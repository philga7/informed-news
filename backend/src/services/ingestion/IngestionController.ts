/**
 * Ingestion Controller
 * 
 * Central controller for ingesting content from any source type.
 * Handles deduplication, normalization, and database insertion.
 */

import crypto from 'crypto';
import { supabase } from '../../utils/supabase.js';
import { auditService } from '../auditService.js';
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
   * Verify that the source exists in the database
   */
  private async verifySourceExists(sourceId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('sources')
      .select('id')
      .eq('id', sourceId)
      .single();

    if (error || !data) {
      console.error(`Source ${sourceId} does not exist in database:`, error?.message || 'Not found');
      return false;
    }

    return true;
  }

  /**
   * Insert a source record into the database
   */
  private async insertRecord(dto: SourceRecordDTO, contentHash: string): Promise<boolean> {
    try {
      // Verify source exists before attempting insert
      const sourceExists = await this.verifySourceExists(dto.source_id);
      if (!sourceExists) {
        console.error(`Cannot insert record: source ${dto.source_id} does not exist`);
        return false;
      }

      // Build raw_metadata with content hash
      const rawMetadata = {
        ...(dto.raw_metadata || {}),
        content_hash: contentHash,
      };

      // Insert into source_records table
      const { data: insertedRecord, error } = await supabase
        .from('source_records')
        .insert({
          source_id: dto.source_id,
          title: dto.title,
          url: dto.url ?? null,
          content: dto.content ?? null,
          published_at: dto.published_at?.toISOString() ?? null,
          language: dto.language ?? null,
          geographic_indicators: dto.geographic_indicators 
            ? (JSON.parse(JSON.stringify(dto.geographic_indicators)) as any)
            : null,
          raw_metadata: rawMetadata as any,
          // Phase 1: Content optimization and media types
          media_type: dto.media_type ?? 'article',
          content_type: dto.content_type ?? 'full_text',
          content_compressed: dto.content_compressed ?? false,
          content_length: dto.content_length ?? null,
        } as any)
        .select('id')
        .single<{ id: string }>();

      if (error) {
        console.error('Error inserting source record:', error);
        // Check if it's a foreign key constraint error
        if (error.code === '23503') {
          console.error(`Foreign key violation: source ${dto.source_id} does not exist in sources table`);
        }
        return false;
      }

      // Audit log: source record created (system ingestion)
      if (insertedRecord && insertedRecord.id) {
        await auditService.logSourceRecordCreated(
          insertedRecord.id,
          {
            title: dto.title,
            source_id: dto.source_id,
            media_type: dto.media_type,
            content_type: dto.content_type,
            content_length: dto.content_length ?? null,
            content_compressed: dto.content_compressed ?? false,
          }
        );
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
      console.log(`    📥 Fetching and normalizing content from source...`);
      // Fetch and normalize content from source
      const dtos = await this.service.fetchAndNormalize();
      result.records = dtos;
      
      console.log(`    📦 Found ${dtos.length} item(s) to process`);

      // Process each record
      const totalRecords = dtos.length;
      for (let i = 0; i < dtos.length; i++) {
        const dto = dtos[i];
        const recordNum = i + 1;
        
        // Log progress every 10 records or for the last record
        if (recordNum % 10 === 0 || recordNum === totalRecords) {
          console.log(`    ⏳ Processing record ${recordNum}/${totalRecords}...`);
        }
        
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
      
      console.log(`    ✅ Processing complete: ${result.added} added, ${result.skipped} skipped, ${result.errors.length} errors`);
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

