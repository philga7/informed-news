/**
 * Brief summaries (NEWS-88): refresh-time generation for the top stories of
 * each topic section (within the summary budget) and on-demand generation for
 * any story currently visible in the Brief. Ollama is only ever asked about
 * stories shown in the composed Brief; summaries are AI-assisted, not ground truth.
 */
import {
  putBriefSummaries,
  readArticles,
  readBriefSeen,
  readBriefSummaries,
  readMeta,
  readMuteRules,
  readTopics,
  readTriage,
  updateMeta,
} from '../store/index.js';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article, StoreMeta } from '../types/article.js';
import type {
  BriefRunMeta,
  BriefSeenStore,
  BriefSummariesStore,
  BriefSummaryRecord,
  SummaryTrigger,
} from '../types/brief.js';
import type { Topic } from '../types/topic.js';
import type { TriageStore } from '../types/triage.js';
import { BRIEF_TOP_N, ON_DEMAND_SUMMARY_MAX_PER_HOUR, SUMMARY_CONCURRENCY } from './briefConfig.js';
import { OLLAMA_NOT_CONFIGURED, summarizeSource } from './briefSummary.js';
import { getOllamaClient } from './ollamaFraming.js';
import { composeTopicBrief, summarySourceFor, type BriefStory, type SummarySource, type TopicBrief } from './topicBrief.js';
import { resolveTriageBudgets } from './triageConfig.js';

export type BriefSummaryDeps = {
  readTopics?: () => Promise<{ topics: Topic[] }>;
  readMuteRules?: () => Promise<{ rules: MuteRule[] }>;
  readArticles?: () => Promise<Article[]>;
  readTriage?: () => Promise<TriageStore>;
  readBriefSeen?: () => Promise<BriefSeenStore>;
  readBriefSummaries?: () => Promise<BriefSummariesStore>;
  putBriefSummaries?: (records: BriefSummaryRecord[]) => Promise<void>;
  readMeta?: () => Promise<StoreMeta>;
  updateMeta?: (patch: Partial<StoreMeta>) => Promise<unknown>;
  summarize?: typeof summarizeSource;
  ollamaAvailable?: () => boolean;
};

export type OnDemandLimiter = { tryAcquire(): boolean };

export type SummarizeBriefStoryResult =
  | { ok: true; summary: BriefSummaryRecord }
  | { ok: false; code: 'not_in_brief' | 'rate_limited' | 'error'; error: string };

const RUN_ERRORS_MAX = 5;
const HOUR_MS = 60 * 60 * 1000;

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

type Loaded = {
  topics: Topic[];
  muteRules: MuteRule[];
  articles: Article[];
  articlesById: Map<string, Article>;
  triage: TriageStore;
  seen: BriefSeenStore;
  summaries: BriefSummariesStore;
  meta: StoreMeta | null;
};

/**
 * Every input the Brief is composed from. Any failed read → errors and null:
 * without mute rules or seen entries we can't tell which stories are shown,
 * so no Ollama call is made.
 */
async function loadBriefInputs(
  deps: BriefSummaryDeps,
  needMeta: boolean,
  errors: string[],
): Promise<Loaded | null> {
  const reads = await Promise.allSettled([
    (deps.readTopics ?? (() => readTopics()))(),
    (deps.readMuteRules ?? (() => readMuteRules()))(),
    (deps.readArticles ?? (() => readArticles()))(),
    (deps.readTriage ?? (() => readTriage()))(),
    (deps.readBriefSeen ?? (() => readBriefSeen()))(),
    (deps.readBriefSummaries ?? (() => readBriefSummaries()))(),
    needMeta ? (deps.readMeta ?? (() => readMeta()))() : Promise.resolve(null),
  ] as const);
  const labels = ['topics', 'mute rules', 'articles', 'triage', 'seen', 'summaries', 'meta'];
  let failed = false;
  reads.forEach((read, i) => {
    if (read.status === 'rejected') {
      failed = true;
      addError(errors, `${labels[i]}: ${errorMessage(read.reason)}`);
    }
  });
  if (failed) return null;

  const [topics, rules, articles, triage, seen, summaries, meta] = reads.map(
    (r) => (r as PromiseFulfilledResult<unknown>).value,
  ) as [
    { topics: Topic[] },
    { rules: MuteRule[] },
    Article[],
    TriageStore,
    BriefSeenStore,
    BriefSummariesStore,
    StoreMeta | null,
  ];
  return {
    topics: topics.topics,
    muteRules: rules.rules,
    articles,
    articlesById: new Map(articles.map((a) => [a.id, a])),
    triage,
    seen,
    summaries,
    meta,
  };
}

