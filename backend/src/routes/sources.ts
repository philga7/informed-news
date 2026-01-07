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

    // Check if service role key is configured (for debugging)
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!hasServiceRole) {
      console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not set - queries may be blocked by RLS');
    }

    // Fetch sources (without nested records to avoid pagination issues)
    const { data: sources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('organization_id', organization_id as string)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching sources:', error);
      throw error;
    }

    if (!sources || sources.length === 0) {
      return res.json({
        success: true,
        sources: [],
      });
    }

    // Use SQL aggregations to calculate all metrics efficiently in a single query
    const sourceIds = sources.map((s: any) => s.id);
    
    // Get all metrics in one query using SQL aggregation
    const { data: metricsData, error: metricsError } = await supabase.rpc('get_source_metrics', {
      p_source_ids: sourceIds,
      // @ts-ignore - Supabase type inference issue with RPC functions
    } as any) as { data: any; error: any };

    if (metricsError) {
      console.error('Error fetching source metrics:', metricsError);
      // Fallback to empty metrics if RPC fails
    }

    // Create a map of metrics by source ID
    const metricsMap = new Map<string, {
      record_count: number;
      linked_count: number;
      oldest_record_date: string | null;
      most_recent_link_date: string | null;
    }>();

    if (metricsData && Array.isArray(metricsData)) {
      (metricsData as any[]).forEach((metric: any) => {
        metricsMap.set(metric.source_id, {
          record_count: metric.record_count || 0,
          linked_count: metric.linked_count || 0,
          oldest_record_date: metric.oldest_record_date,
          most_recent_link_date: metric.most_recent_link_date,
        });
      });
    }

    // Map sources with their metrics
    const sourcesWithCounts = sources.map((source: any) => {
      const metrics = metricsMap.get(source.id) || {
        record_count: 0,
        linked_count: 0,
        oldest_record_date: null,
        most_recent_link_date: null,
      };

      // Calculate days since last link
      let daysSinceLastLink: number;
      if (metrics.most_recent_link_date) {
        // Has links: calculate days since most recent link
        const linkDate = new Date(metrics.most_recent_link_date);
        daysSinceLastLink = Math.floor((Date.now() - linkDate.getTime()) / (1000 * 60 * 60 * 24));
      } else if (metrics.record_count > 0 && metrics.oldest_record_date) {
        // No links but has records: calculate days since oldest record was ingested
        const oldestDate = new Date(metrics.oldest_record_date);
        daysSinceLastLink = Math.floor((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        // No records at all: 0 days
        daysSinceLastLink = 0;
      }

      return {
        id: source.id,
        organization_id: source.organization_id,
        source_type: source.source_type,
        name: source.name,
        url: source.url,
        domain: source.domain || null,
        reliability_rating: source.reliability_rating,
        value_rating: source.value_rating || null,
        notes: source.notes,
        scrape_external_url: source.scrape_external_url || false,
        created_at: source.created_at,
        updated_at: source.updated_at,
        record_count: metrics.record_count,
        linked_count: metrics.linked_count,
        days_since_last_link: daysSinceLastLink,
      };
    });

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
 * POST /api/sources
 * Create a new OSINT source
 * Body: { organization_id, source_type, name, url?, domain?, reliability_rating?, notes? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, source_type, name, url, domain, reliability_rating, notes, scrape_external_url } = req.body;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    if (!source_type) {
      return res.status(400).json({ error: 'source_type is required' });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Validate source_type
    if (!['rss', 'api', 'email', 'manual'].includes(source_type)) {
      return res.status(400).json({
        error: 'Invalid source_type. Must be rss, api, email, or manual',
      });
    }

    // Validate reliability_rating if provided
    if (reliability_rating && !['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(reliability_rating)) {
      return res.status(400).json({
        error: 'Invalid reliability_rating. Must be HIGH, MEDIUM, LOW, or UNKNOWN',
      });
    }

    const sourceData: any = {
      organization_id,
      source_type,
      name: name.trim(),
      reliability_rating: reliability_rating || 'UNKNOWN',
    };

    if (url !== undefined) {
      sourceData.url = url ? url.trim() : null;
    }
    if (domain !== undefined) {
      sourceData.domain = domain || null;
    }
    if (notes !== undefined) {
      sourceData.notes = notes ? notes.trim() : null;
    }
    if (scrape_external_url !== undefined) {
      sourceData.scrape_external_url = scrape_external_url;
    }

    const result = await supabase
      .from('sources')
      .insert(sourceData)
      .select()
      .single() as {
        data: {
          id: string;
          name: string;
          source_type: string;
          reliability_rating: string | null;
          domain: string | null;
          [key: string]: unknown;
        } | null;
        error: unknown;
      };
    const { data: source, error } = result;

    if (error || !source) {
      console.error('Error creating source:', error);
      throw error || new Error('Failed to create source');
    }

    // Audit log: source created
    await auditService.logSourceCreated(source.id, {
      name: source.name,
      source_type: source.source_type,
      reliability_rating: source.reliability_rating,
      domain: source.domain,
    });

    res.status(201).json({
      success: true,
      source,
    });
  } catch (error) {
    console.error('Error creating source:', error);
    res.status(500).json({
      error: 'Failed to create source',
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
    const { 
      name, 
      url, 
      domain, 
      reliability_rating, 
      notes, 
      value_rating, 
      scrape_external_url,
      retention_max_items,
      retention_days,
      retention_action
    } = req.body;

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

    // Validate retention policy fields if provided
    if (retention_max_items !== undefined && retention_max_items !== null && retention_max_items < 1) {
      return res.status(400).json({
        error: 'Invalid retention_max_items. Must be at least 1',
      });
    }

    if (retention_days !== undefined && retention_days !== null && retention_days < 1) {
      return res.status(400).json({
        error: 'Invalid retention_days. Must be at least 1',
      });
    }

    if (retention_action !== undefined && !['delete', 'archive'].includes(retention_action)) {
      return res.status(400).json({
        error: 'Invalid retention_action. Must be "delete" or "archive"',
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
    if (domain !== undefined) updates.domain = domain;
    if (reliability_rating !== undefined) updates.reliability_rating = reliability_rating;
    if (notes !== undefined) updates.notes = notes;
    if (value_rating !== undefined) updates.value_rating = value_rating;
    if (scrape_external_url !== undefined) updates.scrape_external_url = scrape_external_url;
    // Phase 1: Retention policy fields
    if (retention_max_items !== undefined) updates.retention_max_items = retention_max_items;
    if (retention_days !== undefined) updates.retention_days = retention_days;
    if (retention_action !== undefined) updates.retention_action = retention_action;

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

    // Check if source was successfully updated
    if (!source) {
      return res.status(500).json({ error: 'Failed to update source' });
    }

    // Audit log: Check what changed
    const retentionPolicyChanged = 
      (retention_max_items !== undefined && beforeSourceTyped.retention_max_items !== retention_max_items) ||
      (retention_days !== undefined && beforeSourceTyped.retention_days !== retention_days) ||
      (retention_action !== undefined && beforeSourceTyped.retention_action !== retention_action);

    if (retentionPolicyChanged) {
      // Log retention policy update separately
      await auditService.logRetentionPolicyUpdated(
        id,
        {
          retention_max_items: beforeSourceTyped.retention_max_items,
          retention_days: beforeSourceTyped.retention_days,
          retention_action: beforeSourceTyped.retention_action,
        },
        {
          retention_max_items: (source as any).retention_max_items,
          retention_days: (source as any).retention_days,
          retention_action: (source as any).retention_action,
        }
      );
    }

    if (value_rating !== undefined && beforeSourceTyped.value_rating !== value_rating) {
      await auditService.logSourceRated(id, beforeSourceTyped.value_rating, value_rating);
    } else if (!retentionPolicyChanged) {
      // Only log general source update if retention policy wasn't the only change
      await auditService.logSourceUpdated(id, beforeSourceTyped, source as any);
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
 * DELETE /api/sources/:id
 * Delete a source and all associated source records (cascade delete)
 * Body: none
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch source before deletion for audit log
    const fetchResult = await supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .single() as {
        data: {
          id: string;
          name: string;
          source_type: string;
          reliability_rating: string | null;
          [key: string]: unknown;
        } | null;
        error: unknown;
      };
    const { data: source, error: fetchError } = fetchResult;

    if (fetchError || !source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    // Get record count for audit log
    const { count: recordCount } = await supabase
      .from('source_records')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', id);

    // Delete source (cascade will delete source_records and topic_source_links)
    const { error: deleteError } = await supabase
      .from('sources')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting source:', deleteError);
      throw deleteError;
    }

    // Audit log: source deleted
    await auditService.logSourceDeleted(id, {
      name: source.name,
      source_type: source.source_type,
      reliability_rating: source.reliability_rating,
      record_count: recordCount || 0,
    });

    res.json({
      success: true,
      message: 'Source deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({
      error: 'Failed to delete source',
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

