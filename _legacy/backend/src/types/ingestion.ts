/**
 * Ingestion Layer Type Definitions
 * 
 * Provides abstraction for ingesting content from multiple sources
 * (RSS, manual input, API, email) into the OSINT SourceRecords schema.
 */

// ============================================================================
// SOURCE RECORD DTO
// ============================================================================

/**
 * Data Transfer Object for normalized source records
 * Maps various source types to the unified source_records schema
 */
export interface SourceRecordDTO {
  source_id: string;
  title: string;
  url?: string;
  content?: string;
  published_at?: Date;
  language?: string;
  geographic_indicators?: string[];
  raw_metadata?: Record<string, any>;
  // Phase 1: Content optimization and media types
  media_type?: 'article' | 'video' | 'podcast' | 'audio' | 'other';
  content_type?: 'full_text' | 'summary' | 'structured' | 'minimal';
  content_compressed?: boolean;
  content_length?: number;
}

// ============================================================================
// INGESTION SERVICE INTERFACE
// ============================================================================

/**
 * Interface for all ingestion service implementations
 * Each source type (RSS, manual, API, email) implements this interface
 */
export interface IngestionService {
  /**
   * Fetch and normalize content from the source
   * @returns Array of normalized source record DTOs
   */
  fetchAndNormalize(): Promise<SourceRecordDTO[]>;
}

// ============================================================================
// INGESTION RESULTS
// ============================================================================

/**
 * Result of an ingestion operation
 */
export interface IngestionResult {
  added: number;
  skipped: number;
  errors: string[];
  records?: SourceRecordDTO[];
}

/**
 * Statistics for ingestion operations
 */
export interface IngestionStats {
  totalProcessed: number;
  successfullyAdded: number;
  duplicatesSkipped: number;
  errorsEncountered: number;
  startTime: Date;
  endTime: Date;
  durationMs: number;
}

