import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, AlertTriangle, CheckCircle2, HelpCircle, TrendingUp } from 'lucide-react';
import { useOrganization } from '../../context/OrganizationContext';
import { osintTopicsService } from '../../services/osintTopics.service';
import { claimsService } from '../../services/claims.service';
import { qaService } from '../../services/qa.service';
import type { OsintTopic, ClaimWithEvidence, QACompleteness } from '../../types/osint';

interface TopicWithCount extends OsintTopic {
  linked_records_count: number;
}

interface TopicNeedingAttention {
  topic: TopicWithCount;
  reasons: string[];
  qaCompleteness?: QACompleteness;
}

export function WeeklyReview() {
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  const [topicsNeedingAttention, setTopicsNeedingAttention] = useState<TopicNeedingAttention[]>([]);
  const [claimsNeedingCorroboration, setClaimsNeedingCorroboration] = useState<
    Array<{ claim: ClaimWithEvidence; topicName: string; topicId: string }>
  >([]);
  const [resolutionCandidates, setResolutionCandidates] = useState<TopicWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganization) {
      loadWeeklyData();
    }
  }, [currentOrganization]);

  const loadWeeklyData = async () => {
    if (!currentOrganization) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all topics
      const topics = await osintTopicsService.getAll(currentOrganization.id);
      const activeTopics = topics.filter(t => t.status === 'active' || t.status === 'monitoring');

      // Analyze topics needing attention
      const needsAttention: TopicNeedingAttention[] = [];

      for (const topic of activeTopics) {
        const reasons: string[] = [];

        // Check if stale (no updates in 14+ days)
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(topic.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceUpdate > 14) {
          reasons.push(`Stale: No updates in ${daysSinceUpdate} days`);
        }

        // Check QA completeness
        try {
          const qa = await qaService.getTopicCompleteness(topic.id);
          
          if (qa.completenessScore < 0.7) {
            reasons.push(`Low QA score: ${Math.round(qa.completenessScore * 100)}%`);
          }

          if (qa.summary.linksPendingReview > 0) {
            reasons.push(`${qa.summary.linksPendingReview} links pending review`);
          }

          if (reasons.length > 0) {
            needsAttention.push({ topic, reasons, qaCompleteness: qa });
          }
        } catch (qaError) {
          // If QA check fails, still add topic if stale
          if (reasons.length > 0) {
            needsAttention.push({ topic, reasons });
          }
        }
      }

      setTopicsNeedingAttention(needsAttention);

      // Fetch claims needing corroboration
      const allClaims: Array<{ claim: ClaimWithEvidence; topicName: string; topicId: string }> = [];

      for (const topic of activeTopics) {
        try {
          const claims = await claimsService.getClaimsByTopic(topic.id);
          const needsCorroboration = claims.filter(
            c => c.corroborationStatus === 'single_source' || c.corroborationStatus === 'no_evidence'
          );

          needsCorroboration.forEach(claim => {
            allClaims.push({ claim, topicName: topic.name, topicId: topic.id });
          });
        } catch (claimError) {
          console.warn(`Failed to fetch claims for topic ${topic.id}:`, claimError);
        }
      }

      setClaimsNeedingCorroboration(allClaims);

      // Identify resolution candidates (topics that might be answered)
      const candidates = activeTopics.filter(topic => {
        // Topics with resolution criteria and sufficient linked records
        return (
          topic.resolutionCriteria &&
          topic.linked_records_count >= 3 &&
          topic.status === 'active'
        );
      });

      setResolutionCandidates(candidates);
    } catch (err) {
      console.error('Failed to load weekly review data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const getCorroborationStatusColor = (status: string) => {
    switch (status) {
      case 'no_evidence':
        return 'text-red-400';
      case 'single_source':
        return 'text-yellow-400';
      case 'corroborated':
        return 'text-green-400';
      case 'disputed':
        return 'text-orange-400';
      default:
        return 'text-stone-400';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-stone-400">Loading weekly review...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle size={20} />
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
          <Calendar className="text-accent" size={24} />
          <h2 className="text-2xl font-semibold text-stone-200">Weekly Review</h2>
        </div>
        <p className="text-stone-400 text-sm">
          Deeper dive: Quality checks, corroboration gaps, and resolution opportunities.
        </p>
      </div>

      {/* Topics Needing Attention */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className="text-yellow-400" />
          Topics Needing Attention ({topicsNeedingAttention.length})
        </h3>

        {topicsNeedingAttention.length === 0 ? (
          <div className="flex items-center gap-2 justify-center text-green-400 text-sm py-8">
            <CheckCircle2 size={20} />
            <span>All topics are in good shape!</span>
          </div>
        ) : (
          <div className="space-y-3">
            {topicsNeedingAttention.map(({ topic, reasons, qaCompleteness }) => (
              <div
                key={topic.id}
                onClick={() => navigate(`/topics/${topic.id}`)}
                className="bg-stone-800/50 hover:bg-stone-800 border border-stone-700 rounded-lg p-4 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-stone-200 font-medium mb-2">{topic.name}</h4>
                    <div className="space-y-1">
                      {reasons.map((reason, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-yellow-400">
                          <AlertTriangle size={12} />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                    {qaCompleteness && (
                      <div className="mt-2 text-xs text-stone-500">
                        QA Score: {Math.round(qaCompleteness.completenessScore * 100)}% •{' '}
                        {qaCompleteness.summary.totalLinks} links •{' '}
                        {qaCompleteness.summary.linksPendingReview} pending review
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claims Needing Corroboration */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2 mb-4">
          <HelpCircle size={20} className="text-accent" />
          Claims Needing Corroboration ({claimsNeedingCorroboration.length})
        </h3>

        {claimsNeedingCorroboration.length === 0 ? (
          <div className="text-stone-500 text-sm text-center py-8">
            No claims needing additional corroboration. All claims are well-supported or disputed.
          </div>
        ) : (
          <div className="space-y-3">
            {claimsNeedingCorroboration.slice(0, 10).map(({ claim, topicName, topicId }) => (
              <div
                key={claim.id}
                onClick={() => navigate(`/topics/${topicId}`)}
                className="bg-stone-800/50 hover:bg-stone-800 border border-stone-700 rounded-lg p-4 cursor-pointer transition-colors"
              >
                <div className="mb-2">
                  <span className="text-xs text-stone-500">{topicName}</span>
                </div>
                <p className="text-stone-200 text-sm mb-2">"{claim.claimText}"</p>
                <div className="flex items-center gap-4 text-xs">
                  <span className={getCorroborationStatusColor(claim.corroborationStatus)}>
                    Status: {claim.corroborationStatus.replace('_', ' ')}
                  </span>
                  <span className="text-stone-500">
                    {claim.evidenceCounts.supporting} supporting •{' '}
                    {claim.evidenceCounts.contradicting} contradicting
                  </span>
                </div>
              </div>
            ))}

            {claimsNeedingCorroboration.length > 10 && (
              <div className="text-stone-500 text-sm text-center py-2">
                + {claimsNeedingCorroboration.length - 10} more claims need review
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resolution Candidates */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-green-400" />
          Resolution Candidates ({resolutionCandidates.length})
        </h3>

        {resolutionCandidates.length === 0 ? (
          <div className="text-stone-500 text-sm text-center py-8">
            No topics are ready for resolution yet. Keep collecting evidence.
          </div>
        ) : (
          <div className="space-y-3">
            {resolutionCandidates.map((topic) => (
              <div
                key={topic.id}
                onClick={() => navigate(`/topics/${topic.id}`)}
                className="bg-stone-800/50 hover:bg-stone-800 border border-stone-700 rounded-lg p-4 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-stone-200 font-medium mb-1">{topic.name}</h4>
                    {topic.decisionQuestion && (
                      <p className="text-stone-400 text-sm italic mb-2">
                        "{topic.decisionQuestion}"
                      </p>
                    )}
                    <div className="text-xs text-stone-500">
                      {topic.linked_records_count} linked records • Has resolution criteria defined
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/topics/${topic.id}`);
                    }}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors whitespace-nowrap"
                  >
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Tips */}
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 mb-3">Weekly Review Tips</h3>
        <ul className="space-y-2 text-sm text-stone-400">
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Deep dive on stale topics:</strong> Either update
              with fresh intel or consider suspending/archiving.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Corroboration discipline:</strong> Single-source
              claims are weak. Seek independent confirmation or flag as disputed.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>
              <strong className="text-stone-300">Resolution readiness:</strong> Check if your key
              indicators have been observed. Can you answer the decision question?
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

