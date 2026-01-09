import { useState, useEffect } from 'react';
import { X, Search, Link as LinkIcon, Plus, Loader2, Link2 } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { osintTopicsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';

export type LinkToTopicModalMode = 'single' | 'multi';

interface LinkToTopicModalProps {
  sourceRecordId: string;
  recordTitle?: string; // Optional: for display in header (Scan page)
  organizationId?: string; // Optional: will use currentOrganization if not provided
  mode?: LinkToTopicModalMode; // 'single' (auto-link on click) or 'multi' (select then link)
  filterActiveOnly?: boolean; // Filter to active topics only (default: false)
  onLink: (topicIds: string[]) => Promise<void>; // Called when linking is complete
  onClose: () => void;
}

interface Topic {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  status: string;
}

export function LinkToTopicModal({
  sourceRecordId,
  recordTitle,
  organizationId,
  mode = 'multi',
  filterActiveOnly = false,
  onLink,
  onClose,
}: LinkToTopicModalProps) {
  const { currentOrganization } = useOrganization();
  const orgId = organizationId || currentOrganization?.id;
  
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filteredTopics, setFilteredTopics] = useState<Topic[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [alreadyLinkedTopicIds, setAlreadyLinkedTopicIds] = useState<Set<string>>(new Set()); // Topics already linked to this source record
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (orgId) {
      loadTopics();
      loadAlreadyLinkedTopics();
    }
  }, [orgId, sourceRecordId]);

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
    if (!orgId) return;

    try {
      setIsLoading(true);
      setError(null);
      const fetchedTopics = await osintTopicsService.getAll(orgId);
      const filtered = filterActiveOnly 
        ? fetchedTopics.filter((t: Topic) => t.status === 'active')
        : fetchedTopics;
      setTopics(filtered);
      setFilteredTopics(filtered);
    } catch (err) {
      console.error('Error loading topics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  };

  const loadAlreadyLinkedTopics = async () => {
    if (!sourceRecordId) return;

    try {
      // Use the same API base URL pattern as the services
      const API_BASE = import.meta.env.PROD 
        ? (import.meta.env.VITE_API_URL || '')
        : (import.meta.env.VITE_API_URL || 'http://localhost:3001');
      
      // Fetch the source record to get its linked topics
      const response = await fetch(`${API_BASE}/api/source-records/${sourceRecordId}`);
      if (!response.ok) {
        console.warn('Failed to fetch source record for linked topics');
        return;
      }
      
      const data = await response.json();
      const links = data.record?.topic_source_links || [];
      const linkedTopicIds = new Set(links.map((link: any) => link.topic_id || link.osint_topics?.id).filter(Boolean));
      
      setAlreadyLinkedTopicIds(linkedTopicIds);
      // Pre-select already linked topics
      setSelectedTopicIds(linkedTopicIds);
    } catch (err) {
      console.error('Error loading already linked topics:', err);
      // Don't show error to user - this is just for UX enhancement
    }
  };

  const handleLinkToTopic = async (topicId: string) => {
    if (mode === 'single') {
      // Single mode: link immediately and close
      setIsSubmitting(true);
      setError(null);

      try {
        await osintTopicsService.linkRecord(topicId, sourceRecordId);
        await onLink([topicId]);
        onClose();
      } catch (err) {
        console.error('Error linking to topic:', err);
        setError(err instanceof Error ? err.message : 'Failed to link to topic');
        setIsSubmitting(false);
      }
    } else {
      // Multi mode: toggle selection
      toggleTopic(topicId);
    }
  };

  const toggleTopic = (topicId: string) => {
    // Prevent deselection of already-linked topics (when linking from Source Record page)
    if (alreadyLinkedTopicIds.has(topicId) && selectedTopicIds.has(topicId)) {
      // Topic is already linked - don't allow deselection
      return;
    }
    
    const newSelected = new Set(selectedTopicIds);
    if (newSelected.has(topicId)) {
      newSelected.delete(topicId);
    } else {
      newSelected.add(topicId);
    }
    setSelectedTopicIds(newSelected);
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
    if (!orgId) {
      throw new Error('No organization selected');
    }

    try {
      setIsSubmitting(true);
      setError(null);
      
      const newTopic = await osintTopicsService.create(orgId, topicData);
      await loadTopics();
      
      if (mode === 'single') {
        // Single mode: auto-link and close
        await handleLinkToTopic(newTopic.id);
      } else {
        // Multi mode: auto-link the newly created topic immediately
        // This makes sense because if you're creating a topic to link it, you want it linked right away
        try {
          await osintTopicsService.linkRecord(newTopic.id, sourceRecordId);
          // Refresh the parent to show the new link
          await onLink([newTopic.id]);
          // Also add it to selected topics for visual feedback (in case user wants to link more)
          setSelectedTopicIds(new Set([...selectedTopicIds, newTopic.id]));
          setShowCreateForm(false);
          setSearchQuery('');
          setIsSubmitting(false);
          // Clear any previous errors
          setError(null);
        } catch (linkError) {
          console.error('Error linking newly created topic:', linkError);
          // If linking fails, still select it so user can try again via submit button
          setSelectedTopicIds(new Set([...selectedTopicIds, newTopic.id]));
          setShowCreateForm(false);
          setSearchQuery('');
          setIsSubmitting(false);
          setError(linkError instanceof Error ? linkError.message : 'Topic created but failed to link. You can try linking it manually using the "Link to Topics" button.');
          // Don't throw - let user try to link via submit button
        }
      }
    } catch (err) {
      console.error('Error creating topic:', err);
      setError(err instanceof Error ? err.message : 'Failed to create topic');
      setIsSubmitting(false);
      throw err;
    }
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
      // Filter out already-linked topics - they don't need to be linked again
      const topicsToLink = Array.from(selectedTopicIds).filter(
        topicId => !alreadyLinkedTopicIds.has(topicId)
      );
      
      // If all selected topics are already linked, just refresh and close
      if (topicsToLink.length === 0) {
        await onLink(Array.from(selectedTopicIds));
        onClose();
        return;
      }

      // Link all selected topics that aren't already linked, but handle "already linked" errors gracefully
      const results = await Promise.allSettled(
        topicsToLink.map((topicId) =>
          osintTopicsService.linkRecord(topicId, sourceRecordId)
        )
      );

      // Separate successful links from errors
      // Start with already-linked topics (they're already successful)
      const successful: string[] = Array.from(selectedTopicIds).filter(
        topicId => alreadyLinkedTopicIds.has(topicId)
      );
      const errors: string[] = [];
      
      results.forEach((result, index) => {
        const topicId = topicsToLink[index];
        if (result.status === 'fulfilled') {
          successful.push(topicId);
        } else {
          const error = result.reason;
          // Ignore "already linked" errors - these are fine (shouldn't happen since we filtered, but just in case)
          if (error instanceof Error && error.message.includes('already linked')) {
            successful.push(topicId); // Treat as success
          } else {
            errors.push(error instanceof Error ? error.message : 'Unknown error');
          }
        }
      });

      // Show error only if there were real failures (not just "already linked")
      if (errors.length > 0) {
        setError(`Failed to link some topics: ${errors.join(', ')}`);
      }

      // Refresh parent and close if we have any successful links (including already-linked ones)
      if (successful.length > 0) {
        await onLink(successful);
        onClose();
      }
    } catch (err) {
      console.error('Error linking to topics:', err);
      setError(err instanceof Error ? err.message : 'Failed to link to topics');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSingleMode = mode === 'single';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header - Fixed */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-stone-800">
          <div>
            <h2 className="text-xl font-bold text-stone-100">
              {isSingleMode ? 'Quick Link to Topic' : 'Link to Topics'}
            </h2>
            {recordTitle && (
              <p className="text-sm text-stone-400 mt-1 line-clamp-1">{recordTitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-stone-400 hover:text-stone-200 transition-colors duration-250 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {showCreateForm ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-stone-200">Create New Topic</h3>
                <button
                  type="button"
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
            <form onSubmit={!isSingleMode ? handleSubmit : undefined} className="flex flex-col">
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
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Topic</span>
                </button>
              </div>

              {/* Topics List */}
              <div>
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <LoadingSpinner />
                  </div>
                ) : filteredTopics.length === 0 ? (
                  <EmptyState
                    icon={<Link2 size={64} className="text-stone-600" />}
                    title={searchQuery ? 'No topics found' : `No ${filterActiveOnly ? 'active ' : ''}topics`}
                    description={
                      searchQuery
                        ? 'Try a different search term'
                        : 'Create a topic first to link records to it'
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    {!isSingleMode && (
                      <p className="text-sm text-stone-400 mb-2">
                        Select one or more topics ({selectedTopicIds.size} selected)
                      </p>
                    )}
                    {filteredTopics.map((topic) => {
                      const isSelected = selectedTopicIds.has(topic.id);
                      const isAlreadyLinked = alreadyLinkedTopicIds.has(topic.id);
                      const canDeselect = !isAlreadyLinked || !isSelected;
                      return (
                        <button
                          key={topic.id}
                          type={isSingleMode ? 'button' : 'button'}
                          onClick={() => handleLinkToTopic(topic.id)}
                          disabled={isSubmitting}
                          title={isAlreadyLinked && isSelected ? 'Already linked - cannot be deselected here. Unlink from the Topic page instead.' : undefined}
                          className={`w-full text-left p-4 border rounded-lg transition-all duration-250 disabled:opacity-50 ${
                            isSingleMode
                              ? 'border-stone-700 hover:border-blue-500 hover:bg-blue-900/20 disabled:cursor-not-allowed'
                              : isSelected
                              ? isAlreadyLinked
                                ? 'border-green-600 bg-green-900/20 cursor-default' // Already linked - different color
                                : 'border-blue-600 bg-blue-900/20 cursor-pointer'
                              : 'border-stone-800 hover:border-stone-700 cursor-pointer'
                          } ${!canDeselect && isSelected ? 'opacity-75' : ''}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-stone-100">{topic.name}</h3>
                                {isSelected && !isSingleMode && (
                                  <LinkIcon 
                                    size={16} 
                                    className={`flex-shrink-0 ${isAlreadyLinked ? 'text-green-500' : 'text-blue-500'}`} 
                                  />
                                )}
                                {isAlreadyLinked && isSelected && (
                                  <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-700">
                                    Already Linked
                                  </span>
                                )}
                                {isSingleMode && (
                                  <Link2 className="w-5 h-5 text-stone-400 ml-auto flex-shrink-0" />
                                )}
                              </div>
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
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions (only for multi mode) */}
              {!isSingleMode && (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800 mt-4">
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
              )}
            </form>
          )}
        </div>

        {/* Footer for single mode - Fixed */}
        {isSingleMode && !showCreateForm && (
          <div className="flex-shrink-0 px-6 py-4 bg-stone-800 border-t border-stone-700 rounded-b-lg flex justify-between items-center">
            <p className="text-sm text-stone-400">
              Click on a topic to link this record
            </p>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-stone-300 hover:bg-stone-700 rounded-md transition-colors duration-250 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Loading Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 bg-stone-900/75 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-stone-300">
                {isSingleMode ? 'Linking to topic...' : 'Linking to topics...'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline Topic Creation Form
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
              <span>Create & Continue</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

