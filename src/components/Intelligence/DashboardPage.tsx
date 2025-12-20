import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, TrendingUp, Tag, Star } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { extractTopics } from '../../utils/topicExtractor';
import type { Topic } from '../../types';

export function DashboardPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [isExtracting, setIsExtracting] = useState(false);
  const [filterFollowed, setFilterFollowed] = useState(false);
  const [filterTagged, setFilterTagged] = useState(false);

  const handleRefreshTopics = () => {
    setIsExtracting(true);
    
    // Use requestIdleCallback if available, otherwise setTimeout to yield to browser
    const scheduleWork = (callback: () => void) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(callback, { timeout: 100 });
      } else {
        setTimeout(callback, 0);
      }
    };
    
    scheduleWork(() => {
      const topics = extractTopics(state.articles, state.topics);
      dispatch({ type: 'SET_TOPICS', payload: topics });
      setIsExtracting(false);
    });
  };

  const filteredTopics = useMemo(() => {
    let filtered = state.topics;

    if (filterFollowed) {
      filtered = filtered.filter(topic => topic.followed);
    }

    if (filterTagged) {
      filtered = filtered.filter(topic => topic.tags.length > 0);
    }

    // Sort by most recent activity (updatedAt)
    return filtered.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [state.topics, filterFollowed, filterTagged]);

  const handleTopicClick = (topicId: string) => {
    navigate(`/topic/${topicId}`);
  };

  const handleToggleFollow = (e: React.MouseEvent, topic: Topic) => {
    e.stopPropagation();
    dispatch({
      type: 'FOLLOW_TOPIC',
      payload: { topicId: topic.id, followed: !topic.followed },
    });
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
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
                <TrendingUp className="text-blue-500" size={32} />
                Intelligence Dashboard
              </h1>
              <p className="mt-2 text-stone-400">
                Track topics and patterns across your news sources
              </p>
            </div>
            <button
              onClick={handleRefreshTopics}
              disabled={isExtracting || state.articles.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={18} className={isExtracting ? 'animate-spin' : ''} />
              Refresh Topics
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterFollowed}
              onChange={(e) => setFilterFollowed(e.target.checked)}
              className="rounded border-stone-600 bg-stone-800 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-stone-300">Followed Only</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterTagged}
              onChange={(e) => setFilterTagged(e.target.checked)}
              className="rounded border-stone-600 bg-stone-800 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-stone-300">Tagged Only</span>
          </label>
        </div>

        {/* Topics List */}
        {filteredTopics.length === 0 ? (
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-12 text-center">
            <TrendingUp className="mx-auto text-stone-600 mb-4" size={48} />
            <h3 className="text-xl font-semibold text-stone-300 mb-2">No Topics Found</h3>
            <p className="text-stone-500 mb-4">
              {state.articles.length === 0
                ? 'Fetch some articles first, then click "Refresh Topics" to extract topics.'
                : filterFollowed || filterTagged
                ? 'No topics match your current filters.'
                : 'Click "Refresh Topics" to extract topics from your articles.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredTopics.map((topic) => {
              const articleCount = topic.articleIds.length;
              const latestDate = getLatestArticleDate(topic);

              return (
                <div
                  key={topic.id}
                  onClick={() => handleTopicClick(topic.id)}
                  className="bg-stone-900 border border-stone-800 rounded-lg p-6 hover:border-stone-700 cursor-pointer transition-all duration-250"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold text-stone-200">{topic.name}</h3>
                        {topic.followed && (
                          <Star size={18} className="text-amber-500 fill-amber-500" />
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
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleToggleFollow(e, topic)}
                      className={`flex-shrink-0 p-2 rounded-lg transition-colors duration-250 ${
                        topic.followed
                          ? 'text-amber-500 hover:text-amber-400'
                          : 'text-stone-500 hover:text-stone-400'
                      }`}
                      title={topic.followed ? 'Unfollow topic' : 'Follow topic'}
                    >
                      <Star size={20} fill={topic.followed ? 'currentColor' : 'none'} />
                    </button>
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

