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
          reliability_rating
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
      // Use PostgreSQL full-text search
      query = query.textSearch('title', search as string, {
        type: 'websearch',
        config: 'english',
      });
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
          notes
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


