-- Fix ON CONFLICT issue with partial unique index
-- PostgreSQL may have issues matching ON CONFLICT (content_hash) with partial unique indexes
-- This migration ensures the index is properly recognized for conflict resolution

-- Drop and recreate the unique index to ensure it's properly set up
DROP INDEX IF EXISTS idx_source_records_content_hash_unique;

-- Recreate the unique index (partial index allowing NULLs)
CREATE UNIQUE INDEX idx_source_records_content_hash_unique 
ON source_records(content_hash) 
WHERE content_hash IS NOT NULL;

-- Verify the index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_source_records_content_hash_unique'
  ) THEN
    RAISE EXCEPTION 'Unique index idx_source_records_content_hash_unique was not created';
  END IF;
END $$;

-- Comment for documentation
COMMENT ON INDEX idx_source_records_content_hash_unique IS 'Partial unique index on content_hash for deduplication. Allows multiple NULL values but enforces uniqueness for non-NULL values. Used by batch_insert_source_records function for ON CONFLICT resolution.';

