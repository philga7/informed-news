import { Calendar, FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';
import type { TopicTimeline } from '../../types/osint';

interface TimelineStatsProps {
  timeline: TopicTimeline;
}

export function TimelineStats({ timeline }: TimelineStatsProps) {
  // Calculate velocity percentage change
  const calculateVelocityChange = () => {
    const { last7Days, previous7Days } = timeline.velocity;
    
    if (previous7Days === 0) {
      if (last7Days === 0) return { percentage: 0, direction: 'flat' as const };
      return { percentage: 100, direction: 'up' as const };
    }
    
    const change = ((last7Days - previous7Days) / previous7Days) * 100;
    const direction = change > 0 ? 'up' as const : change < 0 ? 'down' as const : 'flat' as const;
    
    return { percentage: Math.abs(Math.round(change)), direction };
  };

  const velocityChange = calculateVelocityChange();

  const getVelocityColor = () => {
    if (velocityChange.direction === 'up') return 'text-green-400';
    if (velocityChange.direction === 'down') return 'text-red-400';
    return 'text-stone-400';
  };

  const getVelocityBgColor = () => {
    if (velocityChange.direction === 'up') return 'bg-green-900/30 border-green-800/50';
    if (velocityChange.direction === 'down') return 'bg-red-900/30 border-red-800/50';
    return 'bg-stone-800 border-stone-700';
  };

  const VelocityIcon = () => {
    if (velocityChange.direction === 'up') return <TrendingUp size={16} />;
    if (velocityChange.direction === 'down') return <TrendingDown size={16} />;
    return <Minus size={16} />;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* First Mention */}
      <div className="bg-stone-800 border border-stone-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={18} className="text-stone-500" />
          <h4 className="text-sm font-medium text-stone-400">First Mention</h4>
        </div>
        <div className="text-2xl font-semibold text-stone-200">
          {timeline.firstMention ? (
            format(timeline.firstMention, 'MMM d, yyyy')
          ) : (
            <span className="text-stone-500 text-base">No data</span>
          )}
        </div>
        {timeline.firstMention && (
          <div className="text-xs text-stone-500 mt-1">
            {format(timeline.firstMention, 'h:mm a')}
          </div>
        )}
      </div>

      {/* Total Records */}
      <div className="bg-stone-800 border border-stone-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={18} className="text-stone-500" />
          <h4 className="text-sm font-medium text-stone-400">Total Records</h4>
        </div>
        <div className="text-2xl font-semibold text-stone-200">
          {timeline.totalRecords}
        </div>
        <div className="text-xs text-stone-500 mt-1">
          Linked source records
        </div>
      </div>

      {/* Velocity */}
      <div className={`border rounded-lg p-4 ${getVelocityBgColor()}`}>
        <div className="flex items-center gap-2 mb-2">
          <VelocityIcon />
          <h4 className="text-sm font-medium text-stone-400">Velocity (7-day)</h4>
        </div>
        <div className={`text-2xl font-semibold ${getVelocityColor()}`}>
          {velocityChange.direction === 'up' && '+'}
          {velocityChange.direction === 'down' && '-'}
          {velocityChange.percentage}%
        </div>
        <div className="text-xs text-stone-500 mt-1 flex items-center justify-between">
          <span>Last 7 days: {timeline.velocity.last7Days}</span>
          <span className="text-stone-600">•</span>
          <span>Prev 7 days: {timeline.velocity.previous7Days}</span>
        </div>
      </div>
    </div>
  );
}

