import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import type { AppState, AppAction, User } from '../types';
import { appReducer, initialState } from './appReducer';
import { useAuth } from '../hooks/useAuth';
import { useDataLoader } from '../hooks/useDataLoader';

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { user: supabaseUser, loading: authLoading } = useAuth();
  const { loadAllData } = useDataLoader(dispatch);
  const hasLoadedDataRef = useRef(false);

  // Handle Supabase auth state changes
  useEffect(() => {
    if (authLoading) return;

    if (supabaseUser) {
      // User is authenticated with Supabase
      const user: User = {
        id: supabaseUser.id,
        email: supabaseUser.email!,
        name: supabaseUser.user_metadata?.name || supabaseUser.email!,
        createdAt: supabaseUser.created_at,
      };

      // Set auth state
      dispatch({ type: 'RESTORE_AUTH', payload: user });

      // Load all user data from Supabase (only once)
      if (!hasLoadedDataRef.current) {
        hasLoadedDataRef.current = true;
        loadAllData(user.id).then((result) => {
          if (result.success) {
            console.log('✅ Data loaded from Supabase');
          } else {
            console.error('❌ Failed to load data:', result.error);
          }
        });
      }
    } else {
      // User is logged out
      dispatch({ type: 'LOGOUT' });
      hasLoadedDataRef.current = false;
    }
  }, [supabaseUser, authLoading, loadAllData]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
