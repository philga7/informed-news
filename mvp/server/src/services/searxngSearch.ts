import type { SearchCandidate } from '../types/topicSearch.js';
import { publisherDomainFromUrl } from './publisherScrape.js';
import { canonicalizeSearchUrl } from './searchUrl.js';
import { SEARXNG_TIMEOUT_MS, TOPIC_SEARCH_WINDOW_HOURS } from './topicSearchConfig.js';

const DEFAULT_SEARXNG_URL = 'http://127.0.0.1:8888';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const RELATIVE_AGO = /(\d+)\s*(minute|min|hour|hr|day)s?\s+ago/i;
const YESTERDAY = /\byesterday\b/i;
/** Whole-string ISO 8601 date or date-time (`T` or space separator). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;
/** Whole-string RFC 2822 date, e.g. `Tue, 29 Sep 2026 09:15:00 GMT`. */
const RFC_DATE =
  /^(?:[A-Za-z]{3},\s*)?\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}(?::\d{2})?\s+(?:[A-Z]{2,4}|[+-]\d{4})$/;
/** How much of `content` to scan for a leading relative date ("3 hours ago …"). */
const CONTENT_DATE_PREFIX = 40;

export type SearchSearxngOptions = {
  baseUrl: string;
  now?: Date;
};

export type SearchSearxngDeps = {
  fetch?: typeof fetch;
};

type SearxngResult = {
  url?: unknown;
  title?: unknown;
  content?: unknown;
  publishedDate?: unknown;
  pubdate?: unknown;
};

/** `SEARXNG_URL` unset → local default; empty → null (disabled); trailing `/` trimmed. */
export function resolveSearxngBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.SEARXNG_URL;
  if (raw === undefined) return DEFAULT_SEARXNG_URL;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed === '' ? null : trimmed;
}

export function buildSearxngSearchUrl(baseUrl: string, query: string): string {
  const params = new URLSearchParams({
    q: query,
    categories: 'news',
    format: 'json',
    language: 'en-US',
  });
  return `${baseUrl}/search?${params.toString()}`;
}

function relativeUnitMs(unit: string): number {
  const lower = unit.toLowerCase();
  if (lower === 'day') return DAY_MS;
  if (lower === 'hour' || lower === 'hr') return HOUR_MS;
  return MINUTE_MS;
}

function absoluteDateToIso(value: string): string | null {
  let normalized = value;
  const iso = ISO_DATE.exec(value);
  if (iso) {
    normalized = value.replace(' ', 'T');
    // Zone-less date-times would otherwise parse in the server's local zone.
    if (normalized.includes('T') && !iso[1]) normalized += 'Z';
  } else if (!RFC_DATE.test(value)) {
    return null;
  }
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * SearXNG dates come as ISO/RFC strings or engine text like "3 hours ago" /
 * "Yesterday". Unrecognized → null (the result stays undated).
 */
export function parseSearxngPublishedDate(value: unknown, now: Date): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  const absolute = absoluteDateToIso(text);
  if (absolute) return absolute;

  const relative = RELATIVE_AGO.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    return new Date(now.getTime() - amount * relativeUnitMs(relative[2] ?? '')).toISOString();
  }
  if (YESTERDAY.test(text)) return new Date(now.getTime() - DAY_MS).toISOString();
  return null;
}

function resultPublishedAt(result: SearxngResult, now: Date): string | null {
  const contentPrefix =
    typeof result.content === 'string' ? result.content.slice(0, CONTENT_DATE_PREFIX) : null;
  return (
    parseSearxngPublishedDate(result.publishedDate, now) ??
    parseSearxngPublishedDate(result.pubdate, now) ??
    parseSearxngPublishedDate(contentPrefix, now)
  );
}

/**
 * Normalize a SearXNG JSON response. Dated results older than the topic search
 * window are dropped; undated results are kept with `publishedAt: null`.
 */
export function parseSearxngResults(json: unknown, now: Date): SearchCandidate[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (typeof json !== 'object' || !Array.isArray(results)) {
    throw new Error('SearXNG response missing results');
  }

  const windowMs = TOPIC_SEARCH_WINDOW_HOURS * HOUR_MS;
  const seen = new Set<string>();
  const candidates: SearchCandidate[] = [];

  for (const raw of results as SearxngResult[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    if (typeof raw.url !== 'string' || typeof raw.title !== 'string') continue;
    const title = raw.title.trim();
    const url = canonicalizeSearchUrl(raw.url);
    if (!title || !url || seen.has(url)) continue;

    const publishedAt = resultPublishedAt(raw, now);
    if (publishedAt && now.getTime() - Date.parse(publishedAt) > windowMs) continue;

    seen.add(url);
    candidates.push({
      provider: 'searxng',
      title,
      publisherUrl: url,
      publisherName: null,
      publisherDomain: publisherDomainFromUrl(url),
      googleNewsUrl: null,
      googleArticleId: null,
      publishedAt,
      snippet: typeof raw.content === 'string' ? raw.content.trim() : '',
    });
  }

  return candidates;
}

/** Search a self-hosted SearXNG instance's news category for `query`. */
export async function searchSearxng(
  query: string,
  options: SearchSearxngOptions,
  deps: SearchSearxngDeps = {},
): Promise<SearchCandidate[]> {
  const fetchImpl = deps.fetch ?? fetch;
  const response = await fetchImpl(buildSearxngSearchUrl(options.baseUrl, query), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(SEARXNG_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`SearXNG ${response.status}`);
  }
  return parseSearxngResults(await response.json(), options.now ?? new Date());
}
