-- Backfill content_hash for existing records that don't have it
-- This ensures all records have proper content_hash values for deduplication
-- Part of ingestion performance optimization fix

-- Function to calculate content_hash (same logic as IngestionController)
CREATE OR REPLACE FUNCTION calculate_content_hash(
  p_title TEXT,
  p_content TEXT,
  p_published_at TIMESTAMPTZ
) RETURNS TEXT AS $$
DECLARE
  hash_input TEXT;
BEGIN
  -- Build hash input: title|content|published_at (same as IngestionController.generateContentHash)
  hash_input := COALESCE(p_title, '') || '|' || 
                COALESCE(p_content, '') || '|' || 
                COALESCE(p_published_at::TEXT, '');
  
  -- Return SHA-256 hash (PostgreSQL's digest function)
  RETURN encode(digest(hash_input, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill content_hash for records that don't have it
-- This handles the case where multiple NULL records might produce the same hash
-- Strategy: 
-- 1. Only update hashes that don't already exist in the database
-- 2. For duplicate hashes (multiple NULL records with same content), only update ONE record per hash
--    (using DISTINCT ON to pick the oldest record by id)

WITH calculated_hashes AS (
  -- Calculate hash for all records that don't have one
  SELECT 
    id,
    calculate_content_hash(title, content, published_at) AS new_hash
  FROM source_records
  WHERE content_hash IS NULL
    AND title IS NOT NULL
),
existing_hashes AS (
  -- Get all hashes that already exist in the database
  SELECT DISTINCT content_hash
  FROM source_records
  WHERE content_hash IS NOT NULL
),
unique_hashes_to_insert AS (
  -- For each unique hash that doesn't exist yet, pick ONE record to update
  -- This prevents trying to set multiple rows to the same hash value
  SELECT DISTINCT ON (ch.new_hash) ch.id, ch.new_hash
  FROM calculated_hashes ch
  WHERE ch.new_hash NOT IN (SELECT content_hash FROM existing_hashes)
  ORDER BY ch.new_hash, ch.id  -- Use id as tiebreaker for consistent selection
)
UPDATE source_records sr
SET content_hash = uht.new_hash
FROM unique_hashes_to_insert uht
WHERE sr.id = uht.id
  AND sr.content_hash IS NULL;

-- Note: 
-- - Records whose calculated hash already exists are left as NULL (they're duplicates of existing records)
-- - If multiple NULL records would produce the same hash, only the first one (by id) gets updated
--   The others remain NULL and will be treated as duplicates on future inserts
-- This is safe because the unique constraint only applies to non-NULL values

-- Clean up: Drop the helper function (no longer needed after backfill)
DROP FUNCTION IF EXISTS calculate_content_hash(TEXT, TEXT, TIMESTAMPTZ);

-- Comment for documentation
COMMENT ON COLUMN source_records.content_hash IS 'SHA-256 hash of title|content|published_at for deduplication. Unique constraint prevents duplicate records. All records should have this value populated.';

