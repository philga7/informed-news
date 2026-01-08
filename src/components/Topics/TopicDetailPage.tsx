import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, FileText, Plus, Sparkles, Film, AlertTriangle, Trash2, Archive, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { osintTopicsService } from '../../services';
import { analysisService, type AnalyticArtifact } from '../../services/analysis.service';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';
import { ArtifactCard } from '../SourceRecords/ArtifactCard';
import { LinkedRecordsTable } from './LinkedRecordsTable';
import { LinkRecordModal } from './LinkRecordModal';
import { EditLinkModal } from './EditLinkModal';
import { TopicForm } from './TopicForm';
import { TopicTimelineChart } from './TopicTimelineChart';
import { TimelineStats } from './TimelineStats';
import { ConfidenceStats } from './ConfidenceStats';
import { TopicToneAggregate } from './TopicToneAggregate';
import { RelatedTopicsWidget } from './RelatedTopicsWidget';
import { CoordinationSection } from './CoordinationSection';
import { NarrativeEvolutionTimeline } from './NarrativeEvolutionTimeline';
import { TopicStatusBadge } from './TopicStatusBadge';
import { AuditHistoryTab } from './AuditHistoryTab';
import { QAChecklist } from './QAChecklist';
import { CollectionPlanCard } from './CollectionPlanCard';
import { ClaimsAnalysis } from './ClaimsAnalysis';
import { CorroborationMatrix } from './CorroborationMatrix';
import type { TopicTimeline } from '../../types/osint';

