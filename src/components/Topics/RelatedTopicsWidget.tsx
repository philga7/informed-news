import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, TrendingUp } from 'lucide-react';
import { osintTopicsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import type { RelatedTopic } from '../../types/osint';

interface RelatedTopicsWidgetProps {
  topicId: string;
}

export function RelatedTopicsWidget({ topicId }: RelatedTopicsWidgetProps) {
  const navigate = useNavigate();
  const [relatedTopics, setRelatedTopics] = useState<RelatedTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRelatedTopics();
  }, [topicId]);

  const loadRelatedTopics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const topics = await osintTopicsService.getRelatedTopics(topicId);
      setRelatedTopics(topics);
    } catch (err) {
      console.error('Error loading related topics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load related topics');
    } finally {
      setIsLoading(false);
    }
  };

  const getSimilarityColor = (score: number): string => {
    if (score >= 0.5) return 'text-green-400';
    if (score >= 0.3) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const getSimilarityBgColor = (score: number): string => {
    if (score >= 0.5) return 'bg-green-500/20';
    if (score >= 0.3) return 'bg-yellow-500/20';
    return 'bg-orange-500/20';
  };

  if (isLoading) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Network className="text-blue-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Related Topics</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Network className="text-blue-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Related Topics</h3>
        </div>
        <div className="text-center py-8 text-stone-500">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (relatedTopics.length === 0) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Network className="text-blue-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Related Topics</h3>
        </div>
        <div className="text-center py-8 text-stone-500">
          <p>No related topics found. Link more source records to discover connections.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Network className="text-blue-500" size={20} />
        <h3 className="text-lg font-semibold text-stone-200">Related Topics</h3>
        <span className="text-sm text-stone-500">({relatedTopics.length})</span>
      </div>

      <div className="space-y-3">
        {relatedTopics.slice(0, 10).map((topic) => (
          <button
            key={topic.topic_id}
            onClick={() => navigate(`/topics/${topic.topic_id}`)}
            className="w-full flex items-center justify-between p-3 bg-stone-800/50 hover:bg-stone-800 rounded-lg transition-colors duration-200 text-left group"
          >
            <div className="flex-1 min-w-0">
              <h4 className="text-stone-200 font-medium truncate group-hover:text-blue-400 transition-colors duration-200">
                {topic.name}
              </h4>
              <p className="text-sm text-stone-500 mt-1">
                {topic.shared_records} shared record{topic.shared_records !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="ml-4 flex items-center gap-2">
              <div className={`px-3 py-1 rounded text-sm font-medium ${getSimilarityBgColor(topic.similarity_score)} ${getSimilarityColor(topic.similarity_score)}`}>
                {(topic.similarity_score * 100).toFixed(0)}%
              </div>
              <TrendingUp className="text-stone-500 group-hover:text-blue-400 transition-colors duration-200" size={18} />
            </div>
          </button>
        ))}
      </div>

      {relatedTopics.length > 10 && (
        <div className="mt-4 text-center text-sm text-stone-500">
          Showing top 10 of {relatedTopics.length} related topics
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-stone-800 text-sm text-stone-400 bg-stone-800/30 rounded p-3 border-l-2 border-blue-600">
        <p className="font-medium text-stone-300 mb-1">Co-occurrence Analysis</p>
        <p>
          Topics are related based on shared source records. Similarity score uses Jaccard index
          to measure overlap between topic coverage.
        </p>
      </div>
    </div>
  );
}

