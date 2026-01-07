/**
 * Retention Routes
 * 
 * API endpoints for managing content retention policies and archival.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import { RetentionPolicyService, type RetentionPolicy } from '../services/retention/RetentionPolicyService.js';
import { RetentionJob, type AggregatedRetentionResult } from '../services/retention/RetentionJob.js';
import { auditService } from '../services/auditService.js';

const router = Router();
const retentionService = new RetentionPolicyService();
const retentionJob = new RetentionJob();

/**
 * GET /api/retention/sources/:sourceId/policy
 * Get retention policy for a source
 */
router.get('/sources/:sourceId/policy', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const { data: source, error } = await supabase
      .from('sources')
      .select('id, name, retention_max_items, retention_days, retention_action')
      .eq('id', sourceId)
      .single() as {
        data: {
          id: string;
          name: string;
          retention_max_items: number | null;
          retention_days: number | null;
          retention_action: 'delete' | 'archive';
        } | null;
        error: unknown;
      };

    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        return res.status(404).json({ error: 'Source not found' });
      }
      throw error;
    }

    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    res.json({
      success: true,
      policy: {
        maxItems: source.retention_max_items,
        retentionDays: source.retention_days,
        action: source.retention_action || 'archive',
      },
    });
  } catch (error) {
    console.error('Error fetching retention policy:', error);
    res.status(500).json({
      error: 'Failed to fetch retention policy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/retention/sources/:sourceId/policy
 * Update retention policy for a source
 */
router.put('/sources/:sourceId/policy', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { maxItems, retentionDays, action } = req.body;

    // Validate action
    if (action && !['delete', 'archive'].includes(action)) {
      return res.status(400).json({ error: 'action must be "delete" or "archive"' });
    }

    // Validate that at least one limit is set
    if (!maxItems && !retentionDays) {
      return res.status(400).json({
        error: 'Either maxItems or retentionDays must be provided',
      });
    }

    // Fetch current policy for audit
    const { data: currentSource, error: fetchError } = await supabase
      .from('sources')
      .select('id, name, retention_max_items, retention_days, retention_action')
      .eq('id', sourceId)
      .single() as {
        data: {
          id: string;
          name: string;
          retention_max_items: number | null;
          retention_days: number | null;
          retention_action: 'delete' | 'archive';
        } | null;
        error: unknown;
      };

    if (fetchError) {
      if ((fetchError as { code?: string }).code === 'PGRST116') {
        return res.status(404).json({ error: 'Source not found' });
      }
      throw fetchError;
    }

    if (!currentSource) {
      return res.status(404).json({ error: 'Source not found' });
    }

    // Update policy
    const updateData: Record<string, unknown> = {};
    if (maxItems !== undefined) updateData.retention_max_items = maxItems || null;
    if (retentionDays !== undefined) updateData.retention_days = retentionDays || null;
    if (action) updateData.retention_action = action;

    const { data: updatedSource, error } = await supabase
      .from('sources')
      .update(updateData)
      .eq('id', sourceId)
      .select()
      .single() as {
        data: {
          id: string;
          name: string;
          retention_max_items: number | null;
          retention_days: number | null;
          retention_action: 'delete' | 'archive';
          [key: string]: unknown;
        } | null;
        error: unknown;
      };

    if (error) throw error;
    if (!updatedSource) {
      return res.status(500).json({ error: 'Failed to update source' });
    }

    // Audit log
    await auditService.logRetentionPolicyUpdated(
      sourceId,
      {
        retention_max_items: currentSource.retention_max_items,
        retention_days: currentSource.retention_days,
        retention_action: currentSource.retention_action,
      },
      {
        retention_max_items: updatedSource.retention_max_items,
        retention_days: updatedSource.retention_days,
        retention_action: updatedSource.retention_action,
      },
      req.headers['x-user-id'] as string | undefined
    );

    res.json({
      success: true,
      policy: {
        maxItems: updatedSource.retention_max_items,
        retentionDays: updatedSource.retention_days,
        action: updatedSource.retention_action || 'archive',
      },
    });
  } catch (error) {
    console.error('Error updating retention policy:', error);
    res.status(500).json({
      error: 'Failed to update retention policy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/retention/sources/:sourceId/apply
 * Manually trigger retention for a source
 */
router.post('/sources/:sourceId/apply', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    const result = await retentionJob.runRetentionForSource(sourceId);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Error applying retention policy:', error);
    res.status(500).json({
      error: 'Failed to apply retention policy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/retention/organizations/:organizationId/apply
 * Run retention for all sources in organization (called by GitHub Actions)
 */
router.post('/organizations/:organizationId/apply', async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.params;

    const results = await retentionJob.runRetentionForOrganization(organizationId);

    res.json({
      success: true,
      results,
      summary: {
        totalSources: results.length,
        totalProcessed: results.reduce((sum, r) => sum + r.processed, 0),
        totalArchived: results.reduce((sum, r) => sum + r.archived, 0),
        totalDeleted: results.reduce((sum, r) => sum + r.deleted, 0),
        totalProtected: results.reduce((sum, r) => sum + r.protected, 0),
        totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
      },
    });
  } catch (error) {
    console.error('Error applying retention for organization:', error);
    res.status(500).json({
      error: 'Failed to apply retention for organization',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/retention/organizations/all/apply
 * Run retention for all organizations (called by GitHub Actions)
 * Automatically discovers all organizations and processes them
 */
router.post('/organizations/all/apply', async (req: Request, res: Response) => {
  try {
    // Fetch all organizations
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('id, name') as { data: Array<{ id: string; name: string }> | null; error: unknown };

    if (error) throw error;
    if (!organizations || organizations.length === 0) {
      return res.json({
        success: true,
        message: 'No organizations found',
        results: [],
        summary: {
          totalOrganizations: 0,
          totalSources: 0,
          totalProcessed: 0,
          totalArchived: 0,
          totalDeleted: 0,
          totalProtected: 0,
          totalErrors: 0,
        },
      });
    }

    const allResults: Array<{
      organizationId: string;
      organizationName: string;
      results: AggregatedRetentionResult[];
    }> = [];

    // Process each organization
    for (const org of organizations) {
      try {
        const results = await retentionJob.runRetentionForOrganization(org.id);
        allResults.push({
          organizationId: org.id,
          organizationName: org.name,
          results,
        });
      } catch (err) {
        console.error(`Error processing organization ${org.id}:`, err);
        allResults.push({
          organizationId: org.id,
          organizationName: org.name,
          results: [],
        });
      }
    }

    // Aggregate summary
    const summary = {
      totalOrganizations: organizations.length,
      totalSources: allResults.reduce((sum, r) => sum + r.results.length, 0),
      totalProcessed: allResults.reduce((sum, r) => 
        sum + r.results.reduce((s, res) => s + res.processed, 0), 0),
      totalArchived: allResults.reduce((sum, r) => 
        sum + r.results.reduce((s, res) => s + res.archived, 0), 0),
      totalDeleted: allResults.reduce((sum, r) => 
        sum + r.results.reduce((s, res) => s + res.deleted, 0), 0),
      totalProtected: allResults.reduce((sum, r) => 
        sum + r.results.reduce((s, res) => s + res.protected, 0), 0),
      totalErrors: allResults.reduce((sum, r) => 
        sum + r.results.reduce((s, res) => s + res.errors.length, 0), 0),
    };

    res.json({
      success: true,
      results: allResults,
      summary,
    });
  } catch (error) {
    console.error('Error applying retention for all organizations:', error);
    res.status(500).json({
      error: 'Failed to apply retention for all organizations',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/retention/sources/:sourceId/preview
 * Preview what would be archived/deleted
 */
router.get('/sources/:sourceId/preview', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    // Fetch source policy
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('id, retention_max_items, retention_days, retention_action')
      .eq('id', sourceId)
      .single() as {
        data: {
          id: string;
          retention_max_items: number | null;
          retention_days: number | null;
          retention_action: 'delete' | 'archive';
        } | null;
        error: unknown;
      };

    if (sourceError) {
      if ((sourceError as { code?: string }).code === 'PGRST116') {
        return res.status(404).json({ error: 'Source not found' });
      }
      throw sourceError;
    }

    if (!source) {
      return res.status(404).json({ error: 'Source not found' });
    }

    if (!source.retention_max_items && !source.retention_days) {
      return res.json({
        success: true,
        eligible: 0,
        protected: 0,
        sample: [],
      });
    }

    const policy: RetentionPolicy = {
      maxItems: source.retention_max_items || undefined,
      retentionDays: source.retention_days || undefined,
      action: source.retention_action || 'archive',
    };

    // Get eligible records
    const eligibleRecords = await retentionService.getEligibleRecords(sourceId, policy);

    // Get sample (first 10)
    const sample = eligibleRecords.slice(0, 10).map((r) => ({
      id: r.id,
      published_at: r.published_at,
      ingested_at: r.ingested_at,
    }));

    // Count protected records
    let protectedCount = 0;
    for (const record of eligibleRecords) {
      const isProtected = await retentionService.isRecordProtected(record.id);
      if (isProtected) protectedCount++;
    }

    res.json({
      success: true,
      eligible: eligibleRecords.length,
      protected: protectedCount,
      sample,
    });
  } catch (error) {
    console.error('Error previewing retention:', error);
    res.status(500).json({
      error: 'Failed to preview retention',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/retention/archived
 * List archived records (with filters)
 */
router.get('/archived', async (req: Request, res: Response) => {
  try {
    const {
      organization_id,
      source_id,
      archive_reason,
      date_from,
      date_to,
      limit = '50',
      offset = '0',
    } = req.query;

    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' });
    }

    let query = supabase
      .from('archived_source_records')
      .select(
        `
        *,
        sources!inner (
          id,
          organization_id,
          name
        )
      `,
        { count: 'exact' }
      )
      .eq('sources.organization_id', organization_id as string)
      .order('archived_at', { ascending: false });

    if (source_id) {
      query = query.eq('source_id', source_id as string);
    }

    if (archive_reason) {
      query = query.eq('archive_reason', archive_reason as string);
    }

    if (date_from) {
      query = query.gte('archived_at', date_from as string);
    }

    if (date_to) {
      query = query.lte('archived_at', date_to as string);
    }

    query = query.range(
      parseInt(offset as string),
      parseInt(offset as string) + parseInt(limit as string) - 1
    );

    const { data: records, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      records: records || [],
      pagination: {
        total: count || 0,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      },
    });
  } catch (error) {
    console.error('Error fetching archived records:', error);
    res.status(500).json({
      error: 'Failed to fetch archived records',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/retention/archived/:id/restore
 * Restore an archived record
 */
router.post('/archived/:id/restore', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch archived record
    // Note: archived_source_records table is not in database types, so we use type assertion
    const { data: archivedRecord, error: fetchError } = await (supabase as any)
      .from('archived_source_records')
      .select('*')
      .eq('id', id)
      .single() as {
        data: {
          id: string;
          source_id: string;
          title: string;
          url: string | null;
          content: string | null;
          media_type: string;
          content_type: string;
          content_compressed: boolean;
          content_length: number | null;
          published_at: string | null;
          ingested_at: string;
          language: string | null;
          geographic_indicators: unknown;
          raw_metadata: unknown;
          initial_confidence_flags: unknown;
          scan_status: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
        } | null;
        error: unknown;
      };

    if (fetchError) {
      if ((fetchError as { code?: string }).code === 'PGRST116') {
        return res.status(404).json({ error: 'Archived record not found' });
      }
      throw fetchError;
    }

    if (!archivedRecord) {
      return res.status(404).json({ error: 'Archived record not found' });
    }

    // Insert back into source_records
    const { data: restoredRecord, error: restoreError } = await supabase
      .from('source_records')
      // @ts-ignore - Supabase type inference issue, archived_record fields match source_records
      .insert({
        id: archivedRecord.id,
        source_id: archivedRecord.source_id,
        title: archivedRecord.title,
        url: archivedRecord.url,
        content: archivedRecord.content,
        media_type: archivedRecord.media_type,
        content_type: archivedRecord.content_type,
        content_compressed: archivedRecord.content_compressed,
        content_length: archivedRecord.content_length,
        published_at: archivedRecord.published_at,
        ingested_at: archivedRecord.ingested_at,
        language: archivedRecord.language,
        geographic_indicators: archivedRecord.geographic_indicators,
        raw_metadata: archivedRecord.raw_metadata,
        initial_confidence_flags: archivedRecord.initial_confidence_flags,
        scan_status: archivedRecord.scan_status,
        reviewed_at: archivedRecord.reviewed_at,
        reviewed_by: archivedRecord.reviewed_by,
      } as any)
      .select()
      .single();

    if (restoreError) {
      // Check if it's a duplicate key error (already exists)
      if (restoreError.code === '23505') {
        return res.status(409).json({
          error: 'Record already exists (may have been restored already)',
        });
      }
      throw restoreError;
    }

    // Delete from archived_source_records
    const { error: deleteError } = await supabase
      .from('archived_source_records')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting from archived table after restore:', deleteError);
      // Don't fail the request, record is already restored
    }

    // Audit log
    await auditService.logRecordRestored(id, req.headers['x-user-id'] as string | undefined);

    res.json({
      success: true,
      record: restoredRecord,
    });
  } catch (error) {
    console.error('Error restoring archived record:', error);
    res.status(500).json({
      error: 'Failed to restore archived record',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

