import { useState, useEffect } from 'react';
import { X, Search, Link2, Loader2, Plus } from 'lucide-react';
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
  const [showCreateForm, setShowCreateForm] = useState(false);

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

  const handleCreateTopic = async (topicData: {
    name: string;
    description?: string;
    keywords?: string[];
    decisionQuestion?: string;
    decisionContext?: string;
    keyIndicators?: string[];
    resolutionCriteria?: string;
  }) => {
    if (!currentOrganization) {
      throw new Error('No organization selected');
    }

    try {
      setIsSubmitting(true);
      setError(null);
      
      // Create the new topic
      const newTopic = await osintTopicsService.create(currentOrganization.id, topicData);
      
      // Reload topics list to include the new one
      await loadTopics();
      
      // Automatically link the record to the newly created topic
      await handleLinkToTopic(newTopic.id);
      
      // Note: setShowCreateForm(false) is not needed here because handleLinkToTopic
      // will call onLinked which closes the modal
    } catch (err) {
      console.error('Error creating topic:', err);
      setError(err instanceof Error ? err.message : 'Failed to create topic');
      setIsSubmitting(false);
      throw err; // Re-throw so TopicForm can handle it
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

          {showCreateForm ? (
            /* Create Topic Form - Inline Version */
            <div className="flex-1 overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-stone-200">Create New Topic</h3>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                  className="text-stone-400 hover:text-stone-200 transition-colors duration-250 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CreateTopicInlineForm
                initialName={searchQuery.trim()}
                onSubmit={handleCreateTopic}
                onCancel={() => {
                  setShowCreateForm(false);
                  setError(null);
                }}
                isSubmitting={isSubmitting}
              />
            </div>
          ) : (
            <>
              {/* Search and Create Button */}
              <div className="mb-4 space-y-3">
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
                <button
                  onClick={() => setShowCreateForm(true)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Topic</span>
                </button>
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
            </>
          )}
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

// Inline Topic Creation Form (simplified version for quick create)
interface CreateTopicInlineFormProps {
  initialName?: string;
  onSubmit: (data: {
    name: string;
    description?: string;
    keywords?: string[];
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

function CreateTopicInlineForm({ initialName = '', onSubmit, onCancel, isSubmitting }: CreateTopicInlineFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Update name when initialName changes (if user goes back and changes search query)
  useEffect(() => {
    if (initialName) {
      setName(initialName);
    }
  }, [initialName]);

  const handleAddKeyword = () => {
    const keyword = keywordInput.trim();
    if (keyword && !keywords.includes(keyword)) {
      setKeywords([...keywords, keyword]);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Topic name is required');
      return;
    }

    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        keywords: keywords.length > 0 ? keywords : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create topic');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="topic-name" className="block text-sm font-medium text-stone-300 mb-2">
          Topic Name *
        </label>
        <input
          id="topic-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
          placeholder="e.g., Cyber Security Threats"
          required
          disabled={isSubmitting}
          autoFocus
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="topic-description" className="block text-sm font-medium text-stone-300 mb-2">
          Description (optional)
        </label>
        <textarea
          id="topic-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
          placeholder="Brief description of what this topic covers..."
          disabled={isSubmitting}
        />
      </div>

      {/* Keywords */}
      <div>
        <label htmlFor="topic-keywords" className="block text-sm font-medium text-stone-300 mb-2">
          Keywords (optional)
        </label>
        <div className="flex gap-2 mb-2">
          <input
            id="topic-keywords"
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddKeyword();
              }
            }}
            className="flex-1 px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
            placeholder="Add keyword and press Enter"
            disabled={isSubmitting}
          />
          <button
            type="button"
            onClick={handleAddKeyword}
            disabled={isSubmitting || !keywordInput.trim()}
            className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {keywords.map((keyword, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-1 bg-stone-800 text-stone-300 text-xs rounded border border-stone-700"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(index)}
                  disabled={isSubmitting}
                  className="text-stone-400 hover:text-stone-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-stone-800">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-stone-300 hover:bg-stone-800 rounded-lg transition-colors duration-250 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Creating...</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Create & Link</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

