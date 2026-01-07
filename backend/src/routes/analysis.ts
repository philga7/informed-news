import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import { ollamaService } from '../services/ollamaService.js';
import { auditService } from '../services/auditService.js';
import { contentPreparer, type MediaType } from '../services/analysis/ContentPreparer.js';
import { contentExtractor } from '../services/ingestion/ContentExtractor.js';

const router = Router();

/**
 * POST /api/analysis/source-records/:id/summarize
 * Generate AI-assisted summary for a source record
 */
router.post('/source-records/:id/summarize', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fetchFreshContent } = req.body;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the source record with source information
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
        source_id,
        url,
        sources!inner (
          organization_id,
          name,
          reliability_rating
        )
      `)
      .eq('id', id)
      .single() as any;

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Prepare content for analysis (with metadata, links, structure)
    let preparedContent;
    try {
      preparedContent = await contentPreparer.prepareForAnalysis(id, fetchFreshContent === true ? record.url : undefined);
    } catch (prepError) {
      return res.status(400).json({ 
        error: 'Failed to prepare content for analysis',
        message: prepError instanceof Error ? prepError.message : 'Unknown error'
      });
    }

    if (!preparedContent.text || !preparedContent.text.trim()) {
      return res.status(400).json({ error: 'No content available to analyze' });
    }

    // Get source metadata for enhanced prompts
    const sourceMetadata = {
      name: record.sources.name,
      reliabilityRating: record.sources.reliability_rating,
    };

    // Call Ollama service with prepared content
    const summaryResult = await ollamaService.summarize(preparedContent, sourceMetadata);

    // Add warning if content extraction failed with 403, but only if no reviewed notes exist
    // (if reviewed notes exist, analyst has already manually added fresh content)
    const hasReviewedNotes = preparedContent.analystNotes && preparedContent.analystNotes.length > 0;
    const payloadWithWarning = (preparedContent.contentExtractionError === 403 && !hasReviewedNotes)
      ? { ...summaryResult, warning: 'Content extraction blocked (HTTP 403). Analysis based on stored content. Consider manually adding notes for full article analysis.' }
      : summaryResult;

    // Store in analytic_artifacts table
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'summary',
        payload: payloadWithWarning as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    if (!artifact) {
      return res.status(500).json({ error: 'Failed to create artifact' });
    }

    // Audit log: artifact created
    await auditService.logArtifactCreated((artifact as any).id, artifact as any);

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
    const { fetchFreshContent } = req.body;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the source record with source information
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
        source_id,
        url,
        sources!inner (
          organization_id,
          name,
          reliability_rating
        )
      `)
      .eq('id', id)
      .single() as any;

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Prepare content for analysis (with metadata, links, structure)
    let preparedContent;
    try {
      preparedContent = await contentPreparer.prepareForAnalysis(id, fetchFreshContent === true ? record.url : undefined);
    } catch (prepError) {
      return res.status(400).json({ 
        error: 'Failed to prepare content for analysis',
        message: prepError instanceof Error ? prepError.message : 'Unknown error'
      });
    }

    if (!preparedContent.text || !preparedContent.text.trim()) {
      return res.status(400).json({ error: 'No content available to analyze' });
    }

    // Get source metadata for enhanced prompts
    const sourceMetadata = {
      name: record.sources.name,
      reliabilityRating: record.sources.reliability_rating,
    };

    // Call Ollama service with prepared content
    const entitiesResult = await ollamaService.extractEntities(preparedContent, sourceMetadata);

    // Add warning if content extraction failed with 403, but only if no reviewed notes exist
    // (if reviewed notes exist, analyst has already manually added fresh content)
    const hasReviewedNotes = preparedContent.analystNotes && preparedContent.analystNotes.length > 0;
    const payloadWithWarning = (preparedContent.contentExtractionError === 403 && !hasReviewedNotes)
      ? { ...entitiesResult, warning: 'Content extraction blocked (HTTP 403). Analysis based on stored content. Consider manually adding notes for full article analysis.' }
      : entitiesResult;

    // Store in analytic_artifacts table
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'entity_extraction',
        payload: payloadWithWarning as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    if (!artifact) {
      return res.status(500).json({ error: 'Failed to create artifact' });
    }

    // Audit log: artifact created
    await auditService.logArtifactCreated((artifact as any).id, artifact as any);

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
    const { fetchFreshContent } = req.body;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the source record with source information
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
        source_id,
        url,
        sources!inner (
          organization_id,
          name,
          reliability_rating
        )
      `)
      .eq('id', id)
      .single() as any;

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Prepare content for analysis (with metadata, links, structure)
    let preparedContent;
    try {
      preparedContent = await contentPreparer.prepareForAnalysis(id, fetchFreshContent === true ? record.url : undefined);
    } catch (prepError) {
      return res.status(400).json({ 
        error: 'Failed to prepare content for analysis',
        message: prepError instanceof Error ? prepError.message : 'Unknown error'
      });
    }

    if (!preparedContent.text || !preparedContent.text.trim()) {
      return res.status(400).json({ error: 'No content available to analyze' });
    }

    // Get source metadata for enhanced prompts
    const sourceMetadata = {
      name: record.sources.name,
      reliabilityRating: record.sources.reliability_rating,
    };

    // Call Ollama service with prepared content
    const toneResult = await ollamaService.analyzeTone(preparedContent, sourceMetadata);

    // Add warning if content extraction failed with 403, but only if no reviewed notes exist
    // (if reviewed notes exist, analyst has already manually added fresh content)
    const hasReviewedNotes = preparedContent.analystNotes && preparedContent.analystNotes.length > 0;
    const payloadWithWarning = (preparedContent.contentExtractionError === 403 && !hasReviewedNotes)
      ? { ...toneResult, warning: 'Content extraction blocked (HTTP 403). Analysis based on stored content. Consider manually adding notes for full article analysis.' }
      : toneResult;

    // Store in analytic_artifacts table
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'tone_analysis',
        payload: payloadWithWarning as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    if (!artifact) {
      return res.status(500).json({ error: 'Failed to create artifact' });
    }

    // Audit log: artifact created
    await auditService.logArtifactCreated((artifact as any).id, artifact as any);

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
 * Helper function: Check if all artifacts for a source record are reviewed, and update linked topic_source_links accordingly
 * Called when artifacts are reviewed or deleted
 */
async function checkAndUpdateLinkReviewStatus(sourceRecordId: string) {
  console.log(`\n========== [checkAndUpdateLinkReviewStatus] ==========`);
  console.log(`Starting check for source_record_id: ${sourceRecordId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  try {
    const { data: allArtifacts, error: artifactsError } = await supabase
      .from('analytic_artifacts')
      .select('reviewed')
      .eq('source_record_id', sourceRecordId);

    if (artifactsError) {
      console.error('[checkAndUpdateLinkReviewStatus] Error fetching artifacts:', artifactsError);
      return;
    }

    console.log(`[checkAndUpdateLinkReviewStatus] Found ${allArtifacts?.length || 0} artifacts for source_record_id ${sourceRecordId}`);

    if (!allArtifacts || allArtifacts.length === 0) {
      console.log(`[checkAndUpdateLinkReviewStatus] No artifacts found - updating pending links to reviewed`);
      
      // No artifacts - update pending links to reviewed
      const { data: updatedLinks, error: linksError } = await supabase
        .from('topic_source_links')
        .update({ review_status: 'reviewed' } as any)
        .eq('source_record_id', sourceRecordId)
        .in('review_status', ['pending'])
        .select('id');

      if (linksError) {
        console.error('[checkAndUpdateLinkReviewStatus] Error updating links when no artifacts exist:', linksError);
      } else {
        console.log(`[checkAndUpdateLinkReviewStatus] Updated ${updatedLinks?.length || 0} topic_source_links to 'reviewed' (no artifacts)`);
        if (updatedLinks && updatedLinks.length === 0) {
          console.log(`[checkAndUpdateLinkReviewStatus] WARNING: No links were updated. This might mean:`);
          console.log(`  - No links exist for this source_record_id`);
          console.log(`  - All links already have review_status != 'pending'`);
        }
      }
      return;
    }

    const totalArtifacts = allArtifacts.length;
    const reviewedArtifacts = allArtifacts.filter((a: any) => a.reviewed === true).length;
    const unreviewedArtifacts = allArtifacts.filter((a: any) => a.reviewed === false).length;

    console.log(`[checkAndUpdateLinkReviewStatus] Artifact status for source_record_id ${sourceRecordId}: ${reviewedArtifacts} reviewed, ${unreviewedArtifacts} unreviewed, ${totalArtifacts} total`);

    // If all artifacts are reviewed, update pending links to reviewed
    if (reviewedArtifacts === totalArtifacts) {
      console.log(`[checkAndUpdateLinkReviewStatus] All artifacts reviewed - updating pending links`);
      
      // First, check what links exist
      const { data: existingLinks, error: fetchLinksError } = await supabase
        .from('topic_source_links')
        .select('id, review_status')
        .eq('source_record_id', sourceRecordId);

      if (fetchLinksError) {
        console.error('[checkAndUpdateLinkReviewStatus] Error fetching existing links:', fetchLinksError);
      } else {
        console.log(`[checkAndUpdateLinkReviewStatus] Found ${existingLinks?.length || 0} existing links:`, existingLinks?.map((l: any) => ({ id: l.id, status: l.review_status })));
      }

      const { data: updatedLinks, error: linksError } = await supabase
        .from('topic_source_links')
        .update({ review_status: 'reviewed' } as any)
        .eq('source_record_id', sourceRecordId)
        .in('review_status', ['pending'])
        .select('id');

      if (linksError) {
        console.error('[checkAndUpdateLinkReviewStatus] Error updating linked topic_source_links:', linksError);
      } else {
        console.log(`[checkAndUpdateLinkReviewStatus] Updated ${updatedLinks?.length || 0} topic_source_links to 'reviewed' (all artifacts reviewed)`);
        if (updatedLinks && updatedLinks.length > 0) {
          console.log(`[checkAndUpdateLinkReviewStatus] Updated link IDs:`, updatedLinks.map((l: any) => l.id));
        } else {
          console.log(`[checkAndUpdateLinkReviewStatus] WARNING: No links were updated. This might mean:`);
          console.log(`  - No links exist for this source_record_id`);
          console.log(`  - All links already have review_status != 'pending'`);
          console.log(`  - Check existing links above to see their current status`);
        }
      }
    } else {
      console.log(`[checkAndUpdateLinkReviewStatus] Not all artifacts reviewed (${reviewedArtifacts}/${totalArtifacts}) - skipping link update`);
    }
  } catch (error) {
    console.error('[checkAndUpdateLinkReviewStatus] Unexpected error:', error);
    throw error; // Re-throw to see full stack trace
  }
}

