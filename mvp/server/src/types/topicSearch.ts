/**
 * Topic search ingest (NEWS-86): providers, per-refresh run status, and
 * normalized provider candidates before they become articles.
 */

export type SearchProvider = 'google_news' | 'searxng';
export const SEARCH_PROVIDERS: readonly SearchProvider[] = ['google_news', 'searxng'];

export type ProviderRunState = 'ok' | 'partial' | 'down' | 'disabled';

export type ProviderRunStatus = {
  state: ProviderRunState;
  topicsAttempted: number;
  topicsFailed: number;
  /** Candidates returned within the window, before merge */
  items: number;
  /** At most PROVIDER_ERRORS_MAX, each "<topicId>: <message>" */
  errors: string[];
};

export type TopicSearchMeta = {
  /** ISO time the run finished */
  at: string;
  providers: Record<SearchProvider, ProviderRunStatus>;
};

/** One provider result, normalized. */
export type SearchCandidate = {
  provider: SearchProvider;
  title: string;
  /** Direct publisher article URL when known (SearXNG result URL; Google cache hit). */
  publisherUrl: string | null;
  publisherName: string | null;
  publisherDomain: string | null;
  /** Google News article link (query stripped); null for SearXNG. */
  googleNewsUrl: string | null;
  /** The CBMi… token from the Google link; null for SearXNG. */
  googleArticleId: string | null;
  /** ISO */
  publishedAt: string | null;
  snippet: string;
};
