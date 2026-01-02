import { useState, useEffect } from 'react';
import { X, Search, Link as LinkIcon } from 'lucide-react';
import { osintTopicsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';

interface LinkToTopicModalProps {
  sourceRecordId: string;
  organizationId: string;
  onLink: (topicIds: string[]) => Promise<void>;
  onClose: () => void;
}

export function LinkToTopicModal({
  sourceRecordId,
  organizationId,
  onLink,
  onClose,
}: LinkToTopicModalProps) {
  const [topics, setTopics] = useState<any[]>([]);
  const [filteredTopics, setFilteredTopics] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTopics();
  }, [organizationId]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredTopics(topics);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTopics(
        topics.filter(
          (topic) =>
            topic.name.toLowerCase().includes(query) ||
            (topic.description && topic.description.toLowerCase().includes(query)) ||
            (topic.keywords && topic.keywords.some((k: string) => k.toLowerCase().includes(query)))
        )
      );
    }
  }, [searchQuery, topics]);

  const loadTopics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedTopics = await osintTopicsService.getAll(organizationId);
      setTopics(fetchedTopics);
      setFilteredTopics(fetchedTopics);
    } catch (err) {
      console.error('Error loading topics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTopic = (topicId: string) => {
    const newSelected = new Set(selectedTopicIds);
    if (newSelected.has(topicId)) {
      newSelected.delete(topicId);
    } else {
      newSelected.add(topicId);
    }
    setSelectedTopicIds(newSelected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedTopicIds.size === 0) {
      setError('Please select at least one topic');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Link to each selected topic
      await Promise.all(
        Array.from(selectedTopicIds).map((topicId) =>
          osintTopicsService.linkRecord(topicId, sourceRecordId)
        )
      );
      await onLink(Array.from(selectedTopicIds));
      onClose();
    } catch (err) {
      console.error('Error linking to topics:', err);
      setError(err instanceof Error ? err.message : 'Failed to link to topics');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <h2 className="text-2xl font-semibold text-stone-100">Link to Topics</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col">
            {error && (
              <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500"
                  size={20}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search topics..."
                  className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            {/* Topics List */}
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : filteredTopics.length === 0 ? (
              <EmptyState
                title={searchQuery ? 'No topics found' : 'No topics available'}
                description={
                  searchQuery
                    ? 'Try adjusting your search query.'
                    : 'Create a topic first before linking source records.'
                }
              />
            ) : (
              <div className="flex-1 space-y-2">
                <p className="text-sm text-stone-400 mb-2">
                  Select one or more topics ({selectedTopicIds.size} selected)
                </p>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {filteredTopics.map((topic) => {
                    const isSelected = selectedTopicIds.has(topic.id);
                    return (
                      <div
                        key={topic.id}
                        onClick={() => toggleTopic(topic.id)}
                        className={`p-4 border rounded-lg cursor-pointer transition-all duration-250 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-900/20'
                            : 'border-stone-800 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-stone-200 font-medium">{topic.name}</h3>
                              {isSelected && (
                                <LinkIcon size={16} className="text-blue-500 flex-shrink-0" />
                              )}
                            </div>
                            {topic.description && (
                              <p className="text-stone-400 text-sm line-clamp-2">
                                {topic.description}
                              </p>
                            )}
                            {topic.keywords && topic.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {topic.keywords.slice(0, 3).map((keyword: string, index: number) => (
                                  <span
                                    key={index}
                                    className="px-2 py-0.5 bg-stone-800 text-stone-400 text-xs rounded"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-stone-800 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || selectedTopicIds.size === 0}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting
                  ? 'Linking...'
                  : `Link to ${selectedTopicIds.size} Topic${selectedTopicIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

