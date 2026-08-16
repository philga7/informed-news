/**
 * Structured framing / bias analysis from Ollama Cloud.
 * UI should label results: "AI-assisted framing analysis — not ground truth."
 */
export type FramingGenre = 'news_blurb' | 'opinion' | 'analysis' | 'unclear';

export type FramingDimensions = {
  loadedLanguage: number; // 0–1
  emotionalAppeal: number;
  certaintyClaiming: number;
  /** Aggregator/headline selection framing */
  omissionOrSelectionRisk: number;
  /** How clear the underlying source is */
  attributionClarity: number;
};

export type FramingAnalysis = {
  genre: FramingGenre;
  /** e.g. "loaded adjective", "sarcasm" */
  headlineDevices: string[];
  dimensions: FramingDimensions;
  /** 2–3 sentences */
  framingSummary: string;
  /** Short quotes from title/snippet */
  evidenceQuotes: string[];
  /** What a reader should verify */
  openQuestions: string[];
  /** Model self-assessed 0–1 */
  confidence: number;
};

export type SourceKind = 'cfp' | 'xcancel';

/** Publisher body scrape / tweet-as-body status. */
export type BodyStatus =
  | 'ok'
  | 'unavailable'
  | 'blocked'
  | 'not_applicable'
  | 'pending';

/** Soft cap for stored body text (~8–12k chars). */
export const BODY_TEXT_MAX_CHARS = 10_000;

export type ArticleCitation = {
  label: string;
  url: string;
};

export type Article = {
  /** Stable hash of canonicalUrl */
  id: string;
  title: string;
  sourceKind: SourceKind;
  /** CFP item URL or tweet URL; input to the id hash */
  canonicalUrl: string;
  citations: ArticleCitation[];
  publisherUrl: string | null;
  publisherDomain: string | null;
  /** X handle; null for CFP items */
  handle: string | null;
  publishedAt: string | null;
  /** RSS description/content only for MVP */
  snippet: string;
  /**
   * Truncated original text when available.
   * CFP: from publisher scrape. xcancel: tweet text (bodyStatus not_applicable).
   */
  bodyText: string | null;
  bodyStatus: BodyStatus;
  /** Publisher page title / og:title when scraped; null until then */
  publisherTitle: string | null;
  fetchedAt: string;
  classification: FramingAnalysis | null;
  classifiedAt: string | null;
  /** Human-readable error; may include raw model text after a delimiter for debugging */
  classifyError: string | null;
};

export function truncateBodyText(
  text: string,
  maxChars: number = BODY_TEXT_MAX_CHARS,
): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars);
}

/** Optional fetch/run metadata stored alongside articles */
export type StoreMeta = {
  lastFetchAt: string | null;
  lastError: string | null;
};
