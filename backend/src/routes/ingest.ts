/**
 * Ingestion API Routes
 * 
 * Endpoints for ingesting content from various sources into the OSINT schema.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import {
  IngestionController,
  RssIngestionService,
  ManualInputService,
} from '../services/ingestion/index.js';

const router = Router();

/**
 * POST /api/ingest/rss
 * Trigger RSS ingestion for a configured source
 * 
 * Body:
 *   - organization_id: string (required)
 *   - source_id: string (required) - ID of the source in the sources table
 */
router.post('/rss', async (req: Request, res: Response) => {
  try {
    const { organization_id, source_id } = req.body;

    // Validate required fields
    if (!organization_id || !source_id) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['organization_id', 'source_id'],
      });
    }

    // Fetch the source configuration from database
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('*')
      .eq('id', source_id)
      .eq('organization_id', organization_id)
      .single();

    if (sourceError || !source) {
      return res.status(404).json({
        error: 'Source not found',
        message: sourceError?.message || 'Source does not exist or does not belong to this organization',
      });
    }

    // Validate source type
    if (source.source_type !== 'rss') {
      return res.status(400).json({
        error: 'Invalid source type',
        message: `Source type is '${source.source_type}', expected 'rss'`,
      });
    }

    // Validate source has URL
    if (!source.url) {
      return res.status(400).json({
        error: 'Source missing URL',
        message: 'RSS source must have a URL configured',
      });
    }

    // Create RSS ingestion service
    const rssService = new RssIngestionService({
      sourceId: source.id,
      feedUrl: source.url,
      scrapeExternalUrl: false, // TODO: Add this field to sources table
      extractFullContent: true, // Extract full article content for AI analysis
    });

    // Create controller and ingest
    const controller = new IngestionController(rssService);
    const result = await controller.ingest();

    // Log stats
    controller.logStats(result);

    // Update source updated_at timestamp
    await supabase
      .from('sources')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', source_id);

    res.json({
      success: true,
      source_id,
      source_name: source.name,
      result: {
        added: result.added,
        skipped: result.skipped,
        errors: result.errors,
        total_processed: (result.records?.length || 0),
      },
    });
  } catch (error) {
    console.error('RSS ingestion error:', error);
    res.status(500).json({
      error: 'RSS ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/ingest/manual
 * Submit manual content for ingestion
 * 
 * Body:
 *   - organization_id: string (required)
 *   - title: string (required)
 *   - content: string (required)
 *   - url: string (optional)
 *   - source_name: string (optional, defaults to "Manual Input")
 *   - language: string (optional)
 *   - published_at: string (optional, ISO date)
 */
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const {
      organization_id,
      title,
      content,
      url,
      source_name,
      language,
      published_at,
    } = req.body;

    // Validate required fields
    if (!organization_id || !title || !content) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['organization_id', 'title', 'content'],
      });
    }

    // Validate organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organization_id)
      .single();

    if (orgError || !org) {
      return res.status(404).json({
        error: 'Organization not found',
        message: orgError?.message || 'Organization does not exist',
      });
    }

    // Create manual input service
    const manualService = new ManualInputService({
      organizationId: organization_id,
      title,
      content,
      url,
      sourceName: source_name,
      language,
      publishedAt: published_at ? new Date(published_at) : undefined,
    });

    // Create controller and ingest
    const controller = new IngestionController(manualService);
    const result = await controller.ingest();

    // Log stats
    controller.logStats(result);

    res.json({
      success: true,
      result: {
        added: result.added,
        skipped: result.skipped,
        errors: result.errors,
        record: result.records?.[0],
      },
    });
  } catch (error) {
    console.error('Manual ingestion error:', error);
    res.status(500).json({
      error: 'Manual ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/ingest/status
 * Get ingestion system status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    // Test database connection
    const { error } = await supabase
      .from('sources')
      .select('id')
      .limit(1);

    res.json({
      status: error ? 'degraded' : 'operational',
      database: error ? 'disconnected' : 'connected',
      timestamp: new Date().toISOString(),
      error: error?.message,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

