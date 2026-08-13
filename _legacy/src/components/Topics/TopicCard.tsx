import { Target, Trash2, FileText } from 'lucide-react';

interface TopicCardProps {
  topic: {
    id: string;
    name: string;
    description: string | null;
    keywords: string[];
    linked_records_count: number;
    updatedAt: Date;
  };
  onClick: () => void;
  onDelete: () => void;
}

export function TopicCard({ topic, onClick, onDelete }: TopicCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div
      onClick={onClick}
      className="bg-stone-900 border border-stone-800 rounded-lg p-5 hover:border-stone-700 cursor-pointer transition-all duration-250"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Target className="text-blue-500 flex-shrink-0" size={20} />
          <h3 className="text-lg font-semibold text-stone-200 truncate">{topic.name}</h3>
        </div>
        <button
          onClick={handleDelete}
          className="p-2 bg-stone-800 hover:bg-red-900/30 text-stone-400 hover:text-red-400 rounded-lg transition-colors duration-250 flex-shrink-0"
          title="Delete topic"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {topic.description && (
        <p className="text-stone-400 text-sm mb-4 line-clamp-2">
          {topic.description}
        </p>
      )}

      {/* Keywords */}
      {topic.keywords && topic.keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {topic.keywords.slice(0, 4).map((keyword, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-stone-800 text-stone-400 text-xs rounded"
            >
              {keyword}
            </span>
          ))}
          {topic.keywords.length > 4 && (
            <span className="px-2 py-1 bg-stone-800 text-stone-500 text-xs rounded">
              +{topic.keywords.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="flex items-center justify-between text-sm text-stone-500">
        <div className="flex items-center gap-1">
          <FileText size={14} />
          <span>{topic.linked_records_count} record{topic.linked_records_count !== 1 ? 's' : ''}</span>
        </div>
        <span>Updated {formatDate(topic.updatedAt)}</span>
      </div>
    </div>
  );
}