/**
 * Helper function: Remove warnings from all artifacts for a source record
 * Called when notes are added/reviewed, indicating analyst is handling fresh content manually
 */
async function removeWarningsFromArtifacts(sourceRecordId: string) {
  try {
    // Find all artifacts for this source record that have warnings
    const { data: artifacts, error: fetchError } = await supabase
      .from('analytic_artifacts')
      .select('id, payload, type')
      .eq('source_record_id', sourceRecordId)
      .in('type', ['summary', 'entity_extraction', 'tone_analysis', 'key_facts']);

    if (fetchError) {
      console.error('Error fetching artifacts for warning removal:', fetchError);
      return;
    }

    if (!artifacts || artifacts.length === 0) {
      return; // No artifacts to update
    }

    // Update artifacts that have warnings
    const updates: Promise<any>[] = [];
    
    for (const artifact of artifacts) {
      const artifactTyped = artifact as any;
      const payload = artifactTyped.payload;
      
      // Check if payload has a warning field
      if (payload && typeof payload === 'object' && 'warning' in payload) {
        // Remove warning from payload
        const { warning, ...payloadWithoutWarning } = payload;
        
        // Update the artifact
        updates.push(
          supabase
            .from('analytic_artifacts')
            .update({ payload: payloadWithoutWarning as any } as any)
            .eq('id', artifactTyped.id)
            .then(({ error }) => {
              if (error) {
                console.error(`Error removing warning from artifact ${artifactTyped.id}:`, error);
              } else {
                console.log(`Removed warning from ${artifactTyped.type} artifact ${artifactTyped.id}`);
              }
            })
        );
      }
    }

    // Wait for all updates to complete (but don't block the response)
    await Promise.all(updates);
  } catch (error) {
    // Log error but don't fail - this is a cleanup operation
    console.error('Error removing warnings from artifacts:', error);
  }
}

