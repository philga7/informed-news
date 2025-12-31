import { X, RotateCcw, Trash2, Tag } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { topicsService } from '../../services';

interface IgnoredTopicsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IgnoredTopicsModal({ isOpen, onClose }: IgnoredTopicsModalProps) {
  const { state, dispatch } = useApp();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleRestore = async (ignoredTopicId: string) => {
    if (!user?.id) return;
    
    if (!confirm('Restore this topic? It will be recreated from the saved data.')) return;

    const ignoredTopic = state.ignoredTopics.find(it => it.id === ignoredTopicId);
    if (!ignoredTopic || !ignoredTopic.originalTopicId) return;

    // Optimistic update
    dispatch({
      type: 'RESTORE_IGNORED_TOPIC',
      payload: ignoredTopicId,
    });

    try {
      setIsLoading(true);
      setError(null);
      
      // Remove from ignored topics in Supabase
      await topicsService.unignore(user.id, ignoredTopic.originalTopicId);
      
      // Recreate the topic in Supabase
      await topicsService.upsert(user.id, {
        name: ignoredTopic.name,
        keywords: ignoredTopic.keywords,
        followed: false,
        tags: ignoredTopic.tags,
        status: 'active',
      });
    } catch (err) {
      console.error('Failed to restore topic:', err);
      setError('Failed to restore topic. Please try again.');
      
      // Revert on error
      dispatch({
        type: 'ADD_IGNORED_TOPIC',
        payload: ignoredTopic,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermanentlyDelete = async (ignoredTopicId: string) => {
    if (!user?.id) return;
    
    if (!confirm('Permanently delete this ignored topic? This action cannot be undone.')) return;

    const ignoredTopic = state.ignoredTopics.find(it => it.id === ignoredTopicId);
    if (!ignoredTopic || !ignoredTopic.originalTopicId) return;

    // Optimistic update
    dispatch({
      type: 'REMOVE_IGNORED_TOPIC',
      payload: ignoredTopicId,
    });

    try {
      setIsLoading(true);
      setError(null);
      
      // Remove from ignored topics in Supabase
      await topicsService.unignore(user.id, ignoredTopic.originalTopicId);
    } catch (err) {
      console.error('Failed to delete ignored topic:', err);
      setError('Failed to delete ignored topic. Please try again.');
      
      // Revert on error
      dispatch({
        type: 'ADD_IGNORED_TOPIC',
        payload: ignoredTopic,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-stone-900/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-stone-950 rounded-xl border border-stone-800 w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-stone-800">
          <h2 className="text-2xl font-semibold text-stone-200">Ignored Topics</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)]">
          {error && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
              {error}
            </div>
          )}
          
          {state.ignoredTopics.length === 0 ? (
            <div className="text-center py-12">
              <Trash2 className="mx-auto text-stone-600 mb-4" size={48} />
              <h3 className="text-xl font-semibold text-stone-300 mb-2">No Ignored Topics</h3>
              <p className="text-stone-500">
                Deleted topics will appear here for potential restoration.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {state.ignoredTopics.map((ignoredTopic) => (
                <div
                  key={ignoredTopic.id}
                  className="bg-stone-900 border border-stone-800 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-stone-200 mb-2">
                        {ignoredTopic.name}
                      </h3>

                      {/* Keywords */}
                      {ignoredTopic.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {ignoredTopic.keywords.slice(0, 8).map((keyword, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Tags */}
                      {ignoredTopic.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {ignoredTopic.tags.map((tag, index) => (
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
                        <span>{ignoredTopic.articleIds.length} article{ignoredTopic.articleIds.length !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span>Deleted: {formatDate(ignoredTopic.deletedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleRestore(ignoredTopic.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250"
                        title="Restore topic"
                      >
                        <RotateCcw size={16} />
                        <span className="hidden sm:inline">Restore</span>
                      </button>
                      <button
                        onClick={() => handlePermanentlyDelete(ignoredTopic.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-red-900/30 text-stone-400 hover:text-red-400 rounded-lg transition-colors duration-250"
                        title="Permanently delete"
                      >
                        <Trash2 size={16} />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
