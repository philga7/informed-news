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
  scrapeExternalUrl?: boolean;
}

export interface FeedSourceConfig {
  sourceId: string;
  count: number;
  sortBy: 'date' | 'title';
  ascending: boolean;
}

export interface FeedCollection {
  id: string;
  name: string;
  description?: string;
  sources: FeedSourceConfig[];
  createdAt: Date;
  updatedAt: Date;
}

export type TopicTag = string;
export type TopicStatus = 'active' | 'archived' | 'ignored';

export interface Topic {
  id: string;
  name: string;
  keywords: string[];
  articleIds: string[];
  followed: boolean;
  tags: TopicTag[];
  status: TopicStatus;
  potentialRelevanceScore?: number;
  expiryDate?: Date;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IgnoredTopic {
  id: string;
  name: string;
  keywords: string[];
  articleIds: string[];
  tags: TopicTag[];
  deletedAt: Date;
  originalTopicId: string;
}

export interface AppState {
  authentication: {
    user: User | null;
    isAuthenticated: boolean;
    isDemoMode: boolean;
  };
  articles: NewsArticle[];
  sources: NewsSource[];
  collections: FeedCollection[];
  topics: Topic[];
  ignoredTopics: IgnoredTopic[];
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
    isLoadingData: boolean;
    dataLoadError: string | null;
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
  | { type: 'SET_ARTICLES'; payload: NewsArticle[] }
  | { type: 'ADD_SOURCE'; payload: NewsSource }
  | { type: 'UPDATE_SOURCE'; payload: { id: string; updates: Partial<NewsSource> } }
  | { type: 'DELETE_SOURCE'; payload: string }
  | { type: 'SET_SOURCES'; payload: NewsSource[] }
  | { type: 'ADD_COLLECTION'; payload: FeedCollection }
  | { type: 'UPDATE_COLLECTION'; payload: { id: string; updates: Partial<FeedCollection> } }
  | { type: 'DELETE_COLLECTION'; payload: string }
  | { type: 'SET_COLLECTIONS'; payload: FeedCollection[] }
  | { type: 'ADD_TOPIC'; payload: Topic }
  | { type: 'UPDATE_TOPIC'; payload: { id: string; updates: Partial<Topic> } }
  | { type: 'DELETE_TOPIC'; payload: string }
  | { type: 'ADD_ARTICLES_TO_TOPIC'; payload: { topicId: string; articleIds: string[] } }
  | { type: 'FOLLOW_TOPIC'; payload: { topicId: string; followed: boolean } }
  | { type: 'TAG_TOPIC'; payload: { topicId: string; tags: TopicTag[] } }
  | { type: 'SET_TOPICS'; payload: Topic[] }
  | { type: 'ARCHIVE_TOPIC'; payload: { topicId: string; potentialRelevanceScore?: number; expiryDate?: Date } }
  | { type: 'DELETE_TOPIC_WITH_ARTICLES'; payload: string }
  | { type: 'ADD_IGNORED_TOPIC'; payload: IgnoredTopic }
  | { type: 'REMOVE_IGNORED_TOPIC'; payload: string }
  | { type: 'RESTORE_IGNORED_TOPIC'; payload: string }
  | { type: 'UPDATE_TOPIC_STATUS'; payload: { topicId: string; status?: TopicStatus; potentialRelevanceScore?: number; expiryDate?: Date } }
  | { type: 'SET_FILTER'; payload: Partial<AppState['filters']> }
  | { type: 'SET_FETCHING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LAST_UPDATE'; payload: Date }
  | { type: 'SET_LOADING_DATA'; payload: boolean }
  | { type: 'SET_DATA_LOAD_ERROR'; payload: string | null }
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
