import type { Article } from '../types/article.js';
import { upsertArticles, updateMeta } from '../store/index.js';
import { parseRssFeed } from './rss.js';
import { publisherDomainFromUrl, scrapePublisherUrl } from './publisherScrape.js';

const DEFAULT_FEED_URL = 'https://citizenfreepress.com/feed/';
const DEFAULT_FETCH_LIMIT = 25;
const CFP_DOMAIN = 'citizenfreepress.com';

export type CfpFetchOptions = {
  feedUrl?: string;
  limit?: number;
};

export type CfpFetchResult = {
  fetched: number;
  upserted: Article[];
  feedUrl: string;
  limit: number;
};

function resolveFeedUrl(override?: string): string {
  return override || process.env.CFP_FEED_URL || DEFAULT_FEED_URL;
}

function resolveLimit(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.FETCH_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return DEFAULT_FETCH_LIMIT;
}

/**
 * Fetch latest N CFP RSS items, scrape publisher URLs, upsert into the JSON article store.
 */
export async function fetchCfpArticles(
  options: CfpFetchOptions = {},
): Promise<CfpFetchResult> {
  const feedUrl = resolveFeedUrl(options.feedUrl);
  const limit = resolveLimit(options.limit);
  const fetchedAt = new Date().toISOString();

  try {
    const items = await parseRssFeed(feedUrl);
    const latest = items.slice(0, limit);

    const articles: Array<Omit<Article, 'id'> & { id?: string }> = [];

    // Sequential scrape keeps CFP polite and avoids burst timeouts.
    for (const item of latest) {
      const cfpUrl = item.link;
      const publisherUrl = await scrapePublisherUrl(cfpUrl, CFP_DOMAIN);
      const publisherDomain = publisherDomainFromUrl(publisherUrl);

      articles.push({
        title: item.title,
        cfpUrl,
        publisherUrl,
        publisherDomain,
        publishedAt: item.publishedAt,
        snippet: item.snippet,
        fetchedAt,
        classification: null,
        classifiedAt: null,
        classifyError: null,
      });
    }

    const upserted = await upsertArticles(articles);
    await updateMeta({ lastFetchAt: fetchedAt, lastError: null });

    return { fetched: latest.length, upserted, feedUrl, limit };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateMeta({ lastError: message });
    throw err;
  }
}
