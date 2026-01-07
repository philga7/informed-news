/**
 * Content Optimization Routes
 * 
 * API endpoints for content optimization (compression, content type updates).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import { ContentOptimizationJob, type OptimizationResult } from '../services/ingestion/ContentOptimizationJob.js';

const router = Router();
const optimizationJob = new ContentOptimizationJob();

/**
 * POST /api/optimization/organizations/:organizationId/apply
 * Run optimization for all sources in organization (called by GitHub Actions)
 */
router.post('/organizations/:organizationId/apply', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    const result = await optimizationJob.optimizeOrganizationContent(organizationId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Error applying optimization:', error);
    res.status(500).json({
      error: 'Failed to apply optimization',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/optimization/organizations/all/apply
 * Run optimization for all organizations (called by GitHub Actions)
 * Automatically discovers all organizations and processes them
 */
router.post('/organizations/all/apply', async (req: Request, res: Response) => {
  try {
    // Fetch all organizations
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('id, name') as { data: Array<{ id: string; name: string }> | null; error: unknown };

    if (error) throw error;
    if (!organizations || organizations.length === 0) {
      return res.json({
        success: true,
        message: 'No organizations found',
        results: [],
        summary: {
          totalOrganizations: 0,
          totalProcessed: 0,
          totalCompressed: 0,
          totalContentTypeUpdated: 0,
          totalErrors: 0,
        },
      });
    }

    const allResults: Array<{
      organizationId: string;
      organizationName: string;
      result: OptimizationResult;
    }> = [];

    // Process each organization
    for (const org of organizations) {
      try {
        const result = await optimizationJob.optimizeOrganizationContent(org.id);
        allResults.push({
          organizationId: org.id,
          organizationName: org.name,
          result,
        });
      } catch (err) {
        console.error(`Error processing organization ${org.id}:`, err);
        allResults.push({
          organizationId: org.id,
          organizationName: org.name,
          result: {
            processed: 0,
            compressed: 0,
            contentTypeUpdated: 0,
            errors: [
              `Failed to process: ${err instanceof Error ? err.message : 'Unknown error'}`,
            ],
          },
        });
      }
    }

    // Aggregate summary
    const summary = {
      totalOrganizations: organizations.length,
      totalProcessed: allResults.reduce((sum, r) => sum + r.result.processed, 0),
      totalCompressed: allResults.reduce((sum, r) => sum + r.result.compressed, 0),
      totalContentTypeUpdated: allResults.reduce((sum, r) => sum + r.result.contentTypeUpdated, 0),
      totalErrors: allResults.reduce((sum, r) => sum + r.result.errors.length, 0),
    };

    res.json({
      success: true,
      results: allResults,
      summary,
    });
  } catch (error) {
    console.error('Error applying optimization for all organizations:', error);
    res.status(500).json({
      error: 'Failed to apply optimization for all organizations',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/optimization/sources/:sourceId/apply
 * Manually trigger optimization for a source
 */
router.post('/sources/:sourceId/apply', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const result = await optimizationJob.optimizeSourceContent(sourceId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Error applying optimization:', error);
    res.status(500).json({
      error: 'Failed to apply optimization',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/optimization/sources/:sourceId/status
 * Get optimization status and stats
 */
router.get('/sources/:sourceId/status', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    // Get stats from database
    const { data: stats, error } = await supabase
      .from('source_records')
      .select('content_type, content_compressed, content_length')
      .eq('source_id', sourceId) as { 
        data: Array<{
          content_type: string;
          content_compressed: boolean;
          content_length: number | null;
        }> | null; 
        error: unknown 
      };

    if (error) throw error;

    const totalRecords = stats?.length || 0;
    const compressedCount = stats?.filter((s) => s.content_compressed).length || 0;
    const avgContentLength =
      stats && stats.length > 0
        ? stats.reduce((sum, s) => sum + (s.content_length || 0), 0) / totalRecords
        : 0;

    const contentTypeCounts = {
      full_text: stats?.filter((s) => s.content_type === 'full_text').length || 0,
      summary: stats?.filter((s) => s.content_type === 'summary').length || 0,
      structured: stats?.filter((s) => s.content_type === 'structured').length || 0,
      minimal: stats?.filter((s) => s.content_type === 'minimal').length || 0,
    };

    res.json({
      success: true,
      stats: {
        totalRecords,
        compressedCount,
        avgContentLength: Math.round(avgContentLength),
        contentTypeCounts,
      },
    });
  } catch (error) {
    console.error('Error fetching optimization status:', error);
    res.status(500).json({
      error: 'Failed to fetch optimization status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

