import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface ConfidenceBadgeProps {
  level: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  assumptions?: string | null;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function ConfidenceBadge({ 
  level, 
  assumptions, 
  showIcon = true,
  size = 'md'
}: ConfidenceBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!level) {
    return (
      <span className="inline-block px-2 py-1 text-xs rounded bg-stone-800 text-stone-400 border border-stone-700">
        N/A
      </span>
    );
  }

  const getColorClasses = () => {
    switch (level) {
      case 'HIGH':
        return 'bg-green-900/30 text-green-400 border-green-800/50';
      case 'MEDIUM':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50';
      case 'LOW':
        return 'bg-orange-900/30 text-orange-400 border-orange-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2 py-1 text-xs';

  return (
    <div className="relative inline-flex items-center gap-1">
      <span
        className={`inline-block rounded border ${getColorClasses()} ${sizeClasses}`}
      >
        {level}
      </span>
      {assumptions && showIcon && (
        <div
          className="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <HelpCircle
            size={14}
            className="text-stone-500 hover:text-stone-400 cursor-help transition-colors duration-200"
          />
          {showTooltip && (
            <div className="absolute left-0 top-6 z-50 w-64 p-3 bg-stone-800 border border-stone-700 rounded-lg shadow-lg">
              <div className="text-xs text-stone-300 mb-1 font-medium">Assumptions:</div>
              <div className="text-xs text-stone-400 whitespace-pre-wrap break-words">
                {assumptions}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

