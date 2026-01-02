import { useState } from 'react';
import { Edit2, FileText } from 'lucide-react';
import type { Source } from '../../types/osint';
import { EditSourceModal } from './EditSourceModal';
import { SourceValueRating } from './SourceValueRating';

interface OsintSourcesTableProps {
  sources: Array<Source & { record_count: number }>;
  onUpdate: (sourceId: string, updates: any) => Promise<void>;
}

export function OsintSourcesTable({ sources, onUpdate }: OsintSourcesTableProps) {
  const [editingSource, setEditingSource] = useState<(Source & { record_count: number }) | null>(null);

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

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-800">
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Name</th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Type</th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Reliability</th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Value Rating</th>
              <th className="text-center py-3 px-4 text-stone-400 text-sm font-medium">Records</th>
              <th className="text-left py-3 px-4 text-stone-400 text-sm font-medium">Notes</th>
              <th className="text-center py-3 px-4 text-stone-400 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr
                key={source.id}
                className="border-b border-stone-800 hover:bg-stone-800/50 transition-colors duration-250"
              >
                <td className="py-4 px-4">
                  <div className="flex flex-col">
                    <p className="text-stone-200 font-medium">{source.name}</p>
                    {source.url && (
                      <p className="text-stone-500 text-xs mt-1 truncate max-w-xs" title={source.url}>
                        {source.url}
                      </p>
                    )}
                  </div>
                </td>
                <td className="py-4 px-4">
                  <span className="inline-block px-2 py-1 text-xs rounded bg-stone-800 text-stone-300">
                    {getSourceTypeLabel(source.sourceType)}
                  </span>
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
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => setEditingSource(source)}
                      className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-300 rounded-lg transition-colors duration-250"
                      title="Edit source"
                    >
                      <Edit2 size={16} />
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

