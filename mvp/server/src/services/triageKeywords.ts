import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import { articleMatchesMute } from './muteMatch.js';

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type KeywordEndings = 'inflections' | 'plural';

export type KeywordMatchOptions = {
  /** `inflections` (default): plurals + demonyms. `plural`: `s` / `es` only. */
  endings?: KeywordEndings;
};

const ENDING_SUFFIXES: Record<KeywordEndings, string> = {
  inflections: '(?:s|es|n|an|ian|i)?s?',
  plural: '(?:s|es)?',
};

/**
 * Word-boundary keyword match. A keyword with no lowercase letters (e.g. `ICE`, `F-250`)
 * is case-sensitive so `ICE` doesn't hit "ice cream"; otherwise case-insensitive.
 * A keyword ending in a letter also matches endings: by default inflections and
 * plural demonyms ("ICE raids", "Israeli", "Iranians"); `endings: 'plural'` only `s` / `es`.
 */
export function keywordMatches(
  text: string,
  keyword: string,
  options: KeywordMatchOptions = {},
): boolean {
  const needle = keyword.trim();
  if (!needle) return false;
  const flags = /\p{Ll}/u.test(needle) ? 'i' : '';
  const suffix = /[A-Za-z]$/.test(needle) ? ENDING_SUFFIXES[options.endings ?? 'inflections'] : '';
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])${escapeRegExp(needle)}${suffix}(?![A-Za-z0-9])`,
    flags,
  );
  return pattern.test(text);
}

function headlineHaystack(article: Article): string {
  return [article.title, article.publisherTitle, article.snippet]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join('\n');
}

function topicMatchesText(topic: Topic, text: string, options: KeywordMatchOptions = {}): boolean {
  return (
    keywordMatches(text, topic.name, options) ||
    topic.keywords.some((k) => keywordMatches(text, k, options))
  );
}

/** Trimmed, lowercased, leading `www.` stripped; empty → null. */
export function normalizeOutletDomain(raw: string | null | undefined): string | null {
  const domain = raw?.trim().toLowerCase().replace(/^www\./, '');
  return domain ? domain : null;
}

/** A keyword containing `.` and no whitespace is an outlet block, not a headline keyword. */
export function isOutletKeyword(keyword: string): boolean {
  return keyword.includes('.') && !/\s/.test(keyword);
}

const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** Normalized value is a dotted hostname (`bbc.co.uk`), not a dotted abbreviation (`U.S.`). */
export function isHostnameLike(value: string | null | undefined): boolean {
  const domain = normalizeOutletDomain(value);
  return domain !== null && HOSTNAME_PATTERN.test(domain);
}

/** Undesired topic with ≥1 keyword, every one hostname-like. */
export function isOutletOnlyTopic(topic: Topic): boolean {
  return (
    topic.kind === 'undesired' &&
    topic.keywords.length > 0 &&
    topic.keywords.every((keyword) => isHostnameLike(keyword))
  );
}

/** An outlet keyword on the topic equals the domain or is a parent domain of it. */
export function topicBlocksOutlet(topic: Topic, publisherDomain: string | null): boolean {
  const domain = normalizeOutletDomain(publisherDomain);
  if (!domain) return false;
  return topic.keywords.some((raw) => {
    const keyword = normalizeOutletDomain(raw);
    if (!keyword || !isOutletKeyword(keyword)) return false;
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

/**
 * First matching mute rule, else first matching undesired topic (headline or outlet block).
 * Undesired keywords take plural endings only — a mute is a permanent drop.
 */
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
      topicMatchesText(topic, haystack, { endings: 'plural' }) ||
      topicBlocksOutlet(topic, article.publisherDomain),
  );
  return matchedTopic ? `muted:${matchedTopic.id}` : null;
}
