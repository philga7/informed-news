import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { osintTopicsService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import type { NarrativeBucket } from '../../types/osint';
import { format } from 'date-fns';

interface NarrativeEvolutionTimelineProps {
  topicId: string;
  bucket: 'day' | 'week' | 'month';
  onBucketChange: (bucket: 'day' | 'week' | 'month') => void;
}

export function NarrativeEvolutionTimeline({
  topicId,
  bucket,
  onBucketChange,
}: NarrativeEvolutionTimelineProps) {
  const [buckets, setBuckets] = useState<NarrativeBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadNarrativeTimeline();
  }, [topicId, bucket]);

  const loadNarrativeTimeline = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await osintTopicsService.getNarrativeTimeline(topicId, { bucket });
      setBuckets(data.buckets);
      
      // Auto-expand first 3 buckets
      if (data.buckets.length > 0) {
        const initialExpanded = new Set(
          data.buckets.slice(0, 3).map(b => b.date)
        );
        setExpandedBuckets(initialExpanded);
      }
    } catch (err) {
      console.error('Error loading narrative timeline:', err);
      setError(err instanceof Error ? err.message : 'Failed to load narrative timeline');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBucket = (date: string) => {
    const newExpanded = new Set(expandedBuckets);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedBuckets(newExpanded);
  };

  const formatBucketDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    if (bucket === 'day') {
      return format(date, 'EEEE, MMM d, yyyy');
    } else if (bucket === 'week') {
      return `Week of ${format(date, 'MMM d, yyyy')}`;
    } else {
      return format(date, 'MMMM yyyy');
    }
  };

  if (isLoading) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="text-purple-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Narrative Evolution</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="text-purple-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Narrative Evolution</h3>
        </div>
        <div className="text-center py-8 text-stone-500">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="text-purple-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Narrative Evolution</h3>
        </div>
        <div className="text-center py-8 text-stone-500">
          <p>No narrative data available. Link source records to see how coverage evolves over time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
      {/* Header with bucket selector */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="text-purple-500" size={20} />
          <h3 className="text-lg font-semibold text-stone-200">Narrative Evolution</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onBucketChange('day')}
            className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
              bucket === 'day'
                ? 'bg-accent text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => onBucketChange('week')}
            className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
              bucket === 'week'
                ? 'bg-accent text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => onBucketChange('month')}
            className={`px-3 py-1 text-sm rounded transition-colors duration-200 ${
              bucket === 'month'
                ? 'bg-accent text-white'
                : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {buckets.map((bucketData, index) => {
          const isExpanded = expandedBuckets.has(bucketData.date);
          const isLast = index === buckets.length - 1;

          return (
            <div key={bucketData.date} className="relative">
              {/* Timeline line */}
              {!isLast && (
                <div className="absolute left-[15px] top-[40px] bottom-[-12px] w-0.5 bg-stone-700" />
              )}

              {/* Bucket card */}
              <div className="bg-stone-800/50 border border-stone-700 rounded-lg overflow-hidden">
                {/* Bucket header */}
                <button
                  onClick={() => toggleBucket(bucketData.date)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-stone-800 transition-colors duration-200"
                >
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                  </div>

                  <div className="flex-1 text-left">
                    <h4 className="text-stone-200 font-medium">
                      {formatBucketDate(bucketData.date)}
                    </h4>
                    <p className="text-sm text-stone-500">
                      {bucketData.record_count} record{bucketData.record_count !== 1 ? 's' : ''} • {bucketData.key_phrases.length} key phrase{bucketData.key_phrases.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Expand icon */}
                  <div className="flex-shrink-0 text-stone-500">
                    {isExpanded ? (
                      <ChevronDown size={20} />
                    ) : (
                      <ChevronRight size={20} />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-stone-700 pt-4">
                    {bucketData.key_phrases.length > 0 ? (
                      <>
                        <h5 className="text-sm font-medium text-stone-400 mb-3">
                          Key Phrases
                        </h5>
                        <div className="flex flex-wrap gap-2">
                          {bucketData.key_phrases.map((phrase, phraseIndex) => (
                            <span
                              key={phraseIndex}
                              className="px-3 py-1.5 bg-stone-900 text-stone-300 text-sm rounded-full border border-stone-700"
                            >
                              {phrase}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-stone-500 italic">
                        No significant repeated phrases detected in this period
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info box */}
      <div className="mt-6 pt-4 border-t border-stone-800 text-sm text-stone-400 bg-stone-800/30 rounded p-3 border-l-2 border-purple-600">
        <p className="font-medium text-stone-300 mb-1">Narrative Tracking</p>
        <p>
          Key phrases show how language and focus evolve over time. Changes in phrasing may
          indicate narrative shifts, new developments, or coordinated messaging.
        </p>
      </div>
    </div>
  );
}

