/**
 * Reader feedback in triage scoring prompts (NEWS-190). Like / Not relevant
 * entries (NEWS-169) steer Jev as a soft signal only: they never mute or
 * hard-drop an item (muting is NEWS-90's job).
 */
import type { FeedbackEntry } from '../store/feedbackStore.js';
import type { Article } from '../types/article.js';

export type FeedbackMatch = {
  /** Normalized like the feedback snapshot: publisher domain without `www.`, else source kind. */
  source: string;
  topicIds: readonly string[];
};

export type FeedbackLimits = { maxEntries: number; tokenBudget: number };

/** Prompt-sized view of one entry; this is what the budget measures. */
export type PromptFeedback = {
  id: string;
  signal: FeedbackEntry['signal'];
  headline: string;
  source: string;
  topics: string[];
  comment?: string;
};

/** Same normalization the feedback snapshot uses for `source`. */
export function feedbackSourceFor(
  article: Pick<Article, 'publisherDomain' | 'sourceKind'>,
): string {
  const raw = article.publisherDomain?.trim().toLowerCase().replace(/\.$/, '') ?? '';
  const domain = raw.replace(/^www\./, '');
  return domain.length > 0 ? domain : article.sourceKind;
}

export function toPromptFeedback(entry: FeedbackEntry): PromptFeedback {
  return {
    id: entry.id,
    signal: entry.signal,
    headline: entry.snapshot.headline,
    source: entry.snapshot.source,
    topics: entry.snapshot.topics.map((t) => t.name),
    ...(entry.comment ? { comment: entry.comment } : {}),
  };
}

/** chars / 4, rounded up. */
export function estimateFeedbackTokens(entry: FeedbackEntry): number {
  return Math.ceil(JSON.stringify(toPromptFeedback(entry)).length / 4);
}

function byNewest(a: FeedbackEntry, b: FeedbackEntry): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/**
 * Entries that share the item's source or one of its topics come first, then
 * the rest; each group is newest first. Stops at `maxEntries` or when the next
 * entry would push the estimated tokens past `tokenBudget`.
 */
export function selectFeedback(
  entries: readonly FeedbackEntry[],
  match: FeedbackMatch,
  limits: FeedbackLimits,
): FeedbackEntry[] {
  const source = match.source.trim().toLowerCase();
  const topicIds = new Set(match.topicIds);
  const matches = (entry: FeedbackEntry): boolean =>
    entry.snapshot.source.trim().toLowerCase() === source ||
    entry.snapshot.topics.some((t) => topicIds.has(t.id));

  const sorted = [...entries].sort(byNewest);
  const ordered = [...sorted.filter(matches), ...sorted.filter((e) => !matches(e))];

  const picked: FeedbackEntry[] = [];
  let tokens = 0;
  for (const entry of ordered) {
    if (picked.length >= limits.maxEntries) break;
    const cost = estimateFeedbackTokens(entry);
    if (tokens + cost > limits.tokenBudget) break;
    tokens += cost;
    picked.push(entry);
  }
  return picked;
}
