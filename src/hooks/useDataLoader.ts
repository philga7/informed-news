import { useCallback } from 'react';
import {
  sourcesService,
  articlesService,
  collectionsService,
  topicsService,
} from '../services';
import type { AppAction } from '../types';

/**
 * Data Loader Hook
 * 
 * Loads all user data from Supabase on authentication
 */

export function useDataLoader(dispatch: React.Dispatch<AppAction>) {
  const loadAllData = useCallback(async (userId: string) => {
    try {
      dispatch({ type: 'SET_LOADING_DATA', payload: true });
      dispatch({ type: 'SET_DATA_LOAD_ERROR', payload: null });

      // Load all data in parallel for better performance
      const [sources, articles, collections, topics] = await Promise.all([
        sourcesService.getAll(userId),
        articlesService.getRecent(userId, { limit: 100 }), // Load recent 100 articles
        collectionsService.getAll(userId),
        topicsService.getAll(userId),
      ]);

      // Update state with loaded data
      dispatch({ type: 'SET_SOURCES', payload: sources });
      dispatch({ type: 'SET_ARTICLES', payload: articles });
      dispatch({ type: 'SET_COLLECTIONS', payload: collections });
      dispatch({ type: 'SET_TOPICS', payload: topics });
      dispatch({ type: 'SET_LAST_UPDATE', payload: new Date() });

      dispatch({ type: 'SET_LOADING_DATA', payload: false });
      
      return { success: true };
    } catch (error: any) {
      console.error('Failed to load data:', error);
      dispatch({ type: 'SET_DATA_LOAD_ERROR', payload: error.message || 'Failed to load data' });
      dispatch({ type: 'SET_LOADING_DATA', payload: false });
      
      return { success: false, error: error.message };
    }
  }, [dispatch]);

  return { loadAllData };
}

