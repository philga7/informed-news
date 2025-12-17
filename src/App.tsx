import { useState, useMemo } from 'react';
import { useApp } from './context/AppContext';
import { AuthModal } from './components/Auth/AuthModal';
import { Header } from './components/Layout/Header';
import { ArticleFilters } from './components/Filters/ArticleFilters';
import { ArticleList } from './components/News/ArticleList';
import { SourcesModal } from './components/Sources/SourcesModal';
import { FeedManagementPage } from './components/Feeds/FeedManagementPage';
import { LoadingSpinner } from './components/UI/LoadingSpinner';
import { AlertCircle } from 'lucide-react';

type ViewMode = 'articles' | 'feeds';

function App() {
  const { state, dispatch } = useApp();
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('articles');

  const filteredArticles = useMemo(() => {
    let filtered = state.articles;

    if (state.filters.searchQuery) {
      const query = state.filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(query) ||
          article.description.toLowerCase().includes(query)
      );
    }

    if (state.filters.sourceId) {
      filtered = filtered.filter((article) => article.sourceId === state.filters.sourceId);
    }

    if (state.filters.showOnlyFavorites) {
      filtered = filtered.filter((article) => article.isFavorite);
    }

    if (state.filters.showOnlyUnread) {
      filtered = filtered.filter((article) => !article.isRead);
    }

    filtered.sort((a, b) => {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return filtered;
  }, [state.articles, state.filters]);

  if (!state.authentication.isAuthenticated) {
    return <AuthModal isOpen={true} onClose={() => {}} />;
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <Header
        onOpenSources={() => setShowSourcesModal(true)}
        onOpenFeeds={() => setViewMode(viewMode === 'feeds' ? 'articles' : 'feeds')}
      />

      {viewMode === 'feeds' ? (
        <FeedManagementPage />
      ) : (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {state.ui.error && (
            <div className="mb-6 bg-red-900/20 border border-red-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-red-300 text-sm">{state.ui.error}</p>
              </div>
              <button
                onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
                className="text-red-400 hover:text-red-300 transition-colors duration-250"
              >
                <AlertCircle size={20} />
              </button>
            </div>
          )}

          <div className="mb-6">
            <ArticleFilters />
          </div>

          {state.ui.isFetching ? (
            <LoadingSpinner message="Fetching latest news..." />
          ) : (
            <ArticleList articles={filteredArticles} />
          )}
        </main>
      )}

      <SourcesModal isOpen={showSourcesModal} onClose={() => setShowSourcesModal(false)} />
    </div>
  );
}

export default App;
