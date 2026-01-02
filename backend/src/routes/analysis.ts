import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import { ollamaService } from '../services/ollamaService.js';

const router = Router();

/**
 * POST /api/analysis/source-records/:id/summarize
 * Generate AI-assisted summary for a source record
 */
router.post('/source-records/:id/summarize', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the source record
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
        title,
        content,
        source_id,
        sources!inner (
          organization_id
        )
      `)
      .eq('id', id)
      .single() as any;

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Prepare content for analysis (title + content with graceful fallback)
    const textToAnalyze = record.content 
      ? `${record.title}\n\n${record.content}`
      : record.title;

    if (!textToAnalyze.trim()) {
      return res.status(400).json({ error: 'No content available to analyze' });
    }

    // Call Ollama service
    const summaryResult = await ollamaService.summarize(textToAnalyze);

    // Store in analytic_artifacts table
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'summary',
        payload: summaryResult as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({
      error: 'Failed to generate summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/analysis/source-records/:id/entities
 * Extract entities (people, orgs, locations) from a source record
 */
router.post('/source-records/:id/entities', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the source record
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
        title,
        content,
        source_id,
        sources!inner (
          organization_id
        )
      `)
      .eq('id', id)
      .single() as any;

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Prepare content for analysis
    const textToAnalyze = record.content 
      ? `${record.title}\n\n${record.content}`
      : record.title;

    if (!textToAnalyze.trim()) {
      return res.status(400).json({ error: 'No content available to analyze' });
    }

    // Call Ollama service
    const entitiesResult = await ollamaService.extractEntities(textToAnalyze);

    // Store in analytic_artifacts table
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'entity_extraction',
        payload: entitiesResult as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error extracting entities:', error);
    res.status(500).json({
      error: 'Failed to extract entities',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/analysis/source-records/:id/tone
 * Analyze tone and potential bias in a source record
 */
router.post('/source-records/:id/tone', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the source record
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
        title,
        content,
        source_id,
        sources!inner (
          organization_id
        )
      `)
      .eq('id', id)
      .single() as any;

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Prepare content for analysis
    const textToAnalyze = record.content 
      ? `${record.title}\n\n${record.content}`
      : record.title;

    if (!textToAnalyze.trim()) {
      return res.status(400).json({ error: 'No content available to analyze' });
    }

    // Call Ollama service
    const toneResult = await ollamaService.analyzeTone(textToAnalyze);

    // Store in analytic_artifacts table
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'tone_analysis',
        payload: toneResult as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error analyzing tone:', error);
    res.status(500).json({
      error: 'Failed to analyze tone',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/analysis/source-records/:id/artifacts
 * Get all AI analysis artifacts for a source record
 */
router.get('/source-records/:id/artifacts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: artifacts, error } = await supabase
      .from('analytic_artifacts')
      .select('*')
      .eq('source_record_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      artifacts: artifacts || [],
    });
  } catch (error) {
    console.error('Error fetching artifacts:', error);
    res.status(500).json({
      error: 'Failed to fetch artifacts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /api/analysis/artifacts/:id
 * Update artifact review status
 */
router.patch('/artifacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reviewed } = req.body;

    if (typeof reviewed !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'reviewed field must be a boolean',
      });
    }

    // @ts-expect-error - Supabase type inference issue in serverless environment
    const { data: artifact, error } = await supabase
      .from('analytic_artifacts')
      .update({ reviewed } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Artifact not found' });
      }
      throw error;
    }

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error updating artifact:', error);
    res.status(500).json({
      error: 'Failed to update artifact',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/analysis/artifacts/:id
 * Delete an artifact (dismiss/archive)
 */
router.delete('/artifacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('analytic_artifacts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Artifact deleted',
    });
  } catch (error) {
    console.error('Error deleting artifact:', error);
    res.status(500).json({
      error: 'Failed to delete artifact',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

