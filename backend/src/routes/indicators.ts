import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * Helper function to check if error is due to missing table
 */
function isTableMissingError(error: any): boolean {
  return error?.code === '42P01' || 
         error?.message?.includes('does not exist') ||
         error?.message?.includes('relation "indicators" does not exist');
}

/**
 * Helper function to handle table missing errors
 */
function handleTableError(res: Response, error: any): boolean {
  if (isTableMissingError(error)) {
    res.status(500).json({
      error: 'Database migration required',
      message: 'The indicators table does not exist. Please run the migration: supabase/migrations/20250108000002_indicators.sql',
      details: error.message,
    });
    return true;
  }
  return false;
}

/**
 * GET /api/indicators
 * List all indicators with optional filtering
 * Query params: organization_id (required), domain?, is_triggered?
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, domain, is_triggered } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // @ts-ignore - Supabase type inference issue with new indicators table
    let query = supabase
      .from('indicators')
      .select('*')
      .eq('organization_id', organization_id as string);

    // Apply filters
    if (domain) {
      query = query.eq('domain', domain as string);
    }
    if (is_triggered !== undefined) {
      query = query.eq('is_triggered', is_triggered === 'true');
    }

    query = query.order('created_at', { ascending: false });

    const { data: indicators, error } = await query;

    if (error) {
      if (handleTableError(res, error)) return;
      throw error;
    }

    res.json({
      success: true,
      indicators: indicators || [],
    });
  } catch (error) {
    console.error('Error fetching indicators:', error);
    res.status(500).json({
      error: 'Failed to fetch indicators',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/indicators/:id
 * Get a single indicator by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // @ts-ignore - Supabase type inference issue with new indicators table
    const { data: indicator, error } = await supabase
      .from('indicators')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (handleTableError(res, error)) return;
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Indicator not found' });
      }
      throw error;
    }

    if (!indicator) {
      return res.status(404).json({ error: 'Indicator not found' });
    }

    res.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error fetching indicator:', error);
    res.status(500).json({
      error: 'Failed to fetch indicator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/indicators
 * Create a new indicator
 * Body: { organization_id, domain, name, description?, source_url?, check_frequency?, action_on_trigger? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      organization_id, 
      domain, 
      name, 
      description, 
      source_url, 
      check_frequency,
      action_on_trigger 
    } = req.body;

    if (!organization_id || !domain || !name) {
      return res.status(400).json({ 
        error: 'organization_id, domain, and name are required' 
      });
    }

    // @ts-ignore - Supabase type inference issue with new indicators table
    const { data: indicator, error } = await supabase
      .from('indicators')
      .insert({
        organization_id,
        domain,
        name,
        description: description || null,
        source_url: source_url || null,
        check_frequency: check_frequency || 'weekly',
        action_on_trigger: action_on_trigger || null,
        is_triggered: false,
      } as any)
      .select()
      .single();

    if (error) {
      if (handleTableError(res, error)) return;
      throw error;
    }

    res.status(201).json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error creating indicator:', error);
    res.status(500).json({
      error: 'Failed to create indicator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/indicators/:id
 * Update an indicator
 * Body: { name?, domain?, description?, source_url?, check_frequency?, action_on_trigger? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      domain, 
      description, 
      source_url, 
      check_frequency, 
      action_on_trigger 
    } = req.body;

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (domain !== undefined) updates.domain = domain;
    if (description !== undefined) updates.description = description;
    if (source_url !== undefined) updates.source_url = source_url;
    if (check_frequency !== undefined) updates.check_frequency = check_frequency;
    if (action_on_trigger !== undefined) updates.action_on_trigger = action_on_trigger;

    const { data: indicator, error } = await supabase
      .from('indicators')
      // @ts-ignore - Supabase type inference issue with new indicators table
      .update(updates as any)
      .eq('id', id)
      .select()
      .single() as any;

    if (error) {
      if (handleTableError(res, error)) return;
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Indicator not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error updating indicator:', error);
    res.status(500).json({
      error: 'Failed to update indicator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/indicators/:id
 * Delete an indicator
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // @ts-ignore - Supabase type inference issue with new indicators table
    const { error } = await supabase
      .from('indicators')
      .delete()
      .eq('id', id);

    if (error) {
      if (handleTableError(res, error)) return;
      throw error;
    }

    res.json({
      success: true,
      message: 'Indicator deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting indicator:', error);
    res.status(500).json({
      error: 'Failed to delete indicator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/indicators/:id/check
 * Mark indicator as checked (updates last_checked_at)
 */
