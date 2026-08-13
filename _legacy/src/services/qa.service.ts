/**
 * Quality Assurance Service
 * 
 * Frontend service for QA completeness checks and quality metrics.
 */

import type { QACompleteness, SourceValueReport } from '../types/osint';

// Use relative URL in production (Vercel), localhost in development
const API_BASE = import.meta.env.PROD 
  ? (import.meta.env.VITE_API_URL || '')
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

export const qaService = {
  /**
   * Get completeness assessment for a topic
   */
  async getTopicCompleteness(topicId: string): Promise<QACompleteness> {
    const response = await fetch(`${API_BASE}/api/qa/topics/${topicId}/completeness`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Topic not found');
      }
      throw new Error(`Failed to fetch topic completeness: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      topicId: data.topic_id,
      checks: {
        hasDescription: data.checks.has_description,
        hasKeywords: data.checks.has_keywords,
        allLinksHaveConfidence: data.checks.all_links_have_confidence,
        allLinksReviewed: data.checks.all_links_reviewed,
        allArtifactsReviewed: data.checks.all_artifacts_reviewed,
      },
      missingConfidenceLinks: data.missing_confidence_links || [],
      pendingReviewLinks: data.pending_review_links || [],
      unreviewedArtifacts: data.unreviewed_artifacts || [],
      completenessScore: data.completeness_score,
      summary: {
        totalLinks: data.summary.total_links,
        totalArtifacts: data.summary.total_artifacts,
        linksWithoutConfidence: data.summary.links_without_confidence,
        linksPendingReview: data.summary.links_pending_review,
        artifactsUnreviewed: data.summary.artifacts_unreviewed,
      },
    };
  },

  /**
   * Get source value report (top sources by analyst ratings)
   */
  async getSourceValueReport(
    organizationId: string,
    options?: { minRating?: number }
  ): Promise<SourceValueReport> {
    const params = new URLSearchParams({ organization_id: organizationId });
    if (options?.minRating) params.append('min_rating', options.minRating.toString());

    const response = await fetch(`${API_BASE}/api/qa/sources/value-report?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch source value report: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      organizationId: data.organization_id,
      sources: data.sources.map((s: any) => ({
        id: s.id,
        name: s.name,
        sourceType: s.source_type,
        reliabilityRating: s.reliability_rating,
        valueRating: s.value_rating,
        recordCount: s.record_count,
      })),
      statistics: {
        totalRatedSources: data.statistics.total_rated_sources,
        averageRating: data.statistics.average_rating,
        highestRated: data.statistics.highest_rated ? {
          id: data.statistics.highest_rated.id,
          name: data.statistics.highest_rated.name,
          valueRating: data.statistics.highest_rated.value_rating,
        } : null,
      },
    };
  },

  /**
   * Get organization-wide QA dashboard
   */
  async getOrganizationDashboard(organizationId: string): Promise<{
    organizationId: string;
    metrics: {
      topics: {
        total: number;
        byStatus: {
          active: number;
          monitoring: number;
          archived: number;
        };
      };
      links: {
        total: number;
        withoutConfidence: number;
        pendingReview: number;
      };
      artifacts: {
        unreviewed: number;
      };
    };
    qualityScore: number;
  }> {
    const response = await fetch(`${API_BASE}/api/qa/organization/${organizationId}/dashboard`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch QA dashboard: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      organizationId: data.organization_id,
      metrics: {
        topics: {
          total: data.metrics.topics.total,
          byStatus: {
            active: data.metrics.topics.by_status.active,
            monitoring: data.metrics.topics.by_status.monitoring,
            archived: data.metrics.topics.by_status.archived,
          },
        },
        links: {
          total: data.metrics.links.total,
          withoutConfidence: data.metrics.links.without_confidence,
          pendingReview: data.metrics.links.pending_review,
        },
        artifacts: {
          unreviewed: data.metrics.artifacts.unreviewed,
        },
      },
      qualityScore: data.quality_score,
    };
  },
};

