import { useState, useEffect } from 'react';
import { X, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { claimsService } from '../../services/claims.service';
import type { ClaimWithEvidence } from '../../types/osint';

interface EditLinkModalProps {
  link: {
    id: string;
    relevanceScore: number | null;
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
    assumptions: string | null;
    analystNotes: string | null;
    source_records: {
      title: string;
    };
  };
  topicId: string;
  onSave: (
    linkId: string,
    updates: {
      relevanceScore?: number;
      confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
      assumptions?: string;
      analystNotes?: string;
    }
  ) => Promise<void>;
  onClose: () => void;
}

export function EditLinkModal({ link, topicId, onSave, onClose }: EditLinkModalProps) {
  const [confidenceLevel, setConfidenceLevel] = useState<'HIGH' | 'MEDIUM' | 'LOW'>(
    link.confidenceLevel || 'MEDIUM'
  );
  const [relevanceScore, setRelevanceScore] = useState<number>(
    link.relevanceScore !== null ? link.relevanceScore : 0.75
  );
  const [assumptions, setAssumptions] = useState(link.assumptions || '');
  const [analystNotes, setAnalystNotes] = useState(link.analystNotes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Claims management
  const [claims, setClaims] = useState<ClaimWithEvidence[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [selectedClaims, setSelectedClaims] = useState<Map<string, { supports: boolean | null; excerpt: string }>>(new Map());

  useEffect(() => {
    loadClaims();
  }, [topicId]);

  const loadClaims = async () => {
    try {
      setClaimsLoading(true);
      const data = await claimsService.getClaimsByTopic(topicId);
      setClaims(data);
      
      // Pre-populate selected claims that already have evidence for this link
      const selected = new Map();
      data.forEach((claim) => {
        const evidence = claim.evidence.find((e) => e.linkId === link.id);
        if (evidence) {
          selected.set(claim.id, {
            supports: evidence.supports,
            excerpt: evidence.evidenceExcerpt || '',
          });
        }
      });
      setSelectedClaims(selected);
    } catch (err) {
      console.error('Error loading claims:', err);
    } finally {
      setClaimsLoading(false);
    }
  };

  const toggleClaim = (claimId: string) => {
    const newSelected = new Map(selectedClaims);
    if (newSelected.has(claimId)) {
      newSelected.delete(claimId);
    } else {
      newSelected.set(claimId, { supports: null, excerpt: '' });
    }
    setSelectedClaims(newSelected);
  };

  const updateClaimSupport = (claimId: string, supports: boolean | null) => {
    const newSelected = new Map(selectedClaims);
    const current = newSelected.get(claimId);
    if (current) {
      newSelected.set(claimId, { ...current, supports });
    }
    setSelectedClaims(newSelected);
  };

  const updateClaimExcerpt = (claimId: string, excerpt: string) => {
    const newSelected = new Map(selectedClaims);
    const current = newSelected.get(claimId);
    if (current) {
      newSelected.set(claimId, { ...current, excerpt });
    }
    setSelectedClaims(newSelected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);
    setError(null);

    try {
      console.log('[EditLinkModal] Submitting link update:', { 
        linkId: link.id, 
        topicId, 
        updates: {
          relevanceScore,
          confidenceLevel,
          assumptions: assumptions.trim() || undefined,
          analystNotes: analystNotes.trim() || undefined,
        }
      });
      
      // Save link metadata
      await onSave(link.id, {
        relevanceScore,
        confidenceLevel,
        assumptions: assumptions.trim() || undefined,
        analystNotes: analystNotes.trim() || undefined,
      });

      // Save claims evidence
      // First, determine which claims need to be added/updated/deleted
      for (const claim of claims) {
        const existingEvidence = claim.evidence.find((e) => e.linkId === link.id);
        const selectedData = selectedClaims.get(claim.id);

        if (selectedData) {
          // Claim is selected - add or update evidence
          if (existingEvidence) {
            // Update existing evidence
            await claimsService.updateEvidence(claim.id, existingEvidence.id, {
              supports: selectedData.supports,
              evidenceExcerpt: selectedData.excerpt.trim() || undefined,
            });
          } else {
            // Add new evidence
            await claimsService.addEvidence(claim.id, link.id, {
              supports: selectedData.supports,
              evidenceExcerpt: selectedData.excerpt.trim() || undefined,
            });
          }
        } else if (existingEvidence) {
          // Claim is not selected but has existing evidence - delete it
          await claimsService.deleteEvidence(claim.id, existingEvidence.id);
        }
      }

      onClose();
    } catch (err) {
      console.error('Error updating link:', err);
      setError(err instanceof Error ? err.message : 'Failed to update link');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800 flex-shrink-0">
            <div>
              <h2 className="text-2xl font-semibold text-stone-100">Edit Link</h2>
              <p className="text-sm text-stone-400 mt-1 line-clamp-1">
                {link.source_records.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Confidence Level */}
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Confidence Level
                </label>
                <div className="flex gap-2">
                  {(['HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setConfidenceLevel(level)}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors duration-250 ${
                        confidenceLevel === level
                          ? 'bg-blue-600 text-white'
                          : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Relevance Score */}
              <div>
                <label htmlFor="relevance" className="block text-sm font-medium text-stone-300 mb-2">
                  Relevance Score: {(relevanceScore * 100).toFixed(0)}%
                </label>
                <input
                  id="relevance"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={relevanceScore}
                  onChange={(e) => setRelevanceScore(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              {/* Assumptions */}
              <div>
                <label htmlFor="assumptions" className="block text-sm font-medium text-stone-300 mb-2">
                  Assumptions *
                </label>
                <p className="text-xs text-stone-500 mb-2">
                  What assumptions underlie this link? Be explicit about what you're inferring or taking for granted.
                </p>
                <textarea
                  id="assumptions"
                  value={assumptions}
                  onChange={(e) => setAssumptions(e.target.value)}
                  rows={3}
                  required
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                  placeholder="e.g., 'Assuming this source has direct access to the subject matter...'"
                />
              </div>

              {/* Analyst Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-stone-300 mb-2">
                  Analyst Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={analystNotes}
                  onChange={(e) => setAnalystNotes(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                  placeholder="Add any relevant notes or context..."
                />
              </div>

              {/* Claims Addressed */}
              <div className="pt-4 border-t border-stone-700">
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Claims Addressed (Optional)
                </label>
                <p className="text-xs text-stone-500 mb-3">
                  What factual claims does this source make or verify? Select relevant claims and indicate support.
                </p>

                {claimsLoading ? (
                  <div className="flex items-center gap-2 text-stone-500 text-sm py-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-stone-500 border-t-transparent" />
                    Loading claims...
                  </div>
                ) : claims.length === 0 ? (
                  <div className="text-sm text-stone-500 py-4 text-center">
                    No claims yet. Add claims to link them to sources.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {claims.map((claim) => {
                      const isSelected = selectedClaims.has(claim.id);
                      const selectedData = selectedClaims.get(claim.id);

                      return (
                        <div
                          key={claim.id}
                          className={`border rounded-lg p-3 transition-colors duration-200 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-900/10'
                              : 'border-stone-700 bg-stone-800/50 hover:border-stone-600'
                          }`}
                        >
                          {/* Claim checkbox and text */}
                          <div className="flex items-start gap-2 mb-2">
                            <input
                              type="checkbox"
                              id={`claim-${claim.id}`}
                              checked={isSelected}
                              onChange={() => toggleClaim(claim.id)}
                              className="mt-1"
                            />
                            <label
                              htmlFor={`claim-${claim.id}`}
                              className="flex-1 text-sm text-stone-300 cursor-pointer"
                            >
                              {claim.claimText}
                            </label>
                          </div>

                          {/* Support buttons (only show when selected) */}
                          {isSelected && selectedData && (
                            <div className="ml-6 space-y-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateClaimSupport(claim.id, true)}
                                  className={`flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors duration-200 ${
                                    selectedData.supports === true
                                      ? 'bg-green-600 text-white'
                                      : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                                  }`}
                                >
                                  <CheckCircle2 size={12} />
                                  Corroborates
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateClaimSupport(claim.id, false)}
                                  className={`flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors duration-200 ${
                                    selectedData.supports === false
                                      ? 'bg-red-600 text-white'
                                      : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                                  }`}
                                >
                                  <XCircle size={12} />
                                  Contradicts
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateClaimSupport(claim.id, null)}
                                  className={`flex items-center gap-1 px-3 py-1 rounded text-xs transition-colors duration-200 ${
                                    selectedData.supports === null
                                      ? 'bg-stone-600 text-white'
                                      : 'bg-stone-700 text-stone-300 hover:bg-stone-600'
                                  }`}
                                >
                                  <HelpCircle size={12} />
                                  Mentions
                                </button>
                              </div>

                              {/* Evidence excerpt */}
                              <input
                                type="text"
                                value={selectedData.excerpt}
                                onChange={(e) => updateClaimExcerpt(claim.id, e.target.value)}
                                placeholder="Relevant excerpt from source (optional)"
                                className="w-full px-2 py-1 text-xs bg-stone-700 border border-stone-600 rounded text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-stone-800 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !assumptions.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

