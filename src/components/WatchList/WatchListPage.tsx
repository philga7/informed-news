import { useState, useEffect } from 'react';
import { Eye, Plus, Search, RefreshCw, AlertTriangle, Filter } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { watchItemsService } from '../../services';
import { EmptyState } from '../UI/EmptyState';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { WatchItemCard } from './WatchItemCard';
import { WatchItemForm } from './WatchItemForm';
import type { WatchItemCategory, WatchItemStatus } from '../../types/osint';

interface WatchItemWithSignals {
  id: string;
  organizationId: string;
  title: string;
  category: WatchItemCategory;
  notes: string | null;
  indicatorTriggers: string[];
  status: WatchItemStatus;
  escalatedTopicId: string | null;
  firstNotedAt: Date;
  lastReviewedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  signalCount: number;
}

export function WatchListPage() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [watchItems, setWatchItems] = useState<WatchItemWithSignals[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState<WatchItemCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<WatchItemStatus | 'all'>('watching');

  const loadWatchItems = async (showSpinner = true) => {
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
      
      const filters: any = {};
      if (filterCategory !== 'all') {
        filters.category = filterCategory;
      }
      if (filterStatus !== 'all') {
        filters.status = filterStatus;
      }

      const items = await watchItemsService.getAll(currentOrganization.id, filters);
      setWatchItems(items);
    } catch (err) {
      console.error('Error loading watch items:', err);
      setError(err instanceof Error ? err.message : 'Failed to load watch items');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      loadWatchItems();
    }
  }, [currentOrganization?.id, filterCategory, filterStatus]);

  const handleCreateWatchItem = async (itemData: {
    title: string;
    category: WatchItemCategory;
    notes?: string;
    indicatorTriggers?: string[];
  }) => {
    if (!currentOrganization) {
      throw new Error('No organization selected');
    }

    try {
      const newItem = await watchItemsService.create({
        organizationId: currentOrganization.id,
        ...itemData,
      });
      await loadWatchItems(false);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating watch item:', err);
      throw err;
    }
  };

  const handleDeleteWatchItem = async (itemId: string) => {
    if (!confirm('Delete this watch item? All linked source records will be unlinked.')) {
      return;
    }

    try {
      await watchItemsService.delete(itemId);
      setWatchItems(watchItems.filter(item => item.id !== itemId));
    } catch (err) {
      console.error('Error deleting watch item:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete watch item');
    }
  };

  const handleArchiveWatchItem = async (itemId: string) => {
    try {
      await watchItemsService.archive(itemId);
      await loadWatchItems(false);
    } catch (err) {
      console.error('Error archiving watch item:', err);
      setError(err instanceof Error ? err.message : 'Failed to archive watch item');
    }
  };

  const handleMarkAsReviewed = async (itemId: string) => {
    try {
      await watchItemsService.markAsReviewed(itemId);
      await loadWatchItems(false);
    } catch (err) {
      console.error('Error marking as reviewed:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark as reviewed');
    }
  };

  const filteredWatchItems = watchItems.filter(item =>
    searchQuery === '' ||
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.notes && item.notes.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group by category
  const groupedItems = filteredWatchItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<WatchItemCategory, WatchItemWithSignals[]>);

  // Sort categories by item count
  const sortedCategories = Object.keys(groupedItems).sort((a, b) => 
    groupedItems[b as WatchItemCategory].length - groupedItems[a as WatchItemCategory].length
  ) as WatchItemCategory[];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
                <Eye className="text-blue-500" size={32} />
                Watch List
              </h1>
              <p className="mt-2 text-stone-400">
                Tier 1 situational awareness - potential topics under light monitoring
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadWatchItems(false)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
                title="Refresh watch items"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
              >
                <Plus size={18} />
                Create Watch Item
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500" size={20} />
              <input
                type="text"
                placeholder="Search watch items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
              />
            </div>
            
            <div className="flex gap-2">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as WatchItemCategory | 'all')}
                className="px-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All Categories</option>
                <option value="politics">Politics</option>
                <option value="finance">Finance</option>
                <option value="technology">Technology</option>
                <option value="local">Local</option>
                <option value="international">International</option>
                <option value="health">Health</option>
                <option value="security">Security</option>
                <option value="other">Other</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as WatchItemStatus | 'all')}
                className="px-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All Status</option>
                <option value="watching">Watching</option>
                <option value="escalated">Escalated</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="text-sm text-stone-400">Total Watching</div>
            <div className="text-2xl font-bold text-stone-100 mt-1">
              {watchItems.filter(i => i.status === 'watching').length}
            </div>
          </div>
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="text-sm text-stone-400">Total Signals</div>
            <div className="text-2xl font-bold text-stone-100 mt-1">
              {watchItems.reduce((sum, item) => sum + item.signalCount, 0)}
            </div>
          </div>
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="text-sm text-stone-400">Escalated</div>
            <div className="text-2xl font-bold text-stone-100 mt-1">
              {watchItems.filter(i => i.status === 'escalated').length}
            </div>
          </div>
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="text-sm text-stone-400">Archived</div>
            <div className="text-2xl font-bold text-stone-100 mt-1">
              {watchItems.filter(i => i.status === 'archived').length}
            </div>
          </div>
        </div>

        {/* Watch Items List */}
        {filteredWatchItems.length === 0 ? (
          <EmptyState
            icon={<Eye size={64} className="text-stone-600" />}
            title={searchQuery ? 'No matching watch items' : 'No watch items yet'}
            description={
              searchQuery
                ? 'Try adjusting your search or filters'
                : 'Create your first watch item to start monitoring potential topics'
            }
          />
        ) : (
          <div className="space-y-8">
            {sortedCategories.map(category => (
              <div key={category}>
                <h2 className="text-lg font-semibold text-stone-200 mb-4 capitalize">
                  {category} ({groupedItems[category].length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupedItems[category].map(item => (
                    <WatchItemCard
                      key={item.id}
                      watchItem={item}
                      onDelete={handleDeleteWatchItem}
                      onArchive={handleArchiveWatchItem}
                      onMarkAsReviewed={handleMarkAsReviewed}
                      onRefresh={() => loadWatchItems(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <WatchItemForm
            onSubmit={handleCreateWatchItem}
            onCancel={() => setShowCreateModal(false)}
          />
        )}
      </div>
    </div>
  );
}

