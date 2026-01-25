/**
 * X.com Profiles Page
 * 
 * Main page component for managing X.com profile timelines.
 * Features CRUD operations, drag-and-drop reordering, and timeline embedding.
 * 
 * Phase 8: Layout & Styling
 * - Responsive grid layout (1 col mobile, 2 col tablet, 3 col desktop)
 * - View mode toggle (grid vs list)
 * - Improved timeline height constraints
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, User, List, Plus, RefreshCw, LayoutGrid, LayoutList } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useOrganization } from '../../context/OrganizationContext';
import { xcomProfilesService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';
import { XcomProfileCard } from './XcomProfileCard';
import { XcomProfileForm } from './XcomProfileForm';
import type { XcomProfile, XcomProfileInsert, XcomProfileUpdate } from '../../types/xcom';
import { useToast } from '../../context/ToastContext';

type ViewMode = 'grid' | 'list';

export function XcomProfilesPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();

  const [profiles, setProfiles] = useState<XcomProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<XcomProfile | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Configure sensors for drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadProfiles = async (showSpinner = true) => {
    if (!currentOrganization) {
      setIsLoading(false);
      return;
    }

    try {
      if (showSpinner) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      const fetchedProfiles = await xcomProfilesService.getAll(currentOrganization.id);
      setProfiles(fetchedProfiles);
    } catch (err) {
      console.error('Error loading X.com profiles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load X.com profiles');
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load X.com profiles',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      loadProfiles();
    }
  }, [currentOrganization?.id]);

  const handleCreateProfile = async (profileData: XcomProfileInsert) => {
    if (!currentOrganization) {
      throw new Error('No organization selected');
    }

    try {
      await xcomProfilesService.create({
        ...profileData,
        organizationId: currentOrganization.id,
      });
      await loadProfiles(false);
      setShowCreateModal(false);
      showToast({
        type: 'success',
        message: 'X.com profile created successfully',
      });
    } catch (err) {
      console.error('Error creating X.com profile:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create X.com profile',
      });
      throw err;
    }
  };

  const handleUpdateProfile = async (profileId: string, updates: XcomProfileUpdate) => {
    try {
      await xcomProfilesService.update(profileId, updates);
      await loadProfiles(false);
      setEditingProfile(null);
      showToast({
        type: 'success',
        message: 'X.com profile updated successfully',
      });
    } catch (err) {
      console.error('Error updating X.com profile:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update X.com profile',
      });
      throw err;
    }
  };

  const handleUpdateSettings = async (profileId: string, settings: XcomProfile['settings']) => {
    try {
      await xcomProfilesService.update(profileId, { settings });
      await loadProfiles(false);
      showToast({
        type: 'success',
        message: 'Timeline settings updated successfully',
      });
    } catch (err) {
      console.error('Error updating profile settings:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update settings',
      });
      throw err;
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm('Are you sure you want to delete this X.com profile? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingProfileId(profileId);
      await xcomProfilesService.delete(profileId);
      await loadProfiles(false);
      showToast({
        type: 'success',
        message: 'X.com profile deleted successfully',
      });
    } catch (err) {
      console.error('Error deleting X.com profile:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete X.com profile',
      });
    } finally {
      setDeletingProfileId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !currentOrganization) {
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = profiles.findIndex((p) => p.id === active.id);
      const newIndex = profiles.findIndex((p) => p.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      // Optimistic update
      const reorderedProfiles = arrayMove(profiles, oldIndex, newIndex);
      setProfiles(reorderedProfiles);
      setIsReordering(true);

      try {
        // Get the new order of profile IDs
        const profileIds = reorderedProfiles.map((p) => p.id);
        
        // Persist to backend
        await xcomProfilesService.reorder(currentOrganization.id, profileIds);
        
        showToast({
          type: 'success',
          message: 'Profiles reordered successfully',
        });
      } catch (err) {
        // Revert on error
        setProfiles(profiles);
        console.error('Error reordering profiles:', err);
        showToast({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to reorder profiles',
        });
      } finally {
        setIsReordering(false);
      }
    }
  };

  if (!currentOrganization) {
    return <LoadingSpinner />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sparkles className="text-accent" size={32} />
              <div>
                <h1 className="text-3xl font-bold text-stone-200">Developing News</h1>
                <p className="text-stone-400 mt-1">
                  Manage X.com profile and list timelines for {currentOrganization.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadProfiles(false)}
                disabled={isRefreshing}
                className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-stone-800">
            <nav className="-mb-px flex gap-4" aria-label="Tabs">
              <button
                onClick={() => navigate('/developing-news/xcom-profiles')}
                className={`
                  group inline-flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all
                  border-accent text-accent
                `}
              >
                <User size={18} className="text-accent" />
                <div className="flex flex-col items-start">
                  <span>X.com Profiles</span>
                  <span className="text-xs text-accent/70">
                    Profile timelines
                  </span>
                </div>
              </button>
              <button
                onClick={() => navigate('/developing-news/xcom-lists')}
                className={`
                  group inline-flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all
                  border-transparent text-stone-400 hover:text-stone-300 hover:border-stone-700
                `}
              >
                <List size={18} className="text-stone-500 group-hover:text-stone-400" />
                <div className="flex flex-col items-start">
                  <span>X.com Lists</span>
                  <span className="text-xs text-stone-600 group-hover:text-stone-500">
                    List timelines
                  </span>
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="pb-8">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-stone-100">X.com Profiles</h2>
              <p className="text-stone-400 text-sm mt-1">
                {profiles.length} profile{profiles.length !== 1 ? 's' : ''} configured
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-stone-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-stone-700 text-accent'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-stone-700 text-accent'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                  title="List view"
                >
                  <LayoutList size={18} />
                </button>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-stone-900 font-medium rounded-lg transition-colors"
              >
                <Plus size={20} />
                Add Profile
              </button>
            </div>
          </div>

          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300">
              {error}
            </div>
          )}

          {/* Empty State */}
          {profiles.length === 0 && !error && (
            <EmptyState
              title="No X.com Profiles"
              description="Add your first X.com profile to start displaying timeline feeds."
              icon={<User size={64} />}
            />
          )}

          {/* Profiles Grid/List */}
          {profiles.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={profiles.map((p) => p.id)}
                strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
              >
                <div
                  className={
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'
                      : 'flex flex-col gap-4'
                  }
                >
                  {profiles.map((profile) => (
                    <SortableProfileCard
                      key={profile.id}
                      profile={profile}
                      onEdit={setEditingProfile}
                      onDelete={handleDeleteProfile}
                      onUpdateSettings={handleUpdateSettings}
                      isDeleting={deletingProfileId === profile.id}
                      disabled={isReordering}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Create Profile Modal */}
      {showCreateModal && currentOrganization && (
        <XcomProfileForm
          initialData={null}
          organizationId={currentOrganization.id}
          onSubmit={async (data) => {
            await handleCreateProfile(data as XcomProfileInsert);
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit Profile Modal */}
      {editingProfile && currentOrganization && (
        <XcomProfileForm
          initialData={editingProfile}
          organizationId={currentOrganization.id}
          onSubmit={async (data) => {
            await handleUpdateProfile(editingProfile.id, data as XcomProfileUpdate);
          }}
          onCancel={() => setEditingProfile(null)}
        />
      )}
    </div>
  );
}

/**
 * Sortable wrapper for XcomProfileCard
 */
interface SortableProfileCardProps {
  profile: XcomProfile;
  onEdit: (profile: XcomProfile) => void;
  onDelete: (profileId: string) => void;
  onUpdateSettings: (profileId: string, settings: XcomProfile['settings']) => Promise<void>;
  isDeleting?: boolean;
  disabled?: boolean;
  viewMode?: ViewMode;
}

function SortableProfileCard({
  profile,
  onEdit,
  onDelete,
  onUpdateSettings,
  isDeleting = false,
  disabled = false,
  viewMode = 'grid',
}: SortableProfileCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: profile.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <XcomProfileCard
        profile={profile}
        onEdit={onEdit}
        onDelete={onDelete}
        onUpdateSettings={onUpdateSettings}
        isDeleting={isDeleting}
        dragHandleProps={{ ...attributes, ...listeners }}
        viewMode={viewMode}
      />
    </div>
  );
}
