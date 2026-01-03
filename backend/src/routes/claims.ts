import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

/**
 * GET /api/claims
 * Get all claims for a topic with evidence counts and corroboration status
 * Query params: topic_id (required)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { topic_id } = req.query;

    if (!topic_id) {
      return res.status(400).json({ error: 'topic_id is required' });
    }

    // Fetch claims with evidence
    const { data: claims, error } = await supabase
      .from('claims')
      .select(`
        *,
        claim_evidence (
          id,
          link_id,
          supports,
          evidence_excerpt,
          analyst_notes,
          created_by_user_id,
          created_at,
          updated_at,
          topic_source_links!inner (
            id,
            source_record_id,
            source_records (
              id,
              title,
              sources (
                id,
                name
              )
            )
          )
        )
      `)
      .eq('topic_id', topic_id as string)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform claims with corroboration status
    const transformedClaims = claims?.map((claim: any) => {
      const evidence = claim.claim_evidence || [];
      
      const supporting = evidence.filter((e: any) => e.supports === true).length;
      const contradicting = evidence.filter((e: any) => e.supports === false).length;
      const neutral = evidence.filter((e: any) => e.supports === null).length;
      const total = evidence.length;

      let corroborationStatus: string;
      if (total === 0) {
        corroborationStatus = 'no_evidence';
      } else if (contradicting > 0) {
        corroborationStatus = 'disputed';
      } else if (supporting >= 2) {
        corroborationStatus = 'corroborated';
      } else if (supporting === 1) {
        corroborationStatus = 'single_source';
      } else {
        corroborationStatus = 'needs_review';
      }

      return {
        id: claim.id,
        topic_id: claim.topic_id,
        claim_text: claim.claim_text,
        claim_type: claim.claim_type,
        is_falsifiable: claim.is_falsifiable,
        created_by_user_id: claim.created_by_user_id,
        created_at: claim.created_at,
        updated_at: claim.updated_at,
        evidence: evidence.map((e: any) => ({
          id: e.id,
          claim_id: claim.id,
          link_id: e.link_id,
          supports: e.supports,
          evidence_excerpt: e.evidence_excerpt,
          analyst_notes: e.analyst_notes,
          created_by_user_id: e.created_by_user_id,
          created_at: e.created_at,
          updated_at: e.updated_at,
          link: {
            id: e.topic_source_links.id,
            source_record_id: e.topic_source_links.source_record_id,
            source_records: e.topic_source_links.source_records,
          },
        })),
        corroboration_status: corroborationStatus,
        evidence_counts: {
          total,
          supporting,
          contradicting,
          neutral,
        },
      };
    });

    res.json({
      success: true,
      claims: transformedClaims || [],
    });
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({
      error: 'Failed to fetch claims',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/claims
 * Create a new claim
 * Body: { topic_id, claim_text, claim_type?, is_falsifiable?, created_by_user_id? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      topic_id,
      claim_text,
      claim_type,
      is_falsifiable,
      created_by_user_id,
    } = req.body;

    if (!topic_id || !claim_text) {
      return res.status(400).json({ error: 'topic_id and claim_text are required' });
    }

    // Validate claim_type if provided
    if (claim_type && !['factual', 'assessment', 'prediction'].includes(claim_type)) {
      return res.status(400).json({
        error: 'Invalid claim_type. Must be factual, assessment, or prediction',
      });
    }

    const { data: claim, error } = await supabase
      .from('claims')
      .insert({
        topic_id,
        claim_text,
        claim_type: claim_type || null,
        is_falsifiable: is_falsifiable !== undefined ? is_falsifiable : true,
        created_by_user_id: created_by_user_id || null,
      } as any)
      .select()
      .single();

    if (error) throw error;

    if (!claim) {
      return res.status(500).json({ error: 'Failed to create claim' });
    }

    res.status(201).json({
      success: true,
      claim,
    });
  } catch (error) {
    console.error('Error creating claim:', error);
    res.status(500).json({
      error: 'Failed to create claim',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/claims/:id
 * Update a claim
 * Body: { claim_text?, claim_type?, is_falsifiable? }
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { claim_text, claim_type, is_falsifiable } = req.body;

    // Validate claim_type if provided
    if (claim_type && !['factual', 'assessment', 'prediction'].includes(claim_type)) {
      return res.status(400).json({
        error: 'Invalid claim_type. Must be factual, assessment, or prediction',
      });
    }

    const updates: any = {};
    if (claim_text !== undefined) updates.claim_text = claim_text;
    if (claim_type !== undefined) updates.claim_type = claim_type;
    if (is_falsifiable !== undefined) updates.is_falsifiable = is_falsifiable;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data: claim, error } = await supabase
      .from('claims')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Claim not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      claim,
    });
  } catch (error) {
    console.error('Error updating claim:', error);
    res.status(500).json({
      error: 'Failed to update claim',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/claims/:id
 * Delete a claim (cascades to evidence)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('claims')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Claim deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting claim:', error);
    res.status(500).json({
      error: 'Failed to delete claim',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/claims/:claimId/evidence
 * Add evidence for a claim
 * Body: { link_id, supports?, evidence_excerpt?, analyst_notes?, created_by_user_id? }
 */
