import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * GET /api/source-records
 * List source records with filters
 * Query params:
 *   - organization_id (required)
 *   - source_id (optional)
 *   - linked_status ('linked' | 'unlinked' | 'all') (optional, default: 'all')
 *   - date_from (optional)
 *   - date_to (optional)
 *   - search (optional) - full-text search on title and content
 *   - limit (optional, default: 50)
 *   - offset (optional, default: 0)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      organization_id,
      source_id,
      linked_status,
      date_from,
      date_to,
      search,
      limit = '50',
      offset = '0',
    } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // Start building the query
    let query = supabase
      .from('source_records')
      .select(`
        *,
        sources!inner (
          id,
          organization_id,
          name,
          source_type,
          reliability_rating,
          scrape_external_url
        ),
        topic_source_links (
          id,
          topic_id,
          relevance_score,
          confidence_level,
          osint_topics (
            id,
            name
          )
        )
      `, { count: 'exact' })
      .eq('sources.organization_id', organization_id as string);

    // Apply filters
    if (source_id) {
      query = query.eq('source_id', source_id as string);
    }

    if (date_from) {
      query = query.gte('published_at', date_from as string);
    }

    if (date_to) {
      query = query.lte('published_at', date_to as string);
    }

    // Full-text search
    if (search) {
      // Search in both title and source name using OR logic
      // Step 1: Find sources that match the search term
      const { data: matchingSources, error: sourcesError } = await supabase
        .from('sources')
        .select('id')
        .eq('organization_id', organization_id as string)
        .ilike('name', `%${search}%`);

      const matchingSourceIds = matchingSources?.map((s: any) => s.id) || [];

      // Step 2: Search records where title matches OR source_id is in matching sources
      if (matchingSourceIds.length > 0) {
        // Use OR to match either title OR source_id
        query = query.or(`title.ilike.%${search}%,source_id.in.(${matchingSourceIds.join(',')})`);
      } else {
        // No matching sources, just search title
        query = query.ilike('title', `%${search}%`);
      }
    }

    // Order and pagination
    query = query
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('ingested_at', { ascending: false })
      .range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

    const { data: records, error, count } = await query;

    if (error) throw error;

    // Filter by linked status (post-query since it's complex with joins)
    let filteredRecords = records || [];
    if (linked_status === 'linked') {
      filteredRecords = filteredRecords.filter(
        (record: any) => record.topic_source_links && record.topic_source_links.length > 0
      );
    } else if (linked_status === 'unlinked') {
      filteredRecords = filteredRecords.filter(
        (record: any) => !record.topic_source_links || record.topic_source_links.length === 0
      );
    }

    res.json({
      success: true,
      records: filteredRecords,
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error fetching source records:', error);
    res.status(500).json({
      error: 'Failed to fetch source records',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/source-records/scan
 * Get source records for scan view with domain filtering
 * Query params:
 *   - organization_id (required)
 *   - scan_status (optional, can be array) - 'pending' | 'reviewed' | 'linked' | 'dismissed'
 *   - domain (optional) - watch_item_category
 *   - media_type (optional, can be array) - 'article' | 'video' | 'podcast' | 'audio' | 'other'
 *   - date_from (optional)
 *   - date_to (optional)
 *   - search (optional)
 *   - limit (optional, default: 50)
 *   - offset (optional, default: 0)
 */
router.get('/scan', async (req: Request, res: Response) => {
  try {
    const {
      organization_id,
      scan_status,
      domain,
      media_type,
      date_from,
      date_to,
      search,
      limit = '50',
      offset = '0',
    } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // Build query with domain join
    let query = supabase
      .from('source_records')
      .select(`
        *,
        sources!inner (
          id,
          organization_id,
          name,
          domain,
          source_type,
          reliability_rating,
          scrape_external_url
        ),
        topic_source_links (
          id,
          topic_id,
          osint_topics (
            id,
            name
          )
        )
      `, { count: 'exact' })
      .eq('sources.organization_id', organization_id as string);

    // Apply scan status filter
    if (scan_status) {
      const statuses = Array.isArray(scan_status) ? scan_status : [scan_status];
      query = query.in('scan_status', statuses as string[]);
    }

    // Apply domain filter
    if (domain) {
      query = query.eq('sources.domain', domain as string);
    }

    // Apply media type filter
    if (media_type) {
      const types = Array.isArray(media_type) ? media_type : [media_type];
      query = query.in('media_type', types as string[]);
    }

    // Date filters
    if (date_from) {
      query = query.gte('published_at', date_from as string);
    }
    if (date_to) {
      query = query.lte('published_at', date_to as string);
    }

    // Full-text search
    if (search) {
      query = query.textSearch('title', search as string, {
        type: 'websearch',
        config: 'english',
      });
    }

    // Order by ingested_at (most recent first)
    query = query
      .order('ingested_at', { ascending: false })
      .range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

    const { data: records, error, count } = await query;

    if (error) throw error;

    // Get stats - query all records for this organization
    const { data: statsData } = await supabase
      .from('source_records')
      .select(`
        scan_status,
        sources!inner (
          organization_id
        )
      `)
      .eq('sources.organization_id', organization_id as string);

    const stats = {
      pendingCount: 0,
      reviewedCount: 0,
      linkedCount: 0,
      dismissedCount: 0,
    };

    if (statsData) {
      statsData.forEach((record: any) => {
        switch (record.scan_status) {
          case 'pending':
            stats.pendingCount++;
            break;
          case 'reviewed':
            stats.reviewedCount++;
            break;
          case 'linked':
            stats.linkedCount++;
            break;
          case 'dismissed':
            stats.dismissedCount++;
            break;
        }
      });
    }

    // Transform records to include domain info
    const transformedRecords = (records || []).map((record: any) => ({
      ...record,
      source_domain: record.sources?.domain || null,
      source_name: record.sources?.name || null,
    }));

    res.json({
      success: true,
      records: transformedRecords,
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
      stats,
    });
  } catch (error) {
    console.error('Error fetching scan records:', error);
    res.status(500).json({
      error: 'Failed to fetch scan records',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/source-records/scan/stats/domains
 * Get domain statistics for sidebar filtering
 * Query params: organization_id (required)
 */
router.get('/scan/stats/domains', async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // Get all source records with their source domains for this organization
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('id')
      .eq('organization_id', organization_id as string);

    if (sourcesError) throw sourcesError;

    if (!sources || sources.length === 0) {
      return res.json({
        success: true,
        domainStats: [],
      });
    }

    const sourceIds = (sources || []).map((s: any) => s.id);

    const { data: records, error } = await supabase
      .from('source_records')
      .select(`
        scan_status,
        sources!inner (
          domain
        )
      `)
      .in('source_id', sourceIds);

    if (error) throw error;

    // Aggregate by domain
    const domainMap = new Map<string, { pendingCount: number; totalCount: number }>();

    records?.forEach((record: any) => {
      const domain = record.sources?.domain;
      if (!domain) return; // Skip records without domain
      
      if (!domainMap.has(domain)) {
        domainMap.set(domain, { pendingCount: 0, totalCount: 0 });
      }
      const stats = domainMap.get(domain)!;
      stats.totalCount++;
      if (record.scan_status === 'pending') {
        stats.pendingCount++;
      }
    });

    // Convert to array format
    const domainStats = Array.from(domainMap.entries()).map(([domain, stats]) => ({
      domain,
      pendingCount: stats.pendingCount,
      totalCount: stats.totalCount,
    }));

    res.json({
      success: true,
      domainStats,
    });
  } catch (error) {
    console.error('Error fetching domain stats:', error);
    res.status(500).json({
      error: 'Failed to fetch domain stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/source-records/batch/scan-status
 * Batch update scan status for multiple records
 * Body: { record_ids: string[], scan_status: 'pending' | 'reviewed' | 'linked' | 'dismissed', reviewed_by?: string }
 * NOTE: This route must come BEFORE /:id/scan-status to avoid route matching conflicts
 */
router.patch('/batch/scan-status', async (req: Request, res: Response) => {
  try {
    const { record_ids, scan_status, reviewed_by } = req.body;

    if (!record_ids || !Array.isArray(record_ids) || record_ids.length === 0) {
      return res.status(400).json({ error: 'record_ids array is required' });
    }

    if (!scan_status) {
      return res.status(400).json({ error: 'scan_status is required' });
    }

    const updateData: Record<string, unknown> = {
      scan_status,
      reviewed_at: new Date().toISOString(),
    };

    if (reviewed_by) {
      updateData.reviewed_by = reviewed_by;
    }

    const { data, error } = await supabase
      .from('source_records')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update(updateData as any)
      .in('id', record_ids)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      updated: data?.length || 0,
    });
  } catch (error) {
    console.error('Error batch updating scan status:', error);
    res.status(500).json({
      error: 'Failed to batch update scan status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/source-records/:id/scan-status
 * Update scan status for a single record
 * Body: { scan_status: 'pending' | 'reviewed' | 'linked' | 'dismissed', reviewed_by?: string }
 * NOTE: This route must come AFTER /batch/scan-status to avoid route matching conflicts
 */
router.patch('/:id/scan-status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { scan_status, reviewed_by } = req.body;

    if (!scan_status) {
      return res.status(400).json({ error: 'scan_status is required' });
    }

    const updateData: Record<string, unknown> = {
      scan_status,
      reviewed_at: new Date().toISOString(),
    };

    if (reviewed_by) {
      updateData.reviewed_by = reviewed_by;
    }

    const { data, error } = await supabase
      .from('source_records')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update(updateData as any)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      record: data,
    });
  } catch (error) {
    console.error('Error updating scan status:', error);
    res.status(500).json({
      error: 'Failed to update scan status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/source-records/:id
 * Get source record detail with linked topics
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: record, error } = await supabase
      .from('source_records')
      .select(`
        *,
        sources (
          id,
          organization_id,
          name,
          source_type,
          url,
          reliability_rating,
          notes,
          scrape_external_url
        ),
        topic_source_links (
          id,
          relevance_score,
          confidence_level,
          assumptions,
          analyst_notes,
          linked_by_user_id,
          linked_at,
          osint_topics (
            id,
            name,
            description,
            keywords
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Source record not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      record,
    });
  } catch (error) {
    console.error('Error fetching source record:', error);
    res.status(500).json({
      error: 'Failed to fetch source record',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;