/**
 * Helper function: Create claims from reviewed key facts artifact
 * Only creates claims for facts with category='claim', other facts remain as key facts only
 */
async function createClaimsFromKeyFacts(artifact: any) {
  if (!artifact.source_record_id || artifact.type !== 'key_facts') {
    return;
  }

  const payload = artifact.payload as { facts?: Array<{ fact: string; confidence: number; category?: 'event' | 'quote' | 'statistic' | 'claim'; supportingLinks?: string[] }> };
  
  if (!payload.facts || payload.facts.length === 0) {
    return; // No facts to process
  }

  // Extract only facts with category='claim'
  const claimFacts = payload.facts.filter(f => f.category === 'claim');

  if (claimFacts.length === 0) {
    return; // No claim facts to create
  }

  // Find all topics linked to this source record
  const { data: links, error: linksError } = await supabase
    .from('topic_source_links')
    .select('topic_id, id')
    .eq('source_record_id', artifact.source_record_id);

  if (linksError || !links || links.length === 0) {
    return; // No linked topics
  }

  // Create claims for each topic
  for (const link of links) {
    const linkTyped = link as any;
    for (const claimFact of claimFacts) {
      // Check if claim already exists for this topic (avoid duplicates)
      const { data: existingClaim, error: checkError } = await supabase
        .from('claims')
        .select('id')
        .eq('topic_id', linkTyped.topic_id)
        .eq('claim_text', claimFact.fact.trim())
        .maybeSingle();

      if (checkError) {
        console.error(`Error checking for existing claim:`, checkError);
        continue;
      }

      if (existingClaim) {
        // Claim already exists, skip creation
        continue;
      }

      // Create the claim
      const { data: newClaim, error: createError } = await supabase
        .from('claims')
        // @ts-ignore - Supabase type inference issue
        .insert({
          topic_id: linkTyped.topic_id,
          claim_text: claimFact.fact.trim(),
          claim_type: 'factual', // Default to 'factual' for claims extracted from key facts
          is_falsifiable: true,
        } as any)
        .select()
        .single();

      if (createError || !newClaim) {
        console.error(`Error creating claim for topic ${linkTyped.topic_id}:`, createError);
        continue;
      }

      const newClaimTyped = newClaim as any;

      // Create evidence linking the claim to the source record via the topic-source link
      const { error: evidenceError } = await supabase
        .from('claim_evidence')
        // @ts-ignore - Supabase type inference issue
        .insert({
          claim_id: newClaimTyped.id,
          link_id: linkTyped.id, // Use the topic_source_links.id
          supports: true, // By default, key facts support the claim
          evidence_excerpt: claimFact.fact.trim(),
          analyst_notes: `Auto-created from reviewed key facts analysis. Confidence: ${(claimFact.confidence * 100).toFixed(0)}%`,
        } as any);

      if (evidenceError) {
        console.error(`Error creating claim evidence for claim ${newClaimTyped.id}:`, evidenceError);
      } else {
        console.log(`Created claim "${claimFact.fact.substring(0, 50)}..." for topic ${linkTyped.topic_id} with evidence from source record ${artifact.source_record_id}`);
      }
    }
  }
}

/**
 * Helper function: Add entities from reviewed entity extraction artifact to linked topics' keywords
 */