router.post('/:id/check', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: indicator, error } = await supabase
      .from('indicators')
      // @ts-ignore - Supabase type inference issue with new indicators table
      .update({ 
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', id)
      .select()
      .single() as any;

    if (error) {
      if (handleTableError(res, error)) return;
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Indicator not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error checking indicator:', error);
    res.status(500).json({
      error: 'Failed to check indicator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/indicators/:id/trigger
 * Trigger an indicator and optionally create a topic
 * Body: { topic_name?, topic_description?, topic_keywords? }
 */
router.post('/:id/trigger', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { topic_name, topic_description, topic_keywords } = req.body;

    // Call the database function to trigger the indicator
    // @ts-ignore - Supabase type inference issue with new RPC functions
    const { data: topicId, error } = await supabase
      .rpc('trigger_indicator', {
        p_indicator_id: id,
        p_topic_name: topic_name || null,
        p_topic_description: topic_description || null,
        p_topic_keywords: topic_keywords || [],
      } as any);

    if (error) {
      if (handleTableError(res, error)) return;
      throw error;
    }

    // Fetch the updated indicator
    // @ts-ignore - Supabase type inference issue with new indicators table
    const { data: indicator, error: fetchError } = await supabase
      .from('indicators')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // If a topic was created, fetch it too
    let topic = null;
    if (topicId) {
      const { data: topicData, error: topicError } = await supabase
        .from('osint_topics')
        .select('*')
        .eq('id', topicId)
        .single();

      if (topicError) throw topicError;
      topic = topicData;
    }

    res.json({
      success: true,
      indicator,
      topic,
    });
  } catch (error) {
    console.error('Error triggering indicator:', error);
    res.status(500).json({
      error: 'Failed to trigger indicator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/indicators/:id/reset
 * Reset a triggered indicator back to active monitoring
 */
router.post('/:id/reset', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Call the database function to reset the indicator
    // @ts-ignore - Supabase type inference issue with new RPC functions
    const { error } = await supabase
      .rpc('reset_indicator', {
        p_indicator_id: id,
      } as any);

    if (error) {
      if (handleTableError(res, error)) return;
      throw error;
    }

    // Fetch the updated indicator
    // @ts-ignore - Supabase type inference issue with new indicators table
    const { data: indicator, error: fetchError } = await supabase
      .from('indicators')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    res.json({
      success: true,
      indicator,
    });
  } catch (error) {
    console.error('Error resetting indicator:', error);
    res.status(500).json({
      error: 'Failed to reset indicator',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/indicators/due-for-check/:organizationId
 * Get indicators that are due for checking based on their frequency
 */
router.get('/due-for-check/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    // @ts-ignore - Supabase type inference issue with new RPC functions
    const { data: indicators, error } = await supabase
      .rpc('get_indicators_due_for_check', {
        p_organization_id: organizationId,
      } as any);

    if (error) {
      if (handleTableError(res, error)) return;
      throw error;
    }

    res.json({
      success: true,
      indicators: indicators || [],
    });
  } catch (error) {
    console.error('Error fetching due indicators:', error);
    res.status(500).json({
      error: 'Failed to fetch due indicators',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/indicators/triggered/:organizationId
 * Get all triggered indicators for an organization
 */
router.get('/triggered/:organizationId', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    // @ts-ignore - Supabase type inference issue with new indicators table
    const { data: indicators, error } = await supabase
      .from('indicators')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_triggered', true)
      .order('triggered_at', { ascending: false });

    if (error) {
      if (handleTableError(res, error)) return;
      throw error;
    }

    res.json({
      success: true,
      indicators: indicators || [],
    });
  } catch (error) {
    console.error('Error fetching triggered indicators:', error);
    res.status(500).json({
      error: 'Failed to fetch triggered indicators',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

