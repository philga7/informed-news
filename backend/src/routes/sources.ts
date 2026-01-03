import { Router } from 'express';
import type { Request, Response } from 'express';
import { fetchNewsFromSource } from '../services/feedFetcher.js';
import { supabase } from '../utils/supabase.js';
import { auditService } from '../services/auditService.js';
import type { NewsSource } from '../types/index.js';

const router = Router();

/**
 * GET /api/sources
 * List all OSINT sources for an organization
 * Query params: organization_id (required)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // Fetch sources with record counts
    const { data: sources, error } = await supabase
      .from('sources')
      .select(`
        *,
        source_records (
          id
        )
      `)
      .eq('organization_id', organization_id as string)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform data to include record counts
    const sourcesWithCounts = sources?.map((source: any) => ({
      id: source.id,
      organization_id: source.organization_id,
      source_type: source.source_type,
      name: source.name,
      url: source.url,
      reliability_rating: source.reliability_rating,
      notes: source.notes,
      created_at: source.created_at,
      updated_at: source.updated_at,
      record_count: source.source_records?.length || 0,
    }));

    res.json({
      success: true,
      sources: sourcesWithCounts || [],
    });
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({
      error: 'Failed to fetch sources',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/sources/:id
 * Update a source (including reliability rating)
 * Body: { name?, url?, reliability_rating?, notes? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, url, reliability_rating, notes, value_rating } = req.body;

    // Validate reliability_rating if provided
    if (reliability_rating && !['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(reliability_rating)) {
      return res.status(400).json({
        error: 'Invalid reliability_rating. Must be HIGH, MEDIUM, LOW, or UNKNOWN',
      });
    }

    // Validate value_rating if provided
    if (value_rating !== undefined && (value_rating < 1 || value_rating > 5)) {
      return res.status(400).json({
        error: 'Invalid value_rating. Must be between 1 and 5',
      });
    }

    // Fetch current state for audit
    const { data: beforeSource, error: fetchError } = await supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !beforeSource) {
      return res.status(404).json({ error: 'Source not found' });
    }

    // Type assertion for beforeSource
    const beforeSourceTyped = beforeSource as any;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (reliability_rating !== undefined) updates.reliability_rating = reliability_rating;
    if (notes !== undefined) updates.notes = notes;
    if (value_rating !== undefined) updates.value_rating = value_rating;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data: source, error } = await supabase
      .from('sources')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update(updates as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Source not found' });
      }
      throw error;
    }

    // Audit log: source updated (or source rated if value_rating changed)
    if (value_rating !== undefined && beforeSourceTyped.value_rating !== value_rating) {
      await auditService.logSourceRated(id, beforeSourceTyped.value_rating, value_rating);
    } else {
      await auditService.logSourceUpdated(id, beforeSourceTyped, source);
    }

    res.json({
      success: true,
      source,
    });
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({
      error: 'Failed to update source',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/sources/test
 * Test a news source configuration
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { source } = req.body as { source: NewsSource };

    if (!source) {
      return res.status(400).json({ error: 'Source is required' });
    }

    // Try to fetch from the source
    const articles = await fetchNewsFromSource(source);

    res.json({
      success: true,
      articleCount: articles.length,
      sampleArticle: articles[0] || null,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

