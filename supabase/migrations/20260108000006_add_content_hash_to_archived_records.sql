-- Add content_hash to archived_source_records table
-- This allows ingestion to check archived records for duplicates
-- Prevents re-ingestion of archived/deleted records

-- Add content_hash column to archived_source_records
ALTER TABLE archived_source_records
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Create index for faster lookups (not unique, since archived records can have duplicates)
CREATE INDEX IF NOT EXISTS idx_archived_source_records_content_hash 
ON archived_source_records(content_hash)
WHERE content_hash IS NOT NULL;

-- Backfill content_hash for existing archived records
-- Calculate from title, content, and published_at (same logic as source_records)
UPDATE archived_source_records
SET content_hash = encode(
  digest(
    COALESCE(title, '') || '|' || 
    COALESCE(content, '') || '|' || 
    COALESCE(published_at::text, ''),
    'sha256'
  ),
  'hex'
)
WHERE content_hash IS NULL;

COMMENT ON COLUMN archived_source_records.content_hash IS 'SHA-256 hash of title|content|published_at for deduplication. Used by ingestion to prevent re-ingestion of archived records.';

