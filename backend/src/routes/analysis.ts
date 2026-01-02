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

    const { data: artifact, error } = await supabase
      .from('analytic_artifacts')
      // @ts-ignore - Supabase type inference issue in serverless environment
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

/**
 * POST /api/analysis/detect-duplicates
 * Detect near-duplicate content across source records
 * Body: { topic_id?: string, organization_id: string }
 */
router.post('/detect-duplicates', async (req: Request, res: Response) => {
  try {
    const { topic_id, organization_id } = req.body;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    let records: any[] = [];

    if (topic_id) {
      // Fetch records linked to specific topic
      const { data: links, error } = await supabase
        .from('topic_source_links')
        .select(`
          id,
          source_records!inner (
            id,
            title,
            content,
            published_at,
            ingested_at,
            sources!inner (
              id,
              name
            )
          )
        `)
        .eq('topic_id', topic_id);

      if (error) throw error;

      records = links?.map((link: any) => ({
        id: link.source_records.id,
        title: link.source_records.title,
        content: link.source_records.content,
        published_at: link.source_records.published_at,
        ingested_at: link.source_records.ingested_at,
        source_name: link.source_records.sources.name,
        source_id: link.source_records.sources.id,
      })) || [];
    } else {
      // Fetch all records for organization (via sources)
      const { data: sources, error: sourcesError } = await supabase
        .from('sources')
        .select('id')
        .eq('organization_id', organization_id);

      if (sourcesError) throw sourcesError;

      const sourceIds = (sources || []).map((s: any) => s.id);

      if (sourceIds.length > 0) {
        const { data: allRecords, error: recordsError } = await supabase
          .from('source_records')
          .select(`
            id,
            title,
            content,
            published_at,
            ingested_at,
            source_id,
            sources!inner (
              id,
              name
            )
          `)
          .in('source_id', sourceIds)
          .order('published_at', { ascending: false })
          .limit(500); // Limit for performance

        if (recordsError) throw recordsError;

        records = allRecords?.map((record: any) => ({
          id: record.id,
          title: record.title,
          content: record.content,
          published_at: record.published_at,
          ingested_at: record.ingested_at,
          source_name: record.sources.name,
          source_id: record.sources.id,
        })) || [];
      }
    }

    // Detect duplicates using text similarity
    const duplicateGroups = detectDuplicates(records);

    res.json({
      success: true,
      duplicate_groups: duplicateGroups,
    });
  } catch (error) {
    console.error('Error detecting duplicates:', error);
    res.status(500).json({
      error: 'Failed to detect duplicates',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/analysis/coordination-assessments
 * Save analyst assessment of potential coordination
 * Body: { duplicate_group_hash, assessment, organization_id, assessed_by_user_id? }
 */
router.post('/coordination-assessments', async (req: Request, res: Response) => {
  try {
    const { duplicate_group_hash, assessment, organization_id, assessed_by_user_id } = req.body;

    if (!duplicate_group_hash || !assessment || !organization_id) {
      return res.status(400).json({
        error: 'duplicate_group_hash, assessment, and organization_id are required',
      });
    }

    // Store as analytic artifact
    const { data: artifact, error } = await supabase
      .from('analytic_artifacts')
      .insert({
        organization_id,
        type: 'coordination_check',
        payload: {
          duplicate_group_hash,
          assessment,
          assessed_at: new Date().toISOString(),
        } as any,
        model_name: 'analyst',
        created_by: assessed_by_user_id || 'analyst',
        reviewed: true, // Analyst assessments are pre-reviewed
      } as any)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error saving coordination assessment:', error);
    res.status(500).json({
      error: 'Failed to save coordination assessment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Helper function to detect duplicate records
 */
function detectDuplicates(records: any[]): any[] {
  const groups: Map<string, any[]> = new Map();
  const processed = new Set<string>();

  records.forEach((record, i) => {
    if (processed.has(record.id)) return;

    const fingerprint1 = createFingerprint(record);
    const group = [record];
    processed.add(record.id);

    // Compare with remaining records
    for (let j = i + 1; j < records.length; j++) {
      const otherRecord = records[j];
      if (processed.has(otherRecord.id)) continue;

      const fingerprint2 = createFingerprint(otherRecord);
      const similarity = calculateSimilarity(fingerprint1, fingerprint2);

      if (similarity >= 0.8) {
        group.push(otherRecord);
        processed.add(otherRecord.id);
      }
    }

    // Only include groups with 2+ records
    if (group.length > 1) {
      const groupHash = createGroupHash(group);
      groups.set(groupHash, group);
    }
  });

  // Convert to output format
  return Array.from(groups.entries()).map(([hash, groupRecords]) => {
    // Check if published within 1 hour (tight window)
    const timestamps = groupRecords
      .map(r => r.published_at || r.ingested_at)
      .filter(t => t)
      .map(t => new Date(t).getTime())
      .sort();

    const tightWindow = timestamps.length > 1 && 
      (timestamps[timestamps.length - 1] - timestamps[0]) <= 3600000; // 1 hour in ms

    return {
      representative_id: groupRecords[0].id,
      group_hash: hash,
      records: groupRecords.map(r => ({
        id: r.id,
        title: r.title,
        source_name: r.source_name,
        source_id: r.source_id,
        published_at: r.published_at || r.ingested_at,
      })),
      similarity: 0.85, // Approximate (could calculate average)
      tight_window: tightWindow,
    };
  });
}

/**
 * Create fingerprint from record (first 200 chars normalized)
 */
function createFingerprint(record: any): string {
  const text = `${record.title} ${record.content || ''}`;
  return normalizeText(text).substring(0, 200);
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .trim();
}

/**
 * Calculate similarity between two fingerprints using simple approach
 */
function calculateSimilarity(text1: string, text2: string): number {
  // Simple approach: calculate word overlap ratio
  const words1 = new Set(text1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(text2.split(' ').filter(w => w.length > 2));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Create hash for duplicate group
 */
function createGroupHash(records: any[]): string {
  const ids = records.map(r => r.id).sort();
  return ids.join('-').substring(0, 32);
}

export default router;

