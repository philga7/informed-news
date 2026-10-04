/**
 * Filtered out (NEWS-90): what triage dropped and why, for spot checks.
 * Headline/body reasons are AI-assisted (Jev) judgments, not verdicts.
 */

import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import type {
  TriageReason,
  TriageRecord,
  TriageRunMeta,
  TriageStage,
  TriageStore,
} from '../types/triage.js';
import { TRIAGE_WINDOW_HOURS } from './triageConfig.js';

/** Display order: `muted` covers every `muted:<id>` reason. */
export const FILTERED_REASON_GROUPS = [
  'muted',
  'off_topic',
  'clickbait',
  'opinion',
  'rewrite',
  'sponsored',
  'not_significant',
  'duplicate',
  'undated',
  'stale',
  'not_scored_budget',
  'not_scored_error',
] as const;
export type FilteredReasonGroup = (typeof FILTERED_REASON_GROUPS)[number];

export type FilteredOutScope = 'last' | 'window';

export type FilteredOutItem = {
  articleId: string;
  /** null when the article is gone */
  title: string | null;
  /** publisherUrl ?? canonicalUrl */
  url: string | null;
  publisherDomain: string | null;
  publishedAt: string | null;
  sourceKind: string | null;
  reason: TriageReason;
  group: FilteredReasonGroup;
  final: boolean;
  stage: TriageStage;
  mutedBy: { kind: 'rule' | 'topic'; id: string; label: string } | null;
  /** record.topicIds that still exist, in topic store order */
  topics: { id: string; name: string }[];
  duplicateOf: { articleId: string; title: string | null; url: string | null } | null;
  triagedAt: string;
};

export type FilteredOut = {
  scope: FilteredOutScope;
  run: TriageRunMeta | null;
  counts: Partial<Record<FilteredReasonGroup, number>>;
  items: FilteredOutItem[];
};

export const REMOVED_MUTE_LABEL = 'Removed rule or topic';

const GROUP_RANK = new Map<FilteredReasonGroup, number>(
  FILTERED_REASON_GROUPS.map((group, i) => [group, i]),
);

export function filteredReasonGroup(reason: TriageReason): FilteredReasonGroup {
  return reason.startsWith('muted:') ? 'muted' : (reason as FilteredReasonGroup);
}

/** Unknown / missing → 'last'. */
export function parseFilteredOutScope(raw: unknown): FilteredOutScope {
  return raw === 'window' ? 'window' : 'last';
}

function articleUrl(article: Article | undefined): string | null {
  return article ? (article.publisherUrl ?? article.canonicalUrl) : null;
}

function resolveMutedBy(
  id: string,
  muteRules: readonly MuteRule[],
  topicsById: ReadonlyMap<string, Topic>,
): NonNullable<FilteredOutItem['mutedBy']> {
  const rule = muteRules.find((r) => r.id === id);
  if (rule) {
    return {
      kind: 'rule',
      id,
      label: rule.source ? `${rule.keyword} (${rule.source})` : rule.keyword,
    };
  }
  const topic = topicsById.get(id);
  if (topic) return { kind: 'topic', id, label: topic.name };
  return { kind: 'topic', id, label: REMOVED_MUTE_LABEL };
}

function inScope(
  rec: TriageRecord,
  scope: FilteredOutScope,
  run: TriageRunMeta | null,
  now: Date,
): boolean {
  if (scope === 'last') return run !== null && rec.triagedAt === run.at;
  const at = Date.parse(rec.triagedAt);
  return !Number.isNaN(at) && at >= now.getTime() - TRIAGE_WINDOW_HOURS * 60 * 60 * 1000;
}

function compareItems(a: FilteredOutItem, b: FilteredOutItem): number {
  const rank = GROUP_RANK.get(a.group)! - GROUP_RANK.get(b.group)!;
  if (rank !== 0) return rank;
  if (a.publishedAt !== b.publishedAt) {
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return a.publishedAt < b.publishedAt ? 1 : -1;
  }
  return a.articleId < b.articleId ? -1 : a.articleId > b.articleId ? 1 : 0;
}

/**
 * Dropped records for the last triage run (`triagedAt === run.at`) or the last
 * TRIAGE_WINDOW_HOURS, joined with article / topic / mute rule fields. No cap.
 */
export function buildFilteredOut(input: {
  store: TriageStore;
  articles: readonly Article[];
  topics: readonly Topic[];
  muteRules: readonly MuteRule[];
  run: TriageRunMeta | null;
  scope: FilteredOutScope;
  now: Date;
}): FilteredOut {
  const articlesById = new Map(input.articles.map((a) => [a.id, a]));
  const topicsById = new Map(input.topics.map((t) => [t.id, t]));

  const items: FilteredOutItem[] = [];
  for (const rec of Object.values(input.store.records)) {
    if (rec.status !== 'dropped' || rec.reason === null) continue;
    if (!inScope(rec, input.scope, input.run, input.now)) continue;
    const reason = rec.reason;
    const article = articlesById.get(rec.articleId);
    const recTopicIds = new Set(rec.topicIds);
    const duplicate = rec.duplicateOf !== null ? articlesById.get(rec.duplicateOf) : undefined;
    items.push({
      articleId: rec.articleId,
      title: article?.title ?? null,
      url: articleUrl(article),
      publisherDomain: article?.publisherDomain ?? null,
      publishedAt: article?.publishedAt ?? null,
      sourceKind: article?.sourceKind ?? null,
      reason,
      group: filteredReasonGroup(reason),
      final: rec.final,
      stage: rec.stage,
      mutedBy: reason.startsWith('muted:')
        ? resolveMutedBy(reason.slice('muted:'.length), input.muteRules, topicsById)
        : null,
      topics: input.topics
        .filter((t) => recTopicIds.has(t.id))
        .map((t) => ({ id: t.id, name: t.name })),
      duplicateOf:
        rec.duplicateOf !== null
          ? {
              articleId: rec.duplicateOf,
              title: duplicate?.title ?? null,
              url: articleUrl(duplicate),
            }
          : null,
      triagedAt: rec.triagedAt,
    });
  }
  items.sort(compareItems);

  const counts: Partial<Record<FilteredReasonGroup, number>> = {};
  for (const item of items) counts[item.group] = (counts[item.group] ?? 0) + 1;

  return { scope: input.scope, run: input.run, counts, items };
}
