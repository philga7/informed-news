/**
 * Content Optimization Job Service
 * 
 * Provides execution logic for content optimization (compression, content type updates).
 * Scheduling is handled by GitHub Actions.
 */

import { supabase } from '../../utils/supabase.js';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ============================================================================
// TYPES
// ============================================================================

interface OptimizationResult {
  processed: number;
  compressed: number;
  contentTypeUpdated: number;
  errors: string[];
}

interface SourceRecord {
  id: string;
  source_id: string;
  content: string | null;
  content_type: string;
  content_compressed: boolean;
  content_length: number | null;
}

interface Source {
  id: string;
  value_rating: number | null;
}

// ============================================================================
// CONTENT OPTIMIZATION JOB SERVICE
// ============================================================================

export class ContentOptimizationJob {
  /**
   * Optimize content for an organization
   */
  async optimizeOrganizationContent(organizationId: string): Promise<OptimizationResult> {
    const result: OptimizationResult = {
      processed: 0,
      compressed: 0,
      contentTypeUpdated: 0,
      errors: [],
    };

    try {
      // Get all sources for the organization
      const { data: sources, error: sourcesError } = await supabase
        .from('sources')
        .select('id')
        .eq('organization_id', organizationId);

      if (sourcesError) throw sourcesError;
      if (!sources || sources.length === 0) {
        return result;
      }

      // Process each source
      for (const source of sources) {
        try {
          const sourceResult = await this.optimizeSourceContent(source.id);
          result.processed += sourceResult.processed;
          result.compressed += sourceResult.compressed;
          result.contentTypeUpdated += sourceResult.contentTypeUpdated;
          result.errors.push(...sourceResult.errors);
        } catch (err) {
          const errorMsg = `Failed to optimize source ${source.id}: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`;
          result.errors.push(errorMsg);
          console.error('[ContentOptimizationJob]', errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = `Failed to optimize organization content: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      result.errors.push(errorMsg);
      console.error('[ContentOptimizationJob]', errorMsg);
    }

    return result;
  }

  /**
   * Optimize content for a single source
   */
  async optimizeSourceContent(sourceId: string): Promise<OptimizationResult> {
    const result: OptimizationResult = {
      processed: 0,
      compressed: 0,
      contentTypeUpdated: 0,
      errors: [],
    };

    try {
      // Fetch source to get value rating
      const { data: source, error: sourceError } = await supabase
        .from('sources')
        .select('id, value_rating')
        .eq('id', sourceId)
        .single() as { data: Source | null; error: unknown };

      if (sourceError) throw sourceError;
      if (!source) throw new Error(`Source ${sourceId} not found`);

      // Fetch all records for this source
      const { data: records, error: recordsError } = await supabase
        .from('source_records')
        .select('id, content, content_type, content_compressed, content_length')
        .eq('source_id', sourceId) as { data: SourceRecord[] | null; error: unknown };

      if (recordsError) throw recordsError;
      if (!records || records.length === 0) {
        return result;
      }

      // Process each record
      for (const record of records) {
        try {
          result.processed++;

          // Compress large content
          if (record.content && !record.content_compressed) {
            const contentLength = record.content.length;
            if (contentLength > 50 * 1024) {
              // > 50KB
              await this.compressLargeContent(record.id);
              result.compressed++;
            }
          }

          // Update content type based on source value
          const shouldUpdate = await this.shouldUpdateContentType(
            record,
            source.value_rating
          );
          if (shouldUpdate) {
            await this.updateContentTypeForRecord(record.id, source.value_rating);
            result.contentTypeUpdated++;
          }
        } catch (err) {
          const errorMsg = `Failed to optimize record ${record.id}: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`;
          result.errors.push(errorMsg);
          console.error('[ContentOptimizationJob]', errorMsg);
        }
      }
    } catch (err) {
      const errorMsg = `Failed to optimize source content: ${
        err instanceof Error ? err.message : 'Unknown error'
      }`;
      result.errors.push(errorMsg);
      console.error('[ContentOptimizationJob]', errorMsg);
      throw err;
    }

    return result;
  }

  /**
   * Compress content > 50KB
   */
  async compressLargeContent(recordId: string): Promise<void> {
    try {
      // Fetch record
      const { data: record, error: fetchError } = await supabase
        .from('source_records')
        .select('id, content, content_compressed')
        .eq('id', recordId)
        .single();

      if (fetchError) throw fetchError;
      if (!record || !record.content) {
        throw new Error(`Record ${recordId} not found or has no content`);
      }

      // Skip if already compressed
      if (record.content_compressed) {
        return;
      }

      // Compress content
      const compressed = await gzip(Buffer.from(record.content, 'utf-8'));

      // Update record
      const { error: updateError } = await supabase
        .from('source_records')
        // @ts-expect-error - Supabase type inference issue in serverless environment
        .update({
          content: compressed.toString('base64'), // Store as base64
          content_compressed: true,
          storage_optimized_at: new Date().toISOString(),
        } as any)
        .eq('id', recordId);

      if (updateError) throw updateError;
    } catch (err) {
      console.error('[ContentOptimizationJob] Error compressing content:', err);
      throw err;
    }
  }

  /**
   * Update content_type based on source value changes
   */
  async updateContentTypesForSource(sourceId: string): Promise<void> {
    try {
      // Fetch source
      const { data: source, error: sourceError } = await supabase
        .from('sources')
        .select('id, value_rating')
        .eq('id', sourceId)
        .single() as { data: Source | null; error: unknown };

      if (sourceError) throw sourceError;
      if (!source) throw new Error(`Source ${sourceId} not found`);

      // Fetch all records
      const { data: records, error: recordsError } = await supabase
        .from('source_records')
        .select('id, content_type, content_length')
        .eq('source_id', sourceId) as { data: SourceRecord[] | null; error: unknown };

      if (recordsError) throw recordsError;
      if (!records || records.length === 0) {
        return;
      }

      // Update each record if needed
      for (const record of records) {
        const shouldUpdate = await this.shouldUpdateContentType(record, source.value_rating);
        if (shouldUpdate) {
          await this.updateContentTypeForRecord(record.id, source.value_rating);
        }
      }
    } catch (err) {
      console.error('[ContentOptimizationJob] Error updating content types:', err);
      throw err;
    }
  }

  /**
   * Check if content type should be updated based on source value
   */
  private async shouldUpdateContentType(
    record: SourceRecord,
    sourceValue: number | null
  ): Promise<boolean> {
    // High-value sources (≥4): Should be full_text
    if (sourceValue !== null && sourceValue >= 4) {
      return record.content_type !== 'full_text';
    }

    // Low-value sources (≤2): Should be summary or minimal
    if (sourceValue !== null && sourceValue <= 2) {
      return record.content_type === 'full_text';
    }

    return false;
  }

  /**
   * Update content type for a record
   */
  private async updateContentTypeForRecord(
    recordId: string,
    sourceValue: number | null
  ): Promise<void> {
    let newContentType: string;

    if (sourceValue !== null && sourceValue >= 4) {
      newContentType = 'full_text';
    } else if (sourceValue !== null && sourceValue <= 2) {
      newContentType = 'summary';
    } else {
      // Medium value: keep current or default to full_text
      return;
    }

    const { error } = await supabase
      .from('source_records')
      // @ts-expect-error - Supabase type inference issue in serverless environment
      .update({
        content_type: newContentType,
        storage_optimized_at: new Date().toISOString(),
      } as any)
      .eq('id', recordId);

    if (error) throw error;
  }
}

