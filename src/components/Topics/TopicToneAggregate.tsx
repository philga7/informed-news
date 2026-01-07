import { useState, useEffect } from 'react';
import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { analysisService } from '../../services/analysis.service';

interface TopicToneAggregateProps {
  topicId: string;
}

export function TopicToneAggregate({ topicId }: TopicToneAggregateProps) {
  const [aggregate, setAggregate] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAggregate();
  }, [topicId]);

  const loadAggregate = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await analysisService.getTopicToneAggregate(topicId);
      setAggregate(result.aggregate);
    } catch (err) {
      console.error('Error loading topic tone aggregate:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tone aggregate');
    } finally {
      setIsLoading(false);
    }
  };

  const getToneColor = (tone: string) => {
    switch (tone) {
      case 'factual':
      case 'neutral':
        return 'bg-blue-900/30 text-blue-400 border-blue-800/50';
      case 'opinion':
        return 'bg-purple-900/30 text-purple-400 border-purple-800/50';
      case 'propaganda':
        return 'bg-red-900/30 text-red-400 border-red-800/50';
      case 'sensational':
        return 'bg-orange-900/30 text-orange-400 border-orange-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-green-900/30 text-green-400 border-green-800/50';
      case 'negative':
        return 'bg-red-900/30 text-red-400 border-red-800/50';
      case 'neutral':
        return 'bg-stone-800 text-stone-400 border-stone-700';
      case 'mixed':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50';
      default:
        return 'bg-stone-800 text-stone-400 border-stone-700';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-stone-400" />
          <h3 className="text-lg font-semibold text-stone-200">Aggregate Tone Analysis</h3>
        </div>
        <div className="text-stone-500 text-sm">Loading aggregate analysis...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle size={20} className="text-red-400" />
          <h3 className="text-lg font-semibold text-stone-200">Aggregate Tone Analysis</h3>
        </div>
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!aggregate) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-stone-400" />
          <h3 className="text-lg font-semibold text-stone-200">Aggregate Tone Analysis</h3>
        </div>
        <div className="text-stone-500 text-sm">
          No tone analysis available. Link source records with tone analyses to see aggregate results.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-stone-400" />
          <h3 className="text-lg font-semibold text-stone-200">Aggregate Tone Analysis</h3>
        </div>
        <div className="text-xs text-stone-500">
          Based on {aggregate.analysisCount} analysis{aggregate.analysisCount !== 1 ? 'es' : ''} from {aggregate.sourceRecordCount} source{aggregate.sourceRecordCount !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-stone-400 block mb-2">Overall Tone</span>
            <span className={`px-3 py-2 rounded border text-sm font-medium inline-block ${getToneColor(aggregate.overallTone)}`}>
              {aggregate.overallTone}
            </span>
          </div>
          <div>
            <span className="text-xs text-stone-400 block mb-2">Dominant Sentiment</span>
            <span className={`px-3 py-2 rounded border text-sm font-medium inline-block ${getSentimentColor(aggregate.sentiment)}`}>
              {aggregate.sentiment}
            </span>
          </div>
          <div>
            <span className="text-xs text-stone-400 block mb-2">
              Weighted Confidence
              <span className="ml-1 text-xs text-stone-500" title="Weighted by source reliability">ⓘ</span>
            </span>
            <span className="px-3 py-2 rounded border text-sm font-medium inline-block bg-stone-800 text-stone-300 border-stone-700">
              {(aggregate.confidence * 100).toFixed(0)}%
            </span>
            {aggregate.rawConfidence !== aggregate.confidence && (
              <div className="text-xs text-stone-500 mt-1">
                Raw: {(aggregate.rawConfidence * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </div>

        {/* Tone Distribution */}
        {Object.keys(aggregate.toneDistribution).length > 1 && (
          <div>
            <h4 className="text-sm font-semibold text-stone-400 uppercase mb-3">Tone Distribution</h4>
            <div className="space-y-2">
              {Object.entries(aggregate.toneDistribution)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .map(([tone, count]) => (
                  <div key={tone} className="flex items-center gap-3">
                    <div className="w-24 text-sm text-stone-300">{tone}</div>
                    <div className="flex-1 bg-stone-800 rounded-full h-6 relative overflow-hidden">
                      <div
                        className={`h-full ${getToneColor(tone).split(' ')[0]} ${getToneColor(tone).split(' ')[1]}`}
                        style={{
                          width: `${((count as number) / aggregate.analysisCount) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="w-12 text-sm text-stone-400 text-right">{count as number}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Top Indicators */}
        {aggregate.indicators && aggregate.indicators.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-stone-400 uppercase mb-3">Common Indicators</h4>
            <ul className="space-y-2">
              {aggregate.indicators.slice(0, 5).map((indicator: string, index: number) => (
                <li key={index} className="flex gap-2 text-sm text-stone-300">
                  <CheckCircle size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <span>{indicator}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Bias Signals */}
        {aggregate.biasSignals && aggregate.biasSignals.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-stone-400 uppercase mb-3">Bias Signals</h4>
            <ul className="space-y-2">
              {aggregate.biasSignals.slice(0, 5).map((signal: string, index: number) => (
                <li key={index} className="flex gap-2 text-sm text-stone-300">
                  <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

