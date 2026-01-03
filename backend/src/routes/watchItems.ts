import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * GET /api/watch-items
 * List all watch items with signal counts
 * Query params: organization_id (required), category?, status?
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, category, status } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    let query = supabase
      .from('watch_items')
      .select(`
        *,
        watch_item_records (
          id
        )
      `)
      .eq('organization_id', organization_id as string);

    // Apply filters
    if (category) {
      query = query.eq('category', category as string);
    }
    if (status) {
      query = query.eq('status', status as string);
    }

    query = query.order('last_reviewed_at', { ascending: false });

    const { data: watchItems, error } = await query;

    if (error) throw error;

    // Transform data to include signal counts
    const watchItemsWithSignals = watchItems?.map((item: any) => ({
      id: item.id,
      organization_id: item.organization_id,
      title: item.title,
      category: item.category,
      notes: item.notes,
      indicator_triggers: item.indicator_triggers,
      status: item.status,
      escalated_topic_id: item.escalated_topic_id,
      first_noted_at: item.first_noted_at,
      last_reviewed_at: item.last_reviewed_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
      signal_count: item.watch_item_records?.length || 0,
    }));

    res.json({
      success: true,
      watch_items: watchItemsWithSignals || [],
    });
  } catch (error) {
    console.error('Error fetching watch items:', error);
    res.status(500).json({
      error: 'Failed to fetch watch items',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/watch-items/:id
 * Get a single watch item by ID with signal count
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: watchItem, error } = await supabase
      .from('watch_items')
      .select(`
        *,
        watch_item_records (
          id
        )
      `)
      .eq('id', id)
      .single() as any;

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Watch item not found' });
      }
      throw error;
    }

    if (!watchItem) {
      return res.status(404).json({ error: 'Watch item not found' });
    }

    const watchItemTyped = watchItem as any;
    const watchItemWithSignals = {
      id: watchItemTyped.id,
      organization_id: watchItemTyped.organization_id,
      title: watchItemTyped.title,
      category: watchItemTyped.category,
      notes: watchItemTyped.notes,
      indicator_triggers: watchItemTyped.indicator_triggers,
      status: watchItemTyped.status,
      escalated_topic_id: watchItemTyped.escalated_topic_id,
      first_noted_at: watchItemTyped.first_noted_at,
      last_reviewed_at: watchItemTyped.last_reviewed_at,
      created_at: watchItemTyped.created_at,
      updated_at: watchItemTyped.updated_at,
      signal_count: watchItemTyped.watch_item_records?.length || 0,
    };

    res.json({
      success: true,
      watch_item: watchItemWithSignals,
    });
  } catch (error) {
    console.error('Error fetching watch item:', error);
    res.status(500).json({
      error: 'Failed to fetch watch item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/watch-items
 * Create a new watch item
 * Body: { organization_id, title, category, notes?, indicator_triggers? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, title, category, notes, indicator_triggers } = req.body;

    if (!organization_id || !title || !category) {
      return res.status(400).json({ 
        error: 'organization_id, title, and category are required' 
      });
    }

    const { data: watchItem, error } = await supabase
      .from('watch_items')
      .insert({
        organization_id,
        title,
        category,
        notes: notes || null,
        indicator_triggers: indicator_triggers || [],
        status: 'watching',
      } as any)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      watch_item: watchItem,
    });
  } catch (error) {
    console.error('Error creating watch item:', error);
    res.status(500).json({
      error: 'Failed to create watch item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/watch-items/:id
 * Update a watch item
 * Body: { title?, category?, notes?, indicator_triggers?, status?, last_reviewed_at? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, category, notes, indicator_triggers, status, last_reviewed_at } = req.body;

    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;
    if (notes !== undefined) updates.notes = notes;
    if (indicator_triggers !== undefined) updates.indicator_triggers = indicator_triggers;
    if (status !== undefined) updates.status = status;
    if (last_reviewed_at !== undefined) updates.last_reviewed_at = last_reviewed_at;

    const { data: watchItem, error } = await supabase
      .from('watch_items')
      // @ts-ignore - Supabase type inference issue with new tables
      .update(updates as any)
      .eq('id', id)
      .select()
      .single() as any;

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Watch item not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      watch_item: watchItem,
    });
  } catch (error) {
    console.error('Error updating watch item:', error);
    res.status(500).json({
      error: 'Failed to update watch item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/watch-items/:id
 * Delete a watch item
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('watch_items')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Watch item deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting watch item:', error);
    res.status(500).json({
      error: 'Failed to delete watch item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/watch-items/:id/records
 * Link a source record to a watch item
 * Body: { source_record_id }
 */
router.post('/:id/records', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { source_record_id } = req.body;

    if (!source_record_id) {
      return res.status(400).json({ error: 'source_record_id is required' });
    }

    const { data: link, error } = await supabase
      .from('watch_item_records')
      .insert({
        watch_item_id: id,
        source_record_id,
      } as any)
      .select()
      .single();

    if (error) {
      // Handle duplicate key error
      if (error.code === '23505') {
        return res.status(409).json({ 
          error: 'This source record is already linked to this watch item' 
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      link,
    });
  } catch (error) {
    console.error('Error linking source record:', error);
    res.status(500).json({
      error: 'Failed to link source record',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/watch-items/:id/records/:recordId
 * Unlink a source record from a watch item
 */
router.delete('/:id/records/:recordId', async (req: Request, res: Response) => {
  try {
    const { id, recordId } = req.params;

    const { error } = await supabase
      .from('watch_item_records')
      .delete()
      .eq('watch_item_id', id)
      .eq('source_record_id', recordId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Source record unlinked successfully',
    });
  } catch (error) {
    console.error('Error unlinking source record:', error);
    res.status(500).json({
      error: 'Failed to unlink source record',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/watch-items/:id/records
 * Get all linked source records for a watch item
 */
router.get('/:id/records', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: records, error } = await supabase
      .from('watch_item_records')
      .select(`
        *,
        source_records (
          *,
          sources (
            id,
            name,
            source_type
          )
        )
      `)
      .eq('watch_item_id', id)
      .order('linked_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      records: records || [],
    });
  } catch (error) {
    console.error('Error fetching linked records:', error);
    res.status(500).json({
      error: 'Failed to fetch linked records',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/watch-items/:id/signal-count
 * Get signal count (number of linked records) for a watch item
 */
router.get('/:id/signal-count', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      // @ts-ignore - Supabase type inference issue with new RPC functions
      .rpc('get_watch_item_signal_count', { p_watch_item_id: id } as any);

    if (error) throw error;

    res.json({
      success: true,
      signal_count: data || 0,
    });
  } catch (error) {
    console.error('Error fetching signal count:', error);
    res.status(500).json({
      error: 'Failed to fetch signal count',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/watch-items/:id/escalate
 * Escalate a watch item to a full topic
 * Body: { topic_name, topic_description?, topic_keywords?, decision_question?, decision_context?, key_indicators? }
 */
router.post('/:id/escalate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      topic_name, 
      topic_description, 
      topic_keywords,
      decision_question,
      decision_context,
      key_indicators,
    } = req.body;

    if (!topic_name) {
      return res.status(400).json({ error: 'topic_name is required' });
    }

    // Call the database function to escalate
    const { data: topicId, error } = await supabase
      // @ts-ignore - Supabase type inference issue with new RPC functions
      .rpc('escalate_watch_item_to_topic', {
        p_watch_item_id: id,
        p_topic_name: topic_name,
        p_topic_description: topic_description || null,
        p_topic_keywords: topic_keywords || [],
      } as any);

    if (error) throw error;

    // Fetch the created topic
    const { data: topic, error: fetchError } = await supabase
      .from('osint_topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (fetchError) throw fetchError;

    // Update topic with intelligence requirement fields if provided
    if (decision_question || decision_context || key_indicators) {
      const updates: any = {};
      if (decision_question) updates.decision_question = decision_question;
      if (decision_context) updates.decision_context = decision_context;
      if (key_indicators) updates.key_indicators = key_indicators;

      const { data: updatedTopic, error: updateError } = await supabase
        .from('osint_topics')
        // @ts-ignore - Supabase type inference issue
        .update(updates as any)
        .eq('id', topicId)
        .select()
        .single() as any;

      if (updateError) throw updateError;

      res.status(201).json({
        success: true,
        topic: updatedTopic,
      });
    } else {
      res.status(201).json({
        success: true,
        topic,
      });
    }
  } catch (error) {
    console.error('Error escalating watch item:', error);
    res.status(500).json({
      error: 'Failed to escalate watch item',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

