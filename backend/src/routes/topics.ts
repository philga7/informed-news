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
      } as any)
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
 * GET /api/topics/:id/timeline
 * Get temporal analysis data for a topic
 * Query params: bucket (day|week|month), start_date?, end_date?
 * NOTE: This route MUST come before GET /api/topics/:id to avoid route collision
 */
router.get('/:id/timeline', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bucket = 'day', start_date, end_date } = req.query;

    // Validate bucket parameter
    if (!['day', 'week', 'month'].includes(bucket as string)) {
      return res.status(400).json({ error: 'Invalid bucket parameter. Must be day, week, or month' });
    }

    // Build the date truncation SQL based on bucket
    const dateTrunc = bucket === 'day' ? 'day' : bucket === 'week' ? 'week' : 'month';

    // Build date range filter
    let dateFilter = '';
    if (start_date) {
      dateFilter += ` AND COALESCE(sr.published_at, sr.ingested_at) >= '${start_date}'`;
    }
    if (end_date) {
      dateFilter += ` AND COALESCE(sr.published_at, sr.ingested_at) <= '${end_date}'`;
    }

    // Query for timeline aggregation
    // @ts-ignore - Supabase type inference issue in serverless environment
    const { data: timelineData, error: timelineError } = await supabase.rpc('get_topic_timeline', {
      p_topic_id: id,
      p_bucket: dateTrunc,
      p_start_date: start_date || null,
      p_end_date: end_date || null,
    } as any);

    // If RPC function doesn't exist, fall back to manual query
    // PGRST202 = PostgREST function not found, 42883 = PostgreSQL function not found
    if (timelineError && (timelineError.code === 'PGRST202' || timelineError.code === '42883')) {
      // Manual aggregation query
      const { data: links, error: linksError } = await supabase
        .from('topic_source_links')
        .select(`
          id,
          source_records!inner (
            published_at,
            ingested_at
          )
        `)
        .eq('topic_id', id);

      if (linksError) throw linksError;

      // Process data in JavaScript
      const records = links?.map((link: any) => ({
        date: link.source_records.published_at || link.source_records.ingested_at,
      })) || [];

      // Filter by date range
      const filteredRecords = records.filter((record: any) => {
        const recordDate = new Date(record.date);
        if (start_date && recordDate < new Date(start_date as string)) return false;
        if (end_date && recordDate > new Date(end_date as string)) return false;
        return true;
      });

      // Group by bucket
      const grouped = new Map<string, number>();
      filteredRecords.forEach((record: any) => {
        const date = new Date(record.date);
        let bucketKey: string;
        
        if (bucket === 'day') {
          bucketKey = date.toISOString().split('T')[0];
        } else if (bucket === 'week') {
          const startOfWeek = new Date(date);
          startOfWeek.setDate(date.getDate() - date.getDay());
          bucketKey = startOfWeek.toISOString().split('T')[0];
        } else {
          bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
        }

        grouped.set(bucketKey, (grouped.get(bucketKey) || 0) + 1);
      });

      const timeline = Array.from(grouped.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate first mention
      const sortedDates = filteredRecords
        .map((r: any) => new Date(r.date))
        .sort((a, b) => a.getTime() - b.getTime());
      const firstMention = sortedDates.length > 0 ? sortedDates[0].toISOString() : null;

      // Calculate velocity (last 7 days vs previous 7 days)
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 7);
      const fourteenDaysAgo = new Date(now);
      fourteenDaysAgo.setDate(now.getDate() - 14);

      const last7Days = filteredRecords.filter((r: any) => {
        const date = new Date(r.date);
        return date >= sevenDaysAgo && date <= now;
      }).length;

      const previous7Days = filteredRecords.filter((r: any) => {
        const date = new Date(r.date);
        return date >= fourteenDaysAgo && date < sevenDaysAgo;
      }).length;

      return res.json({
        success: true,
        topic_id: id,
        timeline,
        first_mention: firstMention,
        total_records: filteredRecords.length,
        velocity: {
          last_7_days: last7Days,
          previous_7_days: previous7Days,
        },
      });
    }

    if (timelineError) throw timelineError;

    res.json({
      success: true,
      ...(timelineData as any),
    });
  } catch (error) {
    console.error('Error fetching topic timeline:', error);
    res.status(500).json({
      error: 'Failed to fetch topic timeline',
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
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update(updates as any)
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
      } as any)
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
 * PATCH /api/topics/:topicId/links/:linkId
 * Update a topic-source link metadata
 * Body: { relevance_score?, confidence_level?, assumptions?, analyst_notes? }
 */
router.patch('/:topicId/links/:linkId', async (req: Request, res: Response) => {
  try {
    const { topicId, linkId } = req.params;
    const {
      relevance_score,
      confidence_level,
      assumptions,
      analyst_notes,
    } = req.body;

    // Validate confidence_level if provided
    if (confidence_level && !['HIGH', 'MEDIUM', 'LOW'].includes(confidence_level)) {
      return res.status(400).json({
        error: 'Invalid confidence_level. Must be HIGH, MEDIUM, or LOW',
      });
    }

    const updates: any = {};
    if (relevance_score !== undefined) updates.relevance_score = relevance_score;
    if (confidence_level !== undefined) updates.confidence_level = confidence_level;
    if (assumptions !== undefined) updates.assumptions = assumptions;
    if (analyst_notes !== undefined) updates.analyst_notes = analyst_notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data: link, error } = await supabase
      .from('topic_source_links')
      // @ts-ignore - Supabase type inference issue in serverless environment
      .update(updates as any)
      .eq('id', linkId)
      .eq('topic_id', topicId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Link not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      link,
    });
  } catch (error) {
    console.error('Error updating topic-source link:', error);
    res.status(500).json({
      error: 'Failed to update link',
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

/**
 * GET /api/topics/:id/related
 * Get related topics based on shared source records (co-occurrence analysis)
 */
router.get('/:id/related', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch all source record IDs linked to this topic
    const { data: thisTopicLinks, error: linksError } = await supabase
      .from('topic_source_links')
      .select('source_record_id')
      .eq('topic_id', id);

    if (linksError) throw linksError;

    if (!thisTopicLinks || thisTopicLinks.length === 0) {
      return res.json({
        success: true,
        topic_id: id,
        related_topics: [],
      });
    }

    const thisTopicRecordIds = new Set(
      thisTopicLinks.map((link: any) => link.source_record_id)
    );

    // Fetch the organization_id for this topic
    const { data: topic, error: topicError } = await supabase
      .from('osint_topics')
      .select('organization_id')
      .eq('id', id)
      .single();

    if (topicError) throw topicError;
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Fetch all other topics in the same organization
    const { data: allTopics, error: allTopicsError } = await supabase
      .from('osint_topics')
      .select(`
        id,
        name,
        topic_source_links (
          source_record_id
        )
      `)
      .eq('organization_id', topic.organization_id)
      .neq('id', id);

    if (allTopicsError) throw allTopicsError;

    // Calculate Jaccard similarity for each topic
    const relatedTopics = allTopics
      ?.map((otherTopic: any) => {
        const otherTopicRecordIds = new Set(
          otherTopic.topic_source_links.map((link: any) => link.source_record_id)
        );

        // Calculate intersection
        const intersection = new Set(
          [...thisTopicRecordIds].filter(id => otherTopicRecordIds.has(id))
        );

        // Calculate union
        const union = new Set([...thisTopicRecordIds, ...otherTopicRecordIds]);

        // Jaccard similarity: |A ∩ B| / |A ∪ B|
        const similarityScore = union.size > 0 
          ? intersection.size / union.size 
          : 0;

        return {
          topic_id: otherTopic.id,
          name: otherTopic.name,
          shared_records: intersection.size,
          similarity_score: parseFloat(similarityScore.toFixed(3)),
        };
      })
      .filter((topic: any) => topic.shared_records > 0) // Only include topics with shared records
      .sort((a: any, b: any) => b.similarity_score - a.similarity_score) // Sort by similarity
      || [];

    res.json({
      success: true,
      topic_id: id,
      related_topics: relatedTopics,
    });
  } catch (error) {
    console.error('Error fetching related topics:', error);
    res.status(500).json({
      error: 'Failed to fetch related topics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/topics/:id/narrative-timeline
 * Get narrative evolution timeline with key phrases per time bucket
 */
router.get('/:id/narrative-timeline', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bucket = 'day', start_date, end_date } = req.query;

    // Validate bucket parameter
    if (!['day', 'week', 'month'].includes(bucket as string)) {
      return res.status(400).json({ 
        error: 'Invalid bucket parameter. Must be day, week, or month' 
      });
    }

    // Fetch source records linked to this topic
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select(`
        id,
        source_records!inner (
          id,
          title,
          published_at,
          ingested_at
        )
      `)
      .eq('topic_id', id);

    if (linksError) throw linksError;

    // Extract records
    const records = links?.map((link: any) => ({
      title: link.source_records.title,
      date: link.source_records.published_at || link.source_records.ingested_at,
    })) || [];

    // Filter by date range
    const filteredRecords = records.filter((record: any) => {
      const recordDate = new Date(record.date);
      if (start_date && recordDate < new Date(start_date as string)) return false;
      if (end_date && recordDate > new Date(end_date as string)) return false;
      return true;
    });

    // Group by time bucket
    const bucketMap = new Map<string, any[]>();
    filteredRecords.forEach((record: any) => {
      const date = new Date(record.date);
      let bucketKey: string;

      if (bucket === 'day') {
        bucketKey = date.toISOString().split('T')[0];
      } else if (bucket === 'week') {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        bucketKey = startOfWeek.toISOString().split('T')[0];
      } else {
        bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
      }

      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, []);
      }
      bucketMap.get(bucketKey)!.push(record.title);
    });

    // Extract key phrases for each bucket
    const buckets = Array.from(bucketMap.entries())
      .map(([date, titles]) => {
        // Simple phrase extraction: most common 2-3 word sequences
        const phrases = extractKeyPhrases(titles);
        return {
          date,
          record_count: titles.length,
          key_phrases: phrases.slice(0, 5), // Top 5 phrases
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      topic_id: id,
      buckets,
    });
  } catch (error) {
    console.error('Error fetching narrative timeline:', error);
    res.status(500).json({
      error: 'Failed to fetch narrative timeline',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Helper function to extract key phrases from titles
 */
function extractKeyPhrases(titles: string[]): string[] {
  const phraseCount = new Map<string, number>();

  titles.forEach(title => {
    // Normalize: lowercase, remove punctuation
    const normalized = title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = normalized.split(' ');

    // Extract 2-word and 3-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      // 2-word phrases
      const phrase2 = `${words[i]} ${words[i + 1]}`;
      if (isSignificantPhrase(phrase2)) {
        phraseCount.set(phrase2, (phraseCount.get(phrase2) || 0) + 1);
      }

      // 3-word phrases
      if (i < words.length - 2) {
        const phrase3 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (isSignificantPhrase(phrase3)) {
          phraseCount.set(phrase3, (phraseCount.get(phrase3) || 0) + 1);
        }
      }
    }
  });

  // Filter phrases that appear more than once, and sort by frequency
  return Array.from(phraseCount.entries())
    .filter(([phrase, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase);
}

/**
 * Helper to filter out common stop words and insignificant phrases
 */
function isSignificantPhrase(phrase: string): boolean {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'which', 'who', 'what', 'when',
    'where', 'why', 'how', 'said', 'says', 'new', 'more', 'after', 'about',
  ]);

  const words = phrase.split(' ');
  
  // Filter out phrases starting or ending with stop words
  if (stopWords.has(words[0]) || stopWords.has(words[words.length - 1])) {
    return false;
  }

  // Filter out very short words
  if (words.some(word => word.length < 3)) {
    return false;
  }

  return true;
}

export default router;


