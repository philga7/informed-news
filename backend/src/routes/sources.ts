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

    // Fetch sources with record counts (simpler query first)
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

    if (error) {
      console.error('Error fetching sources:', error);
      throw error;
    }

    // Get all source record IDs to fetch links
    const sourceRecordIds: string[] = [];
    const sourceIdToRecordIds: Record<string, string[]> = {};
    
    (sources || []).forEach((source: any) => {
      const recordIds = (source.source_records || []).map((r: any) => r.id);
      sourceIdToRecordIds[source.id] = recordIds;
      sourceRecordIds.push(...recordIds);
    });

    // Fetch links for all source records in one query
    let linksByRecordId: Record<string, Array<{ created_at: string }>> = {};
    if (sourceRecordIds.length > 0) {
      const { data: linksData, error: linksError } = await supabase
        .from('topic_source_links')
        .select('source_record_id, created_at')
        .in('source_record_id', sourceRecordIds);

      if (!linksError && linksData) {
        linksData.forEach((link: any) => {
          const recordId = link.source_record_id;
          if (!linksByRecordId[recordId]) {
            linksByRecordId[recordId] = [];
          }
          linksByRecordId[recordId].push({ created_at: link.created_at });
        });
      }
    }

    // Transform data to include record counts and hygiene metrics
    const sourcesWithCounts = (sources || []).map((source: any) => {
      const recordIds = sourceIdToRecordIds[source.id] || [];
      const recordCount = recordIds.length;
      
      // Count records that have topic links
      let linkedCount = 0;
      let mostRecentLinkDate: Date | null = null;
      
      recordIds.forEach((recordId: string) => {
        const links = linksByRecordId[recordId] || [];
        if (links.length > 0) {
          linkedCount++;
          
          // Check for most recent link date
          links.forEach((link: any) => {
            if (link && link.created_at) {
              try {
                const linkDate = new Date(link.created_at);
                if (!isNaN(linkDate.getTime())) {
                  if (!mostRecentLinkDate || linkDate > mostRecentLinkDate) {
                    mostRecentLinkDate = linkDate;
                  }
                }
              } catch (e) {
                // Skip invalid dates
              }
            }
          });
        }
      });
      
      // Calculate days since last link
      const daysSinceLastLink = mostRecentLinkDate 
        ? Math.floor((Date.now() - mostRecentLinkDate.getTime()) / (1000 * 60 * 60 * 24))
        : recordCount > 0 ? 999 : 0; // 999 if has records but never linked
      
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
        record_count: recordCount,
        linked_count: linkedCount,
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

    const { data: source, error } = await supabase
      .from('sources')
      .insert(sourceData)
      .select()
      .single();

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
    const { name, url, domain, reliability_rating, notes, value_rating, scrape_external_url } = req.body;

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
    if (domain !== undefined) updates.domain = domain;
    if (reliability_rating !== undefined) updates.reliability_rating = reliability_rating;
    if (notes !== undefined) updates.notes = notes;
    if (value_rating !== undefined) updates.value_rating = value_rating;
    if (scrape_external_url !== undefined) updates.scrape_external_url = scrape_external_url;

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
 * DELETE /api/sources/:id
 * Delete a source and all associated source records (cascade delete)
 * Body: none
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch source before deletion for audit log
    const { data: source, error: fetchError } = await supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .single();

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

