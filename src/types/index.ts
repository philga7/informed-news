export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface StoredUser extends User {
  passwordHash: string;
  salt: string;
  passwordVersion: number;
}

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  loginTime: string;
  lastActivity: string;
  isDemoMode: boolean;
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl?: string;
  author?: string;
  publishedAt: Date;
  source: string;
  sourceId: string;
  content?: string;
  isRead: boolean;
  isFavorite: boolean;
  fetchedAt: Date;
}

export type SourceType = 'rss' | 'api' | 'manual' | 'scrape';

export interface NewsSource {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  enabled: boolean;
  createdAt: Date;
  lastFetched?: Date;
  errorMessage?: string;
}

export interface AppState {
  authentication: {
    user: User | null;
    isAuthenticated: boolean;
    isDemoMode: boolean;
  };
  articles: NewsArticle[];
  sources: NewsSource[];
  filters: {
    searchQuery: string;
    sourceId: string | null;
    showOnlyFavorites: boolean;
    showOnlyUnread: boolean;
  };
  ui: {
    isFetching: boolean;
    error: string | null;
    lastUpdate: Date | null;
  };
}

export type AppAction =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'RESTORE_AUTH'; payload: User }
  | { type: 'ADD_ARTICLES'; payload: NewsArticle[] }
  | { type: 'UPDATE_ARTICLE'; payload: { id: string; updates: Partial<NewsArticle> } }
  | { type: 'DELETE_ARTICLE'; payload: string }
  | { type: 'CLEAR_ARTICLES' }
  | { type: 'ADD_SOURCE'; payload: NewsSource }
  | { type: 'UPDATE_SOURCE'; payload: { id: string; updates: Partial<NewsSource> } }
  | { type: 'DELETE_SOURCE'; payload: string }
  | { type: 'SET_FILTER'; payload: Partial<AppState['filters']> }
  | { type: 'SET_FETCHING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LAST_UPDATE'; payload: Date }
  | { type: 'LOAD_STATE'; payload: AppState };

export interface RSSFeedItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
  content?: string;
  thumbnail?: string;
}
