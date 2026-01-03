import { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Search, RefreshCw, Filter, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { indicatorsService } from '../../services';
import { EmptyState } from '../UI/EmptyState';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { IndicatorCard } from './IndicatorCard';
import { IndicatorForm } from './IndicatorForm';
import type { Indicator, WatchItemCategory } from '../../types/osint';

export function IndicatorsPage() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterDomain, setFilterDomain] = useState<WatchItemCategory | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'triggered'>('all');

  const loadIndicators = async (showSpinner = true) => {
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
      if (filterDomain !== 'all') {
        filters.domain = filterDomain;
      }
      if (filterStatus === 'triggered') {
        filters.isTriggered = true;
      } else if (filterStatus === 'active') {
        filters.isTriggered = false;
      }

      const items = await indicatorsService.getAll(currentOrganization.id, filters);
      setIndicators(items);
    } catch (err) {
      console.error('Error loading indicators:', err);
      setError(err instanceof Error ? err.message : 'Failed to load indicators');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      loadIndicators();
    }
  }, [currentOrganization?.id, filterDomain, filterStatus]);

  const handleCreateIndicator = async (indicatorData: {
    domain: WatchItemCategory;
    name: string;
    description?: string;
    sourceUrl?: string;
    checkFrequency?: 'daily' | 'weekly' | 'monthly';
    actionOnTrigger?: string;
  }) => {
    if (!currentOrganization) {
      throw new Error('No organization selected');
    }

    try {
      await indicatorsService.create({
        organizationId: currentOrganization.id,
        ...indicatorData,
      });
      await loadIndicators(false);
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating indicator:', err);
      throw err;
    }
  };

  const handleDeleteIndicator = async (indicatorId: string) => {
    if (!confirm('Delete this indicator? This cannot be undone.')) {
      return;
    }

    try {
      await indicatorsService.delete(indicatorId);
      setIndicators(indicators.filter(item => item.id !== indicatorId));
    } catch (err) {
      console.error('Error deleting indicator:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete indicator');
    }
  };

  const filteredIndicators = indicators.filter(indicator =>
    searchQuery === '' ||
    indicator.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (indicator.description && indicator.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group by domain
  const groupedIndicators = filteredIndicators.reduce((acc, indicator) => {
    if (!acc[indicator.domain]) {
      acc[indicator.domain] = [];
    }
    acc[indicator.domain].push(indicator);
    return acc;
  }, {} as Record<WatchItemCategory, Indicator[]>);

  // Sort domains by item count
  const sortedDomains = Object.keys(groupedIndicators).sort((a, b) => 
    groupedIndicators[b as WatchItemCategory].length - groupedIndicators[a as WatchItemCategory].length
  ) as WatchItemCategory[];

  const triggeredCount = indicators.filter(i => i.isTriggered).length;
  const activeCount = indicators.filter(i => !i.isTriggered).length;

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
                <AlertTriangle className="text-amber-500" size={32} />
                Indicators & Warnings
              </h1>
              <p className="mt-2 text-stone-400">
                Predefined signals that trigger escalation to deep analysis
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadIndicators(false)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
                title="Refresh indicators"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
              >
                <Plus size={18} />
                Create Indicator
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500" size={20} />
              <input
                type="text"
                placeholder="Search indicators..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
              />
            </div>
            
            <div className="flex gap-2">
              <select
                value={filterDomain}
                onChange={(e) => setFilterDomain(e.target.value as WatchItemCategory | 'all')}
                className="px-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All Domains</option>
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
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'triggered')}
                className="px-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="triggered">Triggered</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="text-sm text-stone-400">Total Indicators</div>
            <div className="text-2xl font-bold text-stone-100 mt-1">
              {indicators.length}
            </div>
          </div>
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="text-sm text-stone-400">Active Monitoring</div>
            <div className="text-2xl font-bold text-stone-100 mt-1">
              {activeCount}
            </div>
          </div>
          <div className="bg-amber-900/30 border border-amber-800 p-4 rounded-lg">
            <div className="text-sm text-amber-400">Triggered</div>
            <div className="text-2xl font-bold text-amber-100 mt-1">
              {triggeredCount}
            </div>
          </div>
        </div>

        {/* Indicators List */}
        {filteredIndicators.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle size={64} className="text-stone-600" />}
            title={searchQuery ? 'No matching indicators' : 'No indicators yet'}
            description={
              searchQuery
                ? 'Try adjusting your search or filters'
                : 'Create your first indicator to start monitoring for escalation triggers'
            }
          />
        ) : (
          <div className="space-y-8">
            {sortedDomains.map(domain => (
              <div key={domain}>
                <h2 className="text-lg font-semibold text-stone-200 mb-4 capitalize">
                  {domain} ({groupedIndicators[domain].length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupedIndicators[domain].map(indicator => (
                    <IndicatorCard
                      key={indicator.id}
                      indicator={indicator}
                      onDelete={handleDeleteIndicator}
                      onRefresh={() => loadIndicators(false)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <IndicatorForm
            onSubmit={handleCreateIndicator}
            onCancel={() => setShowCreateModal(false)}
          />
        )}
      </div>
    </div>
  );
}

