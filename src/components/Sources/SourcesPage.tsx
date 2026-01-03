import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import { osintSourcesService } from '../../services';
import { useOrganization } from '../../context/OrganizationContext';
import { OsintSourcesTable } from './OsintSourcesTable';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';
import type { Source } from '../../types/osint';

export function SourcesPage() {
  const { currentOrganization } = useOrganization();
  const [sources, setSources] = useState<Array<Source & { record_count: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSources = async () => {
    if (!currentOrganization) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const fetchedSources = await osintSourcesService.getAll(currentOrganization.id);
      setSources(fetchedSources);
    } catch (err) {
      console.error('Error loading sources:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      loadSources();
    }
  }, [currentOrganization?.id]);

  const handleUpdateSource = async (sourceId: string, updates: any) => {
    try {
      await osintSourcesService.update(sourceId, updates);
      // Refresh sources list
      await loadSources();
    } catch (err) {
      console.error('Error updating source:', err);
      setError(err instanceof Error ? err.message : 'Failed to update source');
    }
  };

  return (
    <div className="min-h-screen bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-100 flex items-center gap-3">
            <Database className="text-blue-500" size={32} />
            Manage Sources
          </h1>
          <p className="mt-2 text-stone-400">
            Configure and manage your OSINT data sources with reliability ratings
          </p>
        </div>

        {/* Content */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-stone-200">OSINT Sources</h2>
            <p className="text-sm text-stone-500 mt-1">
              Track source reliability and manage ingestion configurations
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
            <OsintSourcesTable sources={sources} onUpdate={handleUpdateSource} />
          )}
        </div>
      </div>
    </div>
  );
}