export function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: _user } = useAuth();
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
  const [topicArtifacts, setTopicArtifacts] = useState<AnalyticArtifact[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState<string | null>(null);
  const [brokenLinks, setBrokenLinks] = useState<any[]>([]);
  const [archivedLinks, setArchivedLinks] = useState<any[]>([]);
  const [isCleaningLinks, setIsCleaningLinks] = useState(false);

  const loadTopic = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const fetchedTopic = await osintTopicsService.getById(id);
      setTopic(fetchedTopic);
      // Validate links after loading topic
      await validateLinks();
    } catch (err) {
      console.error('Error loading topic:', err);
      setError(err instanceof Error ? err.message : 'Failed to load topic');
    } finally {
      setIsLoading(false);
    }
  };

  const validateLinks = async () => {
    if (!id) return;
    
    try {
      const validation = await osintTopicsService.validateLinks(id);
      setBrokenLinks(validation.brokenLinks || []);
      setArchivedLinks(validation.archivedLinks || []);
    } catch (err) {
      console.error('Error validating links:', err);
      // Don't block the page if validation fails
    }
  };

  const handleCleanupLinks = async (includeArchived: boolean = false) => {
    if (!id) return;
    
    if (!confirm(
      includeArchived
        ? `Are you sure you want to remove ${brokenLinks.length + archivedLinks.length} broken link(s)? This will remove links to both missing and archived records.`
        : `Are you sure you want to remove ${brokenLinks.length} broken link(s)? This will only remove links to completely missing records (archived records will be kept).`
    )) {
      return;
    }

    try {
      setIsCleaningLinks(true);
      const result = await osintTopicsService.cleanupLinks(id, includeArchived);
      alert(`Cleaned up ${result.deleted} orphaned link(s)`);
      // Reload topic and revalidate links
      await loadTopic();
      await validateLinks();
    } catch (err) {
      console.error('Error cleaning up links:', err);
      alert(err instanceof Error ? err.message : 'Failed to clean up links');
    } finally {
      setIsCleaningLinks(false);
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

  const loadTopicArtifacts = async () => {
    if (!id) return;

    try {
      setIsLoadingArtifacts(true);
      // Fetch artifacts for this topic via backend API to avoid RLS issues
      const artifacts = await analysisService.getTopicArtifacts(id);
      setTopicArtifacts(artifacts);
    } catch (err) {
      console.error('Error loading topic artifacts:', err);
      // Don't block the page if artifact loading fails - it's not critical
      setTopicArtifacts([]);
    } finally {
      setIsLoadingArtifacts(false);
    }
  };

  const handleGenerateTopicSummary = async () => {
    if (!id) return;
    try {
      setAnalysisLoading('topic_summary');
      await analysisService.generateTopicSummary(id);
      await loadTopicArtifacts();
    } catch (err) {
      console.error('Error generating topic summary:', err);
      alert(err instanceof Error ? err.message : 'Failed to generate topic summary');
    } finally {
      setAnalysisLoading(null);
    }
  };

  const handleCompareMediaTypes = async () => {
    if (!id) return;
    try {
      setAnalysisLoading('media_comparison');
      await analysisService.compareMediaTypes(id);
      await loadTopicArtifacts();
    } catch (err) {
      console.error('Error comparing media types:', err);
      alert(err instanceof Error ? err.message : 'Failed to compare media types');
    } finally {
      setAnalysisLoading(null);
    }
  };

  // Check if there are multiple media types linked
  const hasMultipleMediaTypes = () => {
    if (!linkedRecords || linkedRecords.length === 0) return false;
    const mediaTypes = new Set(
      linkedRecords
        .map((link: any) => (link.source_records as any)?.media_type || 'article')
        .filter(Boolean)
    );
    return mediaTypes.size >= 2;
  };

  useEffect(() => {
    loadTopic();
    loadTopicArtifacts();
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
    ? linkedRecords.find((link: any) => link.id === editingLinkId) 
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

        {/* Broken Links Warning */}
        {(brokenLinks.length > 0 || archivedLinks.length > 0) && (
          <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-4 mb-6">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-yellow-400 font-semibold mb-1">Broken or Archived Links Detected</h3>
                  <p className="text-yellow-300/80 text-sm">
                    {brokenLinks.length > 0 && (
                      <>
                        {brokenLinks.length} link{brokenLinks.length !== 1 ? 's' : ''} point{brokenLinks.length !== 1 ? '' : 's'} to source records that no longer exist.
                      </>
                    )}
                    {brokenLinks.length > 0 && archivedLinks.length > 0 && ' '}
                    {archivedLinks.length > 0 && (
                      <>
                        {archivedLinks.length} link{archivedLinks.length !== 1 ? 's' : ''} point{archivedLinks.length !== 1 ? '' : 's'} to archived source records.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 mt-3">
              {brokenLinks.length > 0 && (
                <button
                  onClick={() => handleCleanupLinks(false)}
                  disabled={isCleaningLinks}
                  className="flex items-center gap-2 px-3 py-2 bg-yellow-800/50 hover:bg-yellow-800/70 text-yellow-200 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isCleaningLinks ? (
                    <>
                      <LoadingSpinner />
                      <span>Cleaning up...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={16} />
                      <span>Remove {brokenLinks.length} Broken Link{brokenLinks.length !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </button>
              )}
              {archivedLinks.length > 0 && (
                <button
                  onClick={() => handleCleanupLinks(true)}
                  disabled={isCleaningLinks}
                  className="flex items-center gap-2 px-3 py-2 bg-orange-800/50 hover:bg-orange-800/70 text-orange-200 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isCleaningLinks ? (
                    <>
                      <LoadingSpinner />
                      <span>Cleaning up...</span>
                    </>
                  ) : (
                    <>
                      <Archive size={16} />
                      <span>Remove All Broken + Archived Links ({brokenLinks.length + archivedLinks.length})</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Show details */}
            {(brokenLinks.length > 0 || archivedLinks.length > 0) && (
              <div className="mt-4 pt-4 border-t border-yellow-800/50">
                <details className="text-sm">
                  <summary className="text-yellow-400 cursor-pointer hover:text-yellow-300">
                    View Details ({brokenLinks.length + archivedLinks.length} link{brokenLinks.length + archivedLinks.length !== 1 ? 's' : ''})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {brokenLinks.length > 0 && (
                      <div>
                        <h4 className="text-yellow-500 font-medium mb-2">Broken Links ({brokenLinks.length})</h4>
                        <div className="space-y-1 pl-4">
                          {brokenLinks.map((link) => (
                            <div key={link.id} className="text-yellow-300/80 text-xs">
                              • Link ID: {link.id} | Source Record ID: {link.source_record_id} | Linked: {new Date(link.linked_at).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {archivedLinks.length > 0 && (
                      <div>
                        <h4 className="text-orange-400 font-medium mb-2">Archived Links ({archivedLinks.length})</h4>
                        <div className="space-y-1 pl-4">
                          {archivedLinks.map((link) => (
                            <div key={link.id} className="text-orange-300/80 text-xs">
                              • Link ID: {link.id} | Source Record ID: {link.source_record_id} | Linked: {new Date(link.linked_at).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}
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

                {/* Topic-Level AI Analysis Section */}
                {linkedRecords.length > 0 && (
                  <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Sparkles size={20} className="text-accent" />
                      <h2 className="text-xl font-semibold text-stone-200">Topic-Level AI Analysis</h2>
                    </div>

                    <p className="text-sm text-stone-400 mb-4">
                      Generate AI-powered summary across all linked source records. Synthesizes information from multiple sources to provide comprehensive intelligence overview.
                    </p>

                    <div className="flex flex-wrap gap-3 mb-6">
                      <button
                        onClick={handleGenerateTopicSummary}
                        disabled={analysisLoading !== null || linkedRecords.length === 0}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-lg transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="w-4 h-4 flex items-center justify-center">
                          {analysisLoading === 'topic_summary' ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <FileText size={16} />
                          )}
                        </div>
                        <span>Generate Topic Summary</span>
                      </button>

                      {hasMultipleMediaTypes() && (
                        <button
                          onClick={handleCompareMediaTypes}
                          disabled={analysisLoading !== null || linkedRecords.length === 0}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-lg transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="w-4 h-4 flex items-center justify-center">
                            {analysisLoading === 'media_comparison' ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Film size={16} />
                            )}
                          </div>
                          <span>Compare Media Types</span>
                        </button>
                      )}
                    </div>

                    {/* Existing Topic Artifacts */}
                    {isLoadingArtifacts ? (
                      <div className="flex justify-center py-8">
                        <LoadingSpinner />
                      </div>
                    ) : topicArtifacts.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-semibold text-stone-400 uppercase mb-3">
                          Topic Analysis History ({topicArtifacts.length})
                        </h3>
                        <div className="space-y-3">
                          {topicArtifacts.map((artifact) => (
                            <ArtifactCard
                              key={artifact.id}
                              artifact={artifact}
                              onUpdate={loadTopicArtifacts}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-stone-500 text-center py-4 text-sm">
                        No topic-level analysis yet. Click the button above to generate a summary across all linked records.
                      </p>
                    )}
                  </div>
                )}

                {/* Collection Plan Card - Planning tool, should come before linking sources */}
                {id && (
                  <CollectionPlanCard
                    topicId={id}
                    collectionPlan={topic.collection_plan || null}
                    onSave={handleSaveCollectionPlan}
                  />
                )}

                {/* Linked Source Records Section - Collection phase, needs to be early */}
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

                {/* Confidence Assessment Section - Closely related to source records */}
                {linkedRecords.length > 0 && (
                  <div className="mb-6">
                    <ConfidenceStats links={linkedRecords} />
                  </div>
                )}

                {/* Topic-Level Tone Analysis Aggregate */}
                {linkedRecords.length > 0 && id && (
                  <div className="mb-6">
                    <TopicToneAggregate topicId={id} />
                  </div>
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

        {/* Verification Phase - Claims & Corroboration (should come before pattern detection) */}
        {activeTab === 'overview' && (
          <>
            {/* Claims Analysis Section */}
            {id && (
              <div className="mb-6">
                <ClaimsAnalysis topicId={id} />
              </div>
            )}

            {/* Corroboration Matrix Section */}
            {id && (
              <div className="mb-6">
                <CorroborationMatrix topicId={id} />
              </div>
            )}

            {/* Pattern Detection Phase - Temporal & Coordination Analysis */}
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

            {/* Coordination Detection Section */}
            {id && currentOrganization && (
              <div className="mb-6">
                <CoordinationSection topicId={id} organizationId={currentOrganization.id} />
              </div>
            )}

            {/* Context Section - Related Topics (moved to end) */}
            {id && (
              <div className="mb-6">
                <RelatedTopicsWidget topicId={id} />
              </div>
            )}
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

