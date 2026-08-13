import { useState } from 'react';
import { 
  AlertTriangle, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  RotateCcw, 
  ExternalLink,
  Clock,
} from 'lucide-react';
import { indicatorsService } from '../../services';
import { IndicatorForm } from './IndicatorForm';
import { IndicatorCheckModal } from './IndicatorCheckModal';
import type { Indicator } from '../../types/osint';

interface IndicatorCardProps {
  indicator: Indicator;
  onDelete: (indicatorId: string) => void;
  onRefresh: () => void;
}

export function IndicatorCard({ indicator, onDelete, onRefresh }: IndicatorCardProps) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEdit = async (updates: any) => {
    try {
      await indicatorsService.update(indicator.id, updates);
      setShowEditModal(false);
      onRefresh();
    } catch (err) {
      console.error('Error updating indicator:', err);
      throw err;
    }
  };

  const handleMarkAsChecked = async () => {
    try {
      setIsProcessing(true);
      await indicatorsService.markAsChecked(indicator.id);
      onRefresh();
    } catch (err) {
      console.error('Error marking as checked:', err);
      alert(err instanceof Error ? err.message : 'Failed to mark as checked');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset this triggered indicator back to active monitoring?')) {
      return;
    }

    try {
      setIsProcessing(true);
      await indicatorsService.reset(indicator.id);
      onRefresh();
    } catch (err) {
      console.error('Error resetting indicator:', err);
      alert(err instanceof Error ? err.message : 'Failed to reset indicator');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCheckFrequency = (frequency: string) => {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  };

  const formatLastChecked = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  };

  return (
    <>
      <div className={`bg-stone-900 border rounded-lg p-5 hover:border-stone-700 transition-colors ${
        indicator.isTriggered 
          ? 'border-amber-800 bg-amber-900/20' 
          : 'border-stone-800'
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {indicator.isTriggered ? (
              <AlertTriangle className="text-amber-500 flex-shrink-0" size={20} />
            ) : (
              <CheckCircle2 className="text-green-500 flex-shrink-0" size={20} />
            )}
            <h3 className="font-semibold text-stone-100 text-lg">
              {indicator.name}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {!indicator.isTriggered && (
              <>
                <button
                  onClick={() => setShowCheckModal(true)}
                  disabled={isProcessing}
                  className="p-1.5 text-stone-400 hover:text-green-400 hover:bg-stone-800 rounded transition-colors disabled:opacity-50"
                  title="Check indicator"
                >
                  <CheckCircle2 size={16} />
                </button>
                <button
                  onClick={handleMarkAsChecked}
                  disabled={isProcessing}
                  className="p-1.5 text-stone-400 hover:text-blue-400 hover:bg-stone-800 rounded transition-colors disabled:opacity-50"
                  title="Mark as checked"
                >
                  <Clock size={16} />
                </button>
              </>
            )}
            {indicator.isTriggered && (
              <button
                onClick={handleReset}
                disabled={isProcessing}
                className="p-1.5 text-stone-400 hover:text-amber-400 hover:bg-stone-800 rounded transition-colors disabled:opacity-50"
                title="Reset indicator"
              >
                <RotateCcw size={16} />
              </button>
            )}
            <button
              onClick={() => setShowEditModal(true)}
              className="p-1.5 text-stone-400 hover:text-blue-400 hover:bg-stone-800 rounded transition-colors"
              title="Edit indicator"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => onDelete(indicator.id)}
              className="p-1.5 text-stone-400 hover:text-red-400 hover:bg-stone-800 rounded transition-colors"
              title="Delete indicator"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Status Badge */}
        {indicator.isTriggered ? (
          <div className="mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-900/40 text-amber-300 text-sm rounded-full border border-amber-800">
              <AlertTriangle size={14} />
              Triggered {indicator.triggeredAt && `- ${new Date(indicator.triggeredAt).toLocaleDateString()}`}
            </span>
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-900/40 text-green-300 text-sm rounded-full border border-green-800">
              <CheckCircle2 size={14} />
              Active Monitoring
            </span>
            <span className="text-xs text-stone-500">
              Check: {formatCheckFrequency(indicator.checkFrequency)}
            </span>
          </div>
        )}

        {/* Description */}
        {indicator.description && (
          <p className="text-sm text-stone-300 mb-3 line-clamp-2">
            {indicator.description}
          </p>
        )}

        {/* Action on Trigger */}
        {indicator.actionOnTrigger && (
          <div className="mb-3 p-3 bg-stone-800/50 rounded-lg">
            <div className="text-xs text-stone-500 mb-1">Action on trigger:</div>
            <div className="text-sm text-stone-300">{indicator.actionOnTrigger}</div>
          </div>
        )}

        {/* Source URL */}
        {indicator.sourceUrl && (
          <a
            href={indicator.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 mb-3"
          >
            <ExternalLink size={14} />
            View Source
          </a>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-stone-500 pt-3 border-t border-stone-800">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            Last checked: {formatLastChecked(indicator.lastCheckedAt)}
          </div>
          <div className="capitalize">
            {indicator.domain}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <IndicatorForm
          indicator={indicator}
          onSubmit={handleEdit}
          onCancel={() => setShowEditModal(false)}
        />
      )}

      {/* Check Modal */}
      {showCheckModal && (
        <IndicatorCheckModal
          indicator={indicator}
          onClose={() => setShowCheckModal(false)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

