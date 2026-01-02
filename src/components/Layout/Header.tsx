import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Newspaper, LogOut, RefreshCw, Target, FileText, Database } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { authService } from '../../services';

export function Header() {
  const { state, dispatch } = useApp();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await authService.signOut();
      // User state will be automatically cleared by useAuth hook
    } catch (error) {
      console.error('Logout error:', error);
      // Still dispatch logout to clear local state
      dispatch({ type: 'LOGOUT' });
    }
  };

  const handleUpdateNews = async () => {
    dispatch({ type: 'SET_FETCHING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Use hardcoded organization ID (same as SourcesPage)
      const organizationId = '00000000-0000-0000-0000-000000009997';
      
      // Use relative URL in production (Vercel), localhost in development
      const API_BASE = import.meta.env.PROD 
        ? (import.meta.env.VITE_API_URL || '')
        : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

      // Trigger RSS ingestion for the organization
      const response = await fetch(`${API_BASE}/api/ingest/rss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ organization_id: organizationId }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to trigger ingestion: ${response.statusText}`);
      }

      const result = await response.json();
      
      console.log('✅ OSINT Ingestion triggered:', result);
      
      dispatch({ type: 'SET_LAST_UPDATE', payload: new Date() });
      
      // Clear any previous errors
      dispatch({ type: 'SET_ERROR', payload: null });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while fetching news.';
      console.error('Failed to trigger ingestion:', error);
      dispatch({
        type: 'SET_ERROR',
        payload: errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')
          ? 'Unable to connect to backend service. Please ensure the backend is running.'
          : errorMessage,
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

            <Link
              to="/topics"
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 font-medium rounded-lg transition-all duration-250 text-sm sm:text-base ${
                location.pathname === '/topics' || location.pathname.startsWith('/topics/')
                  ? 'bg-stone-700 text-stone-200'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              <Target size={18} />
              <span className="hidden sm:inline">Topics</span>
            </Link>

            <Link
              to="/source-records"
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 font-medium rounded-lg transition-all duration-250 text-sm sm:text-base ${
                location.pathname === '/source-records' || location.pathname.startsWith('/source-records/')
                  ? 'bg-stone-700 text-stone-200'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              <FileText size={18} />
              <span className="hidden sm:inline">Source Records</span>
            </Link>

            <Link
              to="/sources"
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 font-medium rounded-lg transition-all duration-250 text-sm sm:text-base ${
                location.pathname === '/sources'
                  ? 'bg-stone-700 text-stone-200'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
              }`}
            >
              <Database size={18} />
              <span className="hidden sm:inline">Sources</span>
            </Link>

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
