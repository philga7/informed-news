import Parser from 'rss-parser';
import type { SearchCandidate } from '../types/topicSearch.js';
import { publisherDomainFromUrl } from './publisherScrape.js';
import { preprocessXml } from './rss.js';
import { canonicalizeSearchUrl } from './searchUrl.js';
import { GOOGLE_NEWS_TIMEOUT_MS, TOPIC_SEARCH_WINDOW_HOURS } from './topicSearchConfig.js';

/** xml2js shape of `<source url="…">Publisher</source>` (keepArray). */
type GoogleNewsSourceField = Array<string | { _?: string; $?: { url?: string } }>;

type GoogleNewsItem = { source?: GoogleNewsSourceField };

const parser: Parser<Record<string, never>, GoogleNewsItem> = new Parser({
  customFields: {
    item: [['source', 'source', { keepArray: true }]],
  },
});

export const USER_AGENT = 'Mozilla/5.0 (compatible; InformedNews/1.0)';

export type SearchGoogleNewsOptions = {
  now?: Date;
};

export type SearchGoogleNewsDeps = {
  fetch?: typeof fetch;
};

export function buildGoogleNewsSearchUrl(query: string): string {
  const q = encodeURIComponent(`${query} when:2d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

/** The opaque article token (e.g. `CBMi…`) from a news.google.com `/articles/` link. */
export function googleArticleIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== 'news.google.com') return null;
  const match = parsed.pathname.match(/\/articles\/([^/]+)/);
  return match?.[1] ?? null;
}

function readSource(field: GoogleNewsSourceField | undefined): {
  name: string | null;
  url: string | null;
} {
  const first = field?.[0];
  if (first === undefined) return { name: null, url: null };
  if (typeof first === 'string') return { name: first.trim() || null, url: null };
  return { name: first._?.trim() || null, url: first.$?.url ?? null };
}

function stripPublisherSuffix(title: string, publisherName: string | null): string {
  if (!publisherName) return title;
  const suffix = ` - ${publisherName}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

function toIsoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function parseGoogleNewsRss(xml: string): Promise<SearchCandidate[]> {
  const feed = await parser.parseString(preprocessXml(xml));
  const candidates: SearchCandidate[] = [];

  for (const item of feed.items) {
    if (!item.title || !item.link) continue;
    const source = readSource(item.source);

    candidates.push({
      provider: 'google_news',
      title: stripPublisherSuffix(item.title, source.name),
      publisherUrl: null,
      publisherName: source.name,
      publisherDomain: publisherDomainFromUrl(source.url),
      googleNewsUrl: canonicalizeSearchUrl(item.link),
      googleArticleId: googleArticleIdFromUrl(item.link),
      publishedAt: toIsoOrNull(item.isoDate ?? item.pubDate),
      snippet: '',
    });
  }

  return candidates;
}

/**
 * Search Google News RSS for `query`, keeping only items dated within the
 * topic search window of `now`. Undated items are dropped.
 */
export async function searchGoogleNews(
  query: string,
  options: SearchGoogleNewsOptions = {},
  deps: SearchGoogleNewsDeps = {},
): Promise<SearchCandidate[]> {
  const fetchImpl = deps.fetch ?? fetch;
  const response = await fetchImpl(buildGoogleNewsSearchUrl(query), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(GOOGLE_NEWS_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Google News RSS ${response.status}`);
  }

  const candidates = await parseGoogleNewsRss(await response.text());
  const nowMs = (options.now ?? new Date()).getTime();
  const windowMs = TOPIC_SEARCH_WINDOW_HOURS * 60 * 60 * 1000;

  return candidates.filter((candidate) => {
    if (!candidate.publishedAt) return false;
    const age = nowMs - Date.parse(candidate.publishedAt);
    return age <= windowMs;
  });
}
