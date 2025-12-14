import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type { AppState, AppAction, User } from '../types';
import { appReducer, initialState } from './appReducer';
import { saveToStorage, loadFromStorage } from '../utils/storage';
import { getSession, setupActivityTracking, findUserByEmail } from '../utils/auth';

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const userId = state.authentication.user?.id;
      if (userId) {
        try {
          saveToStorage(state, userId);
        } catch (error) {
          console.error('Failed to save state:', error);
        }
      }
    }, 500);
  }, [state]);

  useEffect(() => {
    const session = getSession();
    if (session) {
      const storedUser = findUserByEmail(session.email);
      if (storedUser) {
        const user: User = {
          id: storedUser.id,
          email: storedUser.email,
          name: storedUser.name,
          createdAt: storedUser.createdAt,
        };

        const savedState = loadFromStorage(user.id);
        if (savedState) {
          dispatch({ type: 'LOAD_STATE', payload: savedState });
        } else {
          dispatch({ type: 'RESTORE_AUTH', payload: user });
        }
      }
    }

    const cleanup = setupActivityTracking();
    return cleanup;
  }, []);

  useEffect(() => {
    if (state.authentication.isAuthenticated) {
      debouncedSave();
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [state, debouncedSave]);

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
