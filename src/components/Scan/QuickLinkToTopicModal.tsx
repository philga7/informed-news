import { useState, useEffect } from 'react';
import { X, Search, Link2, Loader2 } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { osintTopicsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';

interface QuickLinkToTopicModalProps {
  record: {
    id: string;
    title: string;
    sourceName: string;
  };
  onClose: () => void;
  onLinked: (topicId: string) => Promise<void>;
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  status: string;
}

export function QuickLinkToTopicModal({
  record,
  onClose,
  onLinked,
}: QuickLinkToTopicModalProps) {
  const { currentOrganization } = useOrganization();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filteredTopics, setFilteredTopics] = useState<Topic[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTopics();
  }, [currentOrganization?.id]);

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
            topic.keywords.some((k: string) => k.toLowerCase().includes(query))
        )
      );
    }
  }, [searchQuery, topics]);

  const loadTopics = async () => {
    if (!currentOrganization) return;

    try {
      setIsLoading(true);
      setError(null);
      const fetchedTopics = await osintTopicsService.getAll(currentOrganization.id);
      // Filter to active topics only
      const activeTopics = fetchedTopics.filter(t => t.status === 'active');
      setTopics(activeTopics);
      setFilteredTopics(activeTopics);
    } catch (err) {
      console.error('Error loading topics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkToTopic = async (topicId: string) => {
    setIsSubmitting(true);
    setError(null);

    try {
      await osintTopicsService.linkRecord(topicId, record.id);
      await onLinked(topicId);
    } catch (err) {
      console.error('Error linking to topic:', err);
      setError(err instanceof Error ? err.message : 'Failed to link to topic');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <div>
            <h2 className="text-xl font-bold text-stone-100">Quick Link to Topic</h2>
            <p className="text-sm text-stone-400 mt-1 line-clamp-1">{record.title}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics by name, description, or keywords..."
                className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                autoFocus
              />
            </div>
          </div>

          {/* Topics List */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : filteredTopics.length === 0 ? (
              <EmptyState
                icon={<Link2 size={64} className="text-stone-600" />}
                title={searchQuery ? 'No topics found' : 'No active topics'}
                description={
                  searchQuery
                    ? 'Try a different search term'
                    : 'Create a topic first to link records to it'
                }
              />
            ) : (
              <div className="space-y-2">
                {filteredTopics.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => handleLinkToTopic(topic.id)}
                    disabled={isSubmitting}
                    className="w-full text-left p-4 border border-stone-700 rounded-lg hover:border-blue-500 hover:bg-blue-900/20 transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-stone-100 mb-1">{topic.name}</h3>
                        {topic.description && (
                          <p className="text-sm text-stone-400 line-clamp-2">
                            {topic.description}
                          </p>
                        )}
                        {topic.keywords.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {topic.keywords.slice(0, 5).map((keyword, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-stone-800 text-stone-300 text-xs rounded border border-stone-700"
                              >
                                {keyword}
                              </span>
                            ))}
                            {topic.keywords.length > 5 && (
                              <span className="px-2 py-0.5 text-stone-500 text-xs">
                                +{topic.keywords.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <Link2 className="w-5 h-5 text-stone-400 ml-3 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-stone-800 border-t border-stone-700 rounded-b-lg flex justify-between items-center">
          <p className="text-sm text-stone-400">
            Click on a topic to link this record
          </p>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-stone-300 hover:bg-stone-700 rounded-md transition-colors duration-250 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {/* Loading Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 bg-stone-900/75 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-stone-300">Linking to topic...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

