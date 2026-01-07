import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Filter, RefreshCw, Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useOrganization } from '../../context/OrganizationContext';
import { sourceRecordsService } from '../../services';
import { EmptyState } from '../UI/EmptyState';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { SourceRecordFilters } from './SourceRecordFilters';
import { ManualArticleInputModal } from './ManualArticleInputModal';
import { formatSourceNameWithDomain } from '../../utils/urlUtils';

export function SourceRecordsPage() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [filters, setFilters] = useState({
    sourceId: '',
    linkedStatus: 'all' as 'linked' | 'unlinked' | 'all',
    dateFrom: '',
    dateTo: '',
  });
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
  });
  const isInitialLoad = useRef(true);

  const loadRecords = async (showSpinner = true, resetOffset = false) => {
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

      const result = await sourceRecordsService.getAll({
        organizationId: currentOrganization.id,
        sourceId: filters.sourceId || undefined,
        linkedStatus: filters.linkedStatus === 'all' ? undefined : filters.linkedStatus,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        search: searchQuery || undefined,
        limit: pagination.limit,
        offset: resetOffset ? 0 : pagination.offset,
      });

      setRecords(result.records);
      setPagination(result.pagination);
      
      // Mark initial load as complete after first successful load
      if (isInitialLoad.current) {
        isInitialLoad.current = false;
      }
    } catch (err) {
      console.error('Error loading records:', err);
      setError(err instanceof Error ? err.message : 'Failed to load source records');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Initial load or organization change - show full loading state
  useEffect(() => {
    if (currentOrganization) {
      isInitialLoad.current = true;
      loadRecords(true, false);
    }
  }, [currentOrganization?.id]);

  // Filter changes - only refresh records listing (after initial load)
  useEffect(() => {
    if (currentOrganization && !isInitialLoad.current) {
      // Only refresh if this is not the initial load (filters changed)
      loadRecords(false, true);
    }
  }, [filters.sourceId, filters.linkedStatus, filters.dateFrom, filters.dateTo]);

  // Pagination changes - only refresh records listing (after initial load)
  useEffect(() => {
    if (currentOrganization && !isInitialLoad.current && pagination.offset > 0) {
      // Only refresh if this is not the initial load and we're actually paginating
      loadRecords(false, false);
    }
  }, [pagination.offset]);

  const handleSearch = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPagination({ ...pagination, offset: 0 });
    loadRecords(false, true); // Use isRefreshing instead of full loading state
  };

  const handleRecordClick = (recordId: string) => {
    navigate(`/source-records/${recordId}`);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getReliabilityColor = (rating: string) => {
    switch (rating) {
      case 'HIGH':
        return 'text-green-400';
      case 'MEDIUM':
        return 'text-yellow-400';
      case 'LOW':
        return 'text-orange-400';
      default:
        return 'text-stone-400';
    }
  };

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
                <FileText className="text-blue-500" size={32} />
                Source Records
              </h1>
              <p className="mt-2 text-stone-400">
                Browse and manage intelligence source records
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowManualInput(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250"
              >
                <Plus size={18} />
                <span className="hidden sm:inline">Add Manual Article</span>
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-250 ${
                  showFilters
                    ? 'bg-blue-600 text-white'
                    : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                }`}
              >
                <Filter size={18} />
                <span className="hidden sm:inline">Filters</span>
              </button>
              <button
                onClick={() => loadRecords(false)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-500"
                size={20}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSearch(e);
                  }
                }}
                placeholder="Search by title, content, or source..."
                className="w-full pl-10 pr-4 py-3 bg-stone-900 border border-stone-800 rounded-lg text-stone-200 placeholder-stone-500 focus:outline-none focus:border-blue-600"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors duration-250"
            >
              Search
            </button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <SourceRecordFilters
              filters={filters}
              onChange={setFilters}
              organizationId={currentOrganization?.id || ''}
            />
          )}
        </div>

        {/* Records List */}
        {records.length === 0 ? (
          <EmptyState
            title="No source records found"
            description="Try adjusting your filters or search query."
            icon={<FileText size={64} className="text-stone-600" />}
          />
        ) : (
          <>
            <div className="bg-stone-900 border border-stone-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stone-800">
                      <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">
                        Title
                      </th>
                      <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">
                        Source
                      </th>
                      <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">
                        Published
                      </th>
                      <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">
                        Linked Topics
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr
                        key={record.id}
                        onClick={() => handleRecordClick(record.id)}
                        className="border-b border-stone-800 hover:bg-stone-800/50 cursor-pointer transition-colors duration-250"
                      >
                        <td className="py-4 px-4">
                          <p className="text-stone-200 font-medium line-clamp-2">
                            {record.title}
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <div>
                            <p className="text-stone-300 text-sm">
                              {formatSourceNameWithDomain(
                                record.sources?.name || 'Unknown',
                                record.url,
                                record.sources?.scrape_external_url || false
                              )}
                            </p>
                            <p
                              className={`text-xs mt-1 ${getReliabilityColor(
                                record.sources?.reliability_rating
                              )}`}
                            >
                              {record.sources?.reliability_rating}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-stone-400 text-sm">
                          {formatDate(record.publishedAt)}
                        </td>
                        <td className="py-4 px-4">
                          {record.topic_source_links && record.topic_source_links.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {record.topic_source_links.slice(0, 2).map((link: any) => (
                                <span
                                  key={link.id}
                                  className="px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded"
                                >
                                  {link.osint_topics.name}
                                </span>
                              ))}
                              {record.topic_source_links.length > 2 && (
                                <span className="px-2 py-1 bg-stone-800 text-stone-500 text-xs rounded">
                                  +{record.topic_source_links.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-stone-500 text-sm">Unlinked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-stone-400 text-sm">
                  Showing {pagination.offset + 1} to{' '}
                  {Math.min(pagination.offset + pagination.limit, pagination.total)} of{' '}
                  {pagination.total} records
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setPagination({
                        ...pagination,
                        offset: Math.max(0, pagination.offset - pagination.limit),
                      })
                    }
                    disabled={pagination.offset === 0}
                    className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      setPagination({
                        ...pagination,
                        offset: pagination.offset + pagination.limit,
                      })
                    }
                    disabled={pagination.offset + pagination.limit >= pagination.total}
                    className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Manual Article Input Modal */}
      {showManualInput && currentOrganization && (
        <ManualArticleInputModal
          organizationId={currentOrganization.id}
          onClose={() => setShowManualInput(false)}
          onSuccess={() => {
            loadRecords(true, true);
          }}
        />
      )}
    </div>
  );
}

