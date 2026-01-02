import type { AppState, AppAction } from '../types';

export const initialState: AppState = {
  authentication: {
    user: null,
    isAuthenticated: false,
    isDemoMode: false,
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

    default:
      return state;
  }
}
