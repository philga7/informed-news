import type { Article } from '../types/article.js';
import { assignClusterIds } from './clusterArticles.js';
import { fetchCfpArticles } from './cfpFetch.js';
import type { CfpFetchOptions, CfpFetchResult } from './cfpFetch.js';
import { fetchXcancelArticles } from './xcancelFetch.js';
import type { XcancelFetchOptions, XcancelFetchResult } from './xcancelFetch.js';
import { fetchCuratedRss } from './curatedRssFetch.js';
import type {
  CuratedRssFetchOptions,
  CuratedRssFetchResult,
} from './curatedRssFetch.js';

export type FetchAllOptions = CfpFetchOptions &
  XcancelFetchOptions &
  CuratedRssFetchOptions;

export type FetchTierCounts = {
  fetched: number;
  upserted: number;
};

export type FetchTiers = {
  sensor: FetchTierCounts;
  primary: FetchTierCounts;
};

export type FetchAllResult = {
  cfp: CfpFetchResult;
  curated: CuratedRssFetchResult;
  xcancel: XcancelFetchResult;
  articles: Article[];
  tiers: FetchTiers;
  fetched: number;
  clustered: number;
  clusters: number;
};

export function countFetchTiers(
  articles: ReadonlyArray<Pick<Article, 'sourceTier'>>,
): FetchTiers {
  let sensor = 0;
  let primary = 0;
  for (const article of articles) {
    if (article.sourceTier === 'primary') {
      primary += 1;
    } else {
      sensor += 1;
    }
  }
  return {
    sensor: { fetched: sensor, upserted: sensor },
    primary: { fetched: primary, upserted: primary },
  };
}

function emptyXcancelFailure(
  message: string,
  options: XcancelFetchOptions = {},
): XcancelFetchResult {
  return {
    fetched: 0,
    upserted: [],
    handles: options.handles ?? [],
    perProfileLimit: 0,
    skipped: false,
    errors: [message],
  };
}

function emptyCuratedFailure(
  message: string,
  options: CuratedRssFetchOptions = {},
): CuratedRssFetchResult {
  return {
    fetched: 0,
    upserted: [],
    sources: options.sources?.map((s) => s.id) ?? [],
    skipped: false,
    errors: [message],
    limit: options.limit ?? 0,
  };
}

/**
 * Run enabled sources in sequence: CFP, then curated RSS, then xcancel.
 * CFP failure fails the whole refresh. Other source failures are isolated —
 * CFP results are still returned and errors surface on the result.
 */
export async function fetchAllSources(
  options: FetchAllOptions = {},
): Promise<FetchAllResult> {
  const cfp = await fetchCfpArticles({
    feedUrl: options.feedUrl,
    limit: options.limit,
  });

  let curated: CuratedRssFetchResult;
  try {
    curated = await fetchCuratedRss({
      sources: options.sources,
      limit: options.limit,
      configPath: options.configPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    curated = emptyCuratedFailure(message, options);
  }

  let xcancel: XcancelFetchResult;
  try {
    xcancel = await fetchXcancelArticles({
      handles: options.handles,
      perProfileLimit: options.perProfileLimit,
      delayMs: options.delayMs,
    });
  } catch (err) {
    // CFP already persisted; do not roll the refresh into a hard failure.
    const message = err instanceof Error ? err.message : String(err);
    xcancel = emptyXcancelFailure(message, options);
  }

  // Crude same-event ids across the full store (CFP + curated + xcancel + prior rows).
  const clustered = await assignClusterIds();
  const byId = new Map(clustered.articles.map((a) => [a.id, a]));
  const withCluster = (rows: Article[]): Article[] =>
    rows.map((a) => byId.get(a.id) ?? a);

  const cfpWithCluster: CfpFetchResult = {
    ...cfp,
    upserted: withCluster(cfp.upserted),
  };
  const curatedWithCluster: CuratedRssFetchResult = {
    ...curated,
    upserted: withCluster(curated.upserted),
  };
  const xcancelWithCluster: XcancelFetchResult = {
    ...xcancel,
    upserted: withCluster(xcancel.upserted),
  };
  const articles = [
    ...cfpWithCluster.upserted,
    ...curatedWithCluster.upserted,
    ...xcancelWithCluster.upserted,
  ];
  const tiers = countFetchTiers(articles);

  return {
    cfp: cfpWithCluster,
    curated: curatedWithCluster,
    xcancel: xcancelWithCluster,
    articles,
    tiers,
    fetched: cfp.fetched + curated.fetched + xcancel.fetched,
    clustered: clustered.clustered,
    clusters: clustered.clusters,
  };
}
