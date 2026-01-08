import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Save, Search, Sparkles, Loader2 } from 'lucide-react';
import { analysisService, type AnalyticArtifact } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { ArtifactCard } from '../SourceRecords/ArtifactCard';
import type { DuplicateGroup } from '../../types/osint';
import { format } from 'date-fns';

interface CoordinationSectionProps {
  topicId: string;
  organizationId: string;
}

export function CoordinationSection({ topicId, organizationId }: CoordinationSectionProps) {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Map<string, string>>(new Map());
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState<string | null>(null); // Group hash being analyzed
  const [coordinationArtifacts, setCoordinationArtifacts] = useState<Map<string, AnalyticArtifact>>(new Map()); // Group hash -> artifact

  const handleScan = async () => {
    try {
      setIsScanning(true);
      setError(null);
      const groups = await analysisService.detectDuplicates({
        topicId,
        organizationId,
      });
      console.log('Detected duplicate groups:', groups);
      setDuplicateGroups(groups || []);
      setHasScanned(true);
    } catch (err) {
      console.error('Error detecting duplicates:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to detect duplicates';
      setError(errorMessage);
      alert(errorMessage);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAssessmentChange = (groupHash: string, assessment: string) => {
    const newAssessments = new Map(assessments);
    newAssessments.set(groupHash, assessment);
    setAssessments(newAssessments);
  };

  const handleSaveAssessment = async (group: DuplicateGroup) => {
    const assessment = assessments.get(group.group_hash);
    if (!assessment || !assessment.trim()) {
      return;
    }

    try {
      setSavingGroup(group.group_hash);
      await analysisService.saveCoordinationAssessment({
        duplicateGroupHash: group.group_hash,
        assessment: assessment.trim(),
        organizationId,
      });
      
      // Clear the assessment input after saving
      const newAssessments = new Map(assessments);
      newAssessments.delete(group.group_hash);
      setAssessments(newAssessments);
    } catch (err) {
      console.error('Error saving assessment:', err);
      alert(err instanceof Error ? err.message : 'Failed to save assessment');
    } finally {
      setSavingGroup(null);
    }
  };

  const handleAnalyzeCoordination = async (group: DuplicateGroup) => {
    try {
      setAnalysisLoading(group.group_hash);
      setError(null);
      const recordIds = group.records.map(r => r.id);
      const artifact = await analysisService.analyzeCoordination({
        duplicateGroupHash: group.group_hash,
        recordIds,
        topicId,
        organizationId,
      });
      
      // Store artifact for this group
      const newArtifacts = new Map(coordinationArtifacts);
      newArtifacts.set(group.group_hash, artifact);
      setCoordinationArtifacts(newArtifacts);
    } catch (err) {
      console.error('Error analyzing coordination:', err);
      alert(err instanceof Error ? err.message : 'Failed to analyze coordination');
    } finally {
      setAnalysisLoading(null);
    }
  };

  // Load existing coordination artifacts for displayed groups
  useEffect(() => {
    const loadArtifacts = async () => {
      if (duplicateGroups.length === 0) return;

      try {
        // Fetch artifacts for this topic with coordination_check type
        const artifacts = await analysisService.getTopicArtifacts(topicId);
        const coordinationArtifactsMap = new Map<string, AnalyticArtifact>();

        // Match artifacts to groups by duplicate_group_hash in payload
        artifacts
          .filter(a => a.type === 'coordination_check' && a.payload?.duplicate_group_hash)
          .forEach(artifact => {
            const groupHash = artifact.payload.duplicate_group_hash;
            coordinationArtifactsMap.set(groupHash, artifact);
          });

        setCoordinationArtifacts(coordinationArtifactsMap);
      } catch (err) {
        console.error('Error loading coordination artifacts:', err);
        // Don't block UI if artifact loading fails
      }
    };

    if (hasScanned && duplicateGroups.length > 0) {
      loadArtifacts();
    }
  }, [hasScanned, duplicateGroups, topicId]);

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-orange-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Coordination Detection</h3>
        </div>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-stone-600 text-stone-200 text-xs rounded-lg transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            {isScanning ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Search size={16} />
            )}
          </div>
          <span>Detect Near-Duplicates</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {!hasScanned && !isScanning && (
        <div className="text-center py-12 text-stone-500">
          <AlertTriangle size={48} className="mx-auto mb-4 text-stone-600" />
          <p className="mb-2">Click "Detect Near-Duplicates" to scan for coordinated content</p>
          <p className="text-sm">
            This analysis identifies source records with highly similar content that may indicate
            coordination, syndication, or amplification campaigns.
          </p>
        </div>
      )}

      {hasScanned && !isScanning && duplicateGroups.length === 0 && (
        <div className="text-center py-12 text-stone-500">
          <p className="mb-2">No near-duplicate content detected</p>
          <p className="text-sm">
            All source records appear to have unique content. This is generally a positive indicator
            of diverse information sources.
          </p>
        </div>
      )}

      {duplicateGroups.length > 0 && (
        <div className="space-y-6">
          {duplicateGroups.map((group, index) => (
            <div
              key={group.group_hash}
              className="bg-stone-800/50 border border-stone-700 rounded-lg p-4"
            >
              {/* Group Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-stone-200 font-medium mb-2">
                    Duplicate Group {index + 1}
                  </h4>
                  <div className="flex items-center gap-4 text-sm text-stone-400">
                    <span>{group.records.length} records</span>
                    <span>~{(group.similarity * 100).toFixed(0)}% similar</span>
                    {group.tight_window && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Clock size={14} />
                        Published within 1 hour
                      </span>
                    )}
                  </div>
                </div>
                {group.tight_window && (
                  <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs font-medium rounded">
                    TIGHT WINDOW
                  </span>
                )}
              </div>

              {/* Records List */}
              <div className="space-y-2 mb-4">
                {group.records.map((record) => (
                  <div
                    key={record.id}
                    className="bg-stone-900/50 rounded p-3 border border-stone-700"
                  >
                    <p className="text-stone-300 text-sm mb-2">{record.title}</p>
                    <div className="flex items-center gap-4 text-xs text-stone-500">
                      <span className="font-medium text-stone-400">{record.source_name}</span>
                      <span>
                        {format(new Date(record.published_at), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Analysis Button */}
              <div className="mb-4 border-t border-stone-700 pt-4">
                {coordinationArtifacts.has(group.group_hash) ? (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-stone-300 mb-2">AI Analysis Result</h5>
                    <ArtifactCard
                      artifact={coordinationArtifacts.get(group.group_hash)!}
                      onUpdate={() => {
                        // Reload artifacts if updated
                        const loadArtifacts = async () => {
                          try {
                            const artifacts = await analysisService.getTopicArtifacts(topicId);
                            const coordinationArtifactsMap = new Map<string, AnalyticArtifact>();
                            artifacts
                              .filter(a => a.type === 'coordination_check' && a.payload?.duplicate_group_hash)
                              .forEach(artifact => {
                                const groupHash = artifact.payload.duplicate_group_hash;
                                coordinationArtifactsMap.set(groupHash, artifact);
                              });
                            setCoordinationArtifacts(coordinationArtifactsMap);
                          } catch (err) {
                            console.error('Error reloading artifacts:', err);
                          }
                        };
                        loadArtifacts();
                      }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => handleAnalyzeCoordination(group)}
                    disabled={analysisLoading !== null}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/50 hover:bg-blue-900/70 border border-blue-800 text-blue-200 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      {analysisLoading === group.group_hash ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Sparkles size={16} />
                      )}
                    </div>
                    <span>AI Analysis</span>
                  </button>
                )}
              </div>

              {/* Analyst Notes */}
              <div className="border-t border-stone-700 pt-4">
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Analyst Assessment
                </label>
                <textarea
                  value={assessments.get(group.group_hash) || ''}
                  onChange={(e) => handleAssessmentChange(group.group_hash, e.target.value)}
                  placeholder="Is this coordination, syndication, or coincidence? Add your assessment..."
                  className="w-full px-3 py-2 bg-stone-900 border border-stone-700 rounded-lg text-stone-300 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                  rows={3}
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => handleSaveAssessment(group)}
                    disabled={
                      !assessments.get(group.group_hash)?.trim() ||
                      savingGroup === group.group_hash
                    }
                    className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingGroup === group.group_hash ? (
                      <>
                        <LoadingSpinner />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={16} />
                        Save Assessment
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-stone-800 text-sm text-stone-400 bg-stone-800/30 rounded p-3 border-l-2 border-orange-600">
        <p className="font-medium text-stone-300 mb-1">Coordination Indicators</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Near-identical content from different sources</li>
          <li>Tight publication windows (within 1 hour)</li>
          <li>Similar phrasing across multiple outlets</li>
        </ul>
        <p className="mt-2">
          Not all duplicates indicate malicious coordination. Consider syndication, press releases,
          and legitimate news sharing.
        </p>
      </div>
    </div>
  );
}

