/**
 * Ingestion Controller
 * 
 * Central controller for ingesting content from any source type.
 * Handles deduplication, normalization, and database insertion.
 */

import crypto from 'crypto';
import { supabase } from '../../utils/supabase.js';
import type { IngestionService, SourceRecordDTO, IngestionResult } from '../../types/ingestion.js';

export class IngestionController {
  private service: IngestionService;

  constructor(service: IngestionService) {
    this.service = service;
  }

  /**
   * Generate content hash for deduplication
   * Uses SHA-256 hash of title + content + published_at
   */
  private generateContentHash(dto: SourceRecordDTO): string {
    const content = [
      dto.title,
      dto.content || '',
      dto.published_at?.toISOString() || '',
    ].join('|');

    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Check if a record with this content hash already exists
   */
  private async isDuplicate(contentHash: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('source_records')
      .select('id')
      .eq('raw_metadata->>content_hash', contentHash)
      .limit(1);

    if (error) {
      console.error('Error checking for duplicates:', error);
      return false; // If we can't check, assume it's not a duplicate
    }

    return (data?.length || 0) > 0;
  }

  /**
   * Insert a source record into the database
   */
  private async insertRecord(dto: SourceRecordDTO, contentHash: string): Promise<boolean> {
    try {
      // Build raw_metadata with content hash
      const rawMetadata = {
        ...(dto.raw_metadata || {}),
        content_hash: contentHash,
      };

      // Insert into source_records table
      const { error } = await supabase
        .from('source_records')
        .insert({
          source_id: dto.source_id,
          title: dto.title,
          url: dto.url || null,
          content: dto.content || null,
          published_at: dto.published_at?.toISOString() || null,
          language: dto.language || null,
          geographic_indicators: dto.geographic_indicators 
            ? JSON.parse(JSON.stringify(dto.geographic_indicators)) 
            : null,
          raw_metadata: rawMetadata,
        });

      if (error) {
        console.error('Error inserting source record:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Unexpected error inserting record:', err);
      return false;
    }
  }

  /**
   * Ingest content from the configured service
   */
  async ingest(): Promise<IngestionResult> {
    const result: IngestionResult = {
      added: 0,
      skipped: 0,
      errors: [],
      records: [],
    };

    try {
      // Fetch and normalize content from source
      const dtos = await this.service.fetchAndNormalize();
      result.records = dtos;

      // Process each record
      for (const dto of dtos) {
        try {
          // Generate content hash
          const contentHash = this.generateContentHash(dto);

          // Check for duplicates
          const isDupe = await this.isDuplicate(contentHash);
          if (isDupe) {
            result.skipped++;
            continue;
          }

          // Insert record
          const success = await this.insertRecord(dto, contentHash);
          if (success) {
            result.added++;
          } else {
            result.errors.push(`Failed to insert record: ${dto.title}`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          result.errors.push(`Error processing "${dto.title}": ${errorMsg}`);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Ingestion service error: ${errorMsg}`);
    }

    return result;
  }

  /**
   * Log ingestion statistics
   */
  logStats(result: IngestionResult): void {
    console.log('📊 Ingestion Stats:');
    console.log(`  ✅ Added: ${result.added}`);
    console.log(`  ⏭️  Skipped (duplicates): ${result.skipped}`);
    console.log(`  ❌ Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0) {
      console.log('  Error details:');
      result.errors.forEach((err, idx) => {
        console.log(`    ${idx + 1}. ${err}`);
      });
    }
  }
}

