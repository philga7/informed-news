import { useState, useEffect } from 'react';
import { Plus, CheckCircle2, AlertTriangle, HelpCircle, XCircle, Trash2 } from 'lucide-react';
import { claimsService } from '../../services/claims.service';
import type { ClaimWithEvidence, ClaimType } from '../../types/osint';

interface ClaimsAnalysisProps {
  topicId: string;
}

export function ClaimsAnalysis({ topicId }: ClaimsAnalysisProps) {
  const [claims, setClaims] = useState<ClaimWithEvidence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadClaims();
  }, [topicId]);

  const loadClaims = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await claimsService.getClaimsByTopic(topicId);
      setClaims(data);
    } catch (err) {
      console.error('Error loading claims:', err);
      setError(err instanceof Error ? err.message : 'Failed to load claims');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClaim = async (claimId: string) => {
    if (!confirm('Are you sure you want to delete this claim? This will also delete all associated evidence.')) {
      return;
    }

    try {
      await claimsService.deleteClaim(claimId);
      await loadClaims();
    } catch (err) {
      console.error('Error deleting claim:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete claim');
    }
  };

  const getCorroborationBadge = (status: string, counts: any) => {
    switch (status) {
      case 'corroborated':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-900/30 border border-green-800 rounded-full">
            <CheckCircle2 size={16} className="text-green-400" />
            <span className="text-sm font-medium text-green-300">
              Corroborated ({counts.supporting} sources)
            </span>
          </div>
        );
      case 'disputed':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-900/30 border border-red-800 rounded-full">
            <XCircle size={16} className="text-red-400" />
            <span className="text-sm font-medium text-red-300">
              Disputed ({counts.contradicting} contradicting)
            </span>
          </div>
        );
      case 'single_source':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-yellow-900/30 border border-yellow-800 rounded-full">
            <AlertTriangle size={16} className="text-yellow-400" />
            <span className="text-sm font-medium text-yellow-300">
              Single Source
            </span>
          </div>
        );
      case 'no_evidence':
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-stone-800 border border-stone-700 rounded-full">
            <HelpCircle size={16} className="text-stone-400" />
            <span className="text-sm font-medium text-stone-400">
              No Evidence
            </span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1 bg-stone-800 border border-stone-700 rounded-full">
            <HelpCircle size={16} className="text-stone-400" />
            <span className="text-sm font-medium text-stone-400">
              Needs Review
            </span>
          </div>
        );
    }
  };

  const getClaimTypeBadge = (type: ClaimType | null) => {
    if (!type) return null;

    const colors = {
      factual: 'bg-blue-900/30 border-blue-800 text-blue-300',
      assessment: 'bg-purple-900/30 border-purple-800 text-purple-300',
      prediction: 'bg-orange-900/30 border-orange-800 text-orange-300',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded border ${colors[type]}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 text-stone-400">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-stone-400 border-t-transparent" />
          Loading claims...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-stone-800">
        <div>
          <h3 className="text-xl font-semibold text-stone-100">Claims Analysis</h3>
          <p className="text-sm text-stone-400 mt-1">
            Track factual claims, assessments, and predictions with corroboration status
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
        >
          <Plus size={18} />
          Add Claim
        </button>
      </div>

      {/* Claims List */}
      <div className="p-6">
        {claims.length === 0 ? (
          <div className="text-center py-12">
            <HelpCircle size={48} className="mx-auto text-stone-600 mb-4" />
            <h4 className="text-lg font-medium text-stone-300 mb-2">No Claims Yet</h4>
            <p className="text-sm text-stone-500 mb-4">
              Start tracking factual claims that need verification
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
            >
              <Plus size={18} />
              Add First Claim
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {claims.map((claim) => (
              <div
                key={claim.id}
                className="bg-stone-800/50 border border-stone-700 rounded-lg p-4 hover:border-stone-600 transition-colors duration-250"
              >
                {/* Claim Header */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getClaimTypeBadge(claim.claimType)}
                      {!claim.isFalsifiable && (
                        <span className="px-2 py-1 text-xs font-medium rounded border bg-stone-700/50 border-stone-600 text-stone-400">
                          Non-falsifiable
                        </span>
                      )}
                    </div>
                    <p className="text-stone-200 text-base leading-relaxed">
                      {claim.claimText}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteClaim(claim.id)}
                      className="p-2 hover:bg-stone-700 rounded-lg transition-colors duration-250"
                      title="Delete claim"
                    >
                      <Trash2 size={16} className="text-stone-400" />
                    </button>
                  </div>
                </div>

                {/* Corroboration Status */}
                <div className="flex items-center justify-between">
                  <div>
                    {getCorroborationBadge(claim.corroborationStatus, claim.evidenceCounts)}
                  </div>
                  {claim.evidenceCounts.total > 0 && (
                    <div className="text-xs text-stone-500">
                      {claim.evidenceCounts.supporting} supporting • {claim.evidenceCounts.contradicting} contradicting • {claim.evidenceCounts.neutral} neutral
                    </div>
                  )}
                </div>

                {/* Evidence Summary */}
                {claim.evidence.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-stone-700">
                    <h5 className="text-sm font-medium text-stone-300 mb-2">Evidence:</h5>
                    <div className="space-y-2">
                      {claim.evidence.map((evidence) => (
                        <div
                          key={evidence.id}
                          className="flex items-start gap-3 text-sm"
                        >
                          <div className="mt-0.5">
                            {evidence.supports === true && (
                              <CheckCircle2 size={16} className="text-green-400" />
                            )}
                            {evidence.supports === false && (
                              <XCircle size={16} className="text-red-400" />
                            )}
                            {evidence.supports === null && (
                              <HelpCircle size={16} className="text-stone-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-stone-400">
                              {evidence.link.source_records.sources.name}
                            </div>
                            {evidence.evidenceExcerpt && (
                              <div className="text-stone-500 text-xs mt-1 italic">
                                "{evidence.evidenceExcerpt}"
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Claim Modal */}
      {showAddModal && (
        <AddClaimModal
          topicId={topicId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadClaims();
          }}
        />
      )}
    </div>
  );
}

interface AddClaimModalProps {
  topicId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddClaimModal({ topicId, onClose, onSuccess }: AddClaimModalProps) {
  const [claimText, setClaimText] = useState('');
  const [claimType, setClaimType] = useState<ClaimType>('factual');
  const [isFalsifiable, setIsFalsifiable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!claimText.trim()) {
      setError('Claim text is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await claimsService.createClaim(topicId, claimText.trim(), {
        claimType,
        isFalsifiable,
      });
      onSuccess();
    } catch (err) {
      console.error('Error creating claim:', err);
      setError(err instanceof Error ? err.message : 'Failed to create claim');
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
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl">
          <div className="p-6 border-b border-stone-800">
            <h3 className="text-xl font-semibold text-stone-100">Add New Claim</h3>
            <p className="text-sm text-stone-400 mt-1">
              What factual claim, assessment, or prediction needs tracking?
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Claim Text */}
              <div>
                <label htmlFor="claimText" className="block text-sm font-medium text-stone-300 mb-2">
                  Claim Statement *
                </label>
                <textarea
                  id="claimText"
                  value={claimText}
                  onChange={(e) => setClaimText(e.target.value)}
                  rows={3}
                  required
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600 resize-none"
                  placeholder="e.g., 'The new policy will be implemented by Q2 2026'"
                />
              </div>

              {/* Claim Type */}
              <div>
                <label className="block text-sm font-medium text-stone-300 mb-2">
                  Claim Type
                </label>
                <div className="flex gap-2">
                  {(['factual', 'assessment', 'prediction'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setClaimType(type)}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors duration-250 ${
                        claimType === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-stone-500 mt-2">
                  Factual: verifiable fact • Assessment: analytical judgment • Prediction: future forecast
                </p>
              </div>

              {/* Falsifiability */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="isFalsifiable"
                  checked={isFalsifiable}
                  onChange={(e) => setIsFalsifiable(e.target.checked)}
                  className="mt-1"
                />
                <label htmlFor="isFalsifiable" className="flex-1">
                  <div className="text-sm font-medium text-stone-300">
                    Falsifiable (Recommended)
                  </div>
                  <div className="text-xs text-stone-500 mt-1">
                    Can this claim be proven false? Falsifiable claims are better for intelligence analysis (Popper criterion).
                  </div>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-stone-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !claimText.trim()}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Claim'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

