import type { Article } from '../types/article.js';
import type { RadarSource } from '../types/radarSource.js';
import { citationsFromRss, upsertArticles } from '../store/index.js';
import { loadRadarSources } from './loadRadarSources.js';
import { parseRssFeed } from './rss.js';
import { scrapePublisherBody } from './publisherBodyScrape.js';
import { publisherDomainFromUrl } from './publisherScrape.js';

export type CuratedRssFetchOptions = {
  /** Optional explicit sources; defaults to config via loadRadarSources. */
  sources?: RadarSource[];
  /** Optional per-source limit override. */
  limit?: number;
  /** Optional config path forwarded to loadRadarSources. */
  configPath?: string;
};

export type CuratedRssFetchResult = {
  /** Total RSS items considered across all sources (after per-source limit). */
  fetched: number;
  /** Upserted articles across all sources. */
  upserted: Article[];
  /** IDs of curated sources that were attempted. */
  sources: string[];
  /** True when no sources were provided or loaded; nothing ran. */
  skipped: boolean;
  /** Per-source error messages; curated failures never throw past CFP. */
  errors: string[];
  /** Effective per-source item limit used for this run. */
  limit: number;
};

type CuratedRssFetchDeps = {
  parseRssFeed?: typeof parseRssFeed;
  scrapePublisherBody?: typeof scrapePublisherBody;
  upsertArticles?: typeof upsertArticles;
};

function stripFragment(url: string): string {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return url;
  return url.slice(0, hashIndex);
}

function resolveLimit(override?: number): number {
  const fromEnv = Number(process.env.RADAR_FETCH_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }

  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }

  return 10;
}

/**
 * Fetch enabled curated RSS sources and upsert into the shared article store.
 * Network and parse failures are isolated per source; CFP owns meta updates.
 */
export async function fetchCuratedRss(
  options: CuratedRssFetchOptions = {},
  deps: CuratedRssFetchDeps = {},
): Promise<CuratedRssFetchResult> {
  const limit = resolveLimit(options.limit);
  const sources: RadarSource[] =
    options.sources ?? loadRadarSources(options.configPath);

  if (sources.length === 0) {
    return {
      fetched: 0,
      upserted: [],
      sources: [],
      skipped: true,
      errors: [],
      limit,
    };
  }

  const parse = deps.parseRssFeed ?? parseRssFeed;
  const scrapeBody = deps.scrapePublisherBody ?? scrapePublisherBody;
  const upsert = deps.upsertArticles ?? upsertArticles;

  const errors: string[] = [];
  const allUpserted: Article[] = [];
  const sourceIds: string[] = [];
  let fetched = 0;
  const fetchedAt = new Date().toISOString();

  for (const source of sources) {
    sourceIds.push(source.id);

    try {
      const items = await parse(source.feedUrl);
      const latest = items.slice(0, limit);
      fetched += latest.length;

      const pending: Array<Omit<Article, 'id'> & { id?: string }> = [];

      for (const item of latest) {
        const link = item.link;
        if (!link) continue;

        const canonicalUrl = stripFragment(link);
        const publisherUrl = canonicalUrl;
        const body = await scrapeBody(publisherUrl);
        const publisherDomain =
          publisherDomainFromUrl(publisherUrl) ?? source.domain;

        pending.push({
          title: item.title,
          sourceKind: 'rss',
          sourceTier: source.sourceTier === 'primary' ? 'primary' : 'sensor',
          canonicalUrl,
          citations: citationsFromRss(source.name, canonicalUrl),
          publisherUrl,
          publisherDomain,
          handle: null,
          publishedAt: item.publishedAt,
          snippet: item.snippet,
          bodyText: body.bodyText,
          bodyStatus: body.bodyStatus,
          publisherTitle: body.publisherTitle,
          imageUrl: body.imageUrl,
          imageCaption: body.imageCaption,
          imageCredit: body.imageCredit,
          clusterId: null,
          fetchedAt,
          classification: null,
          classifiedAt: null,
          classifyError: null,
        });
      }

      if (pending.length > 0) {
        const upserted = await upsert(pending);
        allUpserted.push(...upserted);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${source.id}: ${message}`);
      continue;
    }
  }

  return {
    fetched,
    upserted: allUpserted,
    sources: sourceIds,
    skipped: false,
    errors,
    limit,
  };
}

