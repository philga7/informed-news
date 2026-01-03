/**
 * Topic Status Badge Component
 * 
 * Displays and allows updating topic workflow status.
 * Shows resolution modal when marking topic as resolved.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { osintTopicsService } from '../../services';
import { ResolutionModal } from './ResolutionModal';
import type { TopicStatus, ResolutionConfidence } from '../../types/osint';

interface TopicStatusBadgeProps {
  topicId: string;
  topicName: string;
  currentStatus: TopicStatus;
  onStatusChange?: (newStatus: TopicStatus) => void;
}

export function TopicStatusBadge({ topicId, topicName, currentStatus, onStatusChange }: TopicStatusBadgeProps) {
  const [status, setStatus] = useState<TopicStatus>(currentStatus);
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [pendingResolution, setPendingResolution] = useState<{
    resolutionSummary: string;
    resolutionConfidence: ResolutionConfidence;
    lessonsLearned?: string;
  } | null>(null);

  const statusConfig: Record<TopicStatus, { label: string; color: string; bgColor: string; description: string }> = {
    active: { 
      label: 'Active', 
      color: 'text-blue-400', 
      bgColor: 'bg-blue-900/30 border-blue-800/50',
      description: 'Collecting and analyzing'
    },
    monitoring: { 
      label: 'Monitoring', 
      color: 'text-yellow-400', 
      bgColor: 'bg-yellow-900/30 border-yellow-800/50',
      description: 'Periodic check-ins, low priority'
    },
    suspended: {
      label: 'Suspended',
      color: 'text-purple-400',
      bgColor: 'bg-purple-900/30 border-purple-800/50',
      description: 'Waiting for new information'
    },
    resolved: {
      label: 'Resolved',
      color: 'text-green-400',
      bgColor: 'bg-green-900/30 border-green-800/50',
      description: 'Question answered, decision made'
    },
    archived: { 
      label: 'Archived', 
      color: 'text-stone-400', 
      bgColor: 'bg-stone-800/50 border-stone-700',
      description: 'Historical reference'
    },
  };

  const handleStatusChange = async (newStatus: TopicStatus) => {
    if (newStatus === status) {
      setIsOpen(false);
      return;
    }

    // If marking as resolved, show resolution modal
    if (newStatus === 'resolved') {
      setIsOpen(false);
      setShowResolutionModal(true);
      return;
    }

    // For other statuses, update directly
    try {
      setIsUpdating(true);
      await osintTopicsService.updateStatus(topicId, newStatus);
      setStatus(newStatus);
      setIsOpen(false);
      onStatusChange?.(newStatus);
    } catch (err) {
      console.error('Error updating topic status:', err);
      alert('Failed to update status. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResolutionSubmit = async (resolution: {
    resolutionSummary: string;
    resolutionConfidence: ResolutionConfidence;
    lessonsLearned?: string;
  }) => {
    try {
      setIsUpdating(true);
      setPendingResolution(resolution);
      
      // Update topic with resolution details and status
      await osintTopicsService.update(topicId, {
        status: 'resolved',
        ...resolution,
      });
      
      setStatus('resolved');
      setShowResolutionModal(false);
      setPendingResolution(null);
      onStatusChange?.('resolved');
    } catch (err) {
      console.error('Error marking topic as resolved:', err);
      alert('Failed to mark topic as resolved. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResolutionCancel = () => {
    setShowResolutionModal(false);
    setPendingResolution(null);
  };

  const config = statusConfig[status];

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isUpdating}
          className={`flex items-center gap-2 px-3 py-1.5 rounded border ${config.bgColor} ${config.color} text-sm font-medium transition-colors duration-200 hover:opacity-80 disabled:opacity-50`}
        >
          <span>{config.label}</span>
          <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <div className="absolute top-full right-0 mt-2 w-72 bg-stone-900 border border-stone-700 rounded-lg shadow-lg z-20 overflow-hidden">
              {(Object.keys(statusConfig) as TopicStatus[]).map((statusOption) => {
                const optionConfig = statusConfig[statusOption];
                const isSelected = statusOption === status;

                return (
                  <button
                    key={statusOption}
                    onClick={() => handleStatusChange(statusOption)}
                    disabled={isUpdating}
                    className={`w-full text-left px-4 py-3 transition-colors duration-200 border-b border-stone-800 last:border-b-0 ${
                      isSelected
                        ? `${optionConfig.color} bg-stone-800`
                        : 'text-stone-300 hover:bg-stone-800'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{optionConfig.label}</div>
                        <div className="text-xs text-stone-500 mt-0.5">{optionConfig.description}</div>
                      </div>
                      {isSelected && <span className="text-xs ml-2 mt-0.5">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Resolution Modal */}
      {showResolutionModal && (
        <ResolutionModal
          topicName={topicName}
          onSubmit={handleResolutionSubmit}
          onCancel={handleResolutionCancel}
          isSubmitting={isUpdating}
        />
      )}
    </>
  );
}

