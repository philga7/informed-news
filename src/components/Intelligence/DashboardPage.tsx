import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, TrendingUp, Tag, Star, Check, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { extractTopics } from '../../utils/topicExtractor';
import { topicsService, articlesService } from '../../services';
import type { Topic } from '../../types';
import { IgnoredTopicsModal } from './IgnoredTopicsModal';

export function DashboardPage() {
  const { state, dispatch } = useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isExtracting, setIsExtracting] = useState(false);
  const [filterFollowed, setFilterFollowed] = useState(false);
  const [filterTagged, setFilterTagged] = useState(false);
  const [showIgnoredModal, setShowIgnoredModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      try {
        const topics = extractTopics(state.articles, state.topics);
        dispatch({ type: 'SET_TOPICS', payload: topics });
        setIsExtracting(false);
      } catch (error) {
        setIsExtracting(false);
        console.error('Error extracting topics:', error);
      }
    });
  };

  const filteredTopics = useMemo(() => {
    let filtered = state.topics;

    // Filter out archived and ignored topics (only show active topics on Dashboard)
    filtered = filtered.filter(topic => topic.status === 'active');

    if (filterFollowed) {
      filtered = filtered.filter(topic => topic.followed);
    }

    if (filterTagged) {
      filtered = filtered.filter(topic => topic.tags.length > 0);
    }

    // Sort by most recent activity (updatedAt)
    filtered = filtered.sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // Apply max topic limit (top 50 by recency)
    return filtered.slice(0, 50);
  }, [state.topics, filterFollowed, filterTagged]);

  const handleTopicClick = (topicId: string) => {
    navigate(`/topic/${topicId}`);
  };

  const handleToggleFollow = async (e: React.MouseEvent, topic: Topic) => {
    e.stopPropagation();
    if (!user?.id) return;

    const newFollowedState = !topic.followed;
    
    // Optimistic update
    dispatch({
      type: 'FOLLOW_TOPIC',
      payload: { topicId: topic.id, followed: newFollowedState },
    });

    try {
      setIsLoading(true);
      setError(null);
      
      // Persist to Supabase
      await topicsService.upsert(user.id, {
        id: topic.id,
        name: topic.name,
        keywords: topic.keywords,
        followed: newFollowedState,
        tags: topic.tags,
        status: !newFollowedState && topic.followed && topic.status === 'active' ? 'archived' : topic.status,
      });
    } catch (err) {
      console.error('Failed to toggle follow:', err);
      setError('Failed to update topic. Please try again.');
      
      // Revert on error
      dispatch({
        type: 'FOLLOW_TOPIC',
        payload: { topicId: topic.id, followed: topic.followed },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchiveTopic = async (e: React.MouseEvent, topic: Topic) => {
    e.stopPropagation();
    if (!user?.id) return;
    
    if (!confirm('Archive this topic? All articles will be marked as read.')) return;

    // Optimistic update
    dispatch({
      type: 'ARCHIVE_TOPIC',
      payload: { topicId: topic.id },
    });

    try {
      setIsLoading(true);
      setError(null);
      
      // Update topic status in Supabase
      await topicsService.upsert(user.id, {
        id: topic.id,
        name: topic.name,
        keywords: topic.keywords,
        followed: topic.followed,
        tags: topic.tags,
        status: 'archived',
      });

      // Mark all articles as read
      const articlesToUpdate = state.articles.filter(article => 
        topic.articleIds.includes(article.id)
      );

      await Promise.all(
        articlesToUpdate.map(article =>
          articlesService.update(article.id, { isRead: true })
        )
      );
    } catch (err) {
      console.error('Failed to archive topic:', err);
      setError('Failed to archive topic. Please try again.');
      
      // Revert on error
      dispatch({
        type: 'UPDATE_TOPIC_STATUS',
        payload: { topicId: topic.id, status: topic.status },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTopic = async (e: React.MouseEvent, topic: Topic) => {
    e.stopPropagation();
    if (!user?.id) return;
    
    if (!confirm('Delete this topic and all its articles? This action cannot be undone, but you can restore it from the ignored topics list.')) return;

    // Optimistic update
    dispatch({
      type: 'DELETE_TOPIC_WITH_ARTICLES',
      payload: topic.id,
    });

    try {
      setIsLoading(true);
      setError(null);
      
      // Add to ignored topics in Supabase
      await topicsService.ignore(user.id, topic.id);

      // Delete the topic from Supabase
      await topicsService.delete(topic.id);

      // Delete all articles associated with the topic
      await Promise.all(
        topic.articleIds.map(articleId =>
          articlesService.delete(articleId)
        )
      );
    } catch (err) {
      console.error('Failed to delete topic:', err);
      setError('Failed to delete topic. Please try again.');
      
      // TODO: Revert deletion on error (need to restore from ignoredTopic)
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
            <div className="flex items-center gap-2">
              {state.ignoredTopics.length > 0 && (
                <button
                  onClick={() => setShowIgnoredModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
                >
                  <Trash2 size={18} />
                  Ignored ({state.ignoredTopics.length})
                </button>
              )}
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

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => handleArchiveTopic(e, topic)}
                        className="px-3 py-2 bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-300 rounded-lg transition-all duration-250"
                        title="Archive topic (mark articles as read)"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteTopic(e, topic)}
                        className="px-3 py-2 bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-red-400 rounded-lg transition-all duration-250"
                        title="Delete topic and articles"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        onClick={(e) => handleToggleFollow(e, topic)}
                        className={`transition-colors duration-250 ${
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      <IgnoredTopicsModal
        isOpen={showIgnoredModal}
        onClose={() => setShowIgnoredModal(false)}
      />
    </div>
  );
}

