import type { Article } from '../types/article.js';
import { fetchCfpArticles } from './cfpFetch.js';
import type { CfpFetchOptions, CfpFetchResult } from './cfpFetch.js';
import { fetchXcancelArticles } from './xcancelFetch.js';
import type { XcancelFetchOptions, XcancelFetchResult } from './xcancelFetch.js';

export type FetchAllOptions = CfpFetchOptions & XcancelFetchOptions;

export type FetchAllResult = {
  cfp: CfpFetchResult;
  xcancel: XcancelFetchResult;
  articles: Article[];
  fetched: number;
};

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

/**
 * Run enabled sources in sequence: CFP, then xcancel.
 * CFP failure fails the whole refresh. Xcancel failure is isolated — CFP
 * results are still returned and xcancel errors surface on the result / meta.
 * Empty xcancel config is a no-op (skipped), never fails CFP.
 */
export async function fetchAllSources(
  options: FetchAllOptions = {},
): Promise<FetchAllResult> {
  const cfp = await fetchCfpArticles({
    feedUrl: options.feedUrl,
    limit: options.limit,
  });

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

  const articles = [...cfp.upserted, ...xcancel.upserted];
  return {
    cfp,
    xcancel,
    articles,
    fetched: cfp.fetched + xcancel.fetched,
  };
}
