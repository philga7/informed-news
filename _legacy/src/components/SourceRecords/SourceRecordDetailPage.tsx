import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Calendar, Database, Link as LinkIcon, Sparkles, FileText, Users, MessageSquare, ListChecks, Loader2, FileEdit, ChevronDown, Archive, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { useToast } from '../../context/ToastContext';
import { sourceRecordsService } from '../../services';
import { retentionService } from '../../services/retention.service';
import { analysisService, type AnalyticArtifact } from '../../services/analysis.service';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';
import { LinkToTopicModal } from '../Topics/LinkToTopicModal';
import { ArtifactCard } from './ArtifactCard';

export function SourceRecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: _user } = useAuth();
  const { currentOrganization } = useOrganization();
  const toast = useToast();
  const [record, setRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [artifacts, setArtifacts] = useState<AnalyticArtifact[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState<string | null>(null);
  const [newArtifactIds, setNewArtifactIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  // Initialize summaryContentSource from localStorage, defaulting to 'stored'
  const [summaryContentSource, setSummaryContentSource] = useState<'stored' | 'fresh'>(() => {
    const saved = localStorage.getItem('informed-news:summaryContentSource');
    return (saved === 'stored' || saved === 'fresh') ? saved : 'stored';
  });
  const [summaryDropdownOpen, setSummaryDropdownOpen] = useState(false);
  const summaryDropdownRef = useRef<HTMLDivElement>(null);

  // Persist summaryContentSource to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('informed-news:summaryContentSource', summaryContentSource);
  }, [summaryContentSource]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (summaryDropdownRef.current && !summaryDropdownRef.current.contains(event.target as Node)) {
        setSummaryDropdownOpen(false);
      }
    };

    if (summaryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [summaryDropdownOpen]);

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

  const loadArtifacts = async (showSpinner = false) => {
    if (!id) return;

    try {
      if (showSpinner) {
        setIsLoadingArtifacts(true);
      }
      const fetchedArtifacts = await analysisService.getArtifactsForSourceRecord(id);
      setArtifacts(fetchedArtifacts);
    } catch (err) {
      console.error('Error loading artifacts:', err);
    } finally {
      setIsLoadingArtifacts(false);
    }
  };

  useEffect(() => {
    loadRecord();
    loadArtifacts();
    // Clear new artifact IDs when navigating to a different record
    setNewArtifactIds(new Set());
  }, [id]);

  const handleGenerateSummary = async (contentSource: 'stored' | 'fresh' = summaryContentSource) => {
    if (!id) return;
    try {
      setAnalysisLoading('summary');
      setSummaryDropdownOpen(false);
      const newArtifact = await analysisService.generateSummary(id, contentSource === 'fresh');
      setNewArtifactIds(prev => new Set(prev).add(newArtifact.id));
      await loadArtifacts();
    } catch (err) {
      console.error('Error generating summary:', err);
      alert(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setAnalysisLoading(null);
    }
  };

  const handleExtractEntities = async () => {
    if (!id) return;
    try {
      setAnalysisLoading('entities');
      const newArtifact = await analysisService.extractEntities(id, summaryContentSource === 'fresh');
      setNewArtifactIds(prev => new Set(prev).add(newArtifact.id));
      await loadArtifacts();
    } catch (err) {
      console.error('Error extracting entities:', err);
      alert(err instanceof Error ? err.message : 'Failed to extract entities');
    } finally {
      setAnalysisLoading(null);
    }
  };

  const handleAnalyzeTone = async () => {
    if (!id) return;
    try {
      setAnalysisLoading('tone');
      const newArtifact = await analysisService.analyzeTone(id, summaryContentSource === 'fresh');
      setNewArtifactIds(prev => new Set(prev).add(newArtifact.id));
      await loadArtifacts();
    } catch (err) {
      console.error('Error analyzing tone:', err);
      alert(err instanceof Error ? err.message : 'Failed to analyze tone');
    } finally {
      setAnalysisLoading(null);
    }
  };

  const handleExtractKeyFacts = async () => {
    if (!id) return;
    try {
      setAnalysisLoading('key_facts');
      const newArtifact = await analysisService.extractKeyFacts(id, summaryContentSource === 'fresh');
      setNewArtifactIds(prev => new Set(prev).add(newArtifact.id));
      await loadArtifacts();
    } catch (err) {
      console.error('Error extracting key facts:', err);
      alert(err instanceof Error ? err.message : 'Failed to extract key facts');
    } finally {
      setAnalysisLoading(null);
    }
  };

  const handleAddNotes = async () => {
    if (!id) return;
    try {
      setAnalysisLoading('notes');
      // Create a new notes artifact with empty content
      const newArtifact = await analysisService.createNotes(id, '');
      setNewArtifactIds(prev => new Set(prev).add(newArtifact.id));
      await loadArtifacts();
    } catch (err) {
      console.error('Error creating notes:', err);
      alert(err instanceof Error ? err.message : 'Failed to create notes');
    } finally {
      setAnalysisLoading(null);
    }
  };

  const handleLinkToTopics = async (topicIds: string[]) => {
    // Reload the record to get updated linked topics after linking
    // The modal will close itself after onLink completes
    try {
      // Small delay to ensure database transaction has committed
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Load the record - this will update the state
      await loadRecord();
      
      // Show success message
      toast.showSuccess(`Successfully linked to ${topicIds.length} topic${topicIds.length > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Error refreshing record after linking:', err);
      toast.showError('Link created but failed to refresh. Please reload the page to see the link.');
    }
  };

  const handleArchive = async () => {
    if (!id || !record) return;

    setIsProcessing(true);
    try {
      // Archive the record
      await sourceRecordsService.archive(id);
      
      // Show toast with undo after successful archive (like Delete)
      toast.showArchive(
        `"${record.title}" archived`,
        async () => {
          try {
            await retentionService.undoArchive(id);
            toast.showSuccess('Record restored');
            await loadRecord();
          } catch (err) {
            toast.showError('Failed to restore record');
          }
        }
      );

      // Navigate back to source records list after a short delay to allow toast to be visible
      setTimeout(() => {
        navigate('/source-records');
      }, 100);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to archive record';
      if (errorMessage.includes('protected') || errorMessage.includes('Cannot archive')) {
        // Try to extract detailed message from error response
        let detailedMessage = 'Cannot archive this record. It is linked to active topics, has artifacts, or is linked to watch items. Unlink these relationships or archive the associated topics before archiving.';
        
        if (err instanceof Error && 'response' in err) {
          try {
            const response = (err as any).response;
            if (response && typeof response === 'object' && 'message' in response) {
              detailedMessage = response.message || detailedMessage;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
        
        alert(detailedMessage);
      } else {
        toast.showError(errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !record) return;
    
    if (!window.confirm(`Permanently delete "${record.title}"? This action cannot be undone.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      await sourceRecordsService.delete(id);
      
      toast.showDelete(`"${record.title}" deleted`);
      
      // Navigate back to source records list
      navigate('/source-records');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete record';
      if (errorMessage.includes('protected')) {
        alert('Cannot delete this record. It is linked to topics, has artifacts, or is linked to watch items.');
      } else {
        toast.showError(errorMessage);
      }
    } finally {
      setIsProcessing(false);
    }
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
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleArchive}
                disabled={isProcessing}
                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded transition-colors disabled:opacity-50"
                title="Archive"
              >
                <Archive className="w-4 h-4" />
              </button>
              <button
                onClick={handleDelete}
                disabled={isProcessing}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
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

        {/* AI-Assisted Analysis Section */}
        <div className="mt-6 bg-stone-900 border border-stone-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={20} className="text-accent" />
            <h2 className="text-xl font-semibold text-stone-200">AI-Assisted Analysis</h2>
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-stone-400">
              Generate AI-powered analysis to assist with source evaluation.
            </p>
            {summaryContentSource === 'fresh' && (
              <span className="text-xs text-amber-400 bg-amber-900/20 px-2 py-1 rounded border border-amber-800/50">
                Using fresh content from URL
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            {/* Generate Summary Dropdown Button */}
            <div className="relative" ref={summaryDropdownRef}>
              <div className="flex">
                <button
                  onClick={() => handleGenerateSummary()}
                  disabled={analysisLoading !== null}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-l-lg transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    {analysisLoading === 'summary' ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <FileText size={16} />
                    )}
                  </div>
                  <span>Generate Summary</span>
                </button>
                <button
                  onClick={() => setSummaryDropdownOpen(!summaryDropdownOpen)}
                  disabled={analysisLoading !== null}
                  className="px-2 py-2 bg-stone-800 hover:bg-stone-700 border-y border-r border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-r-lg transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronDown size={16} className={`transition-transform duration-200 ${summaryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {summaryDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setSummaryDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-2 w-64 bg-stone-900 border border-stone-700 rounded-lg shadow-lg z-20 overflow-hidden">
                    <button
                      onClick={() => {
                        setSummaryContentSource('stored');
                        setSummaryDropdownOpen(false);
                      }}
                      disabled={analysisLoading !== null}
                      className={`w-full text-left px-4 py-3 transition-colors duration-200 border-b border-stone-800 last:border-b-0 ${
                        summaryContentSource === 'stored'
                          ? 'text-blue-400 bg-stone-800'
                          : 'text-stone-300 hover:bg-stone-800'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">Use Stored Content</div>
                          <div className="text-xs text-stone-500 mt-0.5">Analyze content from database (RSS feed or manual input)</div>
                        </div>
                        {summaryContentSource === 'stored' && <span className="text-xs ml-2 mt-0.5">✓</span>}
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        if (!record?.url) {
                          alert('No URL available for this source record');
                          setSummaryDropdownOpen(false);
                          return;
                        }
                        setSummaryContentSource('fresh');
                        setSummaryDropdownOpen(false);
                      }}
                      disabled={analysisLoading !== null || !record?.url}
                      className={`w-full text-left px-4 py-3 transition-colors duration-200 ${
                        summaryContentSource === 'fresh'
                          ? 'text-blue-400 bg-stone-800'
                          : 'text-stone-300 hover:bg-stone-800'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">Fetch Fresh Content</div>
                          <div className="text-xs text-stone-500 mt-0.5">Fetch and analyze full article from URL</div>
                        </div>
                        {summaryContentSource === 'fresh' && <span className="text-xs ml-2 mt-0.5">✓</span>}
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={handleExtractEntities}
              disabled={analysisLoading !== null}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-lg transition-colors duration-200 disabled:cursor-not-allowed"
            >
              <div className="w-4 h-4 flex items-center justify-center">
                {analysisLoading === 'entities' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Users size={16} />
                )}
              </div>
              <span>Extract Entities</span>
            </button>

            <button
              onClick={handleAnalyzeTone}
              disabled={analysisLoading !== null}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-lg transition-colors duration-200 disabled:cursor-not-allowed"
            >
              <div className="w-4 h-4 flex items-center justify-center">
                {analysisLoading === 'tone' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <MessageSquare size={16} />
                )}
              </div>
              <span>Analyze Tone</span>
            </button>

            <button
              onClick={handleExtractKeyFacts}
              disabled={analysisLoading !== null}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-lg transition-colors duration-200 disabled:cursor-not-allowed"
            >
              <div className="w-4 h-4 flex items-center justify-center">
                {analysisLoading === 'key_facts' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ListChecks size={16} />
                )}
              </div>
              <span>Extract Key Facts</span>
            </button>

            <button
              onClick={handleAddNotes}
              disabled={analysisLoading !== null}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-lg transition-colors duration-200 disabled:cursor-not-allowed"
            >
              <div className="w-4 h-4 flex items-center justify-center">
                {analysisLoading === 'notes' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileEdit size={16} />
                )}
              </div>
              <span>Add Notes</span>
            </button>
          </div>

          {/* Existing Artifacts */}
          {isLoadingArtifacts ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : artifacts.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-stone-400 uppercase mb-3">
                Analysis History ({artifacts.length})
              </h3>
              <div className="space-y-3">
                {artifacts.map((artifact) => (
                  <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    isNew={newArtifactIds.has(artifact.id)}
                    onUpdate={() => loadArtifacts(false)}
                    sourceReliability={record?.sources?.reliability_rating}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-stone-500 text-center py-4 text-sm">
              No analysis artifacts yet. Click the buttons above to generate AI-assisted analysis.
            </p>
          )}
        </div>
      </div>

      {/* Link to Topic Modal */}
      {showLinkModal && currentOrganization && (
        <LinkToTopicModal
          sourceRecordId={id!}
          recordTitle={record?.title}
          organizationId={currentOrganization.id}
          mode="multi"
          onLink={handleLinkToTopics}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </div>
  );
}

