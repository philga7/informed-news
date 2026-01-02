/**
 * Audit Logs API Routes
 * 
 * Endpoints for querying audit history and entity trails.
 * Provides comprehensive visibility into all analyst actions.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * GET /api/audit-logs
 * Query audit logs with filters
 * Query params:
 *   - entity_type (optional) - filter by entity type
 *   - entity_id (optional) - filter by entity ID
 *   - action (optional) - filter by action type
 *   - user_id (optional) - filter by user
 *   - start_date (optional) - filter by timestamp >= start_date
 *   - end_date (optional) - filter by timestamp <= end_date
 *   - limit (optional, default: 50)
 *   - offset (optional, default: 0)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      entity_type,
      entity_id,
      action,
      user_id,
      start_date,
      end_date,
      limit = '50',
      offset = '0',
    } = req.query;

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false });

    // Apply filters
    if (entity_type) {
      query = query.eq('entity_type', entity_type as string);
    }

    if (entity_id) {
      query = query.eq('entity_id', entity_id as string);
    }

    if (action) {
      query = query.eq('action', action as string);
    }

    if (user_id) {
      query = query.eq('user_id', user_id as string);
    }

    if (start_date) {
      query = query.gte('timestamp', start_date as string);
    }

    if (end_date) {
      query = query.lte('timestamp', end_date as string);
    }

    // Pagination
    query = query.range(
      parseInt(offset as string),
      parseInt(offset as string) + parseInt(limit as string) - 1
    );

    const { data: logs, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      logs: logs || [],
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      error: 'Failed to fetch audit logs',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/audit-logs/topics/:id/history
 * Convenience endpoint for topic audit trail
 */
router.get('/topics/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const { data: logs, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('entity_type', 'topic')
      .eq('entity_id', id)
      .order('timestamp', { ascending: false })
      .range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

    if (error) throw error;

    res.json({
      success: true,
      entity_type: 'topic',
      entity_id: id,
      logs: logs || [],
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error fetching topic history:', error);
    res.status(500).json({
      error: 'Failed to fetch topic history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/audit-logs/source-records/:id/history
 * Convenience endpoint for source record audit trail
 */
router.get('/source-records/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const { data: logs, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('entity_type', 'source_record')
      .eq('entity_id', id)
      .order('timestamp', { ascending: false })
      .range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

    if (error) throw error;

    res.json({
      success: true,
      entity_type: 'source_record',
      entity_id: id,
      logs: logs || [],
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error fetching source record history:', error);
    res.status(500).json({
      error: 'Failed to fetch source record history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/audit-logs/links/:id/history
 * Get audit trail for a specific topic-source link
 */
router.get('/links/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const { data: logs, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('entity_type', 'link')
      .eq('entity_id', id)
      .order('timestamp', { ascending: false })
      .range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

    if (error) throw error;

    res.json({
      success: true,
      entity_type: 'link',
      entity_id: id,
      logs: logs || [],
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error fetching link history:', error);
    res.status(500).json({
      error: 'Failed to fetch link history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/audit-logs/sources/:id/history
 * Get audit trail for a specific source
 */
router.get('/sources/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    const { data: logs, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('entity_type', 'source')
      .eq('entity_id', id)
      .order('timestamp', { ascending: false })
      .range(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string) - 1
      );

    if (error) throw error;

    res.json({
      success: true,
      entity_type: 'source',
      entity_id: id,
      logs: logs || [],
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error fetching source history:', error);
    res.status(500).json({
      error: 'Failed to fetch source history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

