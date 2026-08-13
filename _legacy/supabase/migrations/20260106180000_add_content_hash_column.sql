-- Add content_hash column for fast DB-side deduplication
-- Replaces raw_metadata->>'content_hash' JSONB path lookups with direct column access
-- Part of ingestion performance optimization: DB-side dedupe with upsert-on-conflict

-- Add content_hash column (nullable for existing records)
ALTER TABLE source_records
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create unique index for deduplication (allows NULLs - multiple NULLs are allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_records_content_hash_unique 
ON source_records(content_hash) 
WHERE content_hash IS NOT NULL;

-- Migrate existing content_hash values from raw_metadata to the new column
-- This ensures existing records are also deduplicated correctly
UPDATE source_records
SET content_hash = raw_metadata->>'content_hash'
WHERE content_hash IS NULL 
  AND raw_metadata IS NOT NULL 
  AND raw_metadata->>'content_hash' IS NOT NULL;

-- Create a regular index for faster lookups (in addition to unique index)
CREATE INDEX IF NOT EXISTS idx_source_records_content_hash 
ON source_records(content_hash)
WHERE content_hash IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN source_records.content_hash IS 'SHA-256 hash of title + content + published_at for deduplication. Unique constraint prevents duplicate records.';

