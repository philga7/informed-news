/**
 * Triage orchestrator (NEWS-87): runs at the end of every refresh. Cheapest
 * step first — mute/keyword → duplicate grouping → headline Jev → survivor prep
 * (resolve + scrape) → body Jev — and records keep/drop with a reason per
 * candidate in triage.json. Never calls Ollama; never throws.
 */
import {
  readArticles,
  readMuteRules,
  readTopics,
  readTriage,
  updateMeta,
  upsertArticles,
  writeTriage,
} from '../store/index.js';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article, SourceKind, StoreMeta } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import {
  NON_FINAL_REASONS,
  type TriageLabel,
  type TriageReason,
  type TriageRecord,
  type TriageRunMeta,
  type TriageStage,
  type TriageStore,
} from '../types/triage.js';
import {
  isTriageEnabled,
  resolveTriageBudgets,
  TRIAGE_CONCURRENCY,
  TRIAGE_MAX_CANDIDATE_TOPICS,
  TRIAGE_MAX_PROMOTIONS,
  TRIAGE_MAX_UNDESIRED_TOPICS,
  TRIAGE_WINDOW_HOURS,
} from './triageConfig.js';
import { groupCandidates, outletCount, type DedupeCandidate, type DedupeGroup } from './triageDedupe.js';
import { judgeTriage, type TriageJevContext, type TriageVerdict } from './triageJev.js';
import { candidateTopicIds, muteReason } from './triageKeywords.js';
import { prepareSurvivor } from './triageSurvivor.js';
import { getTypeSafeClient } from './typesafeClient.js';

export type TriageResult = TriageRunMeta & { keptIds: string[] };

export type TriageDeps = {
  readTopics?: () => Promise<{ topics: Topic[] }>;
  readMuteRules?: () => Promise<{ rules: MuteRule[] }>;
  readArticles?: () => Promise<Article[]>;
  upsertArticles?: typeof upsertArticles;
  readTriage?: () => Promise<TriageStore>;
  writeTriage?: (store: TriageStore) => Promise<void>;
  updateMeta?: (patch: Partial<StoreMeta>) => Promise<unknown>;
  judge?: typeof judgeTriage;
  jevAvailable?: () => boolean;
  prepareSurvivor?: typeof prepareSurvivor;
};

/** `GET /api/triage` returns at most this many records. */
export const TRIAGE_LIST_MAX = 500;

const RUN_ERRORS_MAX = 5;
const WINDOW_MS = TRIAGE_WINDOW_HOURS * 60 * 60 * 1000;
const JEV_UNAVAILABLE_ERROR = 'TypeSafe not configured';

/** Representative drops that let the next alternate in the group try. */
const PROMOTABLE_REASONS: ReadonlySet<TriageReason> = new Set<TriageReason>([
  'clickbait',
  'opinion',
  'rewrite',
  'sponsored',
  'undated',
  'stale',
]);

type RecordFields = {
  reason: TriageReason | null;
  stage: TriageStage;
  topicIds: string[];
  labels?: TriageLabel[];
  duplicateOf?: string | null;
  memberIds?: string[];
  outletCount?: number | null;
  significance?: number | null;
  bodyChecked?: boolean;
};

type MemberOutcome =
  | { kind: 'unscored'; reason: 'not_scored_budget' | 'not_scored_error'; stage: TriageStage }
  | { kind: 'drop'; fields: RecordFields & { reason: TriageReason } }
  | { kind: 'keep'; fields: RecordFields; article: Article };

