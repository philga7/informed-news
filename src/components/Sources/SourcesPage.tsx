import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, AlertTriangle, TrendingUp, Calendar, Plus, Archive } from 'lucide-react';
import { osintSourcesService } from '../../services';
import { useOrganization } from '../../context/OrganizationContext';
import { OsintSourcesTable } from './OsintSourcesTable';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';
import { CreateSourceModal } from './CreateSourceModal';
import type { Source, OsintSourceType } from '../../types/osint';

interface SourceWithMetrics extends Source {
  record_count: number;
  linked_count?: number;
  signal_effectiveness?: number;
  days_since_last_link?: number;
}

interface SourceUpdateParams {
  name?: string;
  url?: string;
  domain?: string | null;
  reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  notes?: string;
  scrapeExternalUrl?: boolean;
  enabled?: boolean;
}

export function SourcesPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const [sources, setSources] = useState<SourceWithMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [hygieneStats, setHygieneStats] = useState({
    totalSources: 0,
    lowEffectiveness: 0,
    staleFeeds: 0,
    avgEffectiveness: 0,
  });

  const loadSources = useCallback(async () => {
    if (!currentOrganization) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const fetchedSources = await osintSourcesService.getAll(currentOrganization.id);
      
      // Calculate hygiene metrics
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const sourcesWithMetrics: SourceWithMetrics[] = fetchedSources.map((source) => {
        // Type assertion needed because service returns SourceWithCount but backend includes additional fields
        const sourceWithMetrics = source as SourceWithMetrics;
        const linkedCount = sourceWithMetrics.linked_count || 0;
        const recordCount = sourceWithMetrics.record_count || 0;
        const effectiveness = recordCount > 0 ? (linkedCount / recordCount) * 100 : 0;
        
        return {
          ...sourceWithMetrics,
          linked_count: linkedCount,
          signal_effectiveness: effectiveness,
          days_since_last_link: sourceWithMetrics.days_since_last_link,
        };
      });
      
      setSources(sourcesWithMetrics);
      
      // Calculate overall hygiene stats
      const totalSources = sourcesWithMetrics.length;
      const lowEffectiveness = sourcesWithMetrics.filter(s => 
        s.record_count > 10 && (s.signal_effectiveness || 0) < 5
      ).length;
      const staleFeeds = sourcesWithMetrics.filter(s => 
        (s.days_since_last_link || 0) > 90 && s.record_count > 0
      ).length;
      const avgEffectiveness = totalSources > 0
        ? sourcesWithMetrics.reduce((sum, s) => sum + (s.signal_effectiveness || 0), 0) / totalSources
        : 0;
      
      setHygieneStats({
        totalSources,
        lowEffectiveness,
        staleFeeds,
        avgEffectiveness,
      });
    } catch (err) {
      console.error('Error loading sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (currentOrganization?.id) {
      loadSources();
    }
  }, [currentOrganization?.id, loadSources]);

  const handleUpdateSource = async (sourceId: string, updates: SourceUpdateParams) => {
    try {
      await osintSourcesService.update(sourceId, updates);
      // Refresh sources list
      await loadSources();
    } catch (err) {
      console.error('Error updating source:', err);
      setError(err instanceof Error ? err.message : 'Failed to update source');
    }
  };

  const handleCreateSource = async (sourceData: {
    name: string;
    sourceType: OsintSourceType;
    url?: string;
    domain?: string | null;
    reliabilityRating?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    notes?: string;
    scrapeExternalUrl?: boolean;
  }) => {
    if (!currentOrganization) {
      throw new Error('No organization selected');
    }

    try {
      await osintSourcesService.create(currentOrganization.id, sourceData);
      await loadSources();
      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating source:', err);
      throw err;
    }
  };

  const handleDeleteSource = async (sourceId: string) => {
    try {
      await osintSourcesService.delete(sourceId);
      // Refresh sources list
      await loadSources();
    } catch (err) {
      console.error('Error deleting source:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete source');
      throw err;
    }
  };

  const handleRefreshSource = async (sourceId: string, sourceType: string) => {
    if (!currentOrganization) {
      setError('No organization selected');
      return;
    }

    try {
      setError(null);
      
      // Use relative URL in production (Vercel), localhost in development
      const API_BASE = import.meta.env.PROD 
        ? (import.meta.env.VITE_API_URL || '')
        : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

      // For RSS sources, trigger actual ingestion
      if (sourceType === 'rss') {
        const response = await fetch(`${API_BASE}/api/ingest/rss`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organization_id: currentOrganization.id,
            source_id: sourceId,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || `Failed to refresh source: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ RSS source refreshed:', result);
      } else {
        // For non-RSS sources (API, email, manual), just update the timestamp
        // This marks the source as "touched" without triggering ingestion
        await osintSourcesService.update(sourceId, {});
        console.log(`✅ ${sourceType.toUpperCase()} source timestamp updated`);
      }
      
      // Refresh sources list to update metrics
      await loadSources();
    } catch (err) {
      console.error('Error refreshing source:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh source');
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
                <Database className="text-blue-500" size={32} />
                Manage Sources
              </h1>
              <p className="mt-2 text-stone-400">
                Configure and manage your OSINT data sources with reliability ratings
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View Archived Records */}
              <button
                onClick={() => navigate('/sources/archived')}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 font-medium text-sm whitespace-nowrap"
              >
                <Archive size={16} />
                Archived Records
              </button>
              {/* Primary Action */}
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250 font-medium text-sm whitespace-nowrap"
              >
                <Plus size={16} />
                Create Source
              </button>
            </div>
          </div>
        </div>

        {/* Feed Hygiene Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-stone-400">Avg Effectiveness</div>
                <div className="text-2xl font-bold text-stone-100 mt-1">
                  {hygieneStats.avgEffectiveness.toFixed(1)}%
                </div>
              </div>
              <TrendingUp className="text-blue-500" size={32} />
            </div>
            <p className="text-xs text-stone-500 mt-2">
              % of records linked to topics
            </p>
          </div>
          
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-stone-400">Total Sources</div>
                <div className="text-2xl font-bold text-stone-100 mt-1">
                  {hygieneStats.totalSources}
                </div>
              </div>
              <Database className="text-green-500" size={32} />
            </div>
            <p className="text-xs text-stone-500 mt-2">
              Active OSINT sources
            </p>
          </div>
          
          <div className={`bg-stone-900 border p-4 rounded-lg ${
            hygieneStats.lowEffectiveness > 0 ? 'border-orange-800' : 'border-stone-800'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-stone-400">Low Effectiveness</div>
                <div className={`text-2xl font-bold mt-1 ${
                  hygieneStats.lowEffectiveness > 0 ? 'text-orange-400' : 'text-stone-100'
                }`}>
                  {hygieneStats.lowEffectiveness}
                </div>
              </div>
              <AlertTriangle className={
                hygieneStats.lowEffectiveness > 0 ? 'text-orange-500' : 'text-stone-600'
              } size={32} />
            </div>
            <p className="text-xs text-stone-500 mt-2">
              Sources &lt;5% effectiveness (10+ records)
            </p>
          </div>
          
          <div className={`bg-stone-900 border p-4 rounded-lg ${
            hygieneStats.staleFeeds > 0 ? 'border-red-800' : 'border-stone-800'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-stone-400">Stale Feeds</div>
                <div className={`text-2xl font-bold mt-1 ${
                  hygieneStats.staleFeeds > 0 ? 'text-red-400' : 'text-stone-100'
                }`}>
                  {hygieneStats.staleFeeds}
                </div>
              </div>
              <Calendar className={
                hygieneStats.staleFeeds > 0 ? 'text-red-500' : 'text-stone-600'
              } size={32} />
            </div>
            <p className="text-xs text-stone-500 mt-2">
              No links in 90+ days
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-stone-200">OSINT Sources</h2>
            <p className="text-sm text-stone-500 mt-1">
              Track source reliability, signal effectiveness, and feed hygiene
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : sources.length === 0 ? (
            <EmptyState
              title="No sources found"
              description="Sources will appear here once they are configured through the ingestion system."
              icon={<Database size={48} className="text-stone-600" />}
            />
          ) : (
            <OsintSourcesTable 
              sources={sources} 
              onUpdate={handleUpdateSource}
              onDelete={handleDeleteSource}
              onRefresh={(sourceId, sourceType) => handleRefreshSource(sourceId, sourceType)}
            />
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateSourceModal
          onSubmit={handleCreateSource}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

