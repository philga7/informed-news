/**
 * Framing / bias analysis result for an article.
 * Placeholder shape for MVP; filled by the classify step (later ticket).
 */
export type FramingAnalysis = {
  overallTone: string;
  biasSignals: string[];
  confidence: number | null;
  summary: string | null;
};

export type Article = {
  /** Stable hash of cfpUrl */
  id: string;
  title: string;
  /** Aggregator page URL (Citizen Free Press) */
  cfpUrl: string;
  publisherUrl: string | null;
  publisherDomain: string | null;
  publishedAt: string | null;
  /** RSS description/content only for MVP */
  snippet: string;
  fetchedAt: string;
  classification: FramingAnalysis | null;
  classifiedAt: string | null;
  classifyError: string | null;
};

/** Optional fetch/run metadata stored alongside articles */
export type StoreMeta = {
  lastFetchAt: string | null;
  lastError: string | null;
};
