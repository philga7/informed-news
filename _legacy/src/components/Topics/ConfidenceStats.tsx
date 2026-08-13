import { ConfidenceBadge } from '../UI/ConfidenceBadge';
import { TrendingUp } from 'lucide-react';

interface ConfidenceStatsProps {
  links: Array<{
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  }>;
}

export function ConfidenceStats({ links }: ConfidenceStatsProps) {
  // Calculate confidence distribution
  const total = links.length;
  const highCount = links.filter(l => l.confidenceLevel === 'HIGH').length;
  const mediumCount = links.filter(l => l.confidenceLevel === 'MEDIUM').length;
  const lowCount = links.filter(l => l.confidenceLevel === 'LOW').length;
  const unknownCount = links.filter(l => !l.confidenceLevel).length;

  const highPercent = total > 0 ? (highCount / total) * 100 : 0;
  const mediumPercent = total > 0 ? (mediumCount / total) * 100 : 0;
  const lowPercent = total > 0 ? (lowCount / total) * 100 : 0;
  const unknownPercent = total > 0 ? (unknownCount / total) * 100 : 0;

  if (total === 0) {
    return null;
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="text-blue-500" size={20} />
        <h3 className="text-lg font-semibold text-stone-200">Confidence Assessment</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* HIGH */}
        <div className="bg-stone-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <ConfidenceBadge level="HIGH" showIcon={false} size="sm" />
            <span className="text-2xl font-bold text-green-400">{highCount}</span>
          </div>
          <div className="w-full bg-stone-700 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${highPercent}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-2">{highPercent.toFixed(1)}% of links</p>
        </div>

        {/* MEDIUM */}
        <div className="bg-stone-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <ConfidenceBadge level="MEDIUM" showIcon={false} size="sm" />
            <span className="text-2xl font-bold text-yellow-400">{mediumCount}</span>
          </div>
          <div className="w-full bg-stone-700 rounded-full h-2">
            <div
              className="bg-yellow-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${mediumPercent}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-2">{mediumPercent.toFixed(1)}% of links</p>
        </div>

        {/* LOW */}
        <div className="bg-stone-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <ConfidenceBadge level="LOW" showIcon={false} size="sm" />
            <span className="text-2xl font-bold text-orange-400">{lowCount}</span>
          </div>
          <div className="w-full bg-stone-700 rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${lowPercent}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-2">{lowPercent.toFixed(1)}% of links</p>
        </div>

        {/* UNKNOWN */}
        <div className="bg-stone-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="inline-block px-2 py-0.5 text-xs rounded bg-stone-700 text-stone-400">
              UNKNOWN
            </span>
            <span className="text-2xl font-bold text-stone-400">{unknownCount}</span>
          </div>
          <div className="w-full bg-stone-700 rounded-full h-2">
            <div
              className="bg-stone-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${unknownPercent}%` }}
            />
          </div>
          <p className="text-xs text-stone-500 mt-2">{unknownPercent.toFixed(1)}% of links</p>
        </div>
      </div>

      <div className="text-sm text-stone-400 bg-stone-800/30 rounded p-3 border-l-2 border-blue-600">
        <p className="font-medium text-stone-300 mb-1">Analytic Confidence</p>
        <p>
          Reflects the analyst's assessment of how well the source record relates to this topic. 
          Higher confidence indicates stronger evidence and fewer assumptions.
        </p>
      </div>
    </div>
  );
}

