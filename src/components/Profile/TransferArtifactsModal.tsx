import { useState } from 'react';
import { X, AlertTriangle, ArrowRight, Check } from 'lucide-react';
import { organizationService } from '../../services';
import type { Organization } from '../../types/osint';
import { LoadingSpinner } from '../UI/LoadingSpinner';

interface TransferArtifactsModalProps {
  fromOrganization: Organization;
  availableOrganizations: Organization[];
  blockers: {
    sources: number;
    topics: number;
    artifacts: number;
  };
  onSuccess: () => void;
  onClose: () => void;
}

export function TransferArtifactsModal({
  fromOrganization,
  availableOrganizations,
  blockers,
  onSuccess,
  onClose,
}: TransferArtifactsModalProps) {
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [transferSources, setTransferSources] = useState(true);
  const [transferTopics, setTransferTopics] = useState(true);
  const [transferArtifacts, setTransferArtifacts] = useState(true);
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferComplete, setTransferComplete] = useState(false);
  const [transferResult, setTransferResult] = useState<any>(null);

  const handleTransfer = async () => {
    if (!selectedOrgId) {
      setError('Please select a target organization');
      return;
    }

    try {
      setIsTransferring(true);
      setError(null);

      const result = await organizationService.transferArtifacts(
        fromOrganization.id,
        selectedOrgId,
        {
          transferSources,
          transferTopics,
          transferArtifacts,
        }
      );

      setTransferResult(result.transferred);
      setTransferComplete(true);
    } catch (err) {
      console.error('Error transferring artifacts:', err);
      setError(err instanceof Error ? err.message : 'Failed to transfer artifacts');
    } finally {
      setIsTransferring(false);
    }
  };

  const selectedOrg = availableOrganizations.find(org => org.id === selectedOrgId);

  if (transferComplete && transferResult) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-lg">
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
                  <Check size={32} className="text-green-500" />
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-stone-100 text-center mb-4">
                Transfer Complete!
              </h2>
              <div className="bg-stone-950 border border-stone-800 rounded-lg p-4 space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">Sources transferred:</span>
                  <span className="text-stone-200 font-medium">{transferResult.sources}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">Topics transferred:</span>
                  <span className="text-stone-200 font-medium">{transferResult.topics}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">Source Records transferred:</span>
                  <span className="text-stone-200 font-medium">{transferResult.sourceRecords}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400">Artifacts transferred:</span>
                  <span className="text-stone-200 font-medium">{transferResult.artifacts}</span>
                </div>
              </div>
              <button
                onClick={onSuccess}
                className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-200"
              >
                Continue to Delete Organization
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <h2 className="text-2xl font-semibold text-stone-100">Transfer Artifacts</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Warning */}
            <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
              <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-medium mb-1">Organization has artifacts</p>
                <p>
                  You must transfer {blockers.sources} source(s), {blockers.topics} topic(s), and{' '}
                  {blockers.artifacts} artifact(s) to another organization before deletion.
                </p>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            {/* From/To Display */}
            <div className="flex items-center gap-4">
              <div className="flex-1 p-4 bg-stone-950 border border-stone-800 rounded-lg">
                <p className="text-xs text-stone-500 mb-1">From</p>
                <p className="text-stone-200 font-medium">{fromOrganization.name}</p>
              </div>
              <ArrowRight size={24} className="text-stone-600" />
              <div className="flex-1 p-4 bg-stone-950 border border-stone-800 rounded-lg">
                <p className="text-xs text-stone-500 mb-1">To</p>
                <p className="text-stone-200 font-medium">
                  {selectedOrg ? selectedOrg.name : 'Select organization...'}
                </p>
              </div>
            </div>

            {/* Target Organization Select */}
            <div>
              <label htmlFor="targetOrg" className="block text-sm font-medium text-stone-300 mb-2">
                Target Organization
              </label>
              <select
                id="targetOrg"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
              >
                <option value="">Select an organization...</option>
                {availableOrganizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-stone-500 mt-2">
                Only organizations where you are an owner or admin are shown.
              </p>
            </div>

            {/* Transfer Options */}
            <div>
              <label className="block text-sm font-medium text-stone-300 mb-3">
                What to Transfer
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 bg-stone-950 border border-stone-800 rounded-lg cursor-pointer hover:bg-stone-900/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={transferSources}
                    onChange={(e) => setTransferSources(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-stone-300">
                    Sources <span className="text-stone-500">({blockers.sources})</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-stone-950 border border-stone-800 rounded-lg cursor-pointer hover:bg-stone-900/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={transferTopics}
                    onChange={(e) => setTransferTopics(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-stone-300">
                    Topics <span className="text-stone-500">({blockers.topics})</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 p-3 bg-stone-950 border border-stone-800 rounded-lg cursor-pointer hover:bg-stone-900/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={transferArtifacts}
                    onChange={(e) => setTransferArtifacts(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-stone-300">
                    Artifacts <span className="text-stone-500">({blockers.artifacts})</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-800">
              <button
                onClick={onClose}
                disabled={isTransferring}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={isTransferring || !selectedOrgId}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isTransferring && <LoadingSpinner />}
                {isTransferring ? 'Transferring...' : 'Transfer All & Continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

