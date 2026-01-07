/**
 * QA Checklist Component
 * 
 * Displays quality assurance completeness indicators for a topic.
 * Helps analysts ensure comprehensive intelligence products.
 */

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { qaService } from '../../services';
import { LoadingSpinner } from '../UI/LoadingSpinner';
import type { QACompleteness } from '../../types/osint';

interface QAChecklistProps {
  topicId: string;
}

export function QAChecklist({ topicId }: QAChecklistProps) {
  const [completeness, setCompleteness] = useState<QACompleteness | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompleteness();
  }, [topicId]);

  const loadCompleteness = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await qaService.getTopicCompleteness(topicId);
      setCompleteness(data);
    } catch (err) {
      console.error('Error loading QA completeness:', err);
      setError(err instanceof Error ? err.message : 'Failed to load QA data');
    } finally {
      setIsLoading(false);
    }
  };

  const renderCheckItem = (
    label: string,
    passed: boolean,
    warning?: string
  ) => {
    return (
      <div className="flex items-start gap-3 py-2">
        <div className="flex-shrink-0 mt-0.5">
          {passed ? (
            <CheckCircle2 size={20} className="text-green-500" />
          ) : (
            <AlertCircle size={20} className="text-yellow-500" />
          )}
        </div>
        <div className="flex-1">
          <div className="text-stone-300">{label}</div>
          {!passed && warning && (
            <div className="text-sm text-yellow-500 mt-1">{warning}</div>
          )}
        </div>
      </div>
    );
  };

  const getScoreColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-500';
    if (score >= 0.5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 0.8) return 'Good';
    if (score >= 0.5) return 'Needs Attention';
    return 'Incomplete';
  };

  if (isLoading) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !completeness) {
    return (
      <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-stone-200 mb-4">Quality Assurance</h3>
        <div className="text-center py-4">
          <p className="text-red-400">{error || 'Failed to load QA data'}</p>
          <button
            onClick={loadCompleteness}
            className="mt-4 px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded transition-colors duration-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { checks, summary, completenessScore } = completeness;

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-stone-200">Quality Assurance</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-400">Completeness:</span>
          <span className={`text-xl font-bold ${getScoreColor(completenessScore)}`}>
            {Math.round(completenessScore * 100)}%
          </span>
          <span className={`text-sm ${getScoreColor(completenessScore)}`}>
            {getScoreLabel(completenessScore)}
          </span>
        </div>
      </div>

      <div className="space-y-1 mb-6 border-t border-stone-800 pt-4">
        {renderCheckItem(
          'Topic has description',
          checks.hasDescription,
          checks.hasDescription ? undefined : 'Add a description to provide context'
        )}
        {renderCheckItem(
          'Topic has keywords',
          checks.hasKeywords,
          checks.hasKeywords ? undefined : 'Add keywords for better searchability'
        )}
        {renderCheckItem(
          'All links have confidence assessments',
          checks.allLinksHaveConfidence,
          checks.allLinksHaveConfidence
            ? undefined
            : `${summary.linksWithoutConfidence} link(s) missing confidence level`
        )}
        {renderCheckItem(
          'All links have been reviewed',
          checks.allLinksReviewed,
          checks.allLinksReviewed
            ? undefined
            : `${summary.linksPendingReview} link(s) pending review`
        )}
        {renderCheckItem(
          'All AI artifacts reviewed',
          checks.allArtifactsReviewed,
          checks.allArtifactsReviewed
            ? undefined
            : `${summary.artifactsUnreviewed} artifact(s) pending review`
        )}
      </div>

      {summary.totalLinks > 0 && (
        <div className="bg-stone-950 border border-stone-800 rounded p-4">
          <h4 className="text-sm font-medium text-stone-400 mb-3">Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-stone-500">Total Links</div>
              <div className="text-stone-300 font-medium">{summary.totalLinks}</div>
            </div>
            <div>
              <div className="text-stone-500">Total Artifacts</div>
              <div className="text-stone-300 font-medium">{summary.totalArtifacts}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

