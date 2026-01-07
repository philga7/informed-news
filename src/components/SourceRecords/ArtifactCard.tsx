import { useState, useEffect } from 'react';
import { Trash2, CheckCircle, Circle } from 'lucide-react';
import type { AnalyticArtifact, SummaryPayload, EntityExtractionPayload, ToneAnalysisPayload, KeyFactsPayload, TopicSummaryPayload, MediaComparisonPayload } from '../../services/analysis.service';
import { MediaComparisonCard } from '../Topics/MediaComparisonCard';
import { analysisService } from '../../services/analysis.service';

interface NotesPayload {
  notes: string;
}

interface ArtifactCardProps {
  artifact: AnalyticArtifact;
  isNew?: boolean;
  onUpdate?: () => void;
  sourceReliability?: string; // Source reliability rating for tone analysis display
}

export function ArtifactCard({ artifact, isNew = false, onUpdate, sourceReliability }: ArtifactCardProps) {
  const [isExpanded, setIsExpanded] = useState(isNew);
  const [isUpdating, setIsUpdating] = useState(false);
  const [localArtifact, setLocalArtifact] = useState<AnalyticArtifact>(artifact);
  const [currentNotes, setCurrentNotes] = useState<string>('');

  // Update local artifact when prop changes
  useEffect(() => {
    setLocalArtifact(artifact);
  }, [artifact]);

  const handleReviewToggle = async (notesContent?: string) => {
    const newReviewedState = !localArtifact.reviewed;
    
    // Optimistically update local state
    setLocalArtifact(prev => ({ ...prev, reviewed: newReviewedState }));
    
    try {
      setIsUpdating(true);
      
      // For notes artifacts, pass the content when updating review status
      await analysisService.updateArtifactReview(
        localArtifact.id, 
        newReviewedState,
        localArtifact.type === 'notes' && newReviewedState ? notesContent : undefined
      );
      // Silently update parent without full reload
      onUpdate?.();
    } catch (error) {
      console.error('Error updating review status:', error);
      // Revert on error
      setLocalArtifact(prev => ({ ...prev, reviewed: !newReviewedState }));
      alert('Failed to update review status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this analysis artifact?')) {
      return;
    }

    try {
      setIsUpdating(true);
      await analysisService.deleteArtifact(localArtifact.id);
      onUpdate?.();
    } catch (error) {
      console.error('Error deleting artifact:', error);
      alert('Failed to delete artifact');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'summary':
        return 'Summary';
      case 'entity_extraction':
        return 'Entity Extraction';
      case 'tone_analysis':
        return 'Tone Analysis';
      case 'sentiment':
        return 'Sentiment';
      case 'key_facts':
        return 'Key Facts';
      case 'timeline':
        return 'Timeline';
      case 'network_graph':
        return 'Network Graph';
      case 'media_comparison':
        return 'Media Comparison';
      case 'notes':
        return 'Notes';
      default:
        return type;
    }
  };

  const renderPayload = () => {
    switch (localArtifact.type) {
      case 'summary':
        // Check if this is a topic summary (has topic_id) or source record summary
        if (localArtifact.topic_id) {
          return <TopicSummaryDisplay payload={localArtifact.payload as TopicSummaryPayload} />;
        }
        return <SummaryDisplay payload={localArtifact.payload as SummaryPayload} />;
      case 'entity_extraction':
        return <EntityDisplay payload={localArtifact.payload as EntityExtractionPayload} />;
      case 'tone_analysis':
        return <ToneDisplay payload={localArtifact.payload as ToneAnalysisPayload} sourceReliability={sourceReliability} />;
      case 'key_facts':
        return <KeyFactsDisplay payload={localArtifact.payload as KeyFactsPayload} />;
      case 'media_comparison':
        return <MediaComparisonCard payload={localArtifact.payload as MediaComparisonPayload} />;
      case 'notes':
        return <NotesDisplay artifact={localArtifact} onUpdate={onUpdate} onNotesChange={setCurrentNotes} />;
      default:
        return <pre className="text-xs text-stone-400 whitespace-pre-wrap">{JSON.stringify(localArtifact.payload, null, 2)}</pre>;
    }
  };

  return (
    <div className="bg-stone-800 border border-stone-700 rounded-lg overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-700/50 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <div className={`transition-colors duration-200 ${localArtifact.reviewed ? 'text-green-500' : 'text-stone-500'}`}>
            {localArtifact.reviewed ? <CheckCircle size={18} /> : <Circle size={18} />}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-stone-200">
              {getTypeLabel(localArtifact.type)}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              {formatDate(localArtifact.created_at)} • {localArtifact.model_name}
            </div>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-stone-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-stone-700">
          {/* Payload */}
          <div className="mb-4">
            {renderPayload()}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-4 border-t border-stone-700">
            {localArtifact.type === 'notes' ? (
              <NotesReviewCheckbox
                artifact={localArtifact}
                isUpdating={isUpdating}
                onReviewToggle={handleReviewToggle}
                currentNotes={currentNotes}
              />
            ) : (
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={localArtifact.reviewed}
                  onChange={() => handleReviewToggle()}
                  disabled={isUpdating}
                  className="w-4 h-4 rounded border-stone-600 text-accent focus:ring-accent focus:ring-offset-stone-900"
                />
                <span className="text-sm text-stone-400 group-hover:text-stone-300 transition-colors duration-200">
                  Reviewed and accepted
                </span>
              </label>
            )}

            <button
              onClick={handleDelete}
              disabled={isUpdating}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors duration-200 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Notes Display Component with Markdown Editor
function NotesDisplay({ 
  artifact, 
  onUpdate,
  onNotesChange,
}: { 
  artifact: AnalyticArtifact; 
  onUpdate?: () => void;
  onNotesChange?: (notes: string) => void;
}) {
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const isReviewed = artifact.reviewed;

  useEffect(() => {
    const payload = artifact.payload as NotesPayload;
    const savedNotes = payload?.notes || '';
    setNotes(savedNotes);
    // Notify parent of current notes
    onNotesChange?.(savedNotes);
  }, [artifact, onNotesChange]);

  // Update parent when notes change
  useEffect(() => {
    onNotesChange?.(notes);
  }, [notes, onNotesChange]);

  const handleSave = async () => {
    if (!notes.trim()) {
      alert('Notes cannot be empty');
      return;
    }

    try {
      setIsSaving(true);
      await analysisService.updateNotes(artifact.id, notes);
      onUpdate?.();
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {isReviewed ? (
        // Read-only display for reviewed notes
        <div className="w-full px-3 py-2 bg-stone-800 border border-stone-600 rounded-lg text-stone-100 font-mono text-sm min-h-[200px] whitespace-pre-wrap">
          {notes || <span className="text-stone-500 italic">No notes were added before review.</span>}
        </div>
      ) : (
        // Editable textarea for unreviewed notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 resize-none font-mono text-sm focus:outline-none focus:border-blue-500"
          placeholder="Enter your notes in Markdown format..."
        />
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500">{notes.length} characters</span>
        {!isReviewed && notes !== (artifact.payload as NotesPayload)?.notes && (
          <button
            onClick={handleSave}
            disabled={isSaving || !notes.trim()}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save Notes'}
          </button>
        )}
      </div>
    </div>
  );
}

// Notes Review Checkbox Component (handles saving on review)
function NotesReviewCheckbox({
  artifact,
  isUpdating,
  onReviewToggle,
  currentNotes,
}: {
  artifact: AnalyticArtifact;
  isUpdating: boolean;
  onReviewToggle: (notesContent?: string) => void;
  currentNotes?: string;
}) {
  const payload = artifact.payload as NotesPayload;
  // Use current notes from state if available, otherwise fall back to payload
  const notes = currentNotes !== undefined ? currentNotes : (payload?.notes || '');

  const handleChange = () => {
    // When checking "Reviewed and accepted", save the notes content
    // Use current notes from textarea state, not just saved payload
    if (!artifact.reviewed && notes.trim()) {
      onReviewToggle(notes);
    } else {
      onReviewToggle();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 cursor-pointer group">
        <input
          type="checkbox"
          checked={artifact.reviewed}
          onChange={handleChange}
          disabled={isUpdating}
          className="w-4 h-4 rounded border-stone-600 text-accent focus:ring-accent focus:ring-offset-stone-900"
        />
        <span className="text-sm text-stone-400 group-hover:text-stone-300 transition-colors duration-200">
          Reviewed and accepted
        </span>
      </label>
      {artifact.reviewed && (
        <span className="text-xs text-amber-400 ml-2">
          Consider rerunning analysis to incorporate these notes
        </span>
      )}
    </div>
  );
}

// Summary Display Component
function SummaryDisplay({ payload }: { payload: SummaryPayload }) {
  return (
    <div className="space-y-3">
      {payload.warning && (
        <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-3">
          <p className="text-xs text-amber-400 flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{payload.warning}</span>
          </p>
        </div>
      )}
      <div>
        <h5 className="text-xs font-semibold text-stone-400 uppercase mb-1">Overview</h5>
        <p className="text-sm text-stone-300 leading-relaxed">{payload.summary}</p>
      </div>
      {payload.bulletPoints && payload.bulletPoints.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Key Points</h5>
          <ul className="space-y-1.5">
            {payload.bulletPoints.map((point, index) => (
              <li key={index} className="flex gap-2 text-sm text-stone-300">
                <span className="text-accent mt-1">•</span>
                <span className="flex-1">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Entity Display Component
function EntityDisplay({ payload }: { payload: EntityExtractionPayload }) {
  const renderEntityGroup = (label: string, entities: string[]) => {
    if (!entities || entities.length === 0) return null;

    return (
      <div>
        <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">{label}</h5>
        <div className="flex flex-wrap gap-2">
          {entities.map((entity, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-stone-700 border border-stone-600 rounded text-xs text-stone-300"
            >
              {entity}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {payload.warning && (
        <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-3">
          <p className="text-xs text-amber-400 flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{payload.warning}</span>
          </p>
        </div>
      )}
      {renderEntityGroup('People', payload.people)}
      {renderEntityGroup('Organizations', payload.organizations)}
      {renderEntityGroup('Locations', payload.locations)}
      {renderEntityGroup('Dates', payload.dates)}
    </div>
  );
}

// Key Facts Display Component
function KeyFactsDisplay({ payload }: { payload: KeyFactsPayload }) {
  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'event':
        return 'bg-blue-900/30 text-blue-400 border-blue-800/50';
      case 'quote':
        return 'bg-purple-900/30 text-purple-400 border-purple-800/50';
      case 'statistic':
        return 'bg-green-900/30 text-green-400 border-green-800/50';
      case 'claim':
        return 'bg-orange-900/30 text-orange-400 border-orange-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  return (
    <div className="space-y-3">
      {payload.warning && (
        <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-3">
          <p className="text-xs text-amber-400 flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{payload.warning}</span>
          </p>
        </div>
      )}
      {payload.facts && payload.facts.length > 0 ? (
        <ul className="space-y-3">
          {payload.facts.map((fact, index) => (
            <li key={index} className="p-3 bg-stone-800 border border-stone-700 rounded-lg">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm text-stone-300 flex-1">{fact.fact}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {fact.category && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getCategoryColor(fact.category)}`}>
                      {fact.category}
                    </span>
                  )}
                  <span className="text-xs text-stone-500">
                    {(fact.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              {fact.supportingLinks && fact.supportingLinks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-stone-700">
                  <span className="text-xs text-stone-400 block mb-1">Supporting links:</span>
                  <div className="flex flex-wrap gap-2">
                    {fact.supportingLinks.map((linkUrl, linkIndex) => (
                      <a
                        key={linkIndex}
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline break-all max-w-full truncate"
                        title={linkUrl}
                      >
                        {linkUrl}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-400">No key facts extracted.</p>
      )}
    </div>
  );
}

// Topic Summary Display Component
function TopicSummaryDisplay({ payload }: { payload: TopicSummaryPayload }) {
  return (
    <div className="space-y-4">
      <div>
        <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Executive Summary</h5>
        <p className="text-sm text-stone-300 leading-relaxed whitespace-pre-wrap">{payload.executiveSummary}</p>
      </div>

      {payload.keyDevelopments && payload.keyDevelopments.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Key Developments</h5>
          <ul className="space-y-1.5">
            {payload.keyDevelopments.map((dev, index) => (
              <li key={index} className="flex gap-2 text-sm text-stone-300">
                <span className="text-accent mt-1">•</span>
                <span className="flex-1">{dev}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.corroboratedClaims && payload.corroboratedClaims.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-green-400 uppercase mb-2">✓ Corroborated Claims</h5>
          <p className="text-xs text-stone-400 mb-2">
            The following analysis or claims are mentioned by multiple sources, indicating corroboration:
          </p>
          <ul className="space-y-3">
            {payload.corroboratedClaims.map((item, index) => (
              <li key={index} className="p-3 bg-green-900/20 border border-green-800/50 rounded-lg">
                <p className="text-sm text-green-300 font-medium mb-1.5">{item.claim}</p>
                <div className="flex items-center gap-2 text-xs text-green-400/80">
                  <span className="font-medium">Mentioned by {item.sourceCount} source{item.sourceCount !== 1 ? 's' : ''}:</span>
                  <span className="text-green-300">{item.sources.join(', ')}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.conflictingPerspectives && payload.conflictingPerspectives.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Conflicting Perspectives</h5>
          <ul className="space-y-1.5">
            {payload.conflictingPerspectives.map((perspective, index) => (
              <li key={index} className="flex gap-2 text-sm text-amber-300">
                <span className="text-amber-500 mt-1">⚠</span>
                <span className="flex-1">{perspective}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.timelineHighlights && payload.timelineHighlights.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Timeline Highlights</h5>
          <ul className="space-y-1.5">
            {payload.timelineHighlights.map((event, index) => (
              <li key={index} className="flex gap-2 text-sm text-stone-300">
                <span className="text-blue-400 mt-1">→</span>
                <span className="flex-1">{event}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.recommendedNextSteps && payload.recommendedNextSteps.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Recommended Next Steps</h5>
          <ul className="space-y-1.5">
            {payload.recommendedNextSteps.map((step, index) => (
              <li key={index} className="flex gap-2 text-sm text-stone-300">
                <span className="text-green-400 mt-1">✓</span>
                <span className="flex-1">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.unreviewedRecords && payload.unreviewedRecords.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-amber-400 uppercase mb-2">⚠ Unreviewed Source Records</h5>
          <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-3">
            <p className="text-xs text-amber-300 mb-2">
              The following source records are linked to this topic but were excluded from analysis because they have no reviewed artifacts:
            </p>
            <ul className="space-y-2">
              {payload.unreviewedRecords.map((record, index) => (
                <li key={index} className="text-xs text-amber-200">
                  <span className="font-medium">"{record.title}"</span> from <span className="font-medium">{record.sourceName}</span>
                  <p className="text-amber-400/80 mt-0.5 ml-4">{record.note}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-300 mt-3">
              Please review artifacts for these records and re-run the topic summary to include them.
            </p>
          </div>
        </div>
      )}

      {payload.crossSourceLinks && payload.crossSourceLinks.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Cross-Source Links</h5>
          <ul className="space-y-2">
            {payload.crossSourceLinks.map((link, index) => (
              <li key={index} className="p-2 bg-stone-800 border border-stone-700 rounded text-sm">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 break-all"
                >
                  {link.url}
                </a>
                <div className="text-xs text-stone-500 mt-1">
                  Mentioned in: {link.mentionedIn.join(', ')}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Tone Display Component
function ToneDisplay({ payload, sourceReliability }: { payload: ToneAnalysisPayload; sourceReliability?: string }) {
  const getToneColor = (tone: string) => {
    switch (tone) {
      case 'factual':
      case 'neutral':
        return 'bg-blue-900/30 text-blue-400 border-blue-800/50';
      case 'opinion':
        return 'bg-purple-900/30 text-purple-400 border-purple-800/50';
      case 'propaganda':
        return 'bg-red-900/30 text-red-400 border-red-800/50';
      case 'sensational':
        return 'bg-orange-900/30 text-orange-400 border-orange-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-900/30 text-green-400 border-green-800/50';
      case 'negative':
        return 'bg-red-900/30 text-red-400 border-red-800/50';
      case 'neutral':
        return 'bg-stone-800 text-stone-400 border-stone-700';
      case 'mixed':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  const getReliabilityMultiplier = (rating?: string): number => {
    switch (rating?.toUpperCase()) {
      case 'HIGH': return 1.0;
      case 'MEDIUM': return 0.8;
      case 'LOW': return 0.6;
      case 'UNKNOWN':
      default: return 0.7;
    }
  };

  const getReliabilityColor = (rating?: string) => {
    switch (rating?.toUpperCase()) {
      case 'HIGH': return 'text-green-400';
      case 'MEDIUM': return 'text-yellow-400';
      case 'LOW': return 'text-red-400';
      case 'UNKNOWN':
      default: return 'text-stone-400';
    }
  };

  const multiplier = getReliabilityMultiplier(sourceReliability);
  const rawConfidence = payload.rawConfidence ?? payload.confidence;
  const hasWeighting = payload.rawConfidence !== undefined && sourceReliability;
  const adjustment = hasWeighting ? (payload.confidence - rawConfidence) * 100 : 0;

  return (
    <div className="space-y-4">
      {payload.warning && (
        <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mb-3">
          <p className="text-xs text-amber-400 flex items-start gap-2">
            <span className="mt-0.5">⚠</span>
            <span>{payload.warning}</span>
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <div>
          <span className="text-xs text-stone-400 block mb-1">Overall Tone</span>
          <span className={`px-3 py-1 rounded border text-sm font-medium ${getToneColor(payload.overallTone)}`}>
            {payload.overallTone}
          </span>
        </div>
        <div>
          <span className="text-xs text-stone-400 block mb-1">Sentiment</span>
          <span className={`px-3 py-1 rounded border text-sm font-medium ${getSentimentColor(payload.sentiment)}`}>
            {payload.sentiment}
          </span>
        </div>
        <div className="relative group">
          <span className="text-xs text-stone-400 block mb-1">
            Confidence
            {hasWeighting && (
              <span className="ml-1 text-xs text-stone-500" title="Weighted by source reliability">
                ⓘ
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded border text-sm font-medium bg-stone-800 text-stone-300 border-stone-700">
              {(payload.confidence * 100).toFixed(0)}%
            </span>
            {hasWeighting && adjustment !== 0 && (
              <span className={`text-xs ${adjustment < 0 ? 'text-red-400' : 'text-green-400'}`} title={`Raw confidence: ${(rawConfidence * 100).toFixed(0)}%, Adjusted by ${(adjustment).toFixed(0)}% due to ${sourceReliability} reliability`}>
                {adjustment > 0 ? '↑' : '↓'} {Math.abs(adjustment).toFixed(0)}%
              </span>
            )}
          </div>
          {hasWeighting && (
            <div className="absolute bottom-full left-0 mb-2 p-2 bg-stone-900 border border-stone-700 rounded text-xs text-stone-300 opacity-0 group-hover:opacity-100 pointer-events-none z-10 whitespace-nowrap transition-opacity">
              <div>Raw: {(rawConfidence * 100).toFixed(0)}%</div>
              <div className={getReliabilityColor(sourceReliability)}>Source: {sourceReliability} ({multiplier * 100}%)</div>
              <div>Weighted: {(payload.confidence * 100).toFixed(0)}%</div>
            </div>
          )}
        </div>
        {sourceReliability && (
          <div>
            <span className="text-xs text-stone-400 block mb-1">Source Reliability</span>
            <span className={`px-3 py-1 rounded border text-sm font-medium bg-stone-800 border-stone-700 ${getReliabilityColor(sourceReliability)}`}>
              {sourceReliability}
            </span>
          </div>
        )}
      </div>

      {payload.indicators && payload.indicators.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Indicators</h5>
          <ul className="space-y-1">
            {payload.indicators.map((indicator, index) => (
              <li key={index} className="flex gap-2 text-sm text-stone-300">
                <span className="text-accent mt-1">•</span>
                <span className="flex-1">{indicator}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.biasSignals && payload.biasSignals.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold text-stone-400 uppercase mb-2">Bias Signals</h5>
          <ul className="space-y-1">
            {payload.biasSignals.map((signal, index) => (
              <li key={index} className="flex gap-2 text-sm text-stone-300">
                <span className="text-amber-500 mt-1">⚠</span>
                <span className="flex-1">{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

