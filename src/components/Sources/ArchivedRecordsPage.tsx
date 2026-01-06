import { useState, useEffect } from 'react';
import { Archive, ArrowLeft, RotateCcw, Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOrganization } from '../../context/OrganizationContext';
import { retentionService, type ArchivedRecord } from '../../services/retention.service';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import { EmptyState } from '../UI/EmptyState';

export function ArchivedRecordsPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const [records, setRecords] = useState<ArchivedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
  });
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadRecords = async (resetOffset = false) => {
    if (!currentOrganization) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await retentionService.getArchived({
        organizationId: currentOrganization.id,
        sourceId: selectedSourceId || undefined,
        archiveReason: selectedReason || undefined,
        limit: pagination.limit,
        offset: resetOffset ? 0 : pagination.offset,
      });

      setRecords(result.records);
      setPagination(result.pagination);
    } catch (err) {
      console.error('Error loading archived records:', err);
      setError(err instanceof Error ? err.message : 'Failed to load archived records');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentOrganization) {
      loadRecords(true);
    }
  }, [currentOrganization?.id, selectedSourceId, selectedReason]);

  const handleRestore = async (recordId: string) => {
    if (!confirm('Are you sure you want to restore this archived record?')) {
      return;
    }

    try {
      setRestoringId(recordId);
      await retentionService.restore(recordId);
      await loadRecords();
    } catch (err) {
      console.error('Error restoring record:', err);
      alert('Failed to restore record');
    } finally {
      setRestoringId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case 'retention_policy':
        return 'text-blue-400';
      case 'manual':
        return 'text-yellow-400';
      case 'dismissed':
        return 'text-stone-400';
      default:
        return 'text-stone-300';
    }
  };

  if (!currentOrganization) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <EmptyState
          icon={<Archive size={64} className="text-stone-600" />}
          title="No Organization Selected"
          description="Please select or create an organization to continue."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/sources')}
              className="p-2 hover:bg-stone-800 rounded-lg transition-colors duration-250"
            >
              <ArrowLeft className="w-5 h-5 text-stone-400" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-stone-100 flex items-center gap-3">
                <Archive className="text-blue-500" size={28} />
                Archived Records
              </h1>
              <p className="text-sm text-stone-400 mt-1">
                View and restore archived source records
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search archived records..."
                  className="w-full pl-10 pr-4 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-stone-100 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Reasons</option>
              <option value="retention_policy">Retention Policy</option>
              <option value="manual">Manual</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>
        </div>

        {/* Records List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="bg-stone-900 border border-red-800 rounded-lg p-4">
            <p className="text-red-400">{error}</p>
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            icon={<Archive size={64} className="text-stone-600" />}
            title="No Archived Records"
            description="No archived records found matching your filters."
          />
        ) : (
          <div className="bg-stone-900 border border-stone-800 rounded-lg overflow-hidden">
            <div className="divide-y divide-stone-800">
              {records
                .filter((record) => {
                  if (!searchQuery) return true;
                  const query = searchQuery.toLowerCase();
                  return (
                    record.title.toLowerCase().includes(query) ||
                    record.sources.name.toLowerCase().includes(query)
                  );
                })
                .map((record) => (
                  <div
                    key={record.id}
                    className="p-4 hover:bg-stone-800 transition-colors duration-250"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-stone-100 font-medium mb-1">{record.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-stone-400">
                          <span>{record.sources.name}</span>
                          {record.url && (
                            <a
                              href={record.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                            >
                              View Original
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
                          <span>
                            Archived: {formatDate(record.archived_at)}
                          </span>
                          <span className={getReasonColor(record.archive_reason)}>
                            {record.archive_reason.replace('_', ' ')}
                          </span>
                          {record.published_at && (
                            <span>
                              Published: {formatDate(record.published_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestore(record.id)}
                        disabled={restoringId === record.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors duration-250 disabled:opacity-50"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {restoringId === record.id ? 'Restoring...' : 'Restore'}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {pagination.total > pagination.limit && (
          <div className="flex items-center justify-between mt-6 text-sm text-stone-400">
            <span>
              Showing {pagination.offset + 1} to{' '}
              {Math.min(pagination.offset + pagination.limit, pagination.total)} of{' '}
              {pagination.total} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setPagination({ ...pagination, offset: Math.max(0, pagination.offset - pagination.limit) });
                  loadRecords();
                }}
                disabled={pagination.offset === 0}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => {
                  setPagination({ ...pagination, offset: pagination.offset + pagination.limit });
                  loadRecords();
                }}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg transition-colors duration-250 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

