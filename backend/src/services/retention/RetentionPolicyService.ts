/**
 * Retention Policy Service
 * 
 * Manages content retention policies for sources, including protection logic
 * and archival/deletion operations.
 */

import { supabase } from '../../utils/supabase.js';
import { auditService } from '../auditService.js';

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ============================================================================
// TYPES
// ============================================================================

export interface RetentionPolicy {
  maxItems?: number; // Keep N most recent items
  retentionDays?: number; // Keep items from last N days
  action: 'delete' | 'archive'; // What to do with items outside window
}

export interface RetentionResult {
  processed: number;
  archived: number;
  deleted: number;
  protected: number; // Items protected from retention
  errors: string[];
}

interface SourceRecord {
  id: string;
  source_id: string;
  published_at: string | null;
  ingested_at: string;
  scan_status: string;
}

// ============================================================================
// RETENTION POLICY SERVICE
// ============================================================================

export class RetentionPolicyService {
  /**
   * Check if a record is protected from retention policies
   * Protected if ANY of:
   * - Linked to any topic
   * - Has any artifacts
   * - Linked to any watch item
   * - Not dismissed (scan_status != 'dismissed')
   */
  async isRecordProtected(recordId: string): Promise<boolean> {
    try {
      // Use the database function for consistency
      const { data, error } = await supabase.rpc('is_record_protected', {
        record_id: recordId,
      });

      if (error) {
        console.error('[RetentionPolicyService] Error checking protection:', error);
        // If function fails, default to protected (safe side)
        return true;
      }

      return data === true;
    } catch (err) {
      console.error('[RetentionPolicyService] Exception checking protection:', err);
      // Default to protected on error
      return true;
    }
  }

  /**
   * Get records eligible for retention (outside window, not protected)
   */
  async getEligibleRecords(
    sourceId: string,
    policy: RetentionPolicy
  ): Promise<SourceRecord[]> {
    try {
      // Fetch all records for this source, ordered by published_at DESC (or ingested_at DESC)
      let query = supabase
        .from('source_records')
        .select('id, source_id, published_at, ingested_at, scan_status')
        .eq('source_id', sourceId)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('ingested_at', { ascending: false });

      const { data: allRecords, error } = await query;

      if (error) throw error;
      if (!allRecords || allRecords.length === 0) return [];

      let eligibleRecords: SourceRecord[] = [];

      // Apply maxItems limit
      if (policy.maxItems && policy.maxItems > 0) {
        // Keep only N most recent
        const recordsToCheck = allRecords.slice(policy.maxItems);
        eligibleRecords = recordsToCheck;
      } else {
        eligibleRecords = allRecords;
      }

      // Apply retentionDays limit
      if (policy.retentionDays && policy.retentionDays > 0) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

        eligibleRecords = eligibleRecords.filter((record) => {
          const recordDate = record.published_at
            ? new Date(record.published_at)
            : new Date(record.ingested_at);
          return recordDate < cutoffDate;
        });
      }

      // Filter out protected records
      const unprotectedRecords: SourceRecord[] = [];
      for (const record of eligibleRecords) {
        const isProtected = await this.isRecordProtected(record.id);
        if (!isProtected) {
          unprotectedRecords.push(record);
        }
      }

      return unprotectedRecords;
    } catch (err) {
      console.error('[RetentionPolicyService] Error getting eligible records:', err);
      throw err;
    }
  }

  /**
   * Archive a record (move to archived_source_records)
   */
  async archiveRecord(recordId: string, reason: string): Promise<void> {
    try {
      // Fetch the record
      const { data: record, error: fetchError } = await supabase
        .from('source_records')
        .select('*')
        .eq('id', recordId)
        .single() as { data: {
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
          geographic_indicators: Json | null;
          raw_metadata: Json | null;
          initial_confidence_flags: Json | null;
          scan_status: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
        } | null; error: unknown };

      if (fetchError) throw fetchError;
      if (!record) throw new Error(`Record ${recordId} not found`);

      // Insert into archived_source_records
      const { error: archiveError } = await supabase
        .from('archived_source_records')
        .insert({
          id: record.id,
          source_id: record.source_id,
          title: record.title,
          url: record.url,
          content: record.content,
          media_type: record.media_type,
          content_type: record.content_type,
          content_compressed: record.content_compressed,
          content_length: record.content_length,
          published_at: record.published_at,
          ingested_at: record.ingested_at,
          language: record.language,
          geographic_indicators: record.geographic_indicators,
          raw_metadata: record.raw_metadata,
          initial_confidence_flags: record.initial_confidence_flags,
          scan_status: record.scan_status || null,
          reviewed_at: record.reviewed_at || null,
          reviewed_by: record.reviewed_by || null,
          archived_at: new Date().toISOString(),
          archive_reason: reason,
        });

      if (archiveError) throw archiveError;

      // Delete from source_records
      const { error: deleteError } = await supabase
        .from('source_records')
        .delete()
        .eq('id', recordId);

      if (deleteError) throw deleteError;

      // Audit log
      await auditService.logRecordArchived(recordId, reason);
    } catch (err) {
      console.error('[RetentionPolicyService] Error archiving record:', err);
      throw err;
    }
  }

  /**
   * Delete a record permanently
   */
  async deleteRecord(recordId: string, reason: string = 'retention_policy'): Promise<void> {
    try {
      const { error } = await supabase
        .from('source_records')
        .delete()
        .eq('id', recordId);

      if (error) throw error;

      // Audit log
      await auditService.logRecordDeleted(recordId, reason);
    } catch (err) {
      console.error('[RetentionPolicyService] Error deleting record:', err);
      throw err;
    }
  }

  /**
   * Apply retention policy for a source
   */
  async applyRetentionPolicy(
    sourceId: string,
    policy: RetentionPolicy
  ): Promise<RetentionResult> {
    const result: RetentionResult = {
      processed: 0,
      archived: 0,
      deleted: 0,
      protected: 0,
      errors: [],
    };

    try {
      // Get eligible records
      const eligibleRecords = await this.getEligibleRecords(sourceId, policy);

      result.processed = eligibleRecords.length;

      // Process each record
      for (const record of eligibleRecords) {
        try {
          // Double-check protection (race condition safety)
          const isProtected = await this.isRecordProtected(record.id);
          if (isProtected) {
            result.protected++;
            continue;
          }

          // Apply action
          if (policy.action === 'archive') {
            await this.archiveRecord(record.id, 'retention_policy');
            result.archived++;
          } else {
            await this.deleteRecord(record.id, 'retention_policy');
            result.deleted++;
          }
        } catch (err) {
          const errorMsg = `Failed to process record ${record.id}: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`;
          result.errors.push(errorMsg);
          console.error('[RetentionPolicyService]', errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = `Failed to apply retention policy: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      result.errors.push(errorMsg);
      console.error('[RetentionPolicyService]', errorMsg);
    }

    return result;
  }
}