router.post('/:claimId/evidence', async (req: Request, res: Response) => {
  try {
    const { claimId } = req.params;
    const {
      link_id,
      supports,
      evidence_excerpt,
      analyst_notes,
      created_by_user_id,
    } = req.body;

    if (!link_id) {
      return res.status(400).json({ error: 'link_id is required' });
    }

    const { data: evidence, error } = await supabase
      .from('claim_evidence')
      .insert({
        claim_id: claimId,
        link_id,
        supports: supports !== undefined ? supports : null,
        evidence_excerpt: evidence_excerpt || null,
        analyst_notes: analyst_notes || null,
        created_by_user_id: created_by_user_id || null,
      } as any)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Evidence for this link already exists for this claim',
        });
      }
      throw error;
    }

    if (!evidence) {
      return res.status(500).json({ error: 'Failed to create evidence' });
    }

    res.status(201).json({
      success: true,
      evidence,
    });
  } catch (error) {
    console.error('Error creating evidence:', error);
    res.status(500).json({
      error: 'Failed to create evidence',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/claims/:claimId/evidence/:evidenceId
 * Update claim evidence
 * Body: { supports?, evidence_excerpt?, analyst_notes? }
 */
router.patch('/:claimId/evidence/:evidenceId', async (req: Request, res: Response) => {
  try {
    const { claimId, evidenceId } = req.params;
    const { supports, evidence_excerpt, analyst_notes } = req.body;

    const updates: any = {};
    if (supports !== undefined) updates.supports = supports;
    if (evidence_excerpt !== undefined) updates.evidence_excerpt = evidence_excerpt;
    if (analyst_notes !== undefined) updates.analyst_notes = analyst_notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data: evidence, error } = await supabase
      .from('claim_evidence')
      .update(updates)
      .eq('id', evidenceId)
      .eq('claim_id', claimId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Evidence not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      evidence,
    });
  } catch (error) {
    console.error('Error updating evidence:', error);
    res.status(500).json({
      error: 'Failed to update evidence',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/claims/:claimId/evidence/:evidenceId
 * Delete claim evidence
 */
router.delete('/:claimId/evidence/:evidenceId', async (req: Request, res: Response) => {
  try {
    const { claimId, evidenceId } = req.params;

    const { error } = await supabase
      .from('claim_evidence')
      .delete()
      .eq('id', evidenceId)
      .eq('claim_id', claimId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Evidence deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting evidence:', error);
    res.status(500).json({
      error: 'Failed to delete evidence',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/claims/topic/:topicId/matrix
 * Get corroboration matrix for a topic
 */
router.get('/topic/:topicId/matrix', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;

    // Fetch all claims for topic
    const { data: claims, error: claimsError } = await supabase
      .from('claims')
      .select('id, claim_text, claim_type')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false });

    if (claimsError) throw claimsError;

    // Fetch all links for topic
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select(`
        id,
        source_record_id,
        source_records (
          id,
          sources (
            id,
            name
          )
        )
      `)
      .eq('topic_id', topicId);

    if (linksError) throw linksError;

    // Fetch all evidence for this topic's claims
    const claimIds = claims?.map((c: any) => c.id) || [];
    let evidenceData: any[] = [];
    
    if (claimIds.length > 0) {
      const { data: evidence, error: evidenceError } = await supabase
        .from('claim_evidence')
        .select('*')
        .in('claim_id', claimIds);

      if (evidenceError) throw evidenceError;
      evidenceData = evidence || [];
    }

    // Build matrix
    const matrix: any[] = [];
    claims?.forEach((claim: any) => {
      links?.forEach((link: any) => {
        const evidence = evidenceData.find(
          (e: any) => e.claim_id === claim.id && e.link_id === link.id
        );

        matrix.push({
          claim_id: claim.id,
          link_id: link.id,
          source_record_id: link.source_record_id,
          source_name: link.source_records?.sources?.name || 'Unknown',
          supports: evidence ? evidence.supports : null,
          evidence_excerpt: evidence ? evidence.evidence_excerpt : null,
        });
      });
    });

    // Transform sources for UI
    const sources = links?.map((link: any) => ({
      link_id: link.id,
      source_record_id: link.source_record_id,
      source_name: link.source_records?.sources?.name || 'Unknown',
    })) || [];

    res.json({
      success: true,
      matrix: {
        topic_id: topicId,
        claims: claims || [],
        sources,
        matrix,
      },
    });
  } catch (error) {
    console.error('Error fetching corroboration matrix:', error);
    res.status(500).json({
      error: 'Failed to fetch corroboration matrix',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

