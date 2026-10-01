import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import { articleMatchesMute } from './muteMatch.js';

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Word-boundary keyword match. A keyword with no lowercase letters (e.g. `ICE`, `F-250`)
 * is case-sensitive so `ICE` doesn't hit "ice cream"; otherwise case-insensitive.
 */
export function keywordMatches(text: string, keyword: string): boolean {
  const needle = keyword.trim();
  if (!needle) return false;
  const flags = /\p{Ll}/u.test(needle) ? 'i' : '';
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(needle)}(?![A-Za-z0-9])`, flags);
  return pattern.test(text);
}

function headlineHaystack(article: Article): string {
  return [article.title, article.publisherTitle, article.snippet]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join('\n');
}

function topicMatchesText(topic: Topic, text: string): boolean {
  return keywordMatches(text, topic.name) || topic.keywords.some((k) => keywordMatches(text, k));
}

function isOutletKeyword(keyword: string): boolean {
  return keyword.includes('.') && !/\s/.test(keyword);
}

function topicBlocksOutlet(topic: Topic, publisherDomain: string | null): boolean {
  const domain = publisherDomain?.trim().toLowerCase();
  if (!domain) return false;
  return topic.keywords.some((raw) => {
    const keyword = raw.trim().toLowerCase();
    if (!isOutletKeyword(keyword)) return false;
    return domain === keyword || domain.endsWith(`.${keyword}`);
  });
}

/** Desired topic ids (topics-store order) whose name or keyword appears in the headline text. */
export function desiredTopicHits(article: Article, desired: readonly Topic[]): string[] {
  const haystack = headlineHaystack(article);
  return desired.filter((topic) => topicMatchesText(topic, haystack)).map((topic) => topic.id);
}

/**
 * Search rows: their still-desired `topicIds` plus keyword hits. Other rows: keyword hits only.
 * Ordered by topics-store order, deduped.
 */
export function candidateTopicIds(article: Article, desired: readonly Topic[]): string[] {
  const ids = new Set(desiredTopicHits(article, desired));
  if (article.sourceKind === 'search') {
    for (const id of article.topicIds ?? []) ids.add(id);
  }
  return desired.filter((topic) => ids.has(topic.id)).map((topic) => topic.id);
}

/** First matching mute rule, else first matching undesired topic (headline or outlet block). */
export function muteReason(
  article: Article,
  muteRules: readonly MuteRule[],
  undesired: readonly Topic[],
): `muted:${string}` | null {
  const matchedRule = muteRules.find((rule) => articleMatchesMute(article, [rule]));
  if (matchedRule) return `muted:${matchedRule.id}`;

  const haystack = headlineHaystack(article);
  const matchedTopic = undesired.find(
    (topic) =>
      topicMatchesText(topic, haystack) || topicBlocksOutlet(topic, article.publisherDomain),
  );
  return matchedTopic ? `muted:${matchedTopic.id}` : null;
}
