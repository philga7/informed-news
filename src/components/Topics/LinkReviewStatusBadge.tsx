/**
 * Link Review Status Badge Component
 * 
 * Displays review status for topic-source links.
 */

import type { LinkReviewStatus } from '../../types/osint';

interface LinkReviewStatusBadgeProps {
  status: LinkReviewStatus;
  size?: 'sm' | 'md';
}

export function LinkReviewStatusBadge({ status, size = 'sm' }: LinkReviewStatusBadgeProps) {
  const statusConfig: Record<
    LinkReviewStatus,
    { label: string; color: string; bgColor: string }
  > = {
    pending: {
      label: 'Pending Review',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-900/30 border-yellow-800/50',
    },
    reviewed: {
      label: 'Reviewed',
      color: 'text-green-400',
      bgColor: 'bg-green-900/30 border-green-800/50',
    },
    disputed: {
      label: 'Disputed',
      color: 'text-red-400',
      bgColor: 'bg-red-900/30 border-red-800/50',
    },
  };

  const config = statusConfig[status];
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border ${config.bgColor} ${config.color} ${sizeClass} font-medium`}
    >
      {config.label}
    </span>
  );
}