type TriageRun = {
  now: Date;
  at: string;
  budget: number;
  used: number;
  jevErrors: number;
  prior: Record<string, TriageRecord>;
  calls: Map<string, number>;
  records: Map<string, TriageRecord>;
  changed: Map<string, Article>;
  errors: string[];
  desiredById: Map<string, Topic>;
  undesired: Topic[];
  judge: typeof judgeTriage;
  prepare: typeof prepareSurvivor;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function addError(errors: string[], message: string): void {
  if (errors.length < RUN_ERRORS_MAX && !errors.includes(message)) errors.push(message);
}

/** Store-write errors bypass the cap: a lost write must always be visible. */
function addStoreError(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function articleTime(article: Article): number {
  return Date.parse(article.publishedAt ?? article.fetchedAt);
}

function inWindow(article: Article, now: Date): boolean {
  const time = articleTime(article);
  return !Number.isNaN(time) && now.getTime() - time <= WINDOW_MS;
}

function record(run: TriageRun, articleId: string, fields: RecordFields): void {
  const reason = fields.reason;
  run.records.set(articleId, {
    articleId,
    status: reason === null ? 'kept' : 'dropped',
    reason,
    stage: fields.stage,
    final: reason === null || !NON_FINAL_REASONS.has(reason),
    topicIds: fields.topicIds,
    labels: fields.labels ?? [],
    duplicateOf: fields.duplicateOf ?? null,
    memberIds: fields.memberIds ?? [],
    outletCount: fields.outletCount ?? null,
    significance: fields.significance ?? null,
    bodyChecked: fields.bodyChecked ?? false,
    jevCalls: (run.prior[articleId]?.jevCalls ?? 0) + (run.calls.get(articleId) ?? 0),
    triagedAt: run.at,
  });
}

/** Reserve one Jev call synchronously (before the await) so concurrent groups never overspend. */
function reserve(run: TriageRun, articleId: string): boolean {
  if (run.used >= run.budget) return false;
  run.used += 1;
  run.calls.set(articleId, (run.calls.get(articleId) ?? 0) + 1);
  return true;
}

function jevFailed(run: TriageRun, error: string): void {
  run.jevErrors += 1;
  addError(run.errors, `Jev: ${error}`);
}

/** A thrown or rejected judge takes the same path as an `ok: false` result. */
async function judgeSafely(
  run: TriageRun,
  stage: 'headline' | 'body',
  article: Article,
  ctx: TriageJevContext,
): ReturnType<typeof judgeTriage> {
  try {
    return await run.judge(stage, article, ctx);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function contextFor(run: TriageRun, topicIds: string[]): TriageJevContext {
  return {
    candidates: topicIds
      .map((id) => run.desiredById.get(id))
      .filter((t): t is Topic => t !== undefined),
    undesired: run.undesired,
  };
}

function dropFrom(
  verdict: Extract<TriageVerdict, { decision: 'drop' }>,
  stage: TriageStage,
  significance: number,
): MemberOutcome {
  return {
    kind: 'drop',
    fields: { reason: verdict.reason, stage, topicIds: verdict.topicIds, significance },
  };
}

async function triageMember(member: DedupeCandidate, run: TriageRun): Promise<MemberOutcome> {
  const id = member.article.id;
  const ctx = contextFor(run, member.topicIds);

  if (!reserve(run, id)) return { kind: 'unscored', reason: 'not_scored_budget', stage: 'budget' };
  const headline = await judgeSafely(run, 'headline', member.article, ctx);
  if (!headline.ok) {
    jevFailed(run, headline.error);
    return { kind: 'unscored', reason: 'not_scored_error', stage: 'headline' };
  }
  const { verdict } = headline;
  if (verdict.decision === 'drop') return dropFrom(verdict, 'headline', verdict.significance);

  const prepared = await run.prepare(member.article, run.now);
  if (prepared.changed) run.changed.set(id, prepared.article);
  if (prepared.dateIssue) {
    return {
      kind: 'drop',
      fields: {
        reason: prepared.dateIssue,
        stage: 'survivor',
        topicIds: verdict.topicIds,
        significance: verdict.significance,
      },
    };
  }

  let cleared = verdict;
  let bodyChecked = false;
  if (prepared.article.bodyStatus === 'ok' && reserve(run, id)) {
    const body = await judgeSafely(run, 'body', prepared.article, ctx);
    if (!body.ok) {
      jevFailed(run, body.error);
    } else if (body.verdict.decision === 'drop') {
      return dropFrom(body.verdict, 'body', verdict.significance);
    } else {
      cleared = body.verdict;
      bodyChecked = true;
    }
  }

  return {
    kind: 'keep',
    article: prepared.article,
    fields: {
      reason: null,
      stage: bodyChecked ? 'body' : 'headline',
      topicIds: cleared.topicIds,
      labels: cleared.labels,
      significance: verdict.significance,
      bodyChecked,
    },
  };
}

/**
 * Representative first; after a quality/date drop, up to TRIAGE_MAX_PROMOTIONS
 * alternates try. Off-topic / muted / not_significant stop the group.
 */
async function processGroup(group: DedupeGroup, run: TriageRun): Promise<void> {
  const { ordered } = group;
  const representativeId = ordered[0]!.article.id;
  const lastTry = Math.min(ordered.length - 1, TRIAGE_MAX_PROMOTIONS);
  const duplicateOf = (members: DedupeCandidate[], keptId: string) => {
    for (const m of members) {
      record(run, m.article.id, {
        reason: 'duplicate',
        stage: 'dedupe',
        topicIds: m.topicIds,
        duplicateOf: keptId,
      });
    }
  };

  for (let i = 0; i <= lastTry; i++) {
    const member = ordered[i]!;
    const untried = ordered.slice(i + 1);
    const outcome = await triageMember(member, run);

    if (outcome.kind === 'unscored') {
      for (const m of [member, ...untried]) {
        record(run, m.article.id, {
          reason: outcome.reason,
          stage: outcome.stage,
          topicIds: m.topicIds,
        });
      }
      return;
    }

    if (outcome.kind === 'keep') {
      const others = ordered.filter((m) => m !== member);
      const groupArticles = ordered.map((m) =>
        m === member ? outcome.article : (run.changed.get(m.article.id) ?? m.article),
      );
      record(run, member.article.id, {
        ...outcome.fields,
        memberIds: others.map((m) => m.article.id),
        outletCount: outletCount(groupArticles),
      });
      duplicateOf(untried, member.article.id);
      return;
    }

    record(run, member.article.id, outcome.fields);
    if (!PROMOTABLE_REASONS.has(outcome.fields.reason) || i === lastTry) {
      duplicateOf(untried, representativeId);
      return;
    }
  }
}

function newestTime(group: DedupeGroup): number {
  const times = group.ordered.map((m) => articleTime(m.article)).filter((t) => !Number.isNaN(t));
  return times.length > 0 ? Math.max(...times) : Number.NEGATIVE_INFINITY;
}

/**
 * Budget priority: round-robin across topics (core before watch, each in
 * topics-store order), newest group first within a topic.
 */
function orderByBudgetPriority(groups: DedupeGroup[], desired: readonly Topic[]): DedupeGroup[] {
  const topicOrder = [
    ...desired.filter((t) => t.level !== 'watch'),
    ...desired.filter((t) => t.level === 'watch'),
  ];
  const repId = (g: DedupeGroup) => g.ordered[0]!.article.id;
  const queues = topicOrder.map((topic) =>
    groups
      .filter((g) => g.topicIds.includes(topic.id))
      .sort((a, b) => newestTime(b) - newestTime(a) || (repId(a) < repId(b) ? -1 : 1)),
  );

  const scheduled = new Set<DedupeGroup>();
  const ordered: DedupeGroup[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const queue of queues) {
      while (queue.length > 0 && scheduled.has(queue[0]!)) queue.shift();
      const next = queue.shift();
      if (!next) continue;
      scheduled.add(next);
      ordered.push(next);
      progressed = true;
    }
  }
  for (const group of groups) if (!scheduled.has(group)) ordered.push(group);
  return ordered;
}

async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next]!;
      next += 1;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function reasonKey(reason: TriageReason): string {
  return reason.startsWith('muted:') ? 'muted' : reason;
}

/**
 * Triage every in-window, non-manual article that has no final record yet.
 * Writes triage.json, changed survivor articles, and `meta.triage`; store
 * failures land in `errors`. Never throws.
 */
export async function runTriage(
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
  deps: TriageDeps = {},
): Promise<TriageResult> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const budgets = resolveTriageBudgets(env);
  const meta: TriageRunMeta = {
    at: now.toISOString(),
    skipped: false,
    candidates: 0,
    kept: 0,
    dropped: 0,
    byReason: {},
    jev: { budget: budgets.jevCalls, used: 0, errors: 0 },
    summaryBudget: budgets.summaries,
    errors: [],
  };
  let keptIds: string[] = [];

  const finish = async (): Promise<TriageResult> => {
    try {
      await (deps.updateMeta ?? updateMeta)({ triage: { ...meta, errors: [...meta.errors] } });
    } catch (err) {
      addStoreError(meta.errors, `meta write: ${errorMessage(err)}`);
    }
    return { ...meta, keptIds };
  };

  if (!isTriageEnabled(env)) {
    meta.skipped = true;
    return finish();
  }

  const [topicsRead, rulesRead, articlesRead, storeRead] = await Promise.allSettled([
    (deps.readTopics ?? (() => readTopics()))(),
    (deps.readMuteRules ?? (() => readMuteRules()))(),
    (deps.readArticles ?? readArticles)(),
    (deps.readTriage ?? (() => readTriage()))(),
  ]);
  if (
    topicsRead.status === 'rejected' ||
    articlesRead.status === 'rejected' ||
    storeRead.status === 'rejected'
  ) {
    meta.skipped = true;
    for (const read of [topicsRead, articlesRead]) {
      if (read.status === 'rejected') addError(meta.errors, errorMessage(read.reason));
    }
    if (storeRead.status === 'rejected') {
      addError(meta.errors, `triage store: ${errorMessage(storeRead.reason)}`);
    }
    return finish();
  }
  let muteRules: MuteRule[] = [];
  if (rulesRead.status === 'fulfilled') muteRules = rulesRead.value.rules;
  else addError(meta.errors, `mute rules: ${errorMessage(rulesRead.reason)}`);
  const store = storeRead.value;

  let started: TriageRun | null = null;
  try {
    const topics = topicsRead.value.topics;
    const articles = articlesRead.value;
    const desired = topics.filter((t) => t.kind === 'desired');
    const undesired = topics.filter((t) => t.kind === 'undesired');
    const articlesById = new Map(articles.map((a) => [a.id, a]));

    const run: TriageRun = {
      now,
      at: meta.at,
      budget: budgets.jevCalls,
      used: 0,
      jevErrors: 0,
      prior: store.records,
      calls: new Map(),
      records: new Map(),
      changed: new Map(),
      errors: meta.errors,
      desiredById: new Map(desired.map((t) => [t.id, t])),
      undesired: undesired.slice(0, TRIAGE_MAX_UNDESIRED_TOPICS),
      judge: deps.judge ?? judgeTriage,
      prepare: deps.prepareSurvivor ?? prepareSurvivor,
    };
    started = run;

    const candidates = articles.filter(
      (a) =>
        a.sourceKind !== 'manual' &&
        inWindow(a, now) &&
        (store.records[a.id] === undefined || store.records[a.id]!.final === false),
    );

    const survivors: DedupeCandidate[] = [];
    for (const article of candidates) {
      const topicIds = candidateTopicIds(article, desired).slice(0, TRIAGE_MAX_CANDIDATE_TOPICS);
      const muted = muteReason(article, muteRules, undesired);
      if (muted) {
        record(run, article.id, { reason: muted, stage: 'keyword', topicIds });
      } else if (topicIds.length === 0) {
        record(run, article.id, { reason: 'off_topic', stage: 'keyword', topicIds });
      } else {
        survivors.push({ article, topicIds });
      }
    }

    const recentKept: DedupeCandidate[] = [];
    for (const rec of Object.values(store.records)) {
      const article = articlesById.get(rec.articleId);
      if (rec.status === 'kept' && article && inWindow(article, now)) {
        recentKept.push({ article, topicIds: rec.topicIds });
      }
    }

    const updatedKept = new Map<string, TriageRecord>();
    const fresh: DedupeGroup[] = [];
    for (const group of groupCandidates(survivors, recentKept)) {
      const keptId = group.existingKeptId;
      if (keptId === null) {
        fresh.push(group);
        continue;
      }
      for (const m of group.ordered) {
        record(run, m.article.id, {
          reason: 'duplicate',
          stage: 'dedupe',
          topicIds: m.topicIds,
          duplicateOf: keptId,
        });
      }
      const kept = updatedKept.get(keptId) ?? store.records[keptId]!;
      const memberIds = [...new Set([...kept.memberIds, ...group.ordered.map((m) => m.article.id)])];
      const members = [keptId, ...memberIds]
        .map((id) => articlesById.get(id))
        .filter((a): a is Article => a !== undefined);
      updatedKept.set(keptId, { ...kept, memberIds, outletCount: outletCount(members) });
    }

    if (fresh.length > 0 && !(deps.jevAvailable ?? (() => getTypeSafeClient() !== null))()) {
      addError(meta.errors, JEV_UNAVAILABLE_ERROR);
      for (const group of fresh) {
        for (const m of group.ordered) {
          record(run, m.article.id, {
            reason: 'not_scored_error',
            stage: 'headline',
            topicIds: m.topicIds,
          });
        }
      }
    } else {
      await runPool(orderByBudgetPriority(fresh, desired), TRIAGE_CONCURRENCY, async (group) => {
        try {
          await processGroup(group, run);
        } catch (err) {
          addError(meta.errors, errorMessage(err));
          for (const m of group.ordered) {
            if (run.records.has(m.article.id)) continue;
            record(run, m.article.id, {
              reason: 'not_scored_error',
              stage: 'headline',
              topicIds: m.topicIds,
            });
          }
        }
      });
    }

    const records = { ...store.records, ...Object.fromEntries(updatedKept) };
    for (const [id, rec] of run.records) records[id] = rec;
    for (const id of Object.keys(records)) {
      if (!articlesById.has(id)) delete records[id];
    }
    try {
      await (deps.writeTriage ?? ((s: TriageStore) => writeTriage(s)))({
        records,
        updatedAt: meta.at,
      });
    } catch (err) {
      addStoreError(meta.errors, `triage write: ${errorMessage(err)}`);
    }

    if (run.changed.size > 0) {
      try {
        await (deps.upsertArticles ?? upsertArticles)([...run.changed.values()]);
      } catch (err) {
        addStoreError(meta.errors, `article write: ${errorMessage(err)}`);
      }
    }

    meta.candidates = candidates.length;
    meta.jev.used = run.used;
    meta.jev.errors = run.jevErrors;
    keptIds = [];
    for (const rec of run.records.values()) {
      if (rec.reason === null) {
        meta.kept += 1;
        keptIds.push(rec.articleId);
        continue;
      }
      meta.dropped += 1;
      const key = reasonKey(rec.reason);
      meta.byReason[key] = (meta.byReason[key] ?? 0) + 1;
    }
  } catch (err) {
    addError(meta.errors, errorMessage(err));
    meta.skipped = true;
    meta.candidates = 0;
    meta.kept = 0;
    meta.dropped = 0;
    meta.byReason = {};
    meta.jev.used = started?.used ?? 0;
    meta.jev.errors = started?.jevErrors ?? 0;
    keptIds = [];
  }

  return finish();
}

export type TriageListing = TriageRecord & {
  title: string | null;
  canonicalUrl: string | null;
  publisherUrl: string | null;
  publisherDomain: string | null;
  publishedAt: string | null;
  sourceKind: SourceKind | null;
};

/** Newest `triagedAt` first, at most `max`, joined with article fields (null when the article is gone). */
export function listTriageRecords(
  store: TriageStore,
  articles: readonly Article[],
  max: number = TRIAGE_LIST_MAX,
): TriageListing[] {
  const byId = new Map(articles.map((a) => [a.id, a]));
  return Object.values(store.records)
    .sort((a, b) =>
      a.triagedAt !== b.triagedAt
        ? a.triagedAt < b.triagedAt
          ? 1
          : -1
        : a.articleId < b.articleId
          ? -1
          : 1,
    )
    .slice(0, max)
    .map((rec) => {
      const article = byId.get(rec.articleId);
      return {
        ...rec,
        title: article?.title ?? null,
        canonicalUrl: article?.canonicalUrl ?? null,
        publisherUrl: article?.publisherUrl ?? null,
        publisherDomain: article?.publisherDomain ?? null,
        publishedAt: article?.publishedAt ?? null,
        sourceKind: article?.sourceKind ?? null,
      };
    });
}
