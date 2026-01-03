import { ExternalLink, Link2, Eye, X, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { WatchItemCategory, ScanStatus } from '../../types/osint';

interface ScanItemProps {
  record: {
    id: string;
    title: string;
    url: string | null;
    content: string | null;
    publishedAt: Date | null;
    ingestedAt: Date;
    scanStatus: ScanStatus;
    sourceDomain: WatchItemCategory | null;
    sourceName: string;
    topic_source_links?: Array<{
      id: string;
      osint_topics: {
        id: string;
        name: string;
      };
    }>;
  };
  isSelected: boolean;
  isExpanded: boolean;
  dataIndex: number;
  onSelect: () => void;
  onToggleExpand: () => void;
  onDismiss: () => void;
  onLinkToTopic: () => void;
  onCreateWatchItem: () => void;
}

export function ScanItem({
  record,
  isSelected,
  isExpanded,
  dataIndex,
  onSelect,
  onToggleExpand,
  onDismiss,
  onLinkToTopic,
  onCreateWatchItem,
}: ScanItemProps) {
  const hasLinkedTopics = record.topic_source_links && record.topic_source_links.length > 0;
  
  const getFirstLine = (content: string | null) => {
    if (!content) return '';
    const firstLine = content.split('\n')[0];
    return firstLine.length > 200 ? firstLine.substring(0, 200) + '...' : firstLine;
  };

  const getDomainColor = (domain: WatchItemCategory | null) => {
    const colors: Record<WatchItemCategory, string> = {
      politics: 'bg-blue-900/50 text-blue-300 border border-blue-800',
      finance: 'bg-green-900/50 text-green-300 border border-green-800',
      technology: 'bg-purple-900/50 text-purple-300 border border-purple-800',
      local: 'bg-yellow-900/50 text-yellow-300 border border-yellow-800',
      international: 'bg-indigo-900/50 text-indigo-300 border border-indigo-800',
      health: 'bg-red-900/50 text-red-300 border border-red-800',
      security: 'bg-orange-900/50 text-orange-300 border border-orange-800',
      other: 'bg-stone-800 text-stone-300 border border-stone-700',
    };
    return domain ? colors[domain] : 'bg-stone-800 text-stone-300 border border-stone-700';
  };

  return (
    <div
      data-record-index={dataIndex}
      onClick={onSelect}
      className={`p-4 cursor-pointer transition-colors duration-250 ${
        isSelected
          ? 'bg-blue-900/30 border-l-4 border-blue-500'
          : 'bg-stone-900 hover:bg-stone-800/50 border-l-4 border-transparent'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-center space-x-2 mb-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="text-stone-400 hover:text-stone-200 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            
            {record.sourceDomain && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDomainColor(record.sourceDomain)}`}>
                {record.sourceDomain}
              </span>
            )}
            
            <span className="text-sm text-stone-400">{record.sourceName}</span>
            
            {hasLinkedTopics && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-300 border border-green-800">
                Linked
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-stone-100 mb-1">
            {record.title}
            {record.url && (
              <a
                href={record.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-2 inline-block text-stone-400 hover:text-stone-200 transition-colors"
              >
                <ExternalLink className="w-4 h-4 inline" />
              </a>
            )}
          </h3>

          {/* First Line Preview */}
          {!isExpanded && record.content && (
            <p className="text-sm text-stone-400 line-clamp-2">
              {getFirstLine(record.content)}
            </p>
          )}

          {/* Expanded Content */}
          {isExpanded && record.content && (
            <div className="mt-3 prose prose-sm max-w-none prose-invert">
              <p className="text-sm text-stone-300 whitespace-pre-wrap">
                {record.content}
              </p>
            </div>
          )}

          {/* Linked Topics */}
          {isExpanded && hasLinkedTopics && (
            <div className="mt-3 space-y-1">
              <h4 className="text-xs font-semibold text-stone-500 uppercase">Linked Topics</h4>
              {record.topic_source_links!.map((link) => (
                <div key={link.id} className="flex items-center text-sm text-blue-400">
                  <Link2 className="w-3 h-3 mr-1" />
                  {link.osint_topics.name}
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="mt-2 text-xs text-stone-500">
            {record.publishedAt && (
              <span>Published {formatDistanceToNow(record.publishedAt, { addSuffix: true })}</span>
            )}
          </div>
        </div>

        {/* Quick Actions (visible on hover when selected) */}
        {isSelected && (
          <div className="ml-4 flex items-center space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLinkToTopic();
              }}
              className="p-2 text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors duration-250"
              title="Link to topic (T)"
            >
              <Link2 className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateWatchItem();
              }}
              className="p-2 text-purple-400 hover:bg-purple-900/30 rounded-lg transition-colors duration-250"
              title="Create watch item (W)"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-2 text-stone-400 hover:bg-stone-800 rounded-lg transition-colors duration-250"
              title="Dismiss (X)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

