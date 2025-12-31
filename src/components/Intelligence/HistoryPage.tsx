import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Tag, Star, TrendingUp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { topicsService } from '../../services';
import type { Topic } from '../../types';

export function HistoryPage() {
  const { state, dispatch } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Display topics that are followed (starred) - when unstarred, they get archived and remain in history
  const historyTopics = useMemo(() => {
    return state.topics
      .filter(topic => topic.followed || (topic.status === 'archived' && topic.archivedAt))
      .sort((a, b) => {
        // Sort by updatedAt or archivedAt descending
        const dateA = a.archivedAt || a.updatedAt;
        const dateB = b.archivedAt || b.updatedAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
  }, [state.topics]);

  const handleTopicClick = (topicId: string) => {
    navigate(`/topic/${topicId}`);
  };

  const handleUnstar = async (e: React.MouseEvent, topic: Topic) => {
    e.stopPropagation();
    if (!user?.id) return;

    // Optimistic update
    dispatch({
      type: 'FOLLOW_TOPIC',
      payload: { topicId: topic.id, followed: false },
    });

    try {
      setIsLoading(true);
      setError(null);
      
      // Persist to Supabase
      await topicsService.upsert(user.id, {
        id: topic.id,
        name: topic.name,
        keywords: topic.keywords,
        followed: false,
        tags: topic.tags,
        status: topic.status === 'active' ? 'archived' : topic.status,
      });
    } catch (err) {
      console.error('Failed to unstar topic:', err);
      setError('Failed to update topic. Please try again.');
      
      // Revert on error
      dispatch({
        type: 'FOLLOW_TOPIC',
        payload: { topicId: topic.id, followed: true },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTopicArticles = (topic: Topic) => {
    return state.articles.filter(article => topic.articleIds.includes(article.id));
  };

  const getLatestArticleDate = (topic: Topic) => {
    const articles = getTopicArticles(topic);
    if (articles.length === 0) return null;
    
    const sorted = articles.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    return sorted[0].publishedAt;
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
            {error}
          </div>
        )}
        
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
            <Clock className="text-blue-500" size={32} />
            History
          </h1>
          <p className="mt-2 text-stone-400">
            Track and manage your starred topics for future analysis and connections
          </p>
        </div>

        {/* Placeholder for future connection/association features */}
        <div className="mb-6 bg-stone-900 border border-stone-800 rounded-lg p-4">
          <p className="text-stone-400 text-sm">
            <TrendingUp className="inline-block mr-2" size={16} />
            Connection analysis and association features will be available in future updates.
          </p>
        </div>

        {/* History Topics List */}
        {historyTopics.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-12 text-center">
            <Clock className="mx-auto text-stone-600 mb-4" size={48} />
            <h3 className="text-xl font-semibold text-stone-300 mb-2">No History Topics</h3>
            <p className="text-stone-500 mb-4">
              Star topics on the Dashboard to track them here for future analysis.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {historyTopics.map((topic) => {
              const articleCount = topic.articleIds.length;
              const latestDate = getLatestArticleDate(topic);
              const isArchived = topic.status === 'archived';

              return (
                <div
                  key={topic.id}
                  onClick={() => handleTopicClick(topic.id)}
                  className={`bg-stone-900 border rounded-lg p-6 hover:border-stone-700 cursor-pointer transition-all duration-250 ${
                    isArchived ? 'border-stone-700 opacity-75' : 'border-stone-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-stone-200">{topic.name}</h3>
                        {topic.followed && (
                          <Star size={18} className="text-amber-500 fill-amber-500" />
                        )}
                        {isArchived && (
                          <span className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded">
                            Archived
                          </span>
                        )}
                      </div>

                      {/* Keywords */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {topic.keywords.slice(0, 8).map((keyword, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>

                      {/* Tags */}
                      {topic.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {topic.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded border border-blue-800/50 flex items-center gap-1"
                            >
                              <Tag size={12} />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-sm text-stone-500">
                        <span>{articleCount} article{articleCount !== 1 ? 's' : ''}</span>
                        {latestDate && (
                          <>
                            <span>•</span>
                            <span>Last activity: {formatDate(latestDate)}</span>
                          </>
                        )}
                        {topic.archivedAt && (
                          <>
                            <span>•</span>
                            <span>Archived: {formatDate(topic.archivedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {topic.followed && (
                      <button
                        onClick={(e) => handleUnstar(e, topic)}
                        className="flex-shrink-0 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-300 rounded-lg transition-colors duration-250 flex items-center gap-2"
                        title="Unstar topic (will archive)"
                      >
                        <Star size={18} fill="currentColor" />
                        <span className="hidden sm:inline">Unstar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
