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

export type Article = {
  id: string;
  title: string;
  cfpUrl: string;
  publisherUrl: string | null;
  publisherDomain: string | null;
  publishedAt: string | null;
  snippet: string;
  fetchedAt: string;
  classification: FramingAnalysis | null;
  classifiedAt: string | null;
  classifyError: string | null;
};

export type StoreMeta = {
  lastFetchAt: string | null;
  lastError: string | null;
};
