import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, TrendingUp, BarChart3, Eye, AlertCircle } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { osintTopicsService } from '../../services/osintTopics.service';
import { qaService } from '../../services/qa.service';
import type { OsintTopic, SourceValueReport } from '../../types/osint';

interface TopicWithCount extends OsintTopic {
  linked_records_count: number;
}

interface TopicMetrics {
  totalTopics: number;
  byStatus: {
    active: number;
    monitoring: number;
    suspended: number;
    resolved: number;
    archived: number;
  };
  averageRecordsPerTopic: number;
  topicsResolvedThisMonth: number;
}

export function MonthlyAudit() {
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const [_archivedTopics, setArchivedTopics] = useState<TopicWithCount[]>([]);
  const [resolvedTopics, setResolvedTopics] = useState<TopicWithCount[]>([]);
  const [sourceValueReport, setSourceValueReport] = useState<SourceValueReport | null>(null);
  const [topicMetrics, setTopicMetrics] = useState<TopicMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganization) {
      loadMonthlyData();
    }
  }, [currentOrganization]);

  const loadMonthlyData = async () => {
    if (!currentOrganization) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all topics
      const topics = await osintTopicsService.getAll(currentOrganization.id);

      // Filter archived and resolved topics
      const archived = topics.filter(t => t.status === 'archived');
      const resolved = topics.filter(t => t.status === 'resolved');

      // Calculate topics resolved this month
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const resolvedThisMonth = resolved.filter(
        t => t.resolvedAt && new Date(t.resolvedAt) >= oneMonthAgo
      );

      setArchivedTopics(archived);
      setResolvedTopics(resolvedThisMonth);

      // Calculate topic lifecycle metrics
      const byStatus = {
        active: topics.filter(t => t.status === 'active').length,
        monitoring: topics.filter(t => t.status === 'monitoring').length,
        suspended: topics.filter(t => t.status === 'suspended').length,
        resolved: resolved.length,
        archived: archived.length,
      };

      const totalRecords = topics.reduce((sum, t) => sum + (t.linked_records_count || 0), 0);
      const averageRecordsPerTopic = topics.length > 0 ? totalRecords / topics.length : 0;

      setTopicMetrics({
        totalTopics: topics.length,
        byStatus,
        averageRecordsPerTopic,
        topicsResolvedThisMonth: resolvedThisMonth.length,
      });

      // Fetch source value report
      try {
        const valueReport = await qaService.getSourceValueReport(currentOrganization.id, {
          minRating: 1,
        });
        setSourceValueReport(valueReport);
      } catch (sourceError) {
        console.warn('Failed to load source value report:', sourceError);
      }
    } catch (err) {
      console.error('Failed to load monthly audit data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatConfidence = (confidence: string | null) => {
    if (!confidence) return 'N/A';
    return confidence.charAt(0) + confidence.slice(1).toLowerCase();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-stone-400">Loading monthly audit...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="text-accent" size={24} />
          <h2 className="text-2xl font-semibold text-stone-200">Monthly Audit</h2>
        </div>
        <p className="text-stone-400 text-sm">
          Strategic review: Lifecycle metrics, source effectiveness, and blind spot analysis.
        </p>
      </div>

      {/* Topic Lifecycle Metrics */}
      {topicMetrics && (
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2 mb-4">
            <TrendingUp size={20} className="text-accent" />
            Topic Lifecycle Metrics
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-stone-200">{topicMetrics.totalTopics}</div>
              <div className="text-xs text-stone-400 mt-1">Total Topics</div>
            </div>

            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-400">{topicMetrics.byStatus.active}</div>
              <div className="text-xs text-stone-400 mt-1">Active</div>
            </div>

            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-400">{topicMetrics.byStatus.monitoring}</div>
              <div className="text-xs text-stone-400 mt-1">Monitoring</div>
            </div>

            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-400">{topicMetrics.byStatus.suspended}</div>
              <div className="text-xs text-stone-400 mt-1">Suspended</div>
            </div>

            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-400">{topicMetrics.byStatus.resolved}</div>
              <div className="text-xs text-stone-400 mt-1">Resolved</div>
            </div>

            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-stone-400">{topicMetrics.byStatus.archived}</div>
              <div className="text-xs text-stone-400 mt-1">Archived</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-stone-700 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xl font-bold text-stone-200">
                {topicMetrics.averageRecordsPerTopic.toFixed(1)}
              </div>
              <div className="text-xs text-stone-400">Avg Records per Topic</div>
            </div>
            <div>
              <div className="text-xl font-bold text-accent">
                {topicMetrics.topicsResolvedThisMonth}
              </div>
              <div className="text-xs text-stone-400">Resolved This Month</div>
            </div>
          </div>
        </div>
      )}

      {/* Recently Resolved Topics */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2 mb-4">
          <Archive size={20} className="text-purple-400" />
          Recently Resolved Topics ({resolvedTopics.length})
        </h3>

        {resolvedTopics.length === 0 ? (
          <div className="text-stone-500 text-sm text-center py-8">
            No topics resolved in the last month. Continue collecting evidence on active topics.
          </div>
        ) : (
          <div className="space-y-3">
            {resolvedTopics.map((topic) => (
              <div
                key={topic.id}
                onClick={() => navigate(`/topics/${topic.id}`)}
                className="bg-stone-800/50 hover:bg-stone-800 border border-stone-700 rounded-lg p-4 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h4 className="text-stone-200 font-medium">{topic.name}</h4>
                  <span
                    className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                      topic.resolutionConfidence === 'HIGH'
                        ? 'bg-green-900/30 text-green-400'
                        : topic.resolutionConfidence === 'MEDIUM'
                        ? 'bg-yellow-900/30 text-yellow-400'
                        : 'bg-red-900/30 text-red-400'
                    }`}
                  >
                    {formatConfidence(topic.resolutionConfidence)} Confidence
                  </span>
                </div>

                {topic.resolutionSummary && (
                  <p className="text-stone-400 text-sm mb-2">{topic.resolutionSummary}</p>
                )}

                <div className="text-xs text-stone-500">
                  {topic.linked_records_count} linked records •{' '}
                  {topic.resolvedAt
                    ? new Date(topic.resolvedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Unknown date'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Source Value Report */}
      {sourceValueReport && sourceValueReport.sources.length > 0 && (
        <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2 mb-4">
            <Eye size={20} className="text-accent" />
            Top Sources by Value
          </h3>

          <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-stone-400">Total Rated Sources:</span>{' '}
              <span className="text-stone-200 font-medium">
                {sourceValueReport.statistics.totalRatedSources}
              </span>
            </div>
            <div>
              <span className="text-stone-400">Average Rating:</span>{' '}
              <span className="text-stone-200 font-medium">
                {sourceValueReport.statistics.averageRating.toFixed(1)} / 5
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {sourceValueReport.sources
              .sort((a, b) => b.valueRating - a.valueRating)
              .slice(0, 10)
              .map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between bg-stone-800/50 rounded-lg p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-200 font-medium truncate">{source.name}</div>
                    <div className="text-xs text-stone-500">
                      {source.recordCount} records • {source.sourceType}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-amber-400 font-medium">
                      {'★'.repeat(source.valueRating)}
                      {'☆'.repeat(5 - source.valueRating)}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Blind Spot Analysis */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 mb-3">Blind Spot Analysis</h3>
        <p className="text-stone-400 text-sm mb-4">
          Reflect on gaps in your intelligence coverage:
        </p>

        <ul className="space-y-2 text-sm text-stone-400">
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Coverage gaps:</strong> Are there topics you
              should be tracking but aren't? Review recent news to identify blind spots.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Source diversity:</strong> Are you relying too
              heavily on certain sources? Consider adding alternative perspectives.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Analytical bias:</strong> Did your resolutions
              hold up? If not, what assumptions were wrong?
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Topic lifecycle:</strong> Are topics staying
              active too long? Consider tighter resolution criteria or time limits.
            </span>
          </li>
        </ul>
      </div>

      {/* Monthly Tips */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 mb-3">Monthly Audit Tips</h3>
        <ul className="space-y-2 text-sm text-stone-400">
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Strategic reflection:</strong> This is not about
              daily operations. Think bigger picture: What's working? What needs to change?
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Source pruning:</strong> Low-value sources waste
              time. Consider removing or downgrading sources that consistently provide little value.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Lessons learned:</strong> Review resolved topics.
              What worked? What didn't? Update your collection methodology accordingly.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

