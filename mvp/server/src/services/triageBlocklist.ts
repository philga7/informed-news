import type { Article } from '../types/article.js';
import type { BlocklistTerm, LoadedRadarSourcesFile, RadarSource } from '../types/radarSource.js';
import { normalizeOutletDomain } from './triageKeywords.js';

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHaystack(article: Article): string {
  const title = article.title ?? '';
  const snippet = article.snippet ?? '';
  if (snippet.trim().length === 0) {
    return title;
  }
  return `${title}\n${snippet}`;
}

function termMatches(haystack: string, entry: BlocklistTerm): boolean {
  const term = entry.term;
  if (!term) {
    return false;
  }
  if (entry.substring) {
    return haystack.toLowerCase().includes(term.toLowerCase());
  }
  const pattern = new RegExp(
    `(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`,
    'i',
  );
  return pattern.test(haystack);
}

/** Curated RSS row whose publisher domain matches a configured source. */
export function matchingRssSource(
  article: Article,
  sources: readonly RadarSource[],
): RadarSource | null {
  if (article.sourceKind !== 'rss') {
    return null;
  }
  const articleDomain = normalizeOutletDomain(article.publisherDomain);
  if (!articleDomain) {
    return null;
  }
  for (const source of sources) {
    if (normalizeOutletDomain(source.domain) === articleDomain) {
      return source;
    }
  }
  return null;
}

function firstMatchingTerm(haystack: string, terms: BlocklistTerm[] | undefined): string | null {
  if (!terms) {
    return null;
  }
  for (const entry of terms) {
    if (termMatches(haystack, entry)) {
      return entry.term;
    }
  }
  return null;
}

export function matchBlocklist(
  article: Article,
  config: LoadedRadarSourcesFile,
): { term: string } | null {
  const haystack = buildHaystack(article);

  const globalHit = firstMatchingTerm(haystack, config.blocklist);
  if (globalHit !== null) {
    return { term: globalHit };
  }

  const source = matchingRssSource(article, config.sources);
  const sourceHit = firstMatchingTerm(haystack, source?.blocklist);
  if (sourceHit !== null) {
    return { term: sourceHit };
  }

  return null;
}
