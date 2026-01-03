import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Plus, Search, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { osintTopicsService } from '../../services';
import { EmptyState } from '../UI/EmptyState';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { TopicCard } from './TopicCard';
import { TopicForm } from './TopicForm';

export function TopicsPage() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadTopics = async (showSpinner = true) => {
    if (!currentOrganization) {
      setIsLoading(false);
      return;
    }

    try {
      if (showSpinner) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      
      const fetchedTopics = await osintTopicsService.getAll(currentOrganization.id);
      setTopics(fetchedTopics);
    } catch (err) {
      console.error('Error loading topics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load topics');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      loadTopics();
    }
  }, [currentOrganization?.id]);

  const handleCreateTopic = async (topicData: {
    name: string;
    description?: string;
    keywords?: string[];
  }) => {
    if (!currentOrganization) {
      throw new Error('No organization selected');
    }

    try {
      const newTopic = await osintTopicsService.create(currentOrganization.id, topicData);
      setTopics([newTopic, ...topics]);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating topic:', err);
      throw err; // Let form handle the error
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!confirm('Delete this topic? All links to source records will be removed.')) {
      return;
    }

    try {
      await osintTopicsService.delete(topicId);
      setTopics(topics.filter(t => t.id !== topicId));
    } catch (err) {
      console.error('Error deleting topic:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete topic');
    }
  };

  const handleTopicClick = (topicId: string) => {
    navigate(`/topics/${topicId}`);
  };

  const filteredTopics = topics.filter(topic =>
    searchQuery === '' ||
    topic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (topic.description && topic.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (topic.keywords && topic.keywords.some((k: string) => 
      k.toLowerCase().includes(searchQuery.toLowerCase())
    ))
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
                <Target className="text-blue-500" size={32} />
                Topics
              </h1>
              <p className="mt-2 text-stone-400">
                Organize and track intelligence topics across your sources
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadTopics(false)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
                title="Refresh topics"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
              >
                <Plus size={18} />
                Create Topic
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search topics by name, description, or keywords..."
              className="w-full pl-10 pr-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Topics List */}
        {filteredTopics.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No topics found' : 'No topics yet'}
            description={
              searchQuery
                ? 'Try adjusting your search query.'
                : 'Create your first topic to start organizing intelligence from source records.'
            }
            icon={<Target size={64} className="text-stone-600" />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTopics.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                onClick={() => handleTopicClick(topic.id)}
                onDelete={() => handleDeleteTopic(topic.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Topic Modal */}
      {showCreateModal && (
        <TopicForm
          onSubmit={handleCreateTopic}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}


