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
  /** Human-readable error; may include raw model text after a delimiter for debugging */
  classifyError: string | null;
};

/** Optional fetch/run metadata stored alongside articles */
export type StoreMeta = {
  lastFetchAt: string | null;
  lastError: string | null;
};