/** Omitting `boundaryAt` lets composition use `meta.refresh.lastSuccess.startedAt`. */
function composeFrom(loaded: Loaded, now: Date, boundaryAt?: string | null): TopicBrief {
  return composeTopicBrief({
    topics: loaded.topics,
    muteRules: loaded.muteRules,
    articles: loaded.articles,
    triage: loaded.triage,
    seen: loaded.seen,
    summaries: loaded.summaries,
    refresh: loaded.meta?.refresh ?? null,
    now,
    ...(boundaryAt !== undefined ? { boundaryAt } : {}),
  });
}

function sourceForStory(loaded: Loaded, articleId: string): SummarySource | null {
  const record = loaded.triage.records[articleId];
  if (!record) return null;
  return summarySourceFor(record, loaded.articlesById, loaded.triage);
}

function cachedOk(
  summaries: BriefSummariesStore,
  articleId: string,
  source: SummarySource,
): BriefSummaryRecord | null {
  const cached = summaries.summaries[articleId];
  return cached?.status === 'ok' && cached.text && cached.sourceHash === source.hash ? cached : null;
}

function unavailableRecord(articleId: string, at: string, trigger: SummaryTrigger): BriefSummaryRecord {
  return {
    articleId,
    status: 'unavailable',
    text: null,
    sourceArticleId: null,
    sourceHash: null,
    model: null,
    error: null,
    generatedAt: at,
    trigger,
  };
}

function resultRecord(
  articleId: string,
  source: SummarySource,
  result: Awaited<ReturnType<typeof summarizeSource>>,
  at: string,
  trigger: SummaryTrigger,
): BriefSummaryRecord {
  return {
    articleId,
    status: result.ok ? 'ok' : 'error',
    text: result.ok ? result.text : null,
    sourceArticleId: source.sourceArticleId,
    sourceHash: source.hash,
    model: result.ok ? result.model : null,
    error: result.ok ? null : result.error,
    generatedAt: at,
    trigger,
  };
}

