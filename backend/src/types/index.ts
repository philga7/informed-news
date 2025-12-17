export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  author?: string;
  publishedAt: string;
  source: string;
  sourceId: string;
  content?: string;
  isRead: boolean;
  isFavorite: boolean;
  fetchedAt: string;
}

export type SourceType = 'rss' | 'api' | 'manual' | 'scrape';

export interface NewsSource {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  enabled: boolean;
  createdAt: string;
  lastFetched?: string;
  errorMessage?: string;
  scrapeExternalUrl?: boolean;
}

export interface FetchResult {
  articles: NewsArticle[];
  errors: { sourceId: string; message: string }[];
}

export interface RSSFeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
  content?: string;
  thumbnail?: string;
}