async function addEntitiesToLinkedTopics(artifact: any) {
  if (!artifact.source_record_id || artifact.type !== 'entity_extraction') {
    return;
  }

  // Extract all entities from the payload
  const payload = artifact.payload as { people?: string[]; organizations?: string[]; locations?: string[]; dates?: string[] };
  const entities: string[] = [
    ...(payload.people || []),
    ...(payload.organizations || []),
    ...(payload.locations || []),
    ...(payload.dates || []),
  ].filter(Boolean); // Remove any null/undefined/empty values

  if (entities.length === 0) {
    return; // No entities to add
  }

  // Find all topics linked to this source record
  const { data: links, error: linksError } = await supabase
    .from('topic_source_links')
    .select(`
      topic_id,
      osint_topics!inner (
        id,
        keywords
      )
    `)
    .eq('source_record_id', artifact.source_record_id);

  if (linksError || !links || links.length === 0) {
    return; // No linked topics
  }

  // Update each topic's keywords by merging entities (avoiding duplicates)
  for (const link of links) {
    // Handle both single object and array formats (for safety)
    const linkTyped = link as any;
    const topicData = linkTyped.osint_topics as any;
    const topic = Array.isArray(topicData) ? topicData[0] : topicData;
    
    if (!topic || !topic.id) continue;

    const currentKeywords = Array.isArray(topic.keywords) ? topic.keywords : [];
    const keywordSet = new Set(currentKeywords.map((k: string) => k.toLowerCase().trim()));
    
    // Add new entities that aren't already in keywords (case-insensitive)
    const newKeywords = entities.filter(entity => {
      const normalizedEntity = entity.toLowerCase().trim();
      if (!normalizedEntity || keywordSet.has(normalizedEntity)) {
        return false;
      }
      keywordSet.add(normalizedEntity);
      return true;
    });

    if (newKeywords.length > 0) {
      const updatedKeywords = [...currentKeywords, ...newKeywords];
      
      // Update topic keywords
      const { error: updateError } = await supabase
        .from('osint_topics')
        // @ts-ignore - Supabase type inference issue
        .update({ keywords: updatedKeywords as any } as any)
        .eq('id', topic.id);

      if (updateError) {
        console.error(`Error updating keywords for topic ${topic.id}:`, updateError);
      } else {
        console.log(`Added ${newKeywords.length} entities to topic ${topic.id} keywords`);
      }
    }
  }
}

/**
 * PATCH /api/analysis/artifacts/:id/notes
 * Update notes artifact content
 */
