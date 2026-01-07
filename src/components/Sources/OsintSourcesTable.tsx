import { useState } from 'react';
import { Edit2, FileText, AlertTriangle, Link2, Trash2, RefreshCw } from 'lucide-react';
import type { Source } from '../../types/osint';
import { EditSourceModal } from './EditSourceModal';
import { SourceValueRating } from './SourceValueRating';

interface SourceWithMetrics extends Source {
  record_count: number;
  linked_count?: number;
  signal_effectiveness?: number;
  days_since_last_link?: number;
}

interface StaleWarningTooltipProps {
  source: SourceWithMetrics;
}

interface OsintSourcesTableProps {
  sources: SourceWithMetrics[];
  onUpdate: (sourceId: string, updates: any) => Promise<void>;
  onDelete: (sourceId: string) => Promise<void>;
  onRefresh: (sourceId: string, sourceType: string) => Promise<void>;
}

export function OsintSourcesTable({ sources, onUpdate, onDelete, onRefresh }: OsintSourcesTableProps) {
  const [editingSource, setEditingSource] = useState<SourceWithMetrics | null>(null);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [refreshingSourceId, setRefreshingSourceId] = useState<string | null>(null);

  const getReliabilityBadgeColor = (rating: string) => {
    switch (rating) {
      case 'HIGH':
        return 'bg-green-900/30 text-green-400';
      case 'MEDIUM':
        return 'bg-yellow-900/30 text-yellow-400';
      case 'LOW':
        return 'bg-orange-900/30 text-orange-400';
      case 'UNKNOWN':
      default:
        return 'bg-stone-800 text-stone-400';
    }
  };

  const getSourceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      rss: 'RSS',
      api: 'API',
      email: 'Email',
      manual: 'Manual',
    };
    return labels[type] || type.toUpperCase();
  };

  const handleSaveSource = async (updates: any) => {
    if (!editingSource) return;
    await onUpdate(editingSource.id, updates);
    setEditingSource(null);
  };

  const handleDeleteClick = (source: SourceWithMetrics) => {
    const recordCount = source.record_count || 0;
    const linkedCount = source.linked_count || 0;
    
    const message = recordCount > 0
      ? `Delete "${source.name}"?\n\nThis will permanently delete:\n• The source\n• ${recordCount} source record${recordCount !== 1 ? 's' : ''}\n• ${linkedCount} topic link${linkedCount !== 1 ? 's' : ''}\n\nThis action cannot be undone.`
      : `Delete "${source.name}"?\n\nThis action cannot be undone.`;

    if (confirm(message)) {
      setDeletingSourceId(source.id);
      onDelete(source.id)
        .catch((err) => {
          console.error('Error deleting source:', err);
          alert(`Failed to delete source: ${err instanceof Error ? err.message : 'Unknown error'}`);
        })
        .finally(() => {
          setDeletingSourceId(null);
        });
    }
  };

  const handleRefreshClick = async (source: SourceWithMetrics) => {
    // For RSS sources, require a URL
    if (source.sourceType === 'rss' && !source.url) {
      alert(`Cannot refresh "${source.name}": RSS source is missing a URL.`);
      return;
    }

    setRefreshingSourceId(source.id);
    try {
      await onRefresh(source.id, source.sourceType);
    } catch (err) {
      console.error('Error refreshing source:', err);
      alert(`Failed to refresh source: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRefreshingSourceId(null);
    }
  };

  const getEffectivenessColor = (effectiveness: number) => {
    if (effectiveness >= 10) return 'text-green-400';
    if (effectiveness >= 5) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const isStale = (source: SourceWithMetrics) => {
    return (source.days_since_last_link || 0) > 90 && source.record_count > 0;
  };

  function StaleWarningTooltip({ source }: StaleWarningTooltipProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const daysSinceLastLink = source.days_since_last_link || 0;
    const recordCount = source.record_count || 0;
    const linkedCount = source.linked_count || 0;
    const hasNeverBeenLinked = linkedCount === 0 && recordCount > 0;

    return (
      <div
        className="relative"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <AlertTriangle
          size={16}
          className="text-red-500 mt-1 flex-shrink-0 cursor-help"
        />
        {showTooltip && (
          <div className="absolute left-0 top-6 z-50 w-72 p-3 bg-stone-800 border border-red-800/50 rounded-lg shadow-xl">
            <div className="flex items-start gap-2 mb-2">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-400 mb-1">Stale Feed</div>
                <div className="text-xs text-stone-300 space-y-1">
                  {hasNeverBeenLinked ? (
                    <p>
                      This source has <span className="font-semibold text-red-400">never been linked</span> to any topics.
                      Records have been accumulating for{' '}
                      <span className="font-semibold text-red-400">{Math.floor(daysSinceLastLink)} days</span>.
                    </p>
                  ) : (
                    <p>
                      No records from this source have been linked to topics in{' '}
                      <span className="font-semibold text-red-400">{Math.floor(daysSinceLastLink)} days</span>.
                    </p>
                  )}
                  <div className="pt-2 border-t border-stone-700 mt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-400">Records:</span>
                      <span className="text-stone-200 font-medium">{recordCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-stone-400">Linked to topics:</span>
                      <span className="text-stone-200 font-medium">{linkedCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-stone-400">Signal effectiveness:</span>
                      <span className="text-orange-400 font-medium">
                        {(source.signal_effectiveness || 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-stone-400 italic mt-2 pt-2 border-t border-stone-700">
                    💡 Tip: Review records in Scan view or consider disabling this source if it's no longer useful.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-800">
              <th className="text-left py-3 px-4 pr-2 text-stone-400 text-sm font-medium">Name</th>
              <th className="text-left py-3 pl-2 px-4 text-stone-400 text-sm font-medium">Type</th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Domain</th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Reliability</th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Value Rating</th>
              <th className="text-center py-3 px-4 text-stone-400 text-sm font-medium">Records</th>
              <th className="text-center py-3 px-4 text-stone-400 text-sm font-medium">
                <div className="flex items-center justify-center gap-1">
                  <Link2 size={14} />
                  Signal %
                </div>
              </th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Notes</th>
              <th className="text-right py-3 px-4 text-stone-400 text-sm font-medium w-16"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr
                key={source.id}
                className={`border-b border-stone-800 hover:bg-stone-800/50 transition-colors duration-250 ${
                  isStale(source) ? 'bg-red-900/10' : ''
                }`}
              >
                <td className="py-4 px-4 pr-2">
                  <div className="flex items-start gap-2">
                    {isStale(source) && <StaleWarningTooltip source={source} />}
                    <div className="flex flex-col">
                      <p className="text-stone-200 font-medium">{source.name}</p>
                      {source.url && (
                        <p className="text-stone-500 text-xs mt-1 truncate max-w-xs" title={source.url}>
                          {source.url}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-4 pl-2 px-4">
                  <span className="inline-block px-2 py-1 text-xs rounded bg-stone-800 text-stone-300">
                    {getSourceTypeLabel(source.sourceType)}
                  </span>
                </td>
                <td className="py-4 px-4">
                  {source.domain ? (
                    <span className="inline-block px-2 py-1 text-xs rounded bg-blue-900/30 text-blue-400 capitalize">
                      {source.domain}
                    </span>
                  ) : (
                    <span className="text-stone-600 text-xs italic">-</span>
                  )}
                </td>
                <td className="py-4 px-4">
                  <span
                    className={`inline-block px-2 py-1 text-xs rounded ${getReliabilityBadgeColor(
                      source.reliabilityRating
                    )}`}
                  >
                    {source.reliabilityRating}
                  </span>
                </td>
                <td className="py-4 px-4">
                  <SourceValueRating
                    sourceId={source.id}
                    sourceName={source.name}
                    currentRating={source.valueRating}
                    onRatingChange={() => {}}
                  />
                </td>
                <td className="py-4 px-4 text-center">
                  <div className="flex items-center justify-center gap-1 text-stone-400">
                    <FileText size={14} />
                    <span className="text-sm">{source.record_count}</span>
                  </div>
                </td>
                <td className="py-4 px-4 text-center">
                  {source.record_count > 0 ? (
                    <div className="flex flex-col items-center">
                      <span className={`text-sm font-medium ${getEffectivenessColor(source.signal_effectiveness || 0)}`}>
                        {(source.signal_effectiveness || 0).toFixed(1)}%
                      </span>
                      <span className="text-xs text-stone-500">
                        {source.linked_count || 0} linked
                      </span>
                    </div>
                  ) : (
                    <span className="text-stone-600 text-xs">-</span>
                  )}
                </td>
                <td className="py-4 px-4">
                  {source.notes ? (
                    <p className="text-stone-400 text-sm line-clamp-2 max-w-xs" title={source.notes}>
                      {source.notes}
                    </p>
                  ) : (
                    <span className="text-stone-600 text-sm italic">No notes</span>
                  )}
                </td>
                <td className="py-4 px-4">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleRefreshClick(source)}
                      disabled={refreshingSourceId === source.id || (source.sourceType === 'rss' && !source.url)}
                      className="p-2 hover:bg-stone-800 text-stone-400 hover:text-green-400 rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={source.sourceType === 'rss' && !source.url ? 'RSS source missing URL' : `Refresh ${source.sourceType.toUpperCase()} source`}
                    >
                      <RefreshCw 
                        size={18} 
                        className={refreshingSourceId === source.id ? 'animate-spin' : ''}
                      />
                    </button>
                    <button
                      onClick={() => setEditingSource(source)}
                      className="p-2 hover:bg-stone-800 text-stone-400 hover:text-blue-400 rounded-lg transition-colors duration-250"
                      title="Edit source"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(source)}
                      disabled={deletingSourceId === source.id}
                      className="p-2 hover:bg-stone-800 text-stone-400 hover:text-red-400 rounded-lg transition-colors duration-250 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete source"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingSource && (
        <EditSourceModal
          source={editingSource}
          onSave={handleSaveSource}
          onClose={() => setEditingSource(null)}
        />
      )}
    </>
  );
}

