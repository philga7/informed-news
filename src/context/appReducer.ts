import type { AppState, AppAction } from '../types';

export const initialState: AppState = {
  authentication: {
    user: null,
    isAuthenticated: false,
    isDemoMode: false,
  },
  articles: [],
  sources: [],
  collections: [],
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

    case 'LOAD_STATE':
      // Ensure backward compatibility - merge with defaults for new fields
      return {
        ...initialState,
        ...action.payload,
        collections: action.payload.collections ?? [],
      };

    default:
      return state;
  }
}
