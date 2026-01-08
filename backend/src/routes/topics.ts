import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import { auditService } from '../services/auditService.js';

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

    // Transform data to include counts and Phase 1 + Phase 2 fields
    const topicsWithCounts = topics?.map((topic: any) => ({
      id: topic.id,
      organization_id: topic.organization_id,
      name: topic.name,
      description: topic.description,
      keywords: topic.keywords,
      related_topics: topic.related_topics,
      status: topic.status,
      // Phase 1: Question-driven fields
      decision_question: topic.decision_question,
      decision_context: topic.decision_context,
      key_indicators: topic.key_indicators,
      resolution_criteria: topic.resolution_criteria,
      // Phase 2: Resolution metadata
      resolution_summary: topic.resolution_summary,
      resolution_confidence: topic.resolution_confidence,
      lessons_learned: topic.lessons_learned,
      resolved_at: topic.resolved_at,
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
 * Body: { organization_id, name, description?, keywords?, related_topics?, decision_question?, decision_context?, key_indicators?, resolution_criteria? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      organization_id, 
      name, 
      description, 
      keywords, 
      related_topics,
      decision_question,
      decision_context,
      key_indicators,
      resolution_criteria,
    } = req.body;

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
        decision_question: decision_question || null,
        decision_context: decision_context || null,
        key_indicators: key_indicators || [],
        resolution_criteria: resolution_criteria || null,
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

    if (!topic) {
      return res.status(500).json({ error: 'Failed to create topic' });
    }

    // Audit log: topic created
    await auditService.logTopicCreated((topic as any).id, topic as any);

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

    // Fetch topic with linked records and collection plan
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
          review_status,
          linked_by_user_id,
          linked_at,
          source_record_id,
          source_records (
            id,
            title,
            url,
            content,
            published_at,
            ingested_at,
            language,
            source_id,
            media_type,
            sources (
              id,
              name,
              source_type,
              reliability_rating
            )
          )
        ),
        collection_plans (
          id,
          topic_id,
          source_types_needed,
          claims_to_verify,
          coverage_gaps,
          sources_to_avoid,
          notes,
          created_at,
          updated_at
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

    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Check artifact review status for each linked source record
    const topicData = topic as any;
    const links = topicData.topic_source_links || [];
    const recordIds = links.map((link: any) => link.source_record_id).filter(Boolean);

    // Fetch all artifacts for these source records
    let artifactsByRecord = new Map<string, { total: number; reviewed: number }>();
    if (recordIds.length > 0) {
      const { data: allArtifacts, error: artifactsError } = await supabase
        .from('analytic_artifacts')
        .select('source_record_id, reviewed')
        .in('source_record_id', recordIds);

      if (!artifactsError && allArtifacts) {
        // Group by source_record_id and count reviewed vs total
        allArtifacts.forEach((artifact: any) => {
          const recordId = artifact.source_record_id;
          if (!artifactsByRecord.has(recordId)) {
            artifactsByRecord.set(recordId, { total: 0, reviewed: 0 });
          }
          const counts = artifactsByRecord.get(recordId)!;
          counts.total++;
          if (artifact.reviewed) {
            counts.reviewed++;
          }
        });
      }
    }

    // Add artifact review status to each link
    const linksWithArtifactStatus = links.map((link: any) => {
      const recordId = link.source_record_id;
      const artifactStatus = artifactsByRecord.get(recordId);
      // Only consider "all reviewed" if there ARE artifacts AND they're all reviewed
      // If no artifacts exist, we should NOT auto-promote (analysis hasn't happened yet)
      const allArtifactsReviewed = artifactStatus
        ? artifactStatus.total > 0 && artifactStatus.reviewed === artifactStatus.total
        : false; // Changed: If no artifacts, DON'T consider it "all reviewed"

      return {
        ...link,
        artifactReviewStatus: artifactStatus
          ? {
              total: artifactStatus.total,
              reviewed: artifactStatus.reviewed,
              allReviewed: allArtifactsReviewed,
            }
          : {
              total: 0,
              reviewed: 0,
              allReviewed: true, // No artifacts means nothing to review
            },
      };
    });

    // If all artifacts are reviewed (or there are no artifacts), ensure the link's review_status is not left as 'pending'.
    // This handles the case where a record is linked AFTER artifacts were reviewed (no artifact events fire to update links).
    try {
      const linksNeedingPromotion = linksWithArtifactStatus
        .filter((l: any) => (l.review_status === 'pending') && (l.artifactReviewStatus?.allReviewed === true))
        .map((l: any) => l.id)
        .filter(Boolean);

      if (linksNeedingPromotion.length > 0) {
        const { error: promoteError } = await supabase
          .from('topic_source_links')
          // @ts-ignore - Supabase type inference issue
          .update({ review_status: 'reviewed' })
          .in('id', linksNeedingPromotion)
          .eq('review_status', 'pending');

        if (promoteError) {
          console.error('[topics] Error promoting link review_status based on artifact review state:', promoteError);
        } else {
          // Update response payload to reflect the promotion immediately
          linksWithArtifactStatus.forEach((l: any) => {
            if (linksNeedingPromotion.includes(l.id)) {
              l.review_status = 'reviewed';
            }
          });
        }
      }
    } catch (e) {
      console.error('[topics] Unexpected error promoting link review_status:', e);
    }

    // Extract collection_plan from array (should be 0 or 1)
    const topicWithPlan: any = {
      ...topicData,
      topic_source_links: linksWithArtifactStatus,
      collection_plan: topicData.collection_plans?.[0] || null,
    };
    delete topicWithPlan.collection_plans;

    res.json({
      success: true,
      topic: topicWithPlan,
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
 * PATCH /api/topics/:topicId/links/:linkId
 * Update a topic-source link metadata
 * Body: { relevance_score?, confidence_level?, assumptions?, analyst_notes? }
 * 
 * NOTE: This route must be defined BEFORE /:id to avoid route conflicts
 */
router.patch('/:topicId/links/:linkId', async (req: Request, res: Response) => {
  try {
    const { topicId, linkId } = req.params;
    const {
      relevance_score,
      confidence_level,
      assumptions,
      analyst_notes,
      review_status,
    } = req.body;

    // Validate confidence_level if provided
    if (confidence_level && !['HIGH', 'MEDIUM', 'LOW'].includes(confidence_level)) {
      return res.status(400).json({
        error: 'Invalid confidence_level. Must be HIGH, MEDIUM, or LOW',
      });
    }

    // Validate review_status if provided
    if (review_status && !['pending', 'reviewed', 'disputed'].includes(review_status)) {
      return res.status(400).json({
        error: 'Invalid review_status. Must be pending, reviewed, or disputed',
      });
    }

    // Fetch current state for audit
    console.log(`[PATCH /topics/:topicId/links/:linkId] Looking for link:`, { topicId, linkId });
    const { data: beforeLink, error: fetchError } = await supabase
      .from('topic_source_links')
      .select('*')
      .eq('id', linkId)
      .eq('topic_id', topicId)
      .single();

    if (fetchError) {
      console.error(`[PATCH /topics/:topicId/links/:linkId] Error fetching link:`, fetchError);
      // Check if link exists with just the ID (without topic_id check)
      const { data: linkById, error: linkByIdError } = await supabase
        .from('topic_source_links')
        .select('id, topic_id')
        .eq('id', linkId)
        .single();
      
      if (linkById && !linkByIdError) {
        const linkData = linkById as { id: string; topic_id: string };
        console.log(`[PATCH /topics/:topicId/links/:linkId] Link exists but topic_id mismatch:`, {
          requestedTopicId: topicId,
          actualTopicId: linkData.topic_id,
        });
        return res.status(404).json({ 
          error: 'Link not found',
          details: `Link exists but belongs to a different topic (expected: ${topicId}, actual: ${linkData.topic_id})`
        });
      }
      
      return res.status(404).json({ error: 'Link not found' });
    }

    if (!beforeLink) {
      console.error(`[PATCH /topics/:topicId/links/:linkId] Link not found (no data returned)`);
      return res.status(404).json({ error: 'Link not found' });
    }
    
    console.log(`[PATCH /topics/:topicId/links/:linkId] Link found, proceeding with update`);

    const updates: any = {};
    if (relevance_score !== undefined) updates.relevance_score = relevance_score;
    if (confidence_level !== undefined) updates.confidence_level = confidence_level;
    if (assumptions !== undefined) updates.assumptions = assumptions;
    if (analyst_notes !== undefined) updates.analyst_notes = analyst_notes;
    if (review_status !== undefined) updates.review_status = review_status;

    const { data: updatedLink, error: updateError } = await supabase
      .from('topic_source_links')
      // @ts-ignore - Supabase type inference issue
      .update(updates)
      .eq('id', linkId)
      .eq('topic_id', topicId)
      .select()
      .single();

    if (updateError) throw updateError;
    if (!updatedLink) {
      return res.status(500).json({ error: 'Failed to update link' });
    }

    // Audit log: link updated
    await auditService.logLinkUpdated(
      (updatedLink as any).id,
      beforeLink as any,
      updatedLink as any
    );

    res.json({
      success: true,
      link: updatedLink,
    });
  } catch (error) {
    console.error('Error updating link:', error);
    res.status(500).json({
      error: 'Failed to update link',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/topics/:id
 * Update topic metadata
 * Body: { name?, description?, keywords?, related_topics?, status?, decision_question?, decision_context?, key_indicators?, resolution_criteria?, resolutionSummary?, resolutionConfidence?, lessonsLearned? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      keywords, 
      related_topics, 
      status,
      decision_question,
      decision_context,
      key_indicators,
      resolution_criteria,
      resolutionSummary,
      resolutionConfidence,
      lessonsLearned,
    } = req.body;

    // Fetch current state for audit
    const { data: beforeTopic, error: fetchError } = await supabase
      .from('osint_topics')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !beforeTopic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Type assertion: after the null check, beforeTopic is guaranteed to exist
    const currentTopic = beforeTopic as any;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (keywords !== undefined) updates.keywords = keywords;
    if (related_topics !== undefined) updates.related_topics = related_topics;
    if (status !== undefined) updates.status = status;
    if (decision_question !== undefined) updates.decision_question = decision_question;
    if (decision_context !== undefined) updates.decision_context = decision_context;
    if (key_indicators !== undefined) updates.key_indicators = key_indicators;
    if (resolution_criteria !== undefined) updates.resolution_criteria = resolution_criteria;
    
    // Phase 2: Resolution metadata
    if (resolutionSummary !== undefined) updates.resolution_summary = resolutionSummary;
    if (resolutionConfidence !== undefined) updates.resolution_confidence = resolutionConfidence;
    if (lessonsLearned !== undefined) updates.lessons_learned = lessonsLearned;
    
    // If marking as resolved, set resolved_at timestamp
    if (status === 'resolved' && !currentTopic.resolved_at) {
      updates.resolved_at = new Date().toISOString();
    }
    
    // If changing from resolved to another status, clear resolved_at
    if (status && status !== 'resolved' && currentTopic.status === 'resolved') {
      updates.resolved_at = null;
    }

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

    // Audit log: topic updated
    await auditService.logTopicUpdated(id, currentTopic, topic);

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

    // Fetch topic before deletion for audit
    const { data: topic, error: fetchError } = await supabase
      .from('osint_topics')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const { error } = await supabase
      .from('osint_topics')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Audit log: topic deleted
    await auditService.logTopicDeleted(id, topic);

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

    // Check if source record was already reviewed in scan view
    const { data: sourceRecord, error: sourceRecordError } = await supabase
      .from('source_records')
      .select('scan_status, reviewed_at')
      .eq('id', source_record_id)
      .single();

    if (sourceRecordError) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Determine initial review_status:
    // - If source record scan_status is 'reviewed' → mark link as reviewed (explicit scan review)
    // - Else, if the record HAS artifacts AND all artifacts are reviewed → mark as reviewed (analysis complete)
    // - Otherwise leave undefined (DB default 'pending')
    // NOTE: We do NOT auto-mark as reviewed if there are no artifacts - that means analysis hasn't happened yet!
    let reviewStatus: 'reviewed' | undefined = undefined;
    const sourceRecordData = sourceRecord as { scan_status: string; reviewed_at: string | null } | null;
    if (sourceRecordData?.scan_status === 'reviewed') {
      // Explicit review in scan view - mark link as reviewed
      reviewStatus = 'reviewed';
      console.log(`[topics] Auto-marking link as reviewed: source_record ${source_record_id} has scan_status='reviewed'`);
    } else {
      // Check artifacts - only auto-review if artifacts exist AND are all reviewed
      try {
        const { data: artifacts, error: artifactsError } = await supabase
          .from('analytic_artifacts')
          .select('reviewed')
          .eq('source_record_id', source_record_id);
        
        if (!artifactsError && artifacts && artifacts.length > 0) {
          const allReviewed = artifacts.every((a: any) => a.reviewed === true);
          if (allReviewed) {
            reviewStatus = 'reviewed';
            console.log(`[topics] Auto-marking link as reviewed: source_record ${source_record_id} has ${artifacts.length} artifacts, all reviewed`);
          } else {
            console.log(`[topics] Not auto-reviewing link: source_record ${source_record_id} has ${artifacts.length} artifacts, but ${artifacts.filter((a: any) => !a.reviewed).length} are not reviewed`);
          }
        } else {
          // No artifacts - don't auto-review (analysis hasn't happened yet)
          console.log(`[topics] Not auto-reviewing link: source_record ${source_record_id} has no artifacts yet`);
        }
      } catch (e) {
        console.warn('[topics] Unable to inspect artifacts for initial link review status:', e);
      }
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
        review_status: reviewStatus, // Seed initial review status based on scan_status/artifact state (else DB default)
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

    if (!link) {
      return res.status(500).json({ error: 'Failed to create link' });
    }

    // Audit log: link added
    await auditService.logLinkAdded(
      (link as any).id,
      topicId,
      source_record_id,
      link as any,
      linked_by_user_id
    );

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

    // Fetch link before deletion for audit
    const { data: link, error: fetchError } = await supabase
      .from('topic_source_links')
      .select('*')
      .eq('id', linkId)
      .eq('topic_id', topicId)
      .single();

    if (fetchError || !link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const { error } = await supabase
      .from('topic_source_links')
      .delete()
      .eq('id', linkId)
      .eq('topic_id', topicId);

    if (error) throw error;

    // Audit log: link removed
    await auditService.logLinkRemoved(linkId, link);

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
 * GET /api/topics/:id/validate-links
 * Validate all links for a topic and identify broken ones (orphaned links)
 * Returns links where source_record_id doesn't exist in source_records
 */
router.get('/:id/validate-links', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch all links for this topic
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select('*')
      .eq('topic_id', id)
      .order('linked_at', { ascending: false }); // Order by linked_at to see newest first

    if (linksError) throw linksError;

    console.log(`[validate-links] Found ${links?.length || 0} links for topic ${id}`);
    if (links && links.length > 0) {
      console.log(`[validate-links] Link IDs and source_record_ids:`, links.map((l: any) => ({ link_id: l.id, source_record_id: l.source_record_id, linked_at: l.linked_at })));
    }

    if (!links || links.length === 0) {
      return res.json({
        success: true,
        brokenLinks: [],
        archivedLinks: [],
        validLinks: 0,
        totalLinks: 0,
      });
    }

    // Check each link to see if source record exists
    const brokenLinks: any[] = [];
    const archivedLinks: any[] = [];
    const recordIds = links.map((link: any) => link.source_record_id);
    console.log(`[validate-links] Checking ${recordIds.length} unique source_record_ids:`, recordIds);

    // Check if records exist in source_records
    const { data: existingRecords, error: recordsError } = await supabase
      .from('source_records')
      .select('id')
      .in('id', recordIds);

    if (recordsError) throw recordsError;

    const existingRecordIds = new Set((existingRecords || []).map((r: any) => r.id));

    // Check archived records for the missing ones
    const missingRecordIds = recordIds.filter((id: string) => !existingRecordIds.has(id));
    let archivedRecordIds = new Set<string>();

    if (missingRecordIds.length > 0) {
      const { data: archivedRecords, error: archivedError } = await supabase
        .from('archived_source_records')
        .select('id, title, url, archived_at, archive_reason')
        .in('id', missingRecordIds);

      if (archivedError) {
        console.error('[validate-links] Error checking archived_source_records:', archivedError);
        // Don't throw - continue with validation
      } else if (archivedRecords) {
        archivedRecordIds = new Set(archivedRecords.map((r: any) => r.id));
      }
    }

    // Categorize links
    links.forEach((link: any) => {
      if (!existingRecordIds.has(link.source_record_id)) {
        if (archivedRecordIds.has(link.source_record_id)) {
          // Link points to archived record
          archivedLinks.push({
            ...link,
            archived: true,
          });
        } else {
          // Link is orphaned (record doesn't exist anywhere)
          brokenLinks.push({
            ...link,
            archived: false,
          });
        }
      }
    });

    console.log(`[validate-links] Validation complete: ${brokenLinks.length} broken, ${archivedLinks.length} archived, ${links.length - brokenLinks.length - archivedLinks.length} valid out of ${links.length} total`);

    res.json({
      success: true,
      brokenLinks, // Orphaned links (record doesn't exist)
      archivedLinks, // Links pointing to archived records
      validLinks: links.length - brokenLinks.length - archivedLinks.length,
      totalLinks: links.length,
    });
  } catch (error) {
    console.error('Error validating links:', error);
    res.status(500).json({
      error: 'Failed to validate links',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/topics/:id/cleanup-links
 * Clean up orphaned links (links where source_record_id doesn't exist)
 * Optionally include archived links in cleanup
 * Body: { includeArchived?: boolean }
 */
router.post('/:id/cleanup-links', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { includeArchived = false } = req.body;

    // Fetch all links for this topic
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select('*')
      .eq('topic_id', id);

    if (linksError) throw linksError;

    if (!links || links.length === 0) {
      return res.json({
        success: true,
        deleted: 0,
        message: 'No links to clean up',
      });
    }

    const recordIds = links.map((link: any) => link.source_record_id);

    // Check if records exist in source_records
    const { data: existingRecords, error: recordsError } = await supabase
      .from('source_records')
      .select('id')
      .in('id', recordIds);

    if (recordsError) throw recordsError;

    const existingRecordIds = new Set((existingRecords || []).map((r: any) => r.id));

    // Determine which links to delete
    const linksToDelete: string[] = [];
    let archivedRecordIds = new Set<string>();

    if (includeArchived) {
      // Check archived records too
      const missingRecordIds = recordIds.filter((id: string) => !existingRecordIds.has(id));
      if (missingRecordIds.length > 0) {
        const { data: archivedRecords, error: archivedError } = await supabase
          .from('archived_source_records')
          .select('id')
          .in('id', missingRecordIds);

        if (!archivedError && archivedRecords) {
          archivedRecordIds = new Set(archivedRecords.map((r: any) => r.id));
        }
      }
    }

    links.forEach((link: any) => {
      if (!existingRecordIds.has(link.source_record_id)) {
        // If includeArchived is false, only delete truly orphaned links
        // If includeArchived is true, delete both orphaned and archived links
        if (!includeArchived && archivedRecordIds.has(link.source_record_id)) {
          // Skip archived links if includeArchived is false
          return;
        }
        linksToDelete.push(link.id);
      }
    });

    if (linksToDelete.length === 0) {
      return res.json({
        success: true,
        deleted: 0,
        message: 'No orphaned links to clean up',
      });
    }

    // Delete orphaned links
    for (const linkId of linksToDelete) {
      const link = links.find((l: any) => l.id === linkId);
      if (link) {
        // Audit log before deletion
        await auditService.logLinkRemoved(linkId, link);
      }
    }

    const { error: deleteError } = await supabase
      .from('topic_source_links')
      .delete()
      .in('id', linksToDelete);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      deleted: linksToDelete.length,
      message: `Cleaned up ${linksToDelete.length} orphaned link(s)`,
    });
  } catch (error) {
    console.error('Error cleaning up links:', error);
    res.status(500).json({
      error: 'Failed to clean up links',
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
      .single() as any;

    if (topicError) throw topicError;
    if (!topic || !topic.organization_id) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    const organizationId = topic.organization_id;

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
      .eq('organization_id', organizationId)
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

    if (!links || links.length === 0) {
      return res.json({
        success: true,
        topic_id: id,
        buckets: [],
      });
    }

    const sourceRecordIds = links.map((link: any) => link.source_records.id);

    // Fetch reviewed key facts artifacts for these source records
    const { data: keyFactsArtifacts, error: artifactsError } = await supabase
      .from('analytic_artifacts')
      .select(`
        id,
        source_record_id,
        payload,
        created_at,
        source_records!inner (
          id,
          published_at,
          ingested_at
        )
      `)
      .eq('type', 'key_facts')
      .eq('reviewed', true)
      .in('source_record_id', sourceRecordIds);

    if (artifactsError) {
      console.error('Error fetching key facts artifacts:', artifactsError);
      // Fall back to title-based extraction if artifacts fetch fails
    }

    // Extract non-claim facts (events, quotes, statistics) from reviewed key facts
    const factRecords: Array<{
      fact: string;
      category: 'event' | 'quote' | 'statistic';
      date: string;
    }> = [];

    if (keyFactsArtifacts && keyFactsArtifacts.length > 0) {
      keyFactsArtifacts.forEach((artifact: any) => {
        const payload = artifact.payload as { facts?: Array<{ fact: string; category?: 'event' | 'quote' | 'statistic' | 'claim' }> };
        if (!payload.facts) return;

        // Extract only non-claim facts (events, quotes, statistics)
        const nonClaimFacts = payload.facts.filter(
          f => f.category && ['event', 'quote', 'statistic'].includes(f.category) && f.fact
        );

        const recordDate = artifact.source_records.published_at || artifact.source_records.ingested_at || artifact.created_at;

        nonClaimFacts.forEach((fact: any) => {
          factRecords.push({
            fact: fact.fact.trim(),
            category: fact.category as 'event' | 'quote' | 'statistic',
            date: recordDate,
          });
        });
      });
    }

    // Fall back to title-based extraction if no key facts available
    const records: Array<{ title: string; date: string }> = [];
    if (factRecords.length === 0) {
      links.forEach((link: any) => {
        records.push({
          title: link.source_records.title,
          date: link.source_records.published_at || link.source_records.ingested_at,
        });
      });
    }

    // Filter by date range and group by time bucket
    const bucketMap = new Map<string, { facts: string[]; recordCount: number }>();

    // Use key facts if available, otherwise fall back to titles
    if (factRecords.length > 0) {
      factRecords.forEach((record: any) => {
        const recordDate = new Date(record.date);
        if (start_date && recordDate < new Date(start_date as string)) return;
        if (end_date && recordDate > new Date(end_date as string)) return;

        let bucketKey: string;
        if (bucket === 'day') {
          bucketKey = recordDate.toISOString().split('T')[0];
        } else if (bucket === 'week') {
          const startOfWeek = new Date(recordDate);
          startOfWeek.setDate(recordDate.getDate() - recordDate.getDay());
          bucketKey = startOfWeek.toISOString().split('T')[0];
        } else {
          bucketKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-01`;
        }

        if (!bucketMap.has(bucketKey)) {
          bucketMap.set(bucketKey, { facts: [], recordCount: 0 });
        }
        const bucketData = bucketMap.get(bucketKey)!;
        bucketData.facts.push(record.fact);
        // Count unique source records per bucket (would need to track this separately)
        bucketData.recordCount = Math.max(bucketData.recordCount, 1); // Simplified: at least 1 record per fact
      });
    } else {
      // Fall back to title-based extraction
      records.forEach((record: any) => {
        const recordDate = new Date(record.date);
        if (start_date && recordDate < new Date(start_date as string)) return;
        if (end_date && recordDate > new Date(end_date as string)) return;

        let bucketKey: string;
        if (bucket === 'day') {
          bucketKey = recordDate.toISOString().split('T')[0];
        } else if (bucket === 'week') {
          const startOfWeek = new Date(recordDate);
          startOfWeek.setDate(recordDate.getDate() - recordDate.getDay());
          bucketKey = startOfWeek.toISOString().split('T')[0];
        } else {
          bucketKey = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}-01`;
        }

        if (!bucketMap.has(bucketKey)) {
          bucketMap.set(bucketKey, { facts: [], recordCount: 0 });
        }
        const bucketData = bucketMap.get(bucketKey)!;
        // For title-based, extract phrases
        const phrases = extractKeyPhrases([record.title]);
        bucketData.facts.push(...phrases);
        bucketData.recordCount += 1;
      });
    }

    // Count unique source records per bucket
    // For key facts, count unique source_record_ids
    const recordCountMap = new Map<string, Set<string>>();
    if (factRecords.length > 0 && keyFactsArtifacts) {
      keyFactsArtifacts.forEach((artifact: any) => {
        const recordDate = artifact.source_records.published_at || artifact.source_records.ingested_at || artifact.created_at;
        const recordDateObj = new Date(recordDate);
        
        let bucketKey: string;
        if (bucket === 'day') {
          bucketKey = recordDateObj.toISOString().split('T')[0];
        } else if (bucket === 'week') {
          const startOfWeek = new Date(recordDateObj);
          startOfWeek.setDate(recordDateObj.getDate() - recordDateObj.getDay());
          bucketKey = startOfWeek.toISOString().split('T')[0];
        } else {
          bucketKey = `${recordDateObj.getFullYear()}-${String(recordDateObj.getMonth() + 1).padStart(2, '0')}-01`;
        }

        if (!recordCountMap.has(bucketKey)) {
          recordCountMap.set(bucketKey, new Set());
        }
        recordCountMap.get(bucketKey)!.add(artifact.source_record_id);
      });
    }

    // Build buckets with deduplicated facts/phrases
    const buckets = Array.from(bucketMap.entries())
      .map(([date, data]) => {
        // Deduplicate facts/phrases and get top ones
        const phraseFreq = new Map<string, number>();
        data.facts.forEach(fact => {
          phraseFreq.set(fact, (phraseFreq.get(fact) || 0) + 1);
        });

        // Sort by frequency and take top 5
        const topPhrases = Array.from(phraseFreq.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([phrase]) => phrase);

        // Get accurate record count
        const recordCount = recordCountMap.has(date) 
          ? recordCountMap.get(date)!.size 
          : data.recordCount;

        return {
          date,
          record_count: recordCount,
          key_phrases: topPhrases,
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

/**
 * POST /api/topics/:id/collection-plan
 * Create or update collection plan for a topic
 * Body: { source_types_needed?, claims_to_verify?, coverage_gaps?, sources_to_avoid?, notes? }
 */
router.post('/:id/collection-plan', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      source_types_needed,
      claims_to_verify,
      coverage_gaps,
      sources_to_avoid,
      notes,
    } = req.body;

    // Verify topic exists
    const { data: topic, error: topicError } = await supabase
      .from('osint_topics')
      .select('id')
      .eq('id', id)
      .single();

    if (topicError || !topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Check if collection plan already exists
    const { data: existingPlan } = await supabase
      .from('collection_plans')
      .select('*')
      .eq('topic_id', id)
      .single();

    let collectionPlan;

    if (existingPlan) {
      // Update existing plan
      const updateData: {
        source_types_needed?: string[];
        claims_to_verify?: string[];
        coverage_gaps?: string[];
        sources_to_avoid?: string[];
        notes?: string | null;
      } = {
        source_types_needed: source_types_needed || [],
        claims_to_verify: claims_to_verify || [],
        coverage_gaps: coverage_gaps || [],
        sources_to_avoid: sources_to_avoid || [],
        notes: notes || null,
      };
      
      const { data, error } = await supabase
        .from('collection_plans')
        // @ts-ignore - Supabase type inference issue in serverless environment
        .update(updateData as any)
        .eq('topic_id', id)
        .select()
        .single();

      if (error) throw error;
      collectionPlan = data;
    } else {
      // Create new plan
      const insertData: {
        topic_id: string;
        source_types_needed: string[];
        claims_to_verify: string[];
        coverage_gaps: string[];
        sources_to_avoid: string[];
        notes: string | null;
      } = {
        topic_id: id,
        source_types_needed: source_types_needed || [],
        claims_to_verify: claims_to_verify || [],
        coverage_gaps: coverage_gaps || [],
        sources_to_avoid: sources_to_avoid || [],
        notes: notes || null,
      };
      
      const { data, error } = await supabase
        .from('collection_plans')
        // @ts-ignore - Supabase type inference issue in serverless environment
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      collectionPlan = data;
    }

    res.json({
      success: true,
      collection_plan: collectionPlan,
    });
  } catch (error) {
    console.error('Error saving collection plan:', error);
    res.status(500).json({
      error: 'Failed to save collection plan',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/topics/:id/collection-plan
 * Get collection plan for a topic
 */
router.get('/:id/collection-plan', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: collectionPlan, error } = await supabase
      .from('collection_plans')
      .select('*')
      .eq('topic_id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Collection plan not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      collection_plan: collectionPlan,
    });
  } catch (error) {
    console.error('Error fetching collection plan:', error);
    res.status(500).json({
      error: 'Failed to fetch collection plan',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;


