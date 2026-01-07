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
  private userId?: string | null;
  private verifiedSourceIds: Set<string> = new Set();

  constructor(service: IngestionService, userId?: string | null) {
    this.service = service;
    this.userId = userId;
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
   * Verify that the source exists in the database
   */
  private async verifySourceExists(sourceId: string): Promise<boolean> {
    if (this.verifiedSourceIds.has(sourceId)) {
      return true;
    }
    const { data, error } = await supabase
      .from('sources')
      .select('id')
      .eq('id', sourceId)
      .single();

    if (error || !data) {
      console.error(`Source ${sourceId} does not exist in database:`, error?.message || 'Not found');
      return false;
    }

    this.verifiedSourceIds.add(sourceId);
    return true;
  }

  /**
   * Batch insert records using upsert-on-conflict for deduplication
   * Uses content_hash unique constraint to skip duplicates at DB level
   */
  private async batchInsertRecords(
    dtos: Array<{ dto: SourceRecordDTO; contentHash: string }>,
    batchSize: number = 100
  ): Promise<{ inserted: number; skipped: number; errors: string[] }> {
    const result = { inserted: 0, skipped: 0, errors: [] as string[] };

    // Process in batches
    for (let i = 0; i < dtos.length; i += batchSize) {
      const batch = dtos.slice(i, i + batchSize);
      
      // Verify all sources exist first (cached check)
      const sourceIds = [...new Set(batch.map(item => item.dto.source_id))];
      for (const sourceId of sourceIds) {
        const exists = await this.verifySourceExists(sourceId);
        if (!exists) {
          // Mark all records from this source as errors
          batch
            .filter(item => item.dto.source_id === sourceId)
            .forEach(item => {
              result.errors.push(`Source ${sourceId} does not exist: ${item.dto.title}`);
            });
        }
      }

      // Filter out records with invalid sources
      const validBatch = batch.filter(item => 
        this.verifiedSourceIds.has(item.dto.source_id)
      );

      if (validBatch.length === 0) {
        continue;
      }

      // Prepare batch for insert
      const insertData = validBatch.map(({ dto, contentHash }) => {
        // Build raw_metadata with content hash (for backwards compatibility)
        const rawMetadata = {
          ...(dto.raw_metadata || {}),
          content_hash: contentHash,
        };

        return {
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
          content_hash: contentHash, // Store in dedicated column for fast dedupe
          // Phase 1: Content optimization and media types
          media_type: dto.media_type ?? 'article',
          content_type: dto.content_type ?? 'full_text',
          content_compressed: dto.content_compressed ?? false,
          content_length: dto.content_length ?? null,
        };
      });

      // Use PostgreSQL function for efficient batch insert with ON CONFLICT DO NOTHING
      // This handles duplicates atomically at the database level
      const recordsJson = insertData.map(row => ({
        source_id: row.source_id,
        title: row.title,
        url: row.url,
        content: row.content,
        published_at: row.published_at,
        language: row.language,
        geographic_indicators: row.geographic_indicators,
        raw_metadata: row.raw_metadata,
        content_hash: row.content_hash,
        media_type: row.media_type,
        content_type: row.content_type,
        content_compressed: row.content_compressed,
        content_length: row.content_length,
      }));

      // Debug: Check if any of these hashes already exist
      if (validBatch.length > 0) {
        const sampleHash = validBatch[0].contentHash;
        const { data: existingRecord, error: checkError } = await supabase
          .from('source_records')
          .select('id, title, content_hash, ingested_at')
          .eq('content_hash', sampleHash)
          .limit(1);
        
        if (!checkError && existingRecord && existingRecord.length > 0) {
          console.log(`    🔍 Sample hash ${sampleHash.substring(0, 16)}... already exists in database:`);
          console.log(`       Existing record: "${existingRecord[0].title}" (ingested: ${existingRecord[0].ingested_at})`);
          console.log(`       New record: "${validBatch[0].dto.title}"`);
        } else {
          console.log(`    ✅ Sample hash ${sampleHash.substring(0, 16)}... is new (not found in database)`);
        }
      }

      // Try a test insert first to see if ON CONFLICT works
      if (validBatch.length > 0 && process.env.DEBUG_INGESTION === 'true') {
        const testRecord = insertData[0];
        console.log(`   🧪 Testing direct insert with ON CONFLICT for first record...`);
        console.log(`      Hash: ${validBatch[0].contentHash.substring(0, 32)}...`);
        
        const { data: testInsert, error: testError } = await supabase
          .from('source_records')
          .insert(testRecord as any)
          .select('id')
          .maybeSingle();
        
        if (testError) {
          if (testError.code === '23505') {
            console.warn(`      ✗ Test insert failed: Unique constraint violation (hash exists)`);
          } else {
            console.error(`      ✗ Test insert failed: ${testError.message} (code: ${testError.code})`);
          }
        } else if (testInsert) {
          console.log(`      ✓ Test insert succeeded: Record inserted with ID ${testInsert.id}`);
          // Delete the test record
          await supabase.from('source_records').delete().eq('id', testInsert.id);
          console.log(`      🗑️  Test record deleted`);
        }
      }

      const { data: functionResult, error: rpcError } = await supabase.rpc(
        'batch_insert_source_records',
        { records: recordsJson as any }
      );

      if (rpcError) {
        // RPC function failed - log error and fall back to direct insert
        console.error('Batch insert RPC function error:', rpcError);
        console.error('Error code:', rpcError.code);
        console.error('Error message:', rpcError.message);
        console.error('Error details:', JSON.stringify(rpcError, null, 2));
        console.error('Falling back to direct insert method');
        // Fall through to direct insert fallback below
      } else if (functionResult && functionResult.length > 0) {
        // Success: function handled duplicates and returned counts + IDs
        const functionData = functionResult[0] as { 
          inserted_count: number; 
          skipped_count: number;
          inserted_ids: string[];
        };
        
        result.inserted += functionData.inserted_count || 0;
        result.skipped += functionData.skipped_count || 0;
        
        // Log if everything was skipped (potential issue)
        if (functionData.inserted_count === 0 && functionData.skipped_count === validBatch.length && validBatch.length > 0) {
          console.warn(`⚠️  All ${validBatch.length} records in batch were skipped as duplicates.`);
          console.warn(`   This might indicate a hash calculation issue or existing records with matching hashes.`);
          
          // Check ALL unique hashes in the batch to see which ones exist
          const uniqueHashesInBatch = [...new Set(validBatch.map(item => item.contentHash))];
          console.warn(`   Checking ${uniqueHashesInBatch.length} unique hash(es) in batch...`);
          
          for (const hash of uniqueHashesInBatch.slice(0, 5)) { // Check first 5 unique hashes
            const { data: existingHash, error: hashCheckError } = await supabase
              .from('source_records')
              .select('id, title, content_hash, source_id, published_at')
              .eq('content_hash', hash)
              .limit(1);
            
            if (!hashCheckError && existingHash && existingHash.length > 0) {
              const existing = existingHash[0];
              const matchingItems = validBatch.filter(item => item.contentHash === hash);
              console.warn(`   ✓ Hash ${hash.substring(0, 16)}... EXISTS in DB: "${existing.title}" (source: ${existing.source_id})`);
              console.warn(`     Trying to insert ${matchingItems.length} item(s) with this hash:`);
              matchingItems.forEach((item, idx) => {
                console.warn(`       ${idx + 1}. "${item.dto.title}" (published: ${item.dto.published_at?.toISOString() || 'null'})`);
              });
            } else {
              console.warn(`   ✗ Hash ${hash.substring(0, 16)}... NOT found in DB (but was skipped by function)`);
              // This is suspicious - hash doesn't exist but was skipped
              const matchingItems = validBatch.filter(item => item.contentHash === hash);
              if (matchingItems.length > 1) {
                console.warn(`     ⚠️  ${matchingItems.length} items in batch have this hash - they conflict with EACH OTHER`);
                console.warn(`     The function processes sequentially, so only the first would insert, rest conflict`);
              }
            }
          }
          
          // Also check if all items have the same hash
          if (uniqueHashesInBatch.length === 1) {
            console.warn(`   ⚠️  CRITICAL: All ${validBatch.length} records have the SAME hash!`);
            console.warn(`     Hash: ${uniqueHashesInBatch[0].substring(0, 32)}...`);
            console.warn(`     Sample items:`);
            validBatch.slice(0, 3).forEach((item, idx) => {
              console.warn(`       ${idx + 1}. Title: "${item.dto.title}"`);
              console.warn(`          Content length: ${(item.dto.content || '').length} chars`);
              console.warn(`          Published: ${item.dto.published_at?.toISOString() || 'null'}`);
            });
          }
        } else {
          console.log(`   Batch result: ${functionData.inserted_count} inserted, ${functionData.skipped_count} skipped`);
        }

        // Audit log inserted records using returned IDs
        // Fetch full record data for audit logging (title, metadata, etc.)
        if (functionData.inserted_ids && functionData.inserted_ids.length > 0) {
          const { data: insertedRecords, error: fetchError } = await supabase
            .from('source_records')
            .select('id, title, source_id, media_type, content_type, content_length, content_compressed')
            .in('id', functionData.inserted_ids);

          if (!fetchError && insertedRecords) {
            // Audit log each inserted record (fire and forget)
            insertedRecords.forEach((record) => {
              void auditService.logSourceRecordCreated(
                record.id,
                {
                  title: record.title,
                  source_id: record.source_id,
                  media_type: record.media_type || 'article',
                  content_type: record.content_type || 'full_text',
                  content_length: record.content_length ?? null,
                  content_compressed: record.content_compressed || false,
                },
                this.userId || undefined
              );
            });
          }
        }
        
        continue; // Move to next batch
      }

      // Fallback: if RPC function doesn't exist or fails, use direct insert
      // This handles backwards compatibility during migration
      const { data: insertedRecords, error } = await supabase
        .from('source_records')
        .insert(insertData as any)
        .select('id, title, content_hash');

      if (error) {
        // If batch insert fails due to unique constraint violations, 
        // fall back to individual inserts to identify which are duplicates
        if (error.code === '23505') {
          // Unique constraint violation - some records are duplicates
          // Process individually to identify which ones
          for (const { dto, contentHash } of validBatch) {
            try {
              const rawMetadata = {
                ...(dto.raw_metadata || {}),
                content_hash: contentHash,
              };

              const insertRow = {
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
                content_hash: contentHash,
                media_type: dto.media_type ?? 'article',
                content_type: dto.content_type ?? 'full_text',
                content_compressed: dto.content_compressed ?? false,
                content_length: dto.content_length ?? null,
              };

              const { data: insertedRecord, error: insertError } = await supabase
                .from('source_records')
                .insert(insertRow as any)
                .select('id')
                .single<{ id: string }>();

              if (insertError) {
                // Check if it's a duplicate (unique constraint violation on content_hash)
                if (insertError.code === '23505' && insertError.message?.includes('content_hash')) {
                  result.skipped++;
                } else {
                  result.errors.push(`Failed to insert "${dto.title}": ${insertError.message}`);
                }
              } else if (insertedRecord) {
                result.inserted++;
                // Audit log (fire and forget)
                void auditService.logSourceRecordCreated(
                  insertedRecord.id,
                  {
                    title: dto.title,
                    source_id: dto.source_id,
                    media_type: dto.media_type,
                    content_type: dto.content_type,
                    content_length: dto.content_length ?? null,
                    content_compressed: dto.content_compressed ?? false,
                  },
                  this.userId || undefined
                );
              }
            } catch (err) {
              result.errors.push(`Error inserting "${dto.title}": ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }
        } else {
          // Other error - log and mark batch as failed
          console.error('Batch insert error:', error);
          validBatch.forEach(({ dto }) => {
            result.errors.push(`Failed to insert "${dto.title}": ${error.message}`);
          });
        }
      } else {
        // Success: all records inserted (no duplicates in this batch)
        const insertedCount = insertedRecords?.length || 0;
        result.inserted += insertedCount;

        // Audit log for inserted records (fire and forget)
        if (insertedRecords && insertedRecords.length > 0) {
          insertedRecords.forEach((record) => {
            const originalItem = validBatch.find(item => item.contentHash === record.content_hash);
            if (originalItem) {
              void auditService.logSourceRecordCreated(
                record.id,
                {
                  title: originalItem.dto.title,
                  source_id: originalItem.dto.source_id,
                  media_type: originalItem.dto.media_type,
                  content_type: originalItem.dto.content_type,
                  content_length: originalItem.dto.content_length ?? null,
                  content_compressed: originalItem.dto.content_compressed ?? false,
                },
                this.userId || undefined
              );
            }
          });
        }
      }
    }

    return result;
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

      // Generate content hashes for all records
      const recordsWithHashes = dtos.map(dto => ({
        dto,
        contentHash: this.generateContentHash(dto),
      }));

      // Debug: Log hash statistics to detect duplicates within batch
      if (recordsWithHashes.length > 0) {
        const sampleHash = recordsWithHashes[0].contentHash;
        const sampleTitle = recordsWithHashes[0].dto.title;
        console.log(`    🔑 Sample content hash for "${sampleTitle.substring(0, 50)}...": ${sampleHash.substring(0, 16)}...`);
        
        // Check for duplicate hashes within the batch
        const hashMap = new Map<string, number>();
        recordsWithHashes.forEach(({ contentHash, dto }) => {
          const count = hashMap.get(contentHash) || 0;
          hashMap.set(contentHash, count + 1);
        });
        
        const uniqueHashes = hashMap.size;
        const totalRecords = recordsWithHashes.length;
        const duplicatesInBatch = totalRecords - uniqueHashes;
        
        if (duplicatesInBatch > 0) {
          console.warn(`    ⚠️  Found ${duplicatesInBatch} duplicate hash(es) within the batch (${uniqueHashes} unique hashes for ${totalRecords} records)`);
          
          // Show which hashes are duplicated
          const duplicateHashes = Array.from(hashMap.entries())
            .filter(([_, count]) => count > 1)
            .map(([hash, count]) => ({ hash: hash.substring(0, 16), count }));
          
          if (duplicateHashes.length > 0) {
            console.warn(`    📋 Duplicate hashes: ${duplicateHashes.map(d => `${d.hash}... (${d.count}x)`).join(', ')}`);
          }
        } else {
          console.log(`    ✅ All ${totalRecords} records have unique hashes`);
        }
      }

      // Batch insert with upsert-on-conflict for DB-side deduplication
      // Batch size: 100 records per batch (adjustable based on performance)
      const batchResult = await this.batchInsertRecords(recordsWithHashes, 100);
      
      result.added = batchResult.inserted;
      result.skipped = batchResult.skipped;
      result.errors = batchResult.errors;
      
      // Log summary
      if (result.skipped > 0 && result.added === 0 && recordsWithHashes.length > 0) {
        console.warn(`    ⚠️  All ${recordsWithHashes.length} records were skipped. This might indicate:`);
        console.warn(`       1. All records are actual duplicates (unlikely for new feeds)`);
        console.warn(`       2. Existing records have matching content_hash values`);
        console.warn(`       3. Database constraint or function issue`);
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