router.patch('/artifacts/:id/notes', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (typeof notes !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'notes field must be a string',
      });
    }

    // Fetch the artifact to verify it exists and is a notes type
    const { data: artifact, error: fetchError } = await supabase
      .from('analytic_artifacts')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Artifact not found' });
      }
      throw fetchError;
    }

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    if ((artifact as any).type !== 'notes') {
      return res.status(400).json({
        error: 'Invalid artifact type',
        message: 'This endpoint is only for notes artifacts',
      });
    }

    // Update the notes content
    const { data: updatedArtifact, error: updateError } = await supabase
      .from('analytic_artifacts')
      .update({
        payload: { notes: notes.trim() } as any,
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    if (!updatedArtifact) {
      return res.status(500).json({ error: 'Failed to update notes' });
    }

    // Note: Notes updates are not separately audited unless they're part of a review.
    // When "Reviewed and accepted" is checked, the review action is logged via the
    // PATCH /artifacts/:id endpoint which includes the notes content update.

    res.json({
      success: true,
      artifact: updatedArtifact,
    });
  } catch (error) {
    console.error('Error updating notes:', error);
    res.status(500).json({
      error: 'Failed to update notes',
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

    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Audit log: artifact reviewed (only when marking as reviewed)
    if (reviewed) {
      const artifactTyped = artifact as any;
      await auditService.logArtifactReviewed(id, artifactTyped);
      
      // If this is a reviewed entity extraction artifact, add entities to linked topics' keywords
      // This runs asynchronously without blocking the response (fire-and-forget for Vercel compatibility)
      if (artifactTyped.type === 'entity_extraction' && artifactTyped.source_record_id) {
        // Don't await - let it run in background to avoid blocking response or hitting Vercel timeouts
        addEntitiesToLinkedTopics(artifactTyped).catch((err) => {
          // Log error but don't fail the request
          console.error('Error adding entities to linked topics:', err);
        });
      }

      // If this is a reviewed key facts artifact, create claims for facts with category='claim'
      // This runs asynchronously without blocking the response (fire-and-forget for Vercel compatibility)
      if (artifactTyped.type === 'key_facts' && artifactTyped.source_record_id) {
        // Don't await - let it run in background to avoid blocking response or hitting Vercel timeouts
        createClaimsFromKeyFacts(artifactTyped).catch((err) => {
          // Log error but don't fail the request
          console.error('Error creating claims from key facts:', err);
        });
      }

      // If this is a notes artifact and notes content is provided, save it
      if (artifactTyped.type === 'notes' && req.body.notes && typeof req.body.notes === 'string') {
        // Update notes content when marking as reviewed
        const { error: notesUpdateError } = await supabase
          .from('analytic_artifacts')
          .update({
            payload: { notes: req.body.notes.trim() } as any,
          } as any)
          .eq('id', id);

        if (notesUpdateError) {
          console.error('Error updating notes content:', notesUpdateError);
          // Don't fail the request, just log the error
        }
      }

      // If this is a notes artifact being reviewed, remove warnings from all artifacts
      // (analyst reviewing notes indicates they're handling fresh content manually)
      if (artifactTyped.type === 'notes' && artifactTyped.source_record_id) {
        removeWarningsFromArtifacts(artifactTyped.source_record_id).catch((err) => {
          // Log error but don't fail the request
          console.error('Error removing warnings from artifacts:', err);
        });
      }

      // After marking an artifact as reviewed, check if all artifacts for this source record are now reviewed
      // If so, update any pending topic_source_links to 'reviewed'
      if (artifactTyped.source_record_id) {
        console.log(`[UPDATE ARTIFACT REVIEW] Artifact ${id} marked as reviewed, checking link review status for source_record_id ${artifactTyped.source_record_id}`);
        checkAndUpdateLinkReviewStatus(artifactTyped.source_record_id).catch((err) => {
          // Log error but don't fail the request
          console.error('[UPDATE ARTIFACT REVIEW] Error checking and updating link review status:', err);
        });
      }
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
 * GET /api/analysis/topics/:id/artifacts
 * Get all artifacts for a topic (topic-level artifacts)
 */
router.get('/topics/:id/artifacts', async (req: Request, res: Response) => {
  try {
    const { id: topicId } = req.params;

    const { data: artifacts, error } = await supabase
      .from('analytic_artifacts')
      .select('*')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      artifacts: artifacts || [],
    });
  } catch (error) {
    console.error('Error fetching topic artifacts:', error);
    res.status(500).json({
      error: 'Failed to fetch topic artifacts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/analysis/artifacts/:id
 * Delete an artifact (dismiss/archive)
 * After deletion, check if all remaining artifacts are reviewed and update linked topic_source_links accordingly
 */
router.delete('/artifacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // First, fetch the artifact to get the source_record_id
    const { data: artifact, error: fetchError } = await supabase
      .from('analytic_artifacts')
      .select('source_record_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!artifact) {
      return res.status(404).json({ error: 'Artifact not found' });
    }

    const sourceRecordId = (artifact as any).source_record_id;

    console.log(`[DELETE ARTIFACT] Deleting artifact ${id} for source_record_id ${sourceRecordId}`);

    // Delete the artifact
    const { error } = await supabase
      .from('analytic_artifacts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    console.log(`[DELETE ARTIFACT] Artifact deleted successfully, checking link review status for source_record_id ${sourceRecordId}`);

    // After deletion, check if all remaining artifacts for this source record are reviewed
    // If so, update any pending topic_source_links to 'reviewed'
    try {
      // Use the shared helper function to check and update link review status
      await checkAndUpdateLinkReviewStatus(sourceRecordId);
      console.log(`[DELETE ARTIFACT] Completed link review status check for source_record_id ${sourceRecordId}`);
    } catch (checkError) {
      console.error('[DELETE ARTIFACT] Error checking artifact review status after deletion:', checkError);
      // Don't fail the request, just log the error
    }

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
 * POST /api/analysis/source-records/:id/key-facts
 * Extract key facts from a source record
 */
router.post('/source-records/:id/key-facts', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fetchFreshContent } = req.body;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the source record with source information
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
        source_id,
        url,
        sources!inner (
          organization_id,
          name,
          reliability_rating
        )
      `)
      .eq('id', id)
      .single() as any;

    if (fetchError || !record) {
      return res.status(404).json({ error: 'Source record not found' });
    }

    // Prepare content for analysis (with metadata, links, structure)
    let preparedContent;
    try {
      preparedContent = await contentPreparer.prepareForAnalysis(id, fetchFreshContent === true ? record.url : undefined);
    } catch (prepError) {
      return res.status(400).json({ 
        error: 'Failed to prepare content for analysis',
        message: prepError instanceof Error ? prepError.message : 'Unknown error'
      });
    }

    if (!preparedContent.text || !preparedContent.text.trim()) {
      return res.status(400).json({ error: 'No content available to analyze' });
    }

    // Get source metadata for enhanced prompts
    const sourceMetadata = {
      name: record.sources.name,
      reliabilityRating: record.sources.reliability_rating,
    };

    // Call Ollama service to extract key facts
    const keyFactsResult = await ollamaService.extractKeyFacts(preparedContent, sourceMetadata);

    // Add warning if content extraction failed with 403, but only if no reviewed notes exist
    // (if reviewed notes exist, analyst has already manually added fresh content)
    const hasReviewedNotes = preparedContent.analystNotes && preparedContent.analystNotes.length > 0;
    const payloadWithWarning = (preparedContent.contentExtractionError === 403 && !hasReviewedNotes)
      ? { ...keyFactsResult, warning: 'Content extraction blocked (HTTP 403). Analysis based on stored content. Consider manually adding notes for full article analysis.' }
      : keyFactsResult;

    // Store in analytic_artifacts table
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'key_facts',
        payload: payloadWithWarning as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    if (!artifact) {
      return res.status(500).json({ error: 'Failed to create artifact' });
    }

    // Audit log: artifact created
    await auditService.logArtifactCreated((artifact as any).id, artifact as any);

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error extracting key facts:', error);
    res.status(500).json({
      error: 'Failed to extract key facts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/analysis/topics/:id/summarize
 * Generate topic-level summary across all linked source records
 */
router.post('/topics/:id/summarize', async (req: Request, res: Response) => {
  try {
    const { id: topicId } = req.params;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the topic
    const { data: topic, error: topicError } = await supabase
      .from('osint_topics')
      .select('id, name, description, decision_question, organization_id')
      .eq('id', topicId)
      .single() as any;

    if (topicError || !topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Fetch all source records linked to this topic
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select(`
        source_record_id,
        source_records!inner (
          id,
          title,
          sources!inner (
            name,
            reliability_rating
          )
        )
      `)
      .eq('topic_id', topicId);

    if (linksError) throw linksError;

    if (!links || links.length === 0) {
      return res.status(400).json({ 
        error: 'No source records linked to this topic',
        message: 'Link source records to the topic before generating a summary'
      });
    }

    // Check for reviewed artifacts for each linked source record
    const recordIds = links.map((link: any) => (link as any).source_record_id);
    const { data: allArtifacts, error: artifactsError } = await supabase
      .from('analytic_artifacts')
      .select('source_record_id, reviewed, type')
      .in('source_record_id', recordIds);

    if (artifactsError) throw artifactsError;

    // Group artifacts by source_record_id
    const artifactsByRecord = new Map<string, Array<{ reviewed: boolean; type: string }>>();
    (allArtifacts || []).forEach((artifact: any) => {
      if (!artifactsByRecord.has(artifact.source_record_id)) {
        artifactsByRecord.set(artifact.source_record_id, []);
      }
      artifactsByRecord.get(artifact.source_record_id)!.push({
        reviewed: artifact.reviewed,
        type: artifact.type,
      });
    });

    // Separate records with reviewed artifacts from those without
    const recordsWithReviewed: Array<{ link: any; recordId: string; sourceInfo: any }> = [];
    const recordsWithUnreviewed: Array<{ recordId: string; title: string; sourceName: string }> = [];

    for (const link of links) {
      const recordId = (link as any).source_record_id;
      const sourceInfo = (link as any).source_records.sources;
      const recordTitle = (link as any).source_records.title || 'Untitled';
      const artifacts = artifactsByRecord.get(recordId) || [];

      // Check if this record has at least one reviewed artifact
      const hasReviewedArtifact = artifacts.some(a => a.reviewed === true);

      if (hasReviewedArtifact) {
        recordsWithReviewed.push({ link, recordId, sourceInfo });
      } else if (artifacts.length > 0) {
        // Has artifacts but none are reviewed
        recordsWithUnreviewed.push({
          recordId,
          title: recordTitle,
          sourceName: sourceInfo.name,
        });
      } else {
        // No artifacts at all - also note this
        recordsWithUnreviewed.push({
          recordId,
          title: recordTitle,
          sourceName: sourceInfo.name,
        });
      }
    }

    if (recordsWithReviewed.length === 0) {
      return res.status(400).json({ 
        error: 'No reviewed artifacts available',
        message: 'At least one linked source record must have reviewed artifacts. Please review artifacts for linked source records before generating a topic summary.'
      });
    }

    // Prepare content only for records with reviewed artifacts
    // Also track source record titles for corroboration tracking
    const preparedContents: Array<PreparedContent & { sourceRecordTitle: string; sourceName: string }> = [];
    const sourceMetadataMap = new Map<string, { name: string; reliabilityRating: string }>();

    for (const { link, recordId, sourceInfo } of recordsWithReviewed) {
      try {
        const prepared = await contentPreparer.prepareForAnalysis(recordId);
        
        // Get the source record title from the link data (already fetched)
        const recordTitle = (link as any).source_records?.title || prepared.metadata.siteName || 'Untitled';
        
        // Add source record title and source name to prepared content for AI to reference
        preparedContents.push({
          ...prepared,
          sourceRecordTitle: recordTitle,
          sourceName: sourceInfo.name,
        });
        
        // Store source metadata (use first occurrence if multiple records from same source)
        if (!sourceMetadataMap.has(sourceInfo.name)) {
          sourceMetadataMap.set(sourceInfo.name, {
            name: sourceInfo.name,
            reliabilityRating: sourceInfo.reliability_rating,
          });
        }
      } catch (prepError) {
        console.warn(`Failed to prepare content for record ${recordId}:`, prepError);
        // Continue with other records
      }
    }

    if (preparedContents.length === 0) {
      return res.status(400).json({ 
        error: 'No valid content available for analysis',
        message: 'All linked records failed content preparation'
      });
    }

    // Use first source metadata (or combine if needed)
    const sourceMetadata = sourceMetadataMap.size > 0 
      ? Array.from(sourceMetadataMap.values())[0]
      : undefined;

    // Build topic context
    const topicContext = {
      name: topic.name,
      description: topic.description || undefined,
      decisionQuestion: topic.decision_question || undefined,
    };

    // Call Ollama service to generate topic summary
    // Pass information about unreviewed records so it can be noted in the summary
    const topicSummaryResult = await ollamaService.summarizeTopic(
      preparedContents,
      topicContext,
      sourceMetadata,
      recordsWithUnreviewed.length > 0 ? recordsWithUnreviewed : undefined
    );

    // Store in analytic_artifacts table (with topic_id, not source_record_id)
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        topic_id: topicId,
        organization_id: topic.organization_id,
        type: 'summary',
        payload: topicSummaryResult as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    if (!artifact) {
      return res.status(500).json({ error: 'Failed to create artifact' });
    }

    // Audit log: artifact created
    await auditService.logArtifactCreated((artifact as any).id, artifact as any);

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error generating topic summary:', error);
    res.status(500).json({
      error: 'Failed to generate topic summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/analysis/topics/:id/compare-media
 * Compare content across different media types for a topic
 */
router.post('/topics/:id/compare-media', async (req: Request, res: Response) => {
  try {
    const { id: topicId } = req.params;

    if (!ollamaService.isAvailable()) {
      return res.status(503).json({
        error: 'AI analysis service not available',
        message: 'OLLAMA_API_KEY not configured',
      });
    }

    // Fetch the topic
    const { data: topic, error: topicError } = await supabase
      .from('osint_topics')
      .select('id, name, description, decision_question, organization_id')
      .eq('id', topicId)
      .single() as any;

    if (topicError || !topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Fetch all source records linked to this topic with media type information
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select(`
        source_record_id,
        source_records!inner (
          id,
          media_type,
          sources!inner (
            name,
            reliability_rating
          )
        )
      `)
      .eq('topic_id', topicId);

    if (linksError) throw linksError;

    if (!links || links.length === 0) {
      return res.status(400).json({ 
        error: 'No source records linked to this topic',
        message: 'Link source records to the topic before comparing media types'
      });
    }

    // Group records by media type
    const recordsByMediaType = new Map<string, typeof links>();
    for (const link of links) {
      const record = (link as any).source_records;
      const mediaType = record.media_type || 'article';
      if (!recordsByMediaType.has(mediaType)) {
        recordsByMediaType.set(mediaType, []);
      }
      recordsByMediaType.get(mediaType)!.push(link);
    }

    // Check if we have at least 2 different media types
    if (recordsByMediaType.size < 2) {
      return res.status(400).json({ 
        error: 'Insufficient media type diversity',
        message: 'At least 2 different media types required for comparison. Current media types: ' + Array.from(recordsByMediaType.keys()).join(', ')
      });
    }

    // Prepare content for each linked record
    const preparedRecords: Array<{ 
      mediaType: MediaType; 
      content: any; 
      sourceName: string 
    }> = [];

    // Valid MediaType values
    const validMediaTypes: MediaType[] = ['article', 'video', 'podcast', 'audio', 'other'];

    for (const link of links) {
      try {
        const recordId = (link as any).source_record_id;
        const record = (link as any).source_records;
        const sourceInfo = record.sources;
        
        const prepared = await contentPreparer.prepareForAnalysis(recordId);
        
        // Validate and cast mediaType
        const rawMediaType = record.media_type || 'article';
        const mediaType: MediaType = validMediaTypes.includes(rawMediaType as MediaType) 
          ? (rawMediaType as MediaType)
          : 'article';
        
        preparedRecords.push({
          mediaType,
          content: prepared,
          sourceName: sourceInfo.name,
        });
      } catch (prepError) {
        console.warn(`Failed to prepare content for record ${(link as any).source_record_id}:`, prepError);
        // Continue with other records
      }
    }

    if (preparedRecords.length === 0) {
      return res.status(400).json({ 
        error: 'No valid content available for analysis',
        message: 'All linked records failed content preparation'
      });
    }

    // Call Ollama service to compare media types
    const comparisonResult = await ollamaService.compareMediaTypes(preparedRecords);

    // Store in analytic_artifacts table (with topic_id, not source_record_id)
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        topic_id: topicId,
        organization_id: topic.organization_id,
        type: 'media_comparison',
        payload: comparisonResult as any,
        model_name: ollamaService.getModelName(),
        created_by: 'system:ollama',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    if (!artifact) {
      return res.status(500).json({ error: 'Failed to create artifact' });
    }

    // Audit log: artifact created
    await auditService.logArtifactCreated((artifact as any).id, artifact as any);

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error comparing media types:', error);
    res.status(500).json({
      error: 'Failed to compare media types',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/analysis/topics/:topicId/tone-aggregate
 * Aggregate tone analysis from all linked source records for a topic
 * Returns weighted average tone, confidence, and sentiment across all linked records
 */
router.get('/topics/:topicId/tone-aggregate', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;

    // Fetch all linked source records for this topic
    const { data: links, error: linksError } = await supabase
      .from('topic_source_links')
      .select(`
        source_record_id,
        source_records!inner (
          id,
          sources!inner (
            reliability_rating
          )
        )
      `)
      .eq('topic_id', topicId);

    if (linksError) throw linksError;
    if (!links || links.length === 0) {
      return res.json({
        success: true,
        topicId,
        aggregate: null,
        message: 'No linked source records found for this topic',
      });
    }

    const sourceRecordIds = links.map((link: any) => link.source_records.id);

    // Fetch all tone analysis artifacts for these source records
    const { data: artifacts, error: artifactsError } = await supabase
      .from('analytic_artifacts')
      .select('*')
      .eq('type', 'tone_analysis')
      .in('source_record_id', sourceRecordIds)
      .eq('reviewed', true); // Only include reviewed analyses

    if (artifactsError) throw artifactsError;

    if (!artifacts || artifacts.length === 0) {
      return res.json({
        success: true,
        topicId,
        aggregate: null,
        message: 'No reviewed tone analyses found for linked source records',
      });
    }

    // Create a map of source record ID to reliability rating
    const reliabilityMap = new Map<string, string>();
    links.forEach((link: any) => {
      reliabilityMap.set(link.source_records.id, link.source_records.sources.reliability_rating);
    });

    // Calculate reliability multipliers
    const getReliabilityWeight = (rating?: string): number => {
      switch (rating?.toUpperCase()) {
        case 'HIGH': return 1.0;
        case 'MEDIUM': return 0.8;
        case 'LOW': return 0.6;
        case 'UNKNOWN':
        default: return 0.7;
      }
    };

    // Aggregate tone analyses
    const toneCounts: Record<string, number> = {};
    const sentimentCounts: Record<string, number> = {};
    let totalWeightedConfidence = 0;
    let totalWeight = 0;
    let totalRawConfidence = 0;
    const allIndicators: string[] = [];
    const allBiasSignals: string[] = [];

    artifacts.forEach((artifact: any) => {
      const payload = artifact.payload;
      if (!payload) return;

      const reliabilityRating = reliabilityMap.get(artifact.source_record_id) || 'UNKNOWN';
      const reliabilityWeight = getReliabilityWeight(reliabilityRating);
      const rawConfidence = payload.rawConfidence ?? payload.confidence ?? 0.5;
      const weightedConfidence = payload.confidence ?? rawConfidence * reliabilityWeight;

      // Count tones
      if (payload.overallTone) {
        toneCounts[payload.overallTone] = (toneCounts[payload.overallTone] || 0) + 1;
      }

      // Count sentiments
      if (payload.sentiment) {
        sentimentCounts[payload.sentiment] = (sentimentCounts[payload.sentiment] || 0) + 1;
      }

      // Weighted confidence average
      totalWeightedConfidence += weightedConfidence * reliabilityWeight;
      totalWeight += reliabilityWeight;
      totalRawConfidence += rawConfidence;

      // Collect indicators and bias signals
      if (Array.isArray(payload.indicators)) {
        allIndicators.push(...payload.indicators);
      }
      if (Array.isArray(payload.biasSignals)) {
        allBiasSignals.push(...payload.biasSignals);
      }
    });

    // Calculate dominant tone and sentiment
    const dominantTone = Object.entries(toneCounts).reduce((a, b) => 
      toneCounts[a[0]] > toneCounts[b[0]] ? a : b, ['neutral', 0]
    )[0] as string;

    const dominantSentiment = Object.entries(sentimentCounts).reduce((a, b) =>
      sentimentCounts[a[0]] > sentimentCounts[b[0]] ? a : b, ['neutral', 0]
    )[0] as string;

    // Calculate average confidence
    const avgWeightedConfidence = totalWeight > 0 ? totalWeightedConfidence / totalWeight : 0;
    const avgRawConfidence = artifacts.length > 0 ? totalRawConfidence / artifacts.length : 0;

    // Get unique indicators and bias signals (top 10 most common)
    const indicatorFreq: Record<string, number> = {};
    allIndicators.forEach(ind => {
      indicatorFreq[ind] = (indicatorFreq[ind] || 0) + 1;
    });
    const topIndicators = Object.entries(indicatorFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ind]) => ind);

    const biasSignalFreq: Record<string, number> = {};
    allBiasSignals.forEach(signal => {
      biasSignalFreq[signal] = (biasSignalFreq[signal] || 0) + 1;
    });
    const topBiasSignals = Object.entries(biasSignalFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([signal]) => signal);

    res.json({
      success: true,
      topicId,
      aggregate: {
        overallTone: dominantTone,
        toneDistribution: toneCounts,
        sentiment: dominantSentiment,
        sentimentDistribution: sentimentCounts,
        confidence: avgWeightedConfidence,
        rawConfidence: avgRawConfidence,
        indicators: topIndicators,
        biasSignals: topBiasSignals,
        sourceRecordCount: sourceRecordIds.length,
        analysisCount: artifacts.length,
      },
    });
  } catch (error) {
    console.error('Error aggregating tone analysis:', error);
    res.status(500).json({
      error: 'Failed to aggregate tone analysis',
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
 * POST /api/analysis/source-records/:id/notes
 * Create a new notes artifact for a source record
 */
router.post('/source-records/:id/notes', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (notes === undefined || notes === null || typeof notes !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'notes field is required and must be a string'
      });
    }

    // Fetch the source record with source information
    const { data: record, error: fetchError } = await supabase
      .from('source_records')
      .select(`
        id,
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

    // Create new notes artifact (multiple notes artifacts are allowed per source record)
    const { data: artifact, error: insertError } = await supabase
      .from('analytic_artifacts')
      .insert({
        source_record_id: id,
        organization_id: record.sources.organization_id,
        type: 'notes',
        payload: { notes: notes.trim() } as any,
        model_name: 'analyst',
        created_by: 'analyst',
        reviewed: false,
      } as any)
      .select()
      .single();

    if (insertError) throw insertError;

    if (!artifact) {
      return res.status(500).json({ error: 'Failed to create notes artifact' });
    }

    // Audit log: artifact created
    await auditService.logArtifactCreated((artifact as any).id, artifact as any);

    // Remove warnings from all artifacts for this source record
    // (analyst adding notes indicates they're handling fresh content manually)
    removeWarningsFromArtifacts(id).catch((err) => {
      // Log error but don't fail the request
      console.error('Error removing warnings from artifacts:', err);
    });

    res.json({
      success: true,
      artifact,
    });
  } catch (error) {
    console.error('Error creating notes:', error);
    res.status(500).json({
      error: 'Failed to create notes',
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

