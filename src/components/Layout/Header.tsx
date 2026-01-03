import { RefreshCw, Newspaper } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useOrganization } from '../../context/OrganizationContext';
import { OrganizationSwitcher } from '../Profile/OrganizationSwitcher';
import { TriggeredIndicatorsBanner } from '../Indicators/TriggeredIndicatorsBanner';

export function Header() {
  const { state, dispatch } = useApp();
  const { currentOrganization } = useOrganization();

  const handleUpdateNews = async () => {
    if (!currentOrganization) {
      console.error('No current organization selected');
      return;
    }

    dispatch({ type: 'SET_FETCHING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const organizationId = currentOrganization.id;
      
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
    <>
      <header className="bg-stone-950 border-b border-stone-800">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo and Last Update */}
            <div className="flex items-center gap-3">
              <Newspaper className="text-accent flex-shrink-0" size={20} />
              <div>
                <h1 className="text-base font-semibold text-stone-200 leading-tight">Informed News</h1>
                <p className="text-xs text-stone-500 leading-tight">Last update: {formatLastUpdate()}</p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleUpdateNews}
                disabled={state.ui.isFetching}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-all duration-250 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md text-sm"
              >
                <RefreshCw size={16} className={state.ui.isFetching ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{state.ui.isFetching ? 'Updating...' : 'Update News'}</span>
                <span className="sm:hidden">Update</span>
              </button>

              <OrganizationSwitcher />
            </div>
          </div>
        </div>
      </header>
      
      {/* Triggered Indicators Banner */}
      <TriggeredIndicatorsBanner />
    </>
  );
}
