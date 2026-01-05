import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * POST /api/scan-sessions
 * Create a new scan session
 * Body: { organization_id, user_id, notes? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, user_id, notes } = req.body;

    if (!organization_id || !user_id) {
      return res.status(400).json({ 
        error: 'organization_id and user_id are required' 
      });
    }

    const { data: session, error } = await supabase
      .from('scan_sessions')
      .insert({
        organization_id,
        user_id,
        started_at: new Date().toISOString(),
        notes: notes || null,
        items_reviewed: 0,
        items_linked_to_topics: 0,
        items_created_watch: 0,
        items_dismissed: 0,
      } as any)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Error creating scan session:', error);
    res.status(500).json({
      error: 'Failed to create scan session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/scan-sessions/:id
 * Update a scan session (typically to end it or update counters)
 * Body: { ended_at?, items_reviewed?, items_linked_to_topics?, items_created_watch?, items_dismissed?, notes? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      ended_at, 
      items_reviewed, 
      items_linked_to_topics, 
      items_created_watch, 
      items_dismissed,
      notes 
    } = req.body;

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (ended_at !== undefined) updates.ended_at = ended_at;
    if (items_reviewed !== undefined) updates.items_reviewed = items_reviewed;
    if (items_linked_to_topics !== undefined) updates.items_linked_to_topics = items_linked_to_topics;
    if (items_created_watch !== undefined) updates.items_created_watch = items_created_watch;
    if (items_dismissed !== undefined) updates.items_dismissed = items_dismissed;
    if (notes !== undefined) updates.notes = notes;

    const { data: session, error } = await supabase
      .from('scan_sessions')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Scan session not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Error updating scan session:', error);
    res.status(500).json({
      error: 'Failed to update scan session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scan-sessions/:id
 * Get a single scan session by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: session, error } = await supabase
      .from('scan_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Scan session not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Error fetching scan session:', error);
    res.status(500).json({
      error: 'Failed to fetch scan session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scan-sessions
 * Get scan sessions for an organization
 * Query params: organization_id (required), limit? (default 10)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, limit = '10' } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    const { data: sessions, error } = await supabase
      // @ts-ignore - Supabase type inference issue with RPC functions
      .rpc('get_recent_scan_sessions', {
        p_organization_id: organization_id as string,
        p_limit: parseInt(limit as string, 10),
      } as any);

    if (error) throw error;

    res.json({
      success: true,
      sessions: sessions || [],
    });
  } catch (error) {
    console.error('Error fetching scan sessions:', error);
    res.status(500).json({
      error: 'Failed to fetch scan sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/scan-sessions/stats/:organizationId
 * Get scan session statistics for an organization
 * Query params: days? (default 30)
 */
router.get('/stats/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { days = '30' } = req.query;

    const result = await supabase
      // @ts-ignore - Supabase type inference issue with RPC functions
      .rpc('get_scan_session_stats', {
        p_organization_id: organizationId,
        p_days: parseInt(days as string, 10),
      } as any) as {
        data: Array<{
          total_sessions: number;
          total_items_reviewed: number;
          total_linked: number;
          total_watch_items: number;
          total_dismissed: number;
          avg_items_per_session: number;
          avg_session_duration_minutes: number;
        }> | null;
        error: unknown;
      };

    const { data, error } = result;

    if (error) throw error;

    // Extract single row from result
    const stats = data && Array.isArray(data) && data.length > 0 ? data[0] : {
      total_sessions: 0,
      total_items_reviewed: 0,
      total_linked: 0,
      total_watch_items: 0,
      total_dismissed: 0,
      avg_items_per_session: 0,
      avg_session_duration_minutes: 0,
    };

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching scan session stats:', error);
    res.status(500).json({
      error: 'Failed to fetch scan session stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/scan-sessions/:id
 * Delete a scan session
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('scan_sessions')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Scan session deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting scan session:', error);
    res.status(500).json({
      error: 'Failed to delete scan session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

