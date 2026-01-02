/**
 * Topic Status Badge Component
 * 
 * Displays and allows updating topic workflow status.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { osintTopicsService } from '../../services';
import type { TopicStatus } from '../../types/osint';

interface TopicStatusBadgeProps {
  topicId: string;
  currentStatus: TopicStatus;
  onStatusChange?: (newStatus: TopicStatus) => void;
}

export function TopicStatusBadge({ topicId, currentStatus, onStatusChange }: TopicStatusBadgeProps) {
  const [status, setStatus] = useState<TopicStatus>(currentStatus);
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const statusConfig: Record<TopicStatus, { label: string; color: string; bgColor: string }> = {
    active: { label: 'Active', color: 'text-blue-400', bgColor: 'bg-blue-900/30 border-blue-800/50' },
    monitoring: { label: 'Monitoring', color: 'text-yellow-400', bgColor: 'bg-yellow-900/30 border-yellow-800/50' },
    archived: { label: 'Archived', color: 'text-stone-400', bgColor: 'bg-stone-800/50 border-stone-700' },
  };

  const handleStatusChange = async (newStatus: TopicStatus) => {
    if (newStatus === status) {
      setIsOpen(false);
      return;
    }

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

  const config = statusConfig[status];

  return (
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
          <div className="absolute top-full right-0 mt-2 w-40 bg-stone-900 border border-stone-700 rounded-lg shadow-lg z-20 overflow-hidden">
            {(Object.keys(statusConfig) as TopicStatus[]).map((statusOption) => {
              const optionConfig = statusConfig[statusOption];
              const isSelected = statusOption === status;

              return (
                <button
                  key={statusOption}
                  onClick={() => handleStatusChange(statusOption)}
                  disabled={isUpdating}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors duration-200 ${
                    isSelected
                      ? `${optionConfig.color} bg-stone-800`
                      : 'text-stone-300 hover:bg-stone-800'
                  } disabled:opacity-50`}
                >
                  {optionConfig.label}
                  {isSelected && <span className="ml-2 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

