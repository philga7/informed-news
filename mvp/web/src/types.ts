export type FramingGenre = 'news_blurb' | 'opinion' | 'analysis' | 'unclear';

export type FramingDimensions = {
  loadedLanguage: number;
  emotionalAppeal: number;
  certaintyClaiming: number;
  omissionOrSelectionRisk: number;
  attributionClarity: number;
};

export type FramingAnalysis = {
  genre: FramingGenre;
  headlineDevices: string[];
  dimensions: FramingDimensions;
  framingSummary: string;
  evidenceQuotes: string[];
  openQuestions: string[];
  confidence: number;
};

export type SourceKind = 'cfp' | 'xcancel';

export type BodyStatus =
  | 'ok'
  | 'unavailable'
  | 'blocked'
  | 'not_applicable'
  | 'pending';

export type ArticleCitation = {
  label: string;
  url: string;
};

export type Article = {
  id: string;
  title: string;
  sourceKind: SourceKind;
  canonicalUrl: string;
  citations: ArticleCitation[];
  publisherUrl: string | null;
  publisherDomain: string | null;
  handle: string | null;
  publishedAt: string | null;
  snippet: string;
  bodyText: string | null;
  bodyStatus: BodyStatus;
  publisherTitle: string | null;
  fetchedAt: string;
  classification: FramingAnalysis | null;
  classifiedAt: string | null;
  classifyError: string | null;
};

export type StoreMeta = {
  lastFetchAt: string | null;
  lastError: string | null;
};
