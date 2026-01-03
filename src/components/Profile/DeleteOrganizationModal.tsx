import { useState, useEffect } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { organizationService } from '../../services';
import { TransferArtifactsModal } from './TransferArtifactsModal';
import type { Organization } from '../../types/osint';
import { LoadingSpinner } from '../UI/LoadingSpinner';

interface DeleteOrganizationModalProps {
  organization: Organization & { userRole: string };
  allOrganizations: (Organization & { userRole: string })[];
  onSuccess: () => void;
  onClose: () => void;
}

export function DeleteOrganizationModal({
  organization,
  allOrganizations,
  onSuccess,
  onClose,
}: DeleteOrganizationModalProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [blockers, setBlockers] = useState<any>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = organization.userRole === 'owner';
  
  // Filter organizations where user is owner/admin (excluding current org)
  const eligibleOrgs = allOrganizations.filter(
    org => org.id !== organization.id && (org.userRole === 'owner' || org.userRole === 'admin')
  );

  useEffect(() => {
    checkIfCanDelete();
  }, []);

  const checkIfCanDelete = async () => {
    try {
      setIsChecking(true);
      const result = await organizationService.canDeleteOrganization(organization.id);
      setCanDelete(result.canDelete);
      setBlockers(result.blockers);
    } catch (err) {
      console.error('Error checking deletion eligibility:', err);
      setError(err instanceof Error ? err.message : 'Failed to check deletion eligibility');
    } finally {
      setIsChecking(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== organization.name) {
      setError('Organization name does not match');
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      await organizationService.deleteOrganization(organization.id);
      onSuccess();
    } catch (err) {
      console.error('Error deleting organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete organization');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTransferSuccess = async () => {
    setShowTransferModal(false);
    // Re-check if organization can now be deleted
    await checkIfCanDelete();
  };

  if (showTransferModal) {
    return (
      <TransferArtifactsModal
        fromOrganization={organization}
        availableOrganizations={eligibleOrgs}
        blockers={blockers}
        onSuccess={handleTransferSuccess}
        onClose={() => setShowTransferModal(false)}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-stone-900 border border-stone-800 rounded-lg w-full max-w-lg">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-stone-800">
            <h2 className="text-2xl font-semibold text-stone-100 flex items-center gap-2">
              <Trash2 size={24} className="text-red-500" />
              Delete Organization
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <X size={20} className="text-stone-400" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Permission Check */}
            {!isOwner && (
              <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-800 rounded-lg">
                <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-200">
                  <p className="font-medium mb-1">Insufficient Permissions</p>
                  <p>Only organization owners can delete organizations.</p>
                </div>
              </div>
            )}

            {/* Only One Org Warning */}
            {isOwner && eligibleOrgs.length === 0 && !canDelete && (
              <div className="flex items-start gap-3 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-200">
                  <p className="font-medium mb-1">Cannot Delete</p>
                  <p>Create another organization first to transfer artifacts to before deletion.</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
                {error}
              </div>
            )}

            {isChecking ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                {/* Organization Info */}
                <div>
                  <p className="text-sm text-stone-400 mb-2">Organization to Delete</p>
                  <div className="p-4 bg-stone-950 border border-stone-800 rounded-lg">
                    <p className="text-stone-200 font-medium">{organization.name}</p>
                  </div>
                </div>

                {/* Blockers Info */}
                {!canDelete && blockers && (
                  <div className="space-y-3">
                    <p className="text-sm text-stone-400">This organization has:</p>
                    <div className="bg-stone-950 border border-stone-800 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-400">Sources:</span>
                        <span className="text-stone-200 font-medium">{blockers.sources}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-400">Topics:</span>
                        <span className="text-stone-200 font-medium">{blockers.topics}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-stone-400">Artifacts:</span>
                        <span className="text-stone-200 font-medium">{blockers.artifacts}</span>
                      </div>
                    </div>
                    {eligibleOrgs.length > 0 && (
                      <button
                        onClick={() => setShowTransferModal(true)}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
                      >
                        Transfer Artifacts & Delete
                      </button>
                    )}
                  </div>
                )}

                {/* Confirmation for Empty Org */}
                {canDelete && isOwner && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-800 rounded-lg">
                      <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-red-200">
                        <p className="font-medium mb-1">This action cannot be undone</p>
                        <p>
                          This will permanently delete the organization <strong>{organization.name}</strong> and
                          all its memberships.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="confirmName" className="block text-sm font-medium text-stone-300 mb-2">
                        Type <span className="text-stone-100 font-bold">{organization.name}</span> to confirm
                      </label>
                      <input
                        id="confirmName"
                        type="text"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-red-600"
                        placeholder={organization.name}
                      />
                    </div>

                    <button
                      onClick={handleDelete}
                      disabled={isDeleting || confirmText !== organization.name}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isDeleting && <LoadingSpinner />}
                      {isDeleting ? 'Deleting...' : 'Delete Organization Permanently'}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Cancel Button */}
            {!isChecking && (
              <div className="pt-4 border-t border-stone-800">
                <button
                  onClick={onClose}
                  disabled={isDeleting}
                  className="w-full px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

