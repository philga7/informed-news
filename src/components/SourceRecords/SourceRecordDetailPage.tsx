import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Calendar, Database, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { sourceRecordsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';
import { LinkToTopicModal } from './LinkToTopicModal';

export function SourceRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [record, setRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const organizationId = '00000000-0000-0000-0000-000000009997';

  const loadRecord = async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      setError(null);
      const fetchedRecord = await sourceRecordsService.getById(id);
      setRecord(fetchedRecord);
    } catch (err) {
      console.error('Error loading record:', err);
      setError(err instanceof Error ? err.message : 'Failed to load source record');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecord();
  }, [id]);

  const handleLinkToTopics = async (topicIds: string[]) => {
    // This would call the API to link to multiple topics
    // For now, we'll just refresh the record
    setShowLinkModal(false);
    await loadRecord();
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getReliabilityColor = (rating: string) => {
    switch (rating) {
      case 'HIGH':
        return 'bg-green-900/30 text-green-400 border-green-800/50';
      case 'MEDIUM':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50';
      case 'LOW':
        return 'bg-orange-900/30 text-orange-400 border-orange-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="min-h-screen bg-stone-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => navigate('/source-records')}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-300 mb-4 transition-colors duration-250"
          >
            <ArrowLeft size={18} />
            Back to Source Records
          </button>
          <EmptyState
            title="Source Record Not Found"
            description={error || 'The source record you are looking for does not exist.'}
          />
        </div>
      </div>
    );
  }

  const linkedTopics = record.topic_source_links || [];

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/source-records')}
          className="flex items-center gap-2 text-stone-400 hover:text-stone-300 mb-6 transition-colors duration-250"
        >
          <ArrowLeft size={18} />
          Back to Source Records
        </button>

        {/* Record Content */}
        <article className="bg-stone-900 border border-stone-800 rounded-lg p-8">
          {/* Title */}
          <h1 className="text-3xl font-bold text-stone-100 mb-4">{record.title}</h1>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b border-stone-800">
            <div className="flex items-center gap-2 text-stone-400">
              <Database size={16} />
              <span className="text-sm">{record.sources?.name}</span>
              <span
                className={`ml-2 px-2 py-1 text-xs rounded border ${getReliabilityColor(
                  record.sources?.reliability_rating
                )}`}
              >
                {record.sources?.reliability_rating}
              </span>
            </div>
            {record.publishedAt && (
              <div className="flex items-center gap-2 text-stone-400">
                <Calendar size={16} />
                <span className="text-sm">{formatDate(record.publishedAt)}</span>
              </div>
            )}
            {record.url && (
              <a
                href={record.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors duration-250"
              >
                <ExternalLink size={16} />
                View Source
              </a>
            )}
          </div>

          {/* Content */}
          {record.content && (
            <div className="prose prose-invert prose-stone max-w-none mb-8">
              <div className="text-stone-300 leading-relaxed whitespace-pre-wrap">
                {record.content}
              </div>
            </div>
          )}

          {/* Additional Metadata */}
          {(record.language || record.geographic_indicators) && (
            <div className="mt-8 pt-6 border-t border-stone-800">
              <h3 className="text-lg font-semibold text-stone-200 mb-4">Metadata</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {record.language && (
                  <div>
                    <span className="text-stone-400">Language:</span>
                    <span className="ml-2 text-stone-300">{record.language.toUpperCase()}</span>
                  </div>
                )}
                {record.geographic_indicators && (
                  <div>
                    <span className="text-stone-400">Geographic Indicators:</span>
                    <span className="ml-2 text-stone-300">
                      {JSON.stringify(record.geographic_indicators)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </article>

        {/* Linked Topics Section */}
        <div className="mt-6 bg-stone-900 border border-stone-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-stone-200 flex items-center gap-2">
              <LinkIcon size={20} />
              Linked Topics
            </h2>
            <button
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
            >
              <LinkIcon size={16} />
              Link to Topic
            </button>
          </div>

          {linkedTopics.length === 0 ? (
            <p className="text-stone-500 text-center py-4">
              This record is not linked to any topics yet.
            </p>
          ) : (
            <div className="space-y-3">
              {linkedTopics.map((link: any) => (
                <div
                  key={link.id}
                  className="flex items-start justify-between p-4 bg-stone-800 border border-stone-700 rounded-lg hover:border-stone-600 transition-colors duration-250"
                >
                  <div className="flex-1">
                    <button
                      onClick={() => navigate(`/topics/${link.osint_topics.id}`)}
                      className="text-lg font-medium text-stone-200 hover:text-blue-400 transition-colors duration-250"
                    >
                      {link.osint_topics.name}
                    </button>
                    {link.analystNotes && (
                      <p className="text-sm text-stone-400 mt-1">{link.analystNotes}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
                      {link.confidenceLevel && (
                        <span>Confidence: {link.confidenceLevel}</span>
                      )}
                      {link.relevanceScore !== null && (
                        <span>Relevance: {(link.relevanceScore * 100).toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Link to Topic Modal */}
      {showLinkModal && (
        <LinkToTopicModal
          sourceRecordId={id!}
          organizationId={organizationId}
          onLink={handleLinkToTopics}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  );
}

