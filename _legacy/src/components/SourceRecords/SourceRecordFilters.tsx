import { useState, useEffect } from 'react';
import { osintSourcesService } from '../../services';
import type { Source } from '../../types/osint';

interface SourceRecordFiltersProps {
  filters: {
    sourceId: string;
    linkedStatus: 'linked' | 'unlinked' | 'all';
    dateFrom: string;
    dateTo: string;
  };
  onChange: (filters: any) => void;
  organizationId: string;
}

export function SourceRecordFilters({ filters, onChange, organizationId }: SourceRecordFiltersProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);

  useEffect(() => {
    if (organizationId) {
      loadSources();
    }
  }, [organizationId]);

  const loadSources = async () => {
    try {
      setIsLoadingSources(true);
      const fetchedSources = await osintSourcesService.getAll(organizationId);
      setSources(fetchedSources);
    } catch (err) {
      console.error('Error loading sources:', err);
    } finally {
      setIsLoadingSources(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="mt-4 p-4 bg-stone-900 border border-stone-800 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Sources */}
        <div>
          <label className="block text-sm font-medium text-stone-300 mb-2">
            Source
          </label>
          <select
            value={filters.sourceId}
            onChange={(e) => handleChange('sourceId', e.target.value)}
            disabled={isLoadingSources}
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600 disabled:opacity-50"
          >
            <option value="">All Sources</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </div>

        {/* Linked Status */}
        <div>
          <label className="block text-sm font-medium text-stone-300 mb-2">
            Linked Status
          </label>
          <select
            value={filters.linkedStatus}
            onChange={(e) => handleChange('linkedStatus', e.target.value)}
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
          >
            <option value="all">All Records</option>
            <option value="linked">Linked Only</option>
            <option value="unlinked">Unlinked Only</option>
          </select>
        </div>

        {/* Date From */}
        <div>
          <label className="block text-sm font-medium text-stone-300 mb-2">
            Date From
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-sm font-medium text-stone-300 mb-2">
            Date To
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-200 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {/* Clear Filters */}
      {(filters.sourceId || filters.linkedStatus !== 'all' || filters.dateFrom || filters.dateTo) && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() =>
              onChange({
                sourceId: '',
                linkedStatus: 'all',
                dateFrom: '',
                dateTo: '',
              })
            }
            className="px-4 py-2 text-sm bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}

