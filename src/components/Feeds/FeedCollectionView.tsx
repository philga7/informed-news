import { useMemo } from 'react';
import { ArrowLeft, Edit2, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ArticleCard } from '../News/ArticleCard';
import { EmptyState } from '../UI/EmptyState';
import { aggregateFeedCollection } from '../../utils/feedAggregator';
import type { FeedCollection } from '../../types';

interface FeedCollectionViewProps {
  collection: FeedCollection;
  onBack: () => void;
  onEdit: () => void;
}

export function FeedCollectionView({ collection, onBack, onEdit }: FeedCollectionViewProps) {
  const { state } = useApp();

  const aggregatedFeed = useMemo(() => {
    return aggregateFeedCollection(collection, state.articles, state.sources);
  }, [collection, state.articles, state.sources]);

  return (
    <div className="max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-stone-400 hover:text-stone-300 transition-colors duration-250"
        >
          <ArrowLeft size={20} />
          Back to Collections
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-lg transition-colors duration-250"
        >
          <Edit2 size={16} />
          Edit Collection
        </button>
      </div>

      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-3 mb-3">
          <Layers className="text-blue-500 mt-1" size={24} />
          <div>
            <h1 className="text-2xl font-bold text-stone-100">{collection.name}</h1>
            {collection.description && (
              <p className="text-stone-400 mt-2">{collection.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-stone-500 mt-4">
          <span>{aggregatedFeed.sections.length} source{aggregatedFeed.sections.length !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>{aggregatedFeed.totalArticles} article{aggregatedFeed.totalArticles !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>Updated {new Date(collection.updatedAt).toLocaleDateString()}</span>
        </div>
      </div>

      {aggregatedFeed.totalArticles === 0 ? (
        <EmptyState
          title="No articles available"
          description="This collection doesn't have any articles yet. Try fetching news from your sources or adjusting the collection settings."
        />
      ) : (
        <div className="space-y-8">
          {aggregatedFeed.sections.map((section, index) => (
            <div key={index}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-stone-200">{section.sourceName}</h2>
                <span className="text-sm text-stone-500">
                  {section.articles.length} of {section.sourceConfig.count} articles
                </span>
              </div>

              {section.articles.length === 0 ? (
                <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 text-center text-stone-400">
                  No articles from this source yet
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.articles.map((article) => (
                    <ArticleCard key={article.id} article={article} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

