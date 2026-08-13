/**
 * Quality Assurance API Routes
 * 
 * Endpoints for QA checks, completeness assessments, and quality metrics.
 * Helps analysts ensure comprehensive intelligence products.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * GET /api/qa/topics/:id/completeness
 * Check topic completeness against QA criteria
 * Returns:
 *   - Boolean checks for each criteria
 *   - Lists of missing/incomplete items
 *   - Overall completeness score (0.0 to 1.0)
 */
router.get('/topics/:id/completeness', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch topic with related data
    const { data: topic, error: topicError } = await supabase
      .from('osint_topics')
      .select(`
        *,
        topic_source_links (
          id,
          confidence_level,
          review_status
        )
      `)
      .eq('id', id)
      .single();

    if (topicError) {
      if (topicError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Topic not found' });
      }
      throw topicError;
    }

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Type assertion for topic
    const topicTyped = topic as any;

    // Fetch analytic artifacts for this topic
    const { data: artifacts, error: artifactsError } = await supabase
      .from('analytic_artifacts')
      .select('id, reviewed')
      .eq('topic_id', id);

    if (artifactsError) throw artifactsError;

    // Run QA checks
    const checks = {
      has_description: !!(topicTyped.description && topicTyped.description.trim().length > 0),
      has_keywords: !!(topicTyped.keywords && Array.isArray(topicTyped.keywords) && topicTyped.keywords.length > 0),
      all_links_have_confidence: true,
      all_links_reviewed: true,
      all_artifacts_reviewed: true,
    };

    const missingConfidenceLinks: string[] = [];
    const pendingReviewLinks: string[] = [];
    const unreviewedArtifacts: string[] = [];

    // Check links for confidence and review status
    if (topicTyped.topic_source_links && topicTyped.topic_source_links.length > 0) {
      topicTyped.topic_source_links.forEach((link: any) => {
        if (!link.confidence_level) {
          checks.all_links_have_confidence = false;
          missingConfidenceLinks.push(link.id);
        }
        if (link.review_status !== 'reviewed') {
          checks.all_links_reviewed = false;
          pendingReviewLinks.push(link.id);
        }
      });
    }

    // Check artifacts for review status
    if (artifacts && artifacts.length > 0) {
      artifacts.forEach((artifact: any) => {
        if (!artifact.reviewed) {
          checks.all_artifacts_reviewed = false;
          unreviewedArtifacts.push(artifact.id);
        }
      });
    }

    // Calculate completeness score (equal weight for each check)
    const totalChecks = Object.keys(checks).length;
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const completenessScore = totalChecks > 0 ? passedChecks / totalChecks : 0;

    res.json({
      success: true,
      topic_id: id,
      checks,
      missing_confidence_links: missingConfidenceLinks,
      pending_review_links: pendingReviewLinks,
      unreviewed_artifacts: unreviewedArtifacts,
      completeness_score: parseFloat(completenessScore.toFixed(2)),
      summary: {
        total_links: topicTyped.topic_source_links?.length || 0,
        total_artifacts: artifacts?.length || 0,
        links_without_confidence: missingConfidenceLinks.length,
        links_pending_review: pendingReviewLinks.length,
        artifacts_unreviewed: unreviewedArtifacts.length,
      },
    });
  } catch (error) {
    console.error('Error checking topic completeness:', error);
    res.status(500).json({
      error: 'Failed to check topic completeness',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/qa/sources/value-report
 * Report on source usefulness based on analyst ratings
 * Query params:
 *   - organization_id (required)
 *   - min_rating (optional) - filter sources with rating >= min_rating
 */
router.get('/sources/value-report', async (req: Request, res: Response) => {
  try {
    const { organization_id, min_rating } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    let query = supabase
      .from('sources')
      .select(`
        id,
        name,
        source_type,
        reliability_rating,
        value_rating,
        source_records (id)
      `)
      .eq('organization_id', organization_id as string)
      .not('value_rating', 'is', null)
      .order('value_rating', { ascending: false });

    if (min_rating) {
      query = query.gte('value_rating', parseInt(min_rating as string));
    }

    const { data: sources, error } = await query;

    if (error) throw error;

    // Calculate statistics
    const sourcesWithRecords = (sources || []).map((source: any) => ({
      id: source.id,
      name: source.name,
      source_type: source.source_type,
      reliability_rating: source.reliability_rating,
      value_rating: source.value_rating,
      record_count: source.source_records?.length || 0,
    }));

    // Sort by value and record count
    sourcesWithRecords.sort((a, b) => {
      if (b.value_rating !== a.value_rating) {
        return b.value_rating - a.value_rating;
      }
      return b.record_count - a.record_count;
    });

    // Calculate averages
    const totalRating = sourcesWithRecords.reduce((sum, s) => sum + s.value_rating, 0);
    const averageRating = sourcesWithRecords.length > 0 
      ? totalRating / sourcesWithRecords.length 
      : 0;

    res.json({
      success: true,
      organization_id,
      sources: sourcesWithRecords,
      statistics: {
        total_rated_sources: sourcesWithRecords.length,
        average_rating: parseFloat(averageRating.toFixed(2)),
        highest_rated: sourcesWithRecords[0] || null,
      },
    });
  } catch (error) {
    console.error('Error generating source value report:', error);
    res.status(500).json({
      error: 'Failed to generate source value report',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/qa/organization/:id/dashboard
 * Overall QA dashboard for an organization
 * Returns key metrics and statistics
 */
router.get('/organization/:id/dashboard', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch topics count by status
    const { data: topics, error: topicsError } = await supabase
      .from('osint_topics')
      .select('id, status')
      .eq('organization_id', id);

    if (topicsError) throw topicsError;

    // Fetch links with missing confidence
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select(`
        id,
        confidence_level,
        review_status,
        osint_topics!inner (
          organization_id
        )
      `)
      .eq('osint_topics.organization_id', id);

    if (linksError) throw linksError;

    // Fetch unreviewed artifacts
    const { data: artifacts, error: artifactsError } = await supabase
      .from('analytic_artifacts')
      .select('id, reviewed')
      .eq('organization_id', id)
      .eq('reviewed', false);

    if (artifactsError) throw artifactsError;

    // Calculate metrics
    const topicsTyped = (topics || []) as any[];
    const linksTyped = (links || []) as any[];
    
    const topicsByStatus = {
      active: topicsTyped.filter(t => t.status === 'active').length || 0,
      monitoring: topicsTyped.filter(t => t.status === 'monitoring').length || 0,
      archived: topicsTyped.filter(t => t.status === 'archived').length || 0,
    };

    const linksWithoutConfidence = linksTyped.filter(l => !l.confidence_level).length || 0;
    const linksPendingReview = linksTyped.filter(l => l.review_status === 'pending').length || 0;

    res.json({
      success: true,
      organization_id: id,
      metrics: {
        topics: {
          total: topics?.length || 0,
          by_status: topicsByStatus,
        },
        links: {
          total: links?.length || 0,
          without_confidence: linksWithoutConfidence,
          pending_review: linksPendingReview,
        },
        artifacts: {
          unreviewed: artifacts?.length || 0,
        },
      },
      quality_score: calculateOrgQualityScore(
        topics?.length || 0,
        linksWithoutConfidence,
        linksPendingReview,
        artifacts?.length || 0
      ),
    });
  } catch (error) {
    console.error('Error generating QA dashboard:', error);
    res.status(500).json({
      error: 'Failed to generate QA dashboard',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Helper: Calculate overall organization quality score
 */
function calculateOrgQualityScore(
  totalTopics: number,
  linksWithoutConfidence: number,
  linksPendingReview: number,
  unreviewedArtifacts: number
): number {
  if (totalTopics === 0) return 1.0;

  // Simple heuristic: penalize for incomplete items
  const penalties = linksWithoutConfidence + linksPendingReview + unreviewedArtifacts;
  const maxPenalty = totalTopics * 3; // Arbitrary: assume 3 potential issues per topic

  const score = Math.max(0, 1 - (penalties / maxPenalty));
  return parseFloat(score.toFixed(2));
}

export default router;

