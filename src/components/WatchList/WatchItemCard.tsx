import { useState } from 'react';
import { Eye, Trash2, Archive, CheckCircle, TrendingUp, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WatchItemCategory, WatchItemStatus } from '../../types/osint';
import { EscalateToTopicModal } from './EscalateToTopicModal';

interface WatchItemCardProps {
  watchItem: {
    id: string;
    title: string;
    category: WatchItemCategory;
    notes: string | null;
    indicatorTriggers: string[];
    status: WatchItemStatus;
    escalatedTopicId: string | null;
    firstNotedAt: Date;
    lastReviewedAt: Date;
    signalCount: number;
  };
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkAsReviewed: (id: string) => void;
  onRefresh: () => void;
}

export function WatchItemCard({ 
  watchItem, 
  onDelete, 
  onArchive, 
  onMarkAsReviewed,
  onRefresh 
}: WatchItemCardProps) {
  const navigate = useNavigate();
  const [showEscalateModal, setShowEscalateModal] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(watchItem.id);
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive(watchItem.id);
  };

  const handleMarkAsReviewed = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkAsReviewed(watchItem.id);
  };

  const handleEscalate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEscalateModal(true);
  };

  const handleViewTopic = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchItem.escalatedTopicId) {
      navigate(`/topics/${watchItem.escalatedTopicId}`);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: WatchItemStatus) => {
    switch (status) {
      case 'watching':
        return 'bg-blue-900/30 text-blue-300 border-blue-800/50';
      case 'escalated':
        return 'bg-green-900/30 text-green-300 border-green-800/50';
      case 'archived':
        return 'bg-stone-800 text-stone-400 border-stone-700';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  const getCategoryColor = (category: WatchItemCategory) => {
    switch (category) {
      case 'politics':
        return 'bg-purple-900/30 text-purple-300 border-purple-800/50';
      case 'finance':
        return 'bg-green-900/30 text-green-300 border-green-800/50';
      case 'technology':
        return 'bg-blue-900/30 text-blue-300 border-blue-800/50';
      case 'security':
        return 'bg-red-900/30 text-red-300 border-red-800/50';
      case 'health':
        return 'bg-pink-900/30 text-pink-300 border-pink-800/50';
      case 'international':
        return 'bg-indigo-900/30 text-indigo-300 border-indigo-800/50';
      case 'local':
        return 'bg-yellow-900/30 text-yellow-300 border-yellow-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  const daysSinceReview = Math.floor(
    (Date.now() - new Date(watchItem.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <>
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-5 hover:border-stone-700 transition-all duration-250">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Eye className="text-blue-500 flex-shrink-0" size={20} />
            <h3 className="text-lg font-semibold text-stone-200 truncate">{watchItem.title}</h3>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {watchItem.status === 'watching' && (
              <>
                <button
                  onClick={handleEscalate}
                  className="p-2 bg-stone-800 hover:bg-blue-900/30 text-blue-400 hover:text-blue-300 rounded-lg transition-colors duration-250"
                  title="Escalate to Topic"
                >
                  <TrendingUp size={16} />
                </button>
                <button
                  onClick={handleMarkAsReviewed}
                  className="p-2 bg-stone-800 hover:bg-green-900/30 text-green-400 hover:text-green-300 rounded-lg transition-colors duration-250"
                  title="Mark as Reviewed"
                >
                  <CheckCircle size={16} />
                </button>
                <button
                  onClick={handleArchive}
                  className="p-2 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-300 rounded-lg transition-colors duration-250"
                  title="Archive"
                >
                  <Archive size={16} />
                </button>
              </>
            )}
            {watchItem.status === 'escalated' && watchItem.escalatedTopicId && (
              <button
                onClick={handleViewTopic}
                className="p-2 bg-stone-800 hover:bg-blue-900/30 text-blue-400 hover:text-blue-300 rounded-lg transition-colors duration-250"
                title="View Topic"
              >
                <ExternalLink size={16} />
              </button>
            )}
            <button
              onClick={handleDelete}
              className="p-2 bg-stone-800 hover:bg-red-900/30 text-stone-400 hover:text-red-400 rounded-lg transition-colors duration-250"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Status and Category Badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(watchItem.status)}`}>
            {watchItem.status}
          </span>
          <span className={`px-2 py-1 text-xs font-medium rounded border ${getCategoryColor(watchItem.category)}`}>
            {watchItem.category}
          </span>
        </div>

        {/* Notes */}
        {watchItem.notes && (
          <p className="text-stone-400 text-sm mb-4 line-clamp-2">
            {watchItem.notes}
          </p>
        )}

        {/* Indicator Triggers */}
        {watchItem.indicatorTriggers && watchItem.indicatorTriggers.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-stone-400 mb-1 flex items-center gap-1">
              <AlertCircle size={12} />
              Escalation Triggers:
            </div>
            <div className="flex flex-wrap gap-1">
              {watchItem.indicatorTriggers.slice(0, 3).map((trigger, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-amber-900/30 text-amber-300 text-xs rounded border border-amber-800/50"
                >
                  {trigger}
                </span>
              ))}
              {watchItem.indicatorTriggers.length > 3 && (
                <span className="px-2 py-1 bg-stone-800 text-stone-500 text-xs rounded border border-stone-700">
                  +{watchItem.indicatorTriggers.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-sm text-stone-500 pt-3 border-t border-stone-800">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <TrendingUp size={14} />
              <span className="font-medium text-stone-200">{watchItem.signalCount}</span>
              <span>signal{watchItem.signalCount !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock size={14} />
              <span>
                {daysSinceReview === 0 ? 'Today' : `${daysSinceReview}d ago`}
              </span>
            </div>
          </div>
          <span className="text-xs">
            First noted {formatDate(watchItem.firstNotedAt)}
          </span>
        </div>
      </div>

      {/* Escalate Modal */}
      {showEscalateModal && (
        <EscalateToTopicModal
          watchItem={watchItem}
          onClose={() => setShowEscalateModal(false)}
          onSuccess={() => {
            setShowEscalateModal(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
