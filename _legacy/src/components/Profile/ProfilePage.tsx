import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, Plus, Edit2, Trash2, Shield, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { organizationService, authService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { DeleteOrganizationModal } from './DeleteOrganizationModal';

interface OrgMember {
  id: string;
  role: 'owner' | 'admin' | 'analyst' | 'member';
  joinedAt: Date;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export function ProfilePage() {
  const { user } = useAuth();
  const { currentOrganization, organizations, refreshOrganizations, switchOrganization } = useOrganization();
  const navigate = useNavigate();

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Inline editing state
  const [editingUserName, setEditingUserName] = useState(false);
  const [userNameValue, setUserNameValue] = useState(user?.user_metadata?.name || user?.email || '');
  const [isSavingUserName, setIsSavingUserName] = useState(false);
  
  const [editingOrgName, setEditingOrgName] = useState(false);
  const [orgNameValue, setOrgNameValue] = useState(currentOrganization?.name || '');
  const [isSavingOrgName, setIsSavingOrgName] = useState(false);

  const isOwnerOrAdmin = currentOrganization?.userRole === 'owner' || currentOrganization?.userRole === 'admin';
  const isOwner = currentOrganization?.userRole === 'owner';

  // Update userNameValue when user changes
  useEffect(() => {
    if (user) {
      setUserNameValue(user.user_metadata?.name || user.email || '');
    }
  }, [user]);

  // Update orgNameValue when organization changes
  useEffect(() => {
    if (currentOrganization) {
      setOrgNameValue(currentOrganization.name);
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (currentOrganization && isOwnerOrAdmin) {
      loadMembers();
    }
  }, [currentOrganization?.id, isOwnerOrAdmin]);

  const loadMembers = async () => {
    if (!currentOrganization) return;

    try {
      setIsLoadingMembers(true);
      const orgMembers = await organizationService.getMembers(currentOrganization.id);
      setMembers(orgMembers);
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newOrgName.trim()) return;

    try {
      setIsCreating(true);
      setError(null);

      const slug = newOrgName
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

      await organizationService.createOrganization(
        newOrgName.trim(),
        `${slug}-${Date.now()}`,
        user.id
      );

      await refreshOrganizations();
      setShowCreateOrg(false);
      setNewOrgName('');
    } catch (err) {
      console.error('Error creating organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSuccess = async () => {
    setShowDeleteModal(false);
    await refreshOrganizations();
    // If current org was deleted, switch to another or redirect
    if (organizations.length > 0) {
      const remainingOrg = organizations.find(org => org.id !== currentOrganization?.id);
      if (remainingOrg) {
        switchOrganization(remainingOrg.id);
        window.location.reload();
      } else {
        navigate('/topics');
      }
    } else {
      navigate('/topics');
    }
  };

  const handleSaveUserName = async () => {
    if (!user || !userNameValue.trim()) {
      setEditingUserName(false);
      return;
    }

    try {
      setIsSavingUserName(true);
      setError(null);
      await authService.updateProfile({ name: userNameValue.trim() });
      setEditingUserName(false);
      // Reload page to refresh user data
      window.location.reload();
    } catch (err) {
      console.error('Error updating user name:', err);
      setError(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setIsSavingUserName(false);
    }
  };

  const handleCancelUserName = () => {
    setUserNameValue(user?.user_metadata?.name || user?.email || '');
    setEditingUserName(false);
  };

  const handleSaveOrgName = async () => {
    if (!currentOrganization || !orgNameValue.trim() || !isOwnerOrAdmin) {
      setEditingOrgName(false);
      return;
    }

    try {
      setIsSavingOrgName(true);
      setError(null);
      await organizationService.updateOrganization(currentOrganization.id, {
        name: orgNameValue.trim(),
      });
      await refreshOrganizations();
      setEditingOrgName(false);
    } catch (err) {
      console.error('Error updating organization name:', err);
      setError(err instanceof Error ? err.message : 'Failed to update organization name');
    } finally {
      setIsSavingOrgName(false);
    }
  };

  const handleCancelOrgName = () => {
    setOrgNameValue(currentOrganization?.name || '');
    setEditingOrgName(false);
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-900/30 text-purple-300 border-purple-800';
      case 'admin':
        return 'bg-blue-900/30 text-blue-300 border-blue-800';
      case 'analyst':
        return 'bg-green-900/30 text-green-300 border-green-800';
      default:
        return 'bg-stone-800 text-stone-300 border-stone-700';
    }
  };

  if (!user || !currentOrganization) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-100 mb-2">Profile & Organizations</h1>
          <p className="text-stone-400">Manage your profile and organization settings</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-4 text-red-400 hover:text-red-300 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* User Profile Section */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-stone-200 mb-4">User Profile</h2>
          <div className="space-y-3">
            <div>
              <span className="text-sm text-stone-400">Email</span>
              <p className="text-stone-200">{user.email}</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-stone-400">Display Name</span>
                {!editingUserName && (
                  <button
                    onClick={() => setEditingUserName(true)}
                    className="p-1 hover:bg-stone-800 rounded transition-colors duration-200"
                    title="Edit name"
                  >
                    <Edit2 size={16} className="text-stone-400 hover:text-stone-300" />
                  </button>
                )}
              </div>
              {editingUserName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={userNameValue}
                    onChange={(e) => setUserNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveUserName();
                      } else if (e.key === 'Escape') {
                        handleCancelUserName();
                      }
                    }}
                    autoFocus
                    className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
                    disabled={isSavingUserName}
                  />
                  <button
                    onClick={handleSaveUserName}
                    disabled={isSavingUserName || !userNameValue.trim()}
                    className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    title="Save"
                  >
                    {isSavingUserName ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}
                  </button>
                  <button
                    onClick={handleCancelUserName}
                    disabled={isSavingUserName}
                    className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-200 disabled:opacity-50"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <p className="text-stone-200">{user.user_metadata?.name || user.email}</p>
              )}
            </div>
          </div>
        </div>

        {/* Current Organization Section */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-stone-200 flex items-center gap-2">
              <Building2 size={20} />
              Current Organization
            </h2>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(currentOrganization.userRole)}`}>
              {currentOrganization.userRole}
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-stone-400">Organization Name</span>
                {!editingOrgName && isOwnerOrAdmin && (
                  <button
                    onClick={() => setEditingOrgName(true)}
                    className="p-1 hover:bg-stone-800 rounded transition-colors duration-200"
                    title="Edit organization name"
                  >
                    <Edit2 size={16} className="text-stone-400 hover:text-stone-300" />
                  </button>
                )}
              </div>
              {editingOrgName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={orgNameValue}
                    onChange={(e) => setOrgNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveOrgName();
                      } else if (e.key === 'Escape') {
                        handleCancelOrgName();
                      }
                    }}
                    autoFocus
                    className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 text-lg focus:outline-none focus:border-blue-600"
                    disabled={isSavingOrgName}
                  />
                  <button
                    onClick={handleSaveOrgName}
                    disabled={isSavingOrgName || !orgNameValue.trim()}
                    className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    title="Save"
                  >
                    {isSavingOrgName ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Check size={16} />
                    )}
                  </button>
                  <button
                    onClick={handleCancelOrgName}
                    disabled={isSavingOrgName}
                    className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-200 disabled:opacity-50"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <p className="text-stone-200 text-lg">{currentOrganization.name}</p>
              )}
            </div>
            <div>
              <span className="text-sm text-stone-400">Member Since</span>
              <p className="text-stone-300">{new Date(currentOrganization.joinedAt).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Switch Organization */}
          {organizations.length > 1 && (
            <div className="mt-6 pt-6 border-t border-stone-800">
              <h3 className="text-sm font-medium text-stone-400 mb-3">Switch Organization</h3>
              <div className="grid grid-cols-1 gap-2">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      switchOrganization(org.id);
                      window.location.reload(); // Reload to clear component state
                    }}
                    disabled={org.id === currentOrganization.id}
                    className={`px-4 py-3 rounded-lg text-left transition-colors duration-200 ${
                      org.id === currentOrganization.id
                        ? 'bg-accent/20 border-2 border-accent text-stone-100'
                        : 'bg-stone-800 border border-stone-700 hover:bg-stone-750 text-stone-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{org.name}</span>
                      <span className={`px-2 py-1 rounded text-xs ${getRoleBadgeColor(org.userRole)}`}>
                        {org.userRole}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create New Organization */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-stone-200">Organizations</h2>
            <button
              onClick={() => setShowCreateOrg(!showCreateOrg)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-200"
            >
              <Plus size={18} />
              Create Organization
            </button>
          </div>

          {showCreateOrg && (
            <form onSubmit={handleCreateOrganization} className="mt-4 p-4 bg-stone-950 border border-stone-800 rounded-lg">
              {error && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm">
                  {error}
                </div>
              )}
              <div className="mb-4">
                <label htmlFor="orgName" className="block text-sm font-medium text-stone-300 mb-2">
                  Organization Name
                </label>
                <input
                  id="orgName"
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full px-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
                  placeholder="My Organization"
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOrg(false);
                    setNewOrgName('');
                    setError(null);
                  }}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Organization Members (Owners/Admins only) */}
        {isOwnerOrAdmin && (
          <div className="bg-stone-900 border border-stone-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-stone-200 mb-4 flex items-center gap-2">
              <Users size={20} />
              Organization Members
            </h2>

            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : members.length === 0 ? (
              <p className="text-stone-400">No members found.</p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-stone-950 border border-stone-800 rounded-lg"
                  >
                    <div>
                      <p className="text-stone-200 font-medium">
                        {member.user.name || member.user.email}
                        {member.user.id === user.id && (
                          <span className="ml-2 text-xs text-stone-500">(You)</span>
                        )}
                      </p>
                      <p className="text-sm text-stone-400">{member.user.email}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(member.role)}`}>
                      <Shield size={12} className="inline mr-1" />
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete Organization (Owners only) */}
        {isOwner && (
          <div className="bg-stone-900 border border-red-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-red-400 mb-2 flex items-center gap-2">
              <Trash2 size={20} />
              Danger Zone
            </h2>
            <p className="text-stone-400 text-sm mb-4">
              Once you delete an organization, there is no going back. Please be certain.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
            >
              <Trash2 size={18} />
              Delete Organization
            </button>
          </div>
        )}

        {/* Back Button */}
        <div className="mt-8">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-200"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Delete Organization Modal */}
      {showDeleteModal && currentOrganization && (
        <DeleteOrganizationModal
          organization={currentOrganization}
          allOrganizations={organizations}
          onSuccess={handleDeleteSuccess}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

