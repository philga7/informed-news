import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Target, Link as LinkIcon, AlertCircle, CheckCircle, Archive, Trash2 } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { useToast } from '../../context/ToastContext';
import { sourceRecordsService } from '../../services/sourceRecords.service';
import { retentionService } from '../../services/retention.service';
import { osintTopicsService } from '../../services/osintTopics.service';
import type { SourceRecord, OsintTopic } from '../../types/osint';

interface SourceRecordWithDetails extends SourceRecord {
  sources: {
    id: string;
    name: string;
  };
  topic_source_links?: Array<{
    id: string;
    topicId: string;
    osint_topics: {
      id: string;
      name: string;
    };
  }>;
}

interface TopicWithCount extends OsintTopic {
  linked_records_count: number;
}

export function DailyReview() {
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const toast = useToast();
  const [unlinkedRecords, setUnlinkedRecords] = useState<SourceRecordWithDetails[]>([]);
  const [activeTopics, setActiveTopics] = useState<TopicWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingRecordId, setProcessingRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganization) {
      loadDailyData();
    }
  }, [currentOrganization]);

  const loadDailyData = async () => {
    if (!currentOrganization) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch unlinked records from the last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const recordsResult = await sourceRecordsService.getAll({
        organizationId: currentOrganization.id,
        linkedStatus: 'unlinked',
        dateFrom: yesterday.toISOString(),
        limit: 20,
      });

      setUnlinkedRecords(recordsResult.records);

      // Fetch active topics
      const topics = await osintTopicsService.getAll(currentOrganization.id);
      const activeOnly = topics.filter(t => t.status === 'active');
      setActiveTopics(activeOnly);
    } catch (err) {
      console.error('Failed to load daily review data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTopicStaleStatus = (topic: TopicWithCount) => {
    if (topic.linked_records_count === 0) {
      return { status: 'empty', message: 'No linked records yet' };
    }

    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(topic.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceUpdate > 14) {
      return { status: 'stale', message: `Last updated ${daysSinceUpdate} days ago` };
    }

    if (daysSinceUpdate > 7) {
      return { status: 'aging', message: `Updated ${daysSinceUpdate} days ago` };
    }

    return { status: 'fresh', message: `Updated ${daysSinceUpdate} days ago` };
  };

  const handleArchive = async (recordId: string, recordTitle: string) => {
    if (!window.confirm(`Archive "${recordTitle}"? This can be undone.`)) {
      return;
    }

    setProcessingRecordId(recordId);
    try {
      await sourceRecordsService.archive(recordId);
      
      // Show toast with undo
      toast.showArchive(
        `"${recordTitle}" archived`,
        async () => {
          try {
            await retentionService.undoArchive(recordId);
            toast.showSuccess('Record restored');
            await loadDailyData();
          } catch (err) {
            toast.showError('Failed to restore record');
          }
        }
      );

      // Remove from list
      setUnlinkedRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to archive record';
      if (errorMessage.includes('protected')) {
        alert('Cannot archive this record. It is linked to topics, has artifacts, or is linked to watch items.');
      } else {
        toast.showError(errorMessage);
      }
    } finally {
      setProcessingRecordId(null);
    }
  };

  const handleDelete = async (recordId: string, recordTitle: string) => {
    if (!window.confirm(`Permanently delete "${recordTitle}"? This action cannot be undone.`)) {
      return;
    }

    setProcessingRecordId(recordId);
    try {
      await sourceRecordsService.delete(recordId);
      toast.showDelete(`"${recordTitle}" deleted`);
      
      // Remove from list
      setUnlinkedRecords((prev) => prev.filter((r) => r.id !== recordId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete record';
      if (errorMessage.includes('protected')) {
        alert('Cannot delete this record. It is linked to topics, has artifacts, or is linked to watch items.');
      } else {
        toast.showError(errorMessage);
      }
    } finally {
      setProcessingRecordId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-stone-400">Loading daily review...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Clock className="text-accent" size={24} />
          <h2 className="text-2xl font-semibold text-stone-200">Daily Review</h2>
        </div>
        <p className="text-stone-400 text-sm">
          Quick 15-minute workflow: Review new records, check active topics, and maintain momentum.
        </p>
      </div>

      {/* Today's Inbox */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2">
            <LinkIcon size={20} className="text-accent" />
            Today's Inbox ({unlinkedRecords.length})
          </h3>
          {unlinkedRecords.length === 0 && (
            <span className="flex items-center gap-1 text-green-400 text-sm">
              <CheckCircle size={16} />
              All caught up!
            </span>
          )}
        </div>

        {unlinkedRecords.length === 0 ? (
          <div className="text-stone-500 text-sm text-center py-8">
            No new unlinked records from the last 24 hours. You're all caught up!
          </div>
        ) : (
          <div className="space-y-3">
            {unlinkedRecords.slice(0, 10).map((record) => (
              <div
                key={record.id}
                onClick={() => navigate(`/source-records/${record.id}`)}
                className="bg-stone-800/50 hover:bg-stone-800 border border-stone-700 rounded-lg p-4 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-stone-200 font-medium mb-1 line-clamp-2">
                      {record.title}
                    </h4>
                    <div className="flex items-center gap-3 text-xs text-stone-500">
                      <span>{record.sources.name}</span>
                      <span>•</span>
                      <span>{formatDate(record.publishedAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/source-records/${record.id}`);
                      }}
                      className="px-3 py-1 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors whitespace-nowrap"
                    >
                      Link
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(record.id, record.title);
                      }}
                      disabled={processingRecordId === record.id}
                      className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors disabled:opacity-50"
                      title="Archive"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(record.id, record.title);
                      }}
                      disabled={processingRecordId === record.id}
                      className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {unlinkedRecords.length > 10 && (
              <button
                onClick={() => navigate('/source-records?filter=unlinked')}
                className="w-full py-2 text-accent hover:text-accent-hover text-sm font-medium transition-colors"
              >
                View all {unlinkedRecords.length} unlinked records →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Active Topics Summary */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2 mb-4">
          <Target size={20} className="text-accent" />
          Active Topics ({activeTopics.length})
        </h3>

        {activeTopics.length === 0 ? (
          <div className="text-stone-500 text-sm text-center py-8">
            No active topics. Create a topic to start tracking intelligence requirements.
          </div>
        ) : (
          <div className="space-y-3">
            {activeTopics.map((topic) => {
              const staleStatus = getTopicStaleStatus(topic);
              return (
                <div
                  key={topic.id}
                  onClick={() => navigate(`/topics/${topic.id}`)}
                  className="bg-stone-800/50 hover:bg-stone-800 border border-stone-700 rounded-lg p-4 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-stone-200 font-medium mb-1">{topic.name}</h4>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-stone-400">
                          {topic.linked_records_count} linked records
                        </span>
                        <span
                          className={`${
                            staleStatus.status === 'stale'
                              ? 'text-red-400'
                              : staleStatus.status === 'aging'
                              ? 'text-yellow-400'
                              : 'text-stone-500'
                          }`}
                        >
                          {staleStatus.message}
                        </span>
                      </div>
                      {topic.decisionQuestion && (
                        <p className="text-stone-500 text-xs mt-2 italic line-clamp-1">
                          "{topic.decisionQuestion}"
                        </p>
                      )}
                    </div>
                    {staleStatus.status === 'stale' && (
                      <span className="flex items-center gap-1 px-2 py-1 bg-red-900/30 text-red-400 text-xs rounded">
                        <AlertCircle size={12} />
                        Stale
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily Tips */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 mb-3">Daily Workflow Tips</h3>
        <ul className="space-y-2 text-sm text-stone-400">
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Link quickly:</strong> Don't overthink initial
              links. You can add analyst notes and confidence levels later during weekly review.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Focus on relevance:</strong> Ask "Does this help
              answer my decision question?" If not, skip it.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Time target:</strong> Aim for ~15 minutes. This is
              triage, not deep analysis.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

