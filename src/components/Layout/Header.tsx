import React, { useState } from 'react';
import { Newspaper, LogOut, Settings, RefreshCw, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { clearSession } from '../../utils/auth';
import { fetchAllNews } from '../../utils/newsFetcher';

interface HeaderProps {
  onOpenSources: () => void;
  onOpenFeeds: () => void;
}

export function Header({ onOpenSources, onOpenFeeds }: HeaderProps) {
  const { state, dispatch } = useApp();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    clearSession();
    dispatch({ type: 'LOGOUT' });
  };

  const handleUpdateNews = async () => {
    if (state.sources.length === 0) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'No news sources configured. Please add sources first.',
      });
      return;
    }

    dispatch({ type: 'SET_FETCHING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const { articles, errors } = await fetchAllNews(state.sources);

      if (articles.length > 0) {
        dispatch({ type: 'ADD_ARTICLES', payload: articles });
        dispatch({ type: 'SET_LAST_UPDATE', payload: new Date() });
      }

      errors.forEach((error) => {
        dispatch({
          type: 'UPDATE_SOURCE',
          payload: {
            id: error.sourceId,
            updates: { errorMessage: error.message, lastFetched: new Date() },
          },
        });
      });

      if (articles.length === 0 && errors.length > 0) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Failed to fetch articles from all sources. Check source configurations.',
        });
      }
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'An unexpected error occurred while fetching news.',
      });
    } finally {
      dispatch({ type: 'SET_FETCHING', payload: false });
    }
  };

  const formatLastUpdate = () => {
    if (!state.ui.lastUpdate) return 'Never';
    const date = new Date(state.ui.lastUpdate);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <header className="bg-stone-950 border-b border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Newspaper className="text-accent" size={32} />
            <div>
              <h1 className="text-xl font-semibold text-stone-200">Informed News</h1>
              <p className="text-xs text-stone-500">Last update: {formatLastUpdate()}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleUpdateNews}
              disabled={state.ui.isFetching}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-all duration-250 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md text-sm sm:text-base"
            >
              <RefreshCw size={18} className={state.ui.isFetching ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{state.ui.isFetching ? 'Updating...' : 'Update News'}</span>
              <span className="sm:hidden">Update</span>
            </button>

            <button
              onClick={onOpenFeeds}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium rounded-lg transition-all duration-250 text-sm sm:text-base"
            >
              <Layers size={18} />
              <span className="hidden sm:inline">Feeds</span>
            </button>

            <button
              onClick={onOpenSources}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium rounded-lg transition-all duration-250 text-sm sm:text-base"
            >
              <Settings size={18} />
              <span className="hidden sm:inline">Sources</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-all duration-250"
              >
                <span className="text-sm truncate max-w-[100px] sm:max-w-none">{state.authentication.user?.name}</span>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-stone-900 border border-stone-800 rounded-lg shadow-xl z-20">
                    <div className="p-3 border-b border-stone-800">
                      <p className="text-sm font-medium text-stone-200">
                        {state.authentication.user?.name}
                      </p>
                      <p className="text-xs text-stone-500 truncate">
                        {state.authentication.user?.email}
                      </p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-3 text-stone-300 hover:bg-stone-800 transition-colors duration-250 text-sm"
                    >
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
