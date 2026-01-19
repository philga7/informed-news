/**
 * X.com Lists Page
 * 
 * Main page component for managing X.com list timelines.
 * Features CRUD operations, drag-and-drop reordering, and timeline embedding.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, User, List, Plus, RefreshCw } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { xcomListsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { XcomListCard } from './XcomListCard';
import { XcomListForm } from './XcomListForm';
import type { XcomList, XcomListInsert, XcomListUpdate } from '../../types/xcom';
import { useToast } from '../../context/ToastContext';

export function XcomListsPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { showToast } = useToast();

  const [lists, setLists] = useState<XcomList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingList, setEditingList] = useState<XcomList | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  const loadLists = async (showSpinner = true) => {
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

      const fetchedLists = await xcomListsService.getAll(currentOrganization.id);
      setLists(fetchedLists);
    } catch (err) {
      console.error('Error loading X.com lists:', err);
      setError(err instanceof Error ? err.message : 'Failed to load X.com lists');
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load X.com lists',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      loadLists();
    }
  }, [currentOrganization?.id]);

  const handleCreateList = async (listData: XcomListInsert) => {
    if (!currentOrganization) {
      throw new Error('No organization selected');
    }

    try {
      await xcomListsService.create({
        ...listData,
        organizationId: currentOrganization.id,
      });
      await loadLists(false);
      setShowCreateModal(false);
      showToast({
        type: 'success',
        message: 'X.com list created successfully',
      });
    } catch (err) {
      console.error('Error creating X.com list:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create X.com list',
      });
      throw err;
    }
  };

  const handleUpdateList = async (listId: string, updates: XcomListUpdate) => {
    try {
      await xcomListsService.update(listId, updates);
      await loadLists(false);
      setEditingList(null);
      showToast({
        type: 'success',
        message: 'X.com list updated successfully',
      });
    } catch (err) {
      console.error('Error updating X.com list:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update X.com list',
      });
      throw err;
    }
  };

  const handleUpdateSettings = async (listId: string, settings: XcomList['settings']) => {
    try {
      await xcomListsService.update(listId, { settings });
      await loadLists(false);
      showToast({
        type: 'success',
        message: 'Timeline settings updated successfully',
      });
    } catch (err) {
      console.error('Error updating list settings:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update settings',
      });
      throw err;
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this X.com list? This action cannot be undone.')) {
      return;
    }

    try {
      setDeletingListId(listId);
      await xcomListsService.delete(listId);
      await loadLists(false);
      showToast({
        type: 'success',
        message: 'X.com list deleted successfully',
      });
    } catch (err) {
      console.error('Error deleting X.com list:', err);
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete X.com list',
      });
    } finally {
      setDeletingListId(null);
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
                onClick={() => loadLists(false)}
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
                  border-transparent text-stone-400 hover:text-stone-300 hover:border-stone-700
                `}
              >
                <User size={18} className="text-stone-500 group-hover:text-stone-400" />
                <div className="flex flex-col items-start">
                  <span>X.com Profiles</span>
                  <span className="text-xs text-stone-600 group-hover:text-stone-500">
                    Profile timelines
                  </span>
                </div>
              </button>
              <button
                onClick={() => navigate('/developing-news/xcom-lists')}
                className={`
                  group inline-flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-all
                  border-accent text-accent
                `}
              >
                <List size={18} className="text-accent" />
                <div className="flex flex-col items-start">
                  <span>X.com Lists</span>
                  <span className="text-xs text-accent/70">
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
              <h2 className="text-2xl font-bold text-stone-100">X.com Lists</h2>
              <p className="text-stone-400 text-sm mt-1">
                {lists.length} list{lists.length !== 1 ? 's' : ''} configured
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 text-stone-900 font-medium rounded-lg transition-colors"
            >
              <Plus size={20} />
              Add List
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-300">
              {error}
            </div>
          )}

          {/* Empty State */}
          {lists.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="text-stone-500 mb-4">
                <List size={64} />
              </div>
              <h3 className="text-xl font-semibold text-stone-200 mb-2">No X.com Lists</h3>
              <p className="text-stone-400 text-center max-w-md">
                Add your first X.com list to start displaying timeline feeds.
              </p>
            </div>
          )}

          {/* Lists Grid */}
          {lists.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {lists.map((list) => (
                <XcomListCard
                  key={list.id}
                  list={list}
                  onEdit={setEditingList}
                  onDelete={handleDeleteList}
                  onUpdateSettings={handleUpdateSettings}
                  isDeleting={deletingListId === list.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create List Modal */}
      {showCreateModal && currentOrganization && (
        <XcomListForm
          initialData={null}
          organizationId={currentOrganization.id}
          onSubmit={handleCreateList}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit List Modal */}
      {editingList && currentOrganization && (
        <XcomListForm
          initialData={editingList}
          organizationId={currentOrganization.id}
          onSubmit={(data) => handleUpdateList(editingList.id, data as XcomListUpdate)}
          onCancel={() => setEditingList(null)}
        />
      )}
    </div>
  );
}
