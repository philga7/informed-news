import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * GET /api/topics
 * List all topics with linked record counts
 * Query params: organization_id (required)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    // Fetch topics with linked record counts
    const { data: topics, error } = await supabase
      .from('osint_topics')
      .select(`
        *,
        topic_source_links (
          id
        )
      `)
      .eq('organization_id', organization_id as string)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Transform data to include counts
    const topicsWithCounts = topics?.map((topic: any) => ({
      id: topic.id,
      organization_id: topic.organization_id,
      name: topic.name,
      description: topic.description,
      keywords: topic.keywords,
      related_topics: topic.related_topics,
      created_at: topic.created_at,
      updated_at: topic.updated_at,
      linked_records_count: topic.topic_source_links?.length || 0,
    }));

    res.json({
      success: true,
      topics: topicsWithCounts || [],
    });
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({
      error: 'Failed to fetch topics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/topics
 * Create a new topic
 * Body: { organization_id, name, description?, keywords?, related_topics? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { organization_id, name, description, keywords, related_topics } = req.body;

    if (!organization_id || !name) {
      return res.status(400).json({ error: 'organization_id and name are required' });
    }

    const { data: topic, error } = await supabase
      .from('osint_topics')
      .insert({
        organization_id,
        name,
        description: description || null,
        keywords: keywords || [],
        related_topics: related_topics || [],
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'A topic with this name already exists in this organization',
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      topic,
    });
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({
      error: 'Failed to create topic',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/topics/:id
 * Get topic detail with linked records
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch topic with linked records
    const { data: topic, error: topicError } = await supabase
      .from('osint_topics')
      .select(`
        *,
        topic_source_links (
          id,
          relevance_score,
          confidence_level,
          assumptions,
          analyst_notes,
          linked_by_user_id,
          linked_at,
          source_records (
            id,
            title,
            url,
            content,
            published_at,
            ingested_at,
            language,
            source_id,
            sources (
              id,
              name,
              source_type,
              reliability_rating
            )
          )
        )
      `)
      .eq('id', id)
      .single();

    if (topicError) {
      if (topicError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Topic not found' });
      }
      throw topicError;
    }

    res.json({
      success: true,
      topic,
    });
  } catch (error) {
    console.error('Error fetching topic:', error);
    res.status(500).json({
      error: 'Failed to fetch topic',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/topics/:id
 * Update topic metadata
 * Body: { name?, description?, keywords?, related_topics? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, keywords, related_topics } = req.body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (keywords !== undefined) updates.keywords = keywords;
    if (related_topics !== undefined) updates.related_topics = related_topics;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data: topic, error } = await supabase
      .from('osint_topics')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Topic not found' });
      }
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'A topic with this name already exists in this organization',
        });
      }
      throw error;
    }

    res.json({
      success: true,
      topic,
    });
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({
      error: 'Failed to update topic',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/topics/:id
 * Delete a topic
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('osint_topics')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Topic deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({
      error: 'Failed to delete topic',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/topics/:id/links
 * Link a source record to a topic
 * Body: { source_record_id, relevance_score?, confidence_level?, assumptions?, analyst_notes?, linked_by_user_id? }
 */
router.post('/:id/links', async (req: Request, res: Response) => {
  try {
    const { id: topicId } = req.params;
    const {
      source_record_id,
      relevance_score,
      confidence_level,
      assumptions,
      analyst_notes,
      linked_by_user_id,
    } = req.body;

    if (!source_record_id) {
      return res.status(400).json({ error: 'source_record_id is required' });
    }

    const { data: link, error } = await supabase
      .from('topic_source_links')
      .insert({
        topic_id: topicId,
        source_record_id,
        relevance_score: relevance_score || null,
        confidence_level: confidence_level || null,
        assumptions: assumptions || null,
        analyst_notes: analyst_notes || null,
        linked_by_user_id: linked_by_user_id || null,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation (already linked)
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'This source record is already linked to this topic',
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
 * DELETE /api/topics/:topicId/links/:linkId
 * Unlink a source record from a topic
 */
router.delete('/:topicId/links/:linkId', async (req: Request, res: Response) => {
  try {
    const { topicId, linkId } = req.params;

    const { error } = await supabase
      .from('topic_source_links')
      .delete()
      .eq('id', linkId)
      .eq('topic_id', topicId);

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

export default router;


