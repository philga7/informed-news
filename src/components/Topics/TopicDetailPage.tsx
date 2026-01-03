import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { osintTopicsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';
import { LinkedRecordsTable } from './LinkedRecordsTable';
import { LinkRecordModal } from './LinkRecordModal';
import { EditLinkModal } from './EditLinkModal';
import { TopicForm } from './TopicForm';
import { TopicTimelineChart } from './TopicTimelineChart';
import { TimelineStats } from './TimelineStats';
import { ConfidenceStats } from './ConfidenceStats';
import { RelatedTopicsWidget } from './RelatedTopicsWidget';
import { CoordinationSection } from './CoordinationSection';
import { NarrativeEvolutionTimeline } from './NarrativeEvolutionTimeline';
import { TopicStatusBadge } from './TopicStatusBadge';
import { AuditHistoryTab } from './AuditHistoryTab';
import { QAChecklist } from './QAChecklist';
import { CollectionPlanCard } from './CollectionPlanCard';
import type { TopicTimeline } from '../../types/osint';

export function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [topic, setTopic] = useState<any>(null);
  const [timeline, setTimeline] = useState<TopicTimeline | null>(null);
  const [timelineBucket, setTimelineBucket] = useState<'day' | 'week' | 'month'>('day');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'qa'>('overview');

  const loadTopic = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const fetchedTopic = await osintTopicsService.getById(id);
      setTopic(fetchedTopic);
    } catch (err) {
      console.error('Error loading topic:', err);
      setError(err instanceof Error ? err.message : 'Failed to load topic');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTimeline = async () => {
    if (!id) return;
    
    try {
      setIsLoadingTimeline(true);
      console.log(`[Timeline] Fetching timeline for topic ${id} with bucket: ${timelineBucket}`);
      const timelineData = await osintTopicsService.getTimeline(id, {
        bucket: timelineBucket,
      });
      console.log('[Timeline] Timeline data received:', timelineData);
      setTimeline(timelineData);
    } catch (err) {
      console.error('[Timeline] Error loading timeline:', err);
      // Don't set error state for timeline failures, just log them
      setTimeline(null);
    } finally {
      setIsLoadingTimeline(false);
    }
  };

  useEffect(() => {
    loadTopic();
  }, [id]);

  useEffect(() => {
    loadTimeline();
  }, [id, timelineBucket]);

  const handleBucketChange = (bucket: 'day' | 'week' | 'month') => {
    setTimelineBucket(bucket);
  };

  const handleUpdateTopic = async (updates: {
    name: string;
    description?: string;
    keywords?: string[];
    decisionQuestion?: string;
    decisionContext?: string;
    keyIndicators?: string[];
    resolutionCriteria?: string;
  }) => {
    if (!id) return;

    try {
      const updatedTopic = await osintTopicsService.update(id, updates);
      setTopic({ ...topic, ...updatedTopic });
      setShowEditModal(false);
    } catch (err) {
      console.error('Error updating topic:', err);
      throw err;
    }
  };

  const handleUnlinkRecord = async (linkId: string) => {
    if (!id) return;

    try {
      await osintTopicsService.unlinkRecord(id, linkId);
      // Refresh topic to get updated links
      await loadTopic();
      // Refresh timeline to reflect changes
      await loadTimeline();
    } catch (err) {
      console.error('Error unlinking record:', err);
      setError(err instanceof Error ? err.message : 'Failed to unlink record');
    }
  };

  const handleLinkRecord = async (sourceRecordId: string, metadata?: any) => {
    if (!id) return;

    try {
      await osintTopicsService.linkRecord(id, sourceRecordId, metadata);
      setShowLinkModal(false);
      // Refresh topic to get updated links
      await loadTopic();
      // Refresh timeline to reflect changes
      await loadTimeline();
    } catch (err) {
      console.error('Error linking record:', err);
      throw err;
    }
  };

  const handleUpdateLink = async (linkId: string, updates: any) => {
    if (!id) return;

    try {
      await osintTopicsService.updateLink(id, linkId, updates);
      setEditingLinkId(null);
      // Refresh topic to get updated links
      await loadTopic();
    } catch (err) {
      console.error('Error updating link:', err);
      throw err;
    }
  };

  const handleSaveCollectionPlan = async (plan: any) => {
    if (!id) return;

    try {
      const savedPlan = await osintTopicsService.saveCollectionPlan(id, plan);
      // Update topic state with new collection plan
      setTopic({ ...topic, collection_plan: savedPlan });
    } catch (err) {
      console.error('Error saving collection plan:', err);
      throw err;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="min-h-screen bg-stone-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => navigate('/topics')}
            className="flex items-center gap-2 text-stone-400 hover:text-stone-300 mb-4 transition-colors duration-250"
          >
            <ArrowLeft size={18} />
            Back to Topics
          </button>
          <EmptyState
            title="Topic Not Found"
            description={error || 'The topic you are looking for does not exist.'}
          />
        </div>
      </div>
    );
  }

  const linkedRecords = topic.topic_source_links || [];
  const editingLink = editingLinkId 
    ? linkedRecords.find(link => link.id === editingLinkId) 
    : null;

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/topics')}
          className="flex items-center gap-2 text-stone-400 hover:text-stone-300 mb-6 transition-colors duration-250"
        >
          <ArrowLeft size={18} />
          Back to Topics
        </button>

        {/* Topic Header */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-stone-100">{topic.name}</h1>
                {id && (
                  <TopicStatusBadge
                    topicId={id}
                    topicName={topic.name}
                    currentStatus={topic.status || 'active'}
                    onStatusChange={() => loadTopic()}
                  />
                )}
              </div>
              {topic.description && (
                <p className="text-stone-400 mb-4">{topic.description}</p>
              )}
            </div>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
            >
              <Edit2 size={18} />
              Edit
            </button>
          </div>

          {/* Keywords */}
          {topic.keywords && topic.keywords.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-stone-400 mb-2">Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {topic.keywords.map((keyword: string, index: number) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="mt-4 pt-4 border-t border-stone-800 flex items-center gap-6 text-sm text-stone-500">
            <div className="flex items-center gap-2">
              <FileText size={16} />
              <span>{linkedRecords.length} linked record{linkedRecords.length !== 1 ? 's' : ''}</span>
            </div>
            <span>Created {new Date(topic.createdAt).toLocaleDateString()}</span>
            <span>Updated {new Date(topic.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Related Topics Section */}
        {id && (
          <div className="mb-6">
            <RelatedTopicsWidget topicId={id} />
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg mb-6">
          <div className="flex border-b border-stone-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 font-medium transition-colors duration-200 ${
                activeTab === 'overview'
                  ? 'text-stone-100 border-b-2 border-accent'
                  : 'text-stone-400 hover:text-stone-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 font-medium transition-colors duration-200 ${
                activeTab === 'history'
                  ? 'text-stone-100 border-b-2 border-accent'
                  : 'text-stone-400 hover:text-stone-300'
              }`}
            >
              History
            </button>
            <button
              onClick={() => setActiveTab('qa')}
              className={`px-6 py-3 font-medium transition-colors duration-200 ${
                activeTab === 'qa'
                  ? 'text-stone-100 border-b-2 border-accent'
                  : 'text-stone-400 hover:text-stone-300'
              }`}
            >
              Quality Assurance
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Intelligence Requirement Display */}
                {(topic.decision_question || topic.decision_context || topic.key_indicators?.length > 0 || topic.resolution_criteria) && (
                  <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-stone-200 mb-4">Intelligence Requirement</h3>
                    
                    {topic.decision_question && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-stone-400 mb-1">Decision Question</h4>
                        <p className="text-stone-300">{topic.decision_question}</p>
                      </div>
                    )}
                    
                    {topic.decision_context && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-stone-400 mb-1">Decision Context</h4>
                        <p className="text-stone-300">{topic.decision_context}</p>
                      </div>
                    )}
                    
                    {topic.key_indicators && topic.key_indicators.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-stone-400 mb-2">Key Indicators</h4>
                        <div className="flex flex-wrap gap-2">
                          {topic.key_indicators.map((indicator: string, index: number) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-blue-900/30 text-blue-300 text-sm rounded border border-blue-800"
                            >
                              {indicator}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {topic.resolution_criteria && (
                      <div>
                        <h4 className="text-sm font-medium text-stone-400 mb-1">Resolution Criteria</h4>
                        <p className="text-stone-300">{topic.resolution_criteria}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Collection Plan Card */}
                {id && (
                  <CollectionPlanCard
                    topicId={id}
                    collectionPlan={topic.collection_plan || null}
                    onSave={handleSaveCollectionPlan}
                  />
                )}
              </div>
            )}

            {activeTab === 'history' && id && (
              <AuditHistoryTab entityType="topic" entityId={id} />
            )}

            {activeTab === 'qa' && id && (
              <QAChecklist topicId={id} />
            )}
          </div>
        </div>

        {/* Timeline Section - Only show in Overview tab */}
        {activeTab === 'overview' && (
          <>
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-stone-200 mb-4">Temporal Analysis</h2>
          
          {isLoadingTimeline ? (
            <div className="bg-stone-900 border border-stone-800 rounded-lg p-12 flex items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : timeline ? (
            <>
              {/* Timeline Stats */}
              <div className="mb-6">
                <TimelineStats timeline={timeline} />
              </div>

              {/* Timeline Chart */}
              <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 mb-6">
                <TopicTimelineChart
                  timeline={timeline}
                  bucket={timelineBucket}
                  onBucketChange={handleBucketChange}
                />
              </div>

              {/* Narrative Evolution Timeline */}
              {id && (
                <NarrativeEvolutionTimeline
                  topicId={id}
                  bucket={timelineBucket}
                  onBucketChange={handleBucketChange}
                />
              )}
            </>
          ) : (
            <div className="bg-stone-900 border border-stone-800 rounded-lg p-12">
              <EmptyState
                title="No Timeline Data"
                description="Timeline analysis will appear once source records are linked to this topic."
                icon={<FileText size={48} className="text-stone-600" />}
              />
            </div>
          )}
        </div>

        {/* Confidence Assessment Section */}
        {linkedRecords.length > 0 && (
          <div className="mb-6">
            <ConfidenceStats links={linkedRecords} />
          </div>
        )}

        {/* Coordination Detection Section */}
        {id && currentOrganization && (
          <div className="mb-6">
            <CoordinationSection topicId={id} organizationId={currentOrganization.id} />
          </div>
        )}

        {/* Linked Source Records Section */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-stone-200">Linked Source Records</h2>
            <button
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
            >
              <Plus size={18} />
              Link Source Record
            </button>
          </div>

          {linkedRecords.length === 0 ? (
            <EmptyState
              title="No linked records"
              description="Link source records to this topic to start building your intelligence picture."
              icon={<FileText size={48} className="text-stone-600" />}
            />
          ) : (
            <LinkedRecordsTable
              links={linkedRecords}
              onUnlink={handleUnlinkRecord}
              onEdit={(linkId) => setEditingLinkId(linkId)}
            />
          )}
        </div>
        </>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <TopicForm
          initialData={{
            name: topic.name,
            description: topic.description || '',
            keywords: topic.keywords || [],
            decisionQuestion: topic.decision_question || '',
            decisionContext: topic.decision_context || '',
            keyIndicators: topic.key_indicators || [],
            resolutionCriteria: topic.resolution_criteria || '',
          }}
          onSubmit={handleUpdateTopic}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {/* Link Record Modal */}
      {showLinkModal && currentOrganization && (
        <LinkRecordModal
          organizationId={currentOrganization.id}
          onLink={handleLinkRecord}
          onClose={() => setShowLinkModal(false)}
        />
      )}

      {/* Edit Link Modal */}
      {editingLink && (
        <EditLinkModal
          link={editingLink}
          topicId={id!}
          onSave={handleUpdateLink}
          onClose={() => setEditingLinkId(null)}
        />
      )}
    </div>
  );
}

