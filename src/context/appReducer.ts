import type { AppState, AppAction, IgnoredTopic, Topic } from '../types';

export const initialState: AppState = {
  authentication: {
    user: null,
    isAuthenticated: false,
    isDemoMode: false,
  },
  articles: [],
  sources: [],
  collections: [],
  topics: [],
  ignoredTopics: [],
  filters: {
    searchQuery: '',
    sourceId: null,
    showOnlyFavorites: false,
    showOnlyUnread: false,
  },
  ui: {
    isFetching: false,
    error: null,
    lastUpdate: null,
    isLoadingData: false,
    dataLoadError: null,
  },
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOGIN':
      return {
        ...state,
        authentication: {
          user: action.payload,
          isAuthenticated: true,
          isDemoMode: false,
        },
      };

    case 'LOGOUT':
      return {
        ...initialState,
      };

    case 'RESTORE_AUTH':
      return {
        ...state,
        authentication: {
          user: action.payload,
          isAuthenticated: true,
          isDemoMode: false,
        },
      };

    case 'ADD_ARTICLES': {
      const existingUrls = new Set(state.articles.map(a => a.url));
      const newArticles = action.payload.filter(a => !existingUrls.has(a.url));
      return {
        ...state,
        articles: [...newArticles, ...state.articles],
      };
    }

    case 'UPDATE_ARTICLE':
      return {
        ...state,
        articles: state.articles.map(article =>
          article.id === action.payload.id
            ? { ...article, ...action.payload.updates }
            : article
        ),
      };

    case 'DELETE_ARTICLE':
      return {
        ...state,
        articles: state.articles.filter(article => article.id !== action.payload),
      };

    case 'CLEAR_ARTICLES':
      return {
        ...state,
        articles: [],
      };

    case 'SET_ARTICLES':
      return {
        ...state,
        articles: action.payload,
      };

    case 'ADD_SOURCE':
      return {
        ...state,
        sources: [...state.sources, action.payload],
      };

    case 'UPDATE_SOURCE':
      return {
        ...state,
        sources: state.sources.map(source =>
          source.id === action.payload.id
            ? { ...source, ...action.payload.updates }
            : source
        ),
      };

    case 'DELETE_SOURCE':
      return {
        ...state,
        sources: state.sources.filter(source => source.id !== action.payload),
      };

    case 'SET_SOURCES':
      return {
        ...state,
        sources: action.payload,
      };

    case 'ADD_COLLECTION':
      return {
        ...state,
        collections: [...state.collections, action.payload],
      };

    case 'UPDATE_COLLECTION':
      return {
        ...state,
        collections: state.collections.map(collection =>
          collection.id === action.payload.id
            ? { ...collection, ...action.payload.updates, updatedAt: new Date() }
            : collection
        ),
      };

    case 'DELETE_COLLECTION':
      return {
        ...state,
        collections: state.collections.filter(collection => collection.id !== action.payload),
      };

    case 'SET_COLLECTIONS':
      return {
        ...state,
        collections: action.payload,
      };

    case 'ADD_TOPIC':
      return {
        ...state,
        topics: [...state.topics, action.payload],
      };

    case 'UPDATE_TOPIC':
      return {
        ...state,
        topics: state.topics.map(topic =>
          topic.id === action.payload.id
            ? { ...topic, ...action.payload.updates, updatedAt: new Date() }
            : topic
        ),
      };

    case 'DELETE_TOPIC':
      return {
        ...state,
        topics: state.topics.filter(topic => topic.id !== action.payload),
      };

    case 'ADD_ARTICLES_TO_TOPIC':
      return {
        ...state,
        topics: state.topics.map(topic => {
          if (topic.id === action.payload.topicId) {
            const newArticleIds = [...new Set([...topic.articleIds, ...action.payload.articleIds])];
            return { ...topic, articleIds: newArticleIds, updatedAt: new Date() };
          }
          return topic;
        }),
      };

    case 'FOLLOW_TOPIC':
      return {
        ...state,
        topics: state.topics.map(topic => {
          if (topic.id === action.payload.topicId) {
            // When unfollowing, if topic was followed, archive it
            if (!action.payload.followed && topic.followed && topic.status === 'active') {
              return {
                ...topic,
                followed: false,
                status: 'archived' as const,
                archivedAt: new Date(),
                updatedAt: new Date(),
              };
            }
            return { ...topic, followed: action.payload.followed, updatedAt: new Date() };
          }
          return topic;
        }),
      };

    case 'TAG_TOPIC':
      return {
        ...state,
        topics: state.topics.map(topic =>
          topic.id === action.payload.topicId
            ? { ...topic, tags: action.payload.tags, updatedAt: new Date() }
            : topic
        ),
      };

    case 'SET_TOPICS':
      return {
        ...state,
        topics: action.payload,
      };

    case 'ARCHIVE_TOPIC': {
      const topic = state.topics.find(t => t.id === action.payload.topicId);
      if (!topic) return state;

      // Mark all articles in the topic as read
      const updatedArticles = state.articles.map(article =>
        topic.articleIds.includes(article.id)
          ? { ...article, isRead: true }
          : article
      );

      // Update topic status to archived
      const updatedTopics = state.topics.map(t =>
        t.id === action.payload.topicId
          ? {
              ...t,
              status: 'archived' as const,
              archivedAt: new Date(),
              potentialRelevanceScore: action.payload.potentialRelevanceScore,
              expiryDate: action.payload.expiryDate,
              updatedAt: new Date(),
            }
          : t
      );

      return {
        ...state,
        articles: updatedArticles,
        topics: updatedTopics,
      };
    }

    case 'DELETE_TOPIC_WITH_ARTICLES': {
      const topic = state.topics.find(t => t.id === action.payload);
      if (!topic) return state;

      // Create ignored topic snapshot
      const ignoredTopic: IgnoredTopic = {
        id: `ignored_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: topic.name,
        keywords: [...topic.keywords],
        articleIds: [...topic.articleIds],
        tags: [...topic.tags],
        deletedAt: new Date(),
        originalTopicId: topic.id,
      };

      // Remove topic from topics array
      const updatedTopics = state.topics.filter(t => t.id !== action.payload);

      // Remove all articles associated with this topic
      const articleIdsToDelete = new Set(topic.articleIds);
      const updatedArticles = state.articles.filter(article => !articleIdsToDelete.has(article.id));

      return {
        ...state,
        topics: updatedTopics,
        articles: updatedArticles,
        ignoredTopics: [...state.ignoredTopics, ignoredTopic],
      };
    }

    case 'ADD_IGNORED_TOPIC':
      return {
        ...state,
        ignoredTopics: [...state.ignoredTopics, action.payload],
      };

    case 'REMOVE_IGNORED_TOPIC':
      return {
        ...state,
        ignoredTopics: state.ignoredTopics.filter(it => it.id !== action.payload),
      };

    case 'RESTORE_IGNORED_TOPIC': {
      const ignoredTopic = state.ignoredTopics.find(it => it.id === action.payload);
      if (!ignoredTopic) return state;

      // Recreate topic from ignored data
      // Only restore articles that still exist
      const existingArticleIds = ignoredTopic.articleIds.filter(id =>
        state.articles.some(a => a.id === id)
      );

      const restoredTopic: Topic = {
        id: `topic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: ignoredTopic.name,
        keywords: [...ignoredTopic.keywords],
        articleIds: existingArticleIds,
        followed: false,
        tags: [...ignoredTopic.tags],
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Remove from ignored topics
      const updatedIgnoredTopics = state.ignoredTopics.filter(it => it.id !== action.payload);

      return {
        ...state,
        topics: [...state.topics, restoredTopic],
        ignoredTopics: updatedIgnoredTopics,
      };
    }

    case 'UPDATE_TOPIC_STATUS':
      return {
        ...state,
        topics: state.topics.map(topic =>
          topic.id === action.payload.topicId
            ? {
                ...topic,
                status: action.payload.status ?? topic.status,
                potentialRelevanceScore: action.payload.potentialRelevanceScore ?? topic.potentialRelevanceScore,
                expiryDate: action.payload.expiryDate ?? topic.expiryDate,
                updatedAt: new Date(),
              }
            : topic
        ),
      };

    case 'SET_FILTER':
      return {
        ...state,
        filters: {
          ...state.filters,
          ...action.payload,
        },
      };

    case 'SET_FETCHING':
      return {
        ...state,
        ui: {
          ...state.ui,
          isFetching: action.payload,
        },
      };

    case 'SET_ERROR':
      return {
        ...state,
        ui: {
          ...state.ui,
          error: action.payload,
        },
      };

    case 'SET_LAST_UPDATE':
      return {
        ...state,
        ui: {
          ...state.ui,
          lastUpdate: action.payload,
        },
      };

    case 'SET_LOADING_DATA':
      return {
        ...state,
        ui: {
          ...state.ui,
          isLoadingData: action.payload,
        },
      };

    case 'SET_DATA_LOAD_ERROR':
      return {
        ...state,
        ui: {
          ...state.ui,
          dataLoadError: action.payload,
        },
      };

    case 'LOAD_STATE':
      // Ensure backward compatibility - merge with defaults for new fields
      const loadedArticles = (action.payload.articles ?? []).map((article: any) => ({
        ...article,
        publishedAt: article.publishedAt ? new Date(article.publishedAt) : new Date(),
        fetchedAt: article.fetchedAt ? new Date(article.fetchedAt) : new Date(),
      }));

      const loadedTopics = (action.payload.topics ?? []).map((topic: any) => ({
        ...topic,
        status: topic.status ?? 'active',
        createdAt: topic.createdAt ? new Date(topic.createdAt) : new Date(),
        updatedAt: topic.updatedAt ? new Date(topic.updatedAt) : new Date(),
        archivedAt: topic.archivedAt ? new Date(topic.archivedAt) : undefined,
        expiryDate: topic.expiryDate ? new Date(topic.expiryDate) : undefined,
      }));

      const loadedIgnoredTopics = (action.payload.ignoredTopics ?? []).map((it: any) => ({
        ...it,
        deletedAt: it.deletedAt ? new Date(it.deletedAt) : new Date(),
      }));

      return {
        ...initialState,
        ...action.payload,
        articles: loadedArticles,
        collections: action.payload.collections ?? [],
        topics: loadedTopics,
        ignoredTopics: loadedIgnoredTopics,
      };

    default:
      return state;
  }
}
