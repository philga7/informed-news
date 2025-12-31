import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Tag, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { topicsService } from '../../services';
import { TopicTimeline } from './TopicTimeline';
import { TopicMap } from './TopicMap';
import { ArticleList } from '../News/ArticleList';
import type { TopicTag } from '../../types';

export function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { user } = useAuth();
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topic = state.topics.find(t => t.id === id);

  if (!topic) {
    return (
      <div className="min-h-screen bg-stone-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-12 text-center">
            <h2 className="text-2xl font-semibold text-stone-300 mb-2">Topic Not Found</h2>
            <p className="text-stone-500 mb-4">The topic you're looking for doesn't exist.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const topicArticles = state.articles.filter(article => topic.articleIds.includes(article.id));

  const handleToggleFollow = async () => {
    if (!user?.id || !topic) return;

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

  const handleAddTag = async () => {
    if (!user?.id || !topic) return;
    
    const tag = newTagInput.trim();
    if (!tag || topic.tags.includes(tag)) return;

    const newTags = [...topic.tags, tag];
    
    // Optimistic update
    dispatch({
      type: 'TAG_TOPIC',
      payload: { topicId: topic.id, tags: newTags },
    });
    setNewTagInput('');
    setShowTagInput(false);

    try {
      setIsLoading(true);
      setError(null);
      
      // Persist to Supabase
      await topicsService.upsert(user.id, {
        id: topic.id,
        name: topic.name,
        keywords: topic.keywords,
        followed: topic.followed,
        tags: newTags,
        status: topic.status,
      });
    } catch (err) {
      console.error('Failed to add tag:', err);
      setError('Failed to add tag. Please try again.');
      
      // Revert on error
      dispatch({
        type: 'TAG_TOPIC',
        payload: { topicId: topic.id, tags: topic.tags },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTag = async (tagToRemove: TopicTag) => {
    if (!user?.id || !topic) return;
    
    const newTags = topic.tags.filter(tag => tag !== tagToRemove);
    
    // Optimistic update
    dispatch({
      type: 'TAG_TOPIC',
      payload: { topicId: topic.id, tags: newTags },
    });

    try {
      setIsLoading(true);
      setError(null);
      
      // Persist to Supabase
      await topicsService.upsert(user.id, {
        id: topic.id,
        name: topic.name,
        keywords: topic.keywords,
        followed: topic.followed,
        tags: newTags,
        status: topic.status,
      });
    } catch (err) {
      console.error('Failed to remove tag:', err);
      setError('Failed to remove tag. Please try again.');
      
      // Revert on error
      dispatch({
        type: 'TAG_TOPIC',
        payload: { topicId: topic.id, tags: topic.tags },
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

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
            {error}
          </div>
        )}
        
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-300 mb-4 transition-colors duration-250"
          >
            <ArrowLeft size={18} />
            Back to Dashboard
          </button>

          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-stone-100">{topic.name}</h1>
                <button
                  onClick={handleToggleFollow}
                  className={`p-2 rounded-lg transition-colors duration-250 ${
                    topic.followed
                      ? 'text-amber-500 hover:text-amber-400'
                      : 'text-stone-500 hover:text-stone-400'
                  }`}
                  title={topic.followed ? 'Unfollow topic' : 'Follow topic'}
                >
                  <Star size={24} fill={topic.followed ? 'currentColor' : 'none'} />
                </button>
              </div>

              {/* Keywords */}
              <div className="flex flex-wrap gap-2 mb-3">
                {topic.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded"
                  >
                    {keyword}
                  </span>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2">
                {topic.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded border border-blue-800/50 flex items-center gap-1"
                  >
                    <Tag size={12} />
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-blue-300"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {!showTagInput ? (
                  <button
                    onClick={() => setShowTagInput(true)}
                    className="px-2 py-1 text-stone-500 hover:text-stone-400 text-xs rounded border border-stone-700 hover:border-stone-600 transition-colors duration-250 flex items-center gap-1"
                  >
                    <Plus size={12} />
                    Add Tag
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAddTag();
                        } else if (e.key === 'Escape') {
                          setShowTagInput(false);
                          setNewTagInput('');
                        }
                      }}
                      placeholder="Tag name..."
                      className="px-2 py-1 bg-stone-800 border border-stone-700 rounded text-sm text-stone-300 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                      autoFocus
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors duration-250"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowTagInput(false);
                        setNewTagInput('');
                      }}
                      className="px-2 py-1 bg-stone-700 hover:bg-stone-600 text-stone-300 text-xs rounded transition-colors duration-250"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="text-sm text-stone-500">
              <p>Created: {formatDate(topic.createdAt)}</p>
              <p>Updated: {formatDate(topic.updatedAt)}</p>
              <p className="mt-2">{topicArticles.length} article{topicArticles.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Timeline Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-stone-200 mb-4">Timeline</h2>
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
            <TopicTimeline articles={topicArticles} />
          </div>
        </div>

        {/* Map Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-stone-200 mb-4">Geographic Distribution</h2>
          <TopicMap articles={topicArticles} />
        </div>

        {/* Articles Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-stone-200 mb-4">Articles</h2>
          <ArticleList articles={topicArticles} />
        </div>
      </div>
    </div>
  );
}

