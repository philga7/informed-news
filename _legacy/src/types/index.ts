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

export interface AppState {
  authentication: {
    user: User | null;
    isAuthenticated: boolean;
    isDemoMode: boolean;
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
  | { type: 'SET_FETCHING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_LAST_UPDATE'; payload: Date }
  | { type: 'SET_LOADING_DATA'; payload: boolean }
  | { type: 'SET_DATA_LOAD_ERROR'; payload: string | null };