/** A thrown or rejected summarize takes the same path as an `ok: false` result. */
async function summarizeSafely(
  summarize: typeof summarizeSource,
  story: BriefStory,
  source: SummarySource,
): ReturnType<typeof summarizeSource> {
  try {
    return await summarize({ title: story.title, text: source.text });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function defaultOllamaAvailable(): boolean {
  return getOllamaClient() !== null;
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

type Pending = { story: BriefStory; source: SummarySource };

/**
 * Summarise the top BRIEF_TOP_N visible stories of each section, in section
 * order, within `TRIAGE_SUMMARY_BUDGET` calls (failed calls count). Writes the
 * records and `meta.brief`. Never throws.
 */
export async function generateRefreshSummaries(
  options: { now?: Date; env?: NodeJS.ProcessEnv; boundaryAt?: string | null } = {},
  deps: BriefSummaryDeps = {},
): Promise<BriefRunMeta> {
  const now = options.now ?? new Date();
  const at = now.toISOString();
  const budget = resolveTriageBudgets(options.env ?? process.env).summaries;
  const summaries: BriefRunMeta['summaries'] = {
    budget,
    used: 0,
    generated: 0,
    reused: 0,
    unavailable: 0,
    errors: [],
  };
  const errors = summaries.errors;

  const finish = async (): Promise<BriefRunMeta> => {
    const brief: BriefRunMeta = { at, summaries: { ...summaries, errors: [...errors] } };
    try {
      await (deps.updateMeta ?? ((patch: Partial<StoreMeta>) => updateMeta(patch)))({ brief });
    } catch (err) {
      addStoreError(errors, `meta write: ${errorMessage(err)}`);
    }
    return { at, summaries: { ...summaries, errors: [...errors] } };
  };

  try {
    const loaded = await loadBriefInputs(deps, options.boundaryAt === undefined, errors);
    if (!loaded) return await finish();

    const brief = composeFrom(loaded, now, options.boundaryAt);
    const records: BriefSummaryRecord[] = [];
    const pending: Pending[] = [];
    for (const section of brief.sections) {
      for (const story of section.stories.slice(0, BRIEF_TOP_N)) {
        const source = sourceForStory(loaded, story.articleId);
        if (!source) {
          summaries.unavailable += 1;
          records.push(unavailableRecord(story.articleId, at, 'refresh'));
        } else if (cachedOk(loaded.summaries, story.articleId, source)) {
          summaries.reused += 1;
        } else {
          pending.push({ story, source });
        }
      }
    }

    if (!(deps.ollamaAvailable ?? defaultOllamaAvailable)()) {
      addError(errors, OLLAMA_NOT_CONFIGURED);
    } else {
      const summarize = deps.summarize ?? summarizeSource;
      await runPool(pending, SUMMARY_CONCURRENCY, async ({ story, source }) => {
        if (summaries.used >= budget) return;
        summaries.used += 1;
        const result = await summarizeSafely(summarize, story, source);
        if (result.ok) summaries.generated += 1;
        else addError(errors, `Ollama: ${result.error}`);
        records.push(resultRecord(story.articleId, source, result, at, 'refresh'));
      });
    }

    if (records.length > 0) {
      try {
        await (deps.putBriefSummaries ?? ((r: BriefSummaryRecord[]) => putBriefSummaries(r)))(records);
      } catch (err) {
        addStoreError(errors, `summaries write: ${errorMessage(err)}`);
      }
    }
  } catch (err) {
    addError(errors, errorMessage(err));
  }
  return finish();
}

/** Sliding one-hour window; per process. */
export function createOnDemandLimiter(
  maxPerHour: number = ON_DEMAND_SUMMARY_MAX_PER_HOUR,
  now: () => number = Date.now,
): OnDemandLimiter {
  const stamps: number[] = [];
  return {
    tryAcquire(): boolean {
      const t = now();
      while (stamps.length > 0 && t - stamps[0]! >= HOUR_MS) stamps.shift();
      if (stamps.length >= maxPerHour) return false;
      stamps.push(t);
      return true;
    },
  };
}

const defaultLimiter = createOnDemandLimiter();
const inFlight = new Map<string, Promise<SummarizeBriefStoryResult>>();

async function writeOnDemand(deps: BriefSummaryDeps, record: BriefSummaryRecord): Promise<void> {
  try {
    await (deps.putBriefSummaries ?? ((r: BriefSummaryRecord[]) => putBriefSummaries(r)))([record]);
  } catch (err) {
    console.warn(`brief summary write failed for ${record.articleId}: ${errorMessage(err)}`);
  }
}

async function summarizeBriefStoryOnce(
  articleId: string,
  now: Date,
  deps: BriefSummaryDeps & { rateLimiter?: OnDemandLimiter },
): Promise<SummarizeBriefStoryResult> {
  const errors: string[] = [];
  const loaded = await loadBriefInputs(deps, true, errors);
  if (!loaded) return { ok: false, code: 'error', error: errors.join('; ') };

  const brief = composeFrom(loaded, now);
  const story = brief.sections.flatMap((s) => s.stories).find((s) => s.articleId === articleId);
  if (!story) return { ok: false, code: 'not_in_brief', error: 'Story is not in the current Brief' };

  const at = now.toISOString();
  const source = sourceForStory(loaded, articleId);
  if (!source) {
    const record = unavailableRecord(articleId, at, 'on_demand');
    await writeOnDemand(deps, record);
    return { ok: true, summary: record };
  }
  const cached = cachedOk(loaded.summaries, articleId, source);
  if (cached) return { ok: true, summary: cached };

  if (!(deps.ollamaAvailable ?? defaultOllamaAvailable)()) {
    return { ok: false, code: 'error', error: OLLAMA_NOT_CONFIGURED };
  }
  if (!(deps.rateLimiter ?? defaultLimiter).tryAcquire()) {
    return {
      ok: false,
      code: 'rate_limited',
      error: `On-demand summary limit reached (${ON_DEMAND_SUMMARY_MAX_PER_HOUR} per hour)`,
    };
  }

  const result = await summarizeSafely(deps.summarize ?? summarizeSource, story, source);
  const record = resultRecord(articleId, source, result, at, 'on_demand');
  await writeOnDemand(deps, record);
  return result.ok ? { ok: true, summary: record } : { ok: false, code: 'error', error: result.error };
}

/**
 * Summary for one story the operator expanded. Only stories visible in the
 * current Brief qualify; concurrent calls for the same id share one result.
 * Never throws.
 */
export function summarizeBriefStory(
  articleId: string,
  options: { now?: Date } = {},
  deps: BriefSummaryDeps & { rateLimiter?: OnDemandLimiter } = {},
): Promise<SummarizeBriefStoryResult> {
  const existing = inFlight.get(articleId);
  if (existing) return existing;

  const promise = summarizeBriefStoryOnce(articleId, options.now ?? new Date(), deps)
    .catch((err): SummarizeBriefStoryResult => ({ ok: false, code: 'error', error: errorMessage(err) }))
    .finally(() => {
      inFlight.delete(articleId);
    });
  inFlight.set(articleId, promise);
  return promise;
}
