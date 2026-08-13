-- Replace partial unique index with a unique constraint
-- PostgreSQL's ON CONFLICT works more reliably with unique constraints than partial unique indexes
-- However, unique constraints can't be partial, so we'll need a different approach

-- Option 1: Create a unique constraint (but this won't allow NULLs the way we want)
-- Actually, unique constraints in PostgreSQL DO allow multiple NULLs, so this should work!

-- First, drop the existing unique index
DROP INDEX IF EXISTS idx_source_records_content_hash_unique;

-- Create a unique constraint on content_hash
-- Note: PostgreSQL unique constraints allow multiple NULL values
-- Only non-NULL values must be unique
ALTER TABLE source_records
ADD CONSTRAINT source_records_content_hash_unique 
UNIQUE (content_hash);

-- Verify the constraint was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'source_records_content_hash_unique'
  ) THEN
    RAISE EXCEPTION 'Unique constraint source_records_content_hash_unique was not created';
  END IF;
  
  RAISE NOTICE '✓ Unique constraint created successfully';
END $$;

-- Comment for documentation
COMMENT ON CONSTRAINT source_records_content_hash_unique ON source_records IS 
'Unique constraint on content_hash for deduplication. Allows multiple NULL values but enforces uniqueness for non-NULL values. Used by batch_insert_source_records function for ON CONFLICT resolution.';

