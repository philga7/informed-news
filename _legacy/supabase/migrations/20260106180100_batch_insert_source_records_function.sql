-- PostgreSQL function for efficient batch insert with ON CONFLICT DO NOTHING
-- This allows Supabase to insert multiple records while skipping duplicates atomically
-- Part of ingestion performance optimization: DB-side dedupe with batched inserts
-- Returns inserted record IDs for audit logging

CREATE OR REPLACE FUNCTION batch_insert_source_records(
  records jsonb
)
RETURNS TABLE(
  inserted_count integer, 
  skipped_count integer,
  inserted_ids uuid[]
) AS $$
DECLARE
  record_item jsonb;
  inserted integer := 0;
  skipped integer := 0;
  inserted_ids_array uuid[] := ARRAY[]::uuid[];
  inserted_id uuid;
BEGIN
  -- Process each record in the JSONB array
  FOR record_item IN SELECT * FROM jsonb_array_elements(records)
  LOOP
    BEGIN
      -- Validate that content_hash is provided and not NULL
      IF record_item->>'content_hash' IS NULL OR record_item->>'content_hash' = 'null' THEN
        RAISE WARNING 'Record missing content_hash: %', COALESCE(record_item->>'title', 'unknown');
        skipped := skipped + 1;
        CONTINUE;
      END IF;
      
      -- Check if this content_hash exists in archived_source_records (prevent re-ingestion of archived records)
      IF EXISTS (
        SELECT 1 FROM archived_source_records 
        WHERE content_hash = record_item->>'content_hash'
      ) THEN
        -- Skip this record - it was previously archived
        skipped := skipped + 1;
        CONTINUE;
      END IF;
      
      -- Insert the record with ON CONFLICT handling
      INSERT INTO source_records (
        source_id,
        title,
        url,
        content,
        published_at,
        language,
        geographic_indicators,
        raw_metadata,
        content_hash,
        media_type,
        content_type,
        content_compressed,
        content_length
      )
      VALUES (
        (record_item->>'source_id')::uuid,
        record_item->>'title',
        NULLIF(record_item->>'url', 'null'),
        NULLIF(record_item->>'content', 'null'),
        CASE WHEN record_item->>'published_at' IS NOT NULL AND record_item->>'published_at' != 'null' 
             THEN (record_item->>'published_at')::timestamptz 
             ELSE NULL END,
        NULLIF(record_item->>'language', 'null'),
        CASE WHEN record_item->'geographic_indicators' IS NOT NULL AND record_item->'geographic_indicators' != 'null'
             THEN record_item->'geographic_indicators'
             ELSE NULL END,
        CASE WHEN record_item->'raw_metadata' IS NOT NULL AND record_item->'raw_metadata' != 'null'
             THEN record_item->'raw_metadata'
             ELSE NULL END,
        record_item->>'content_hash',
        COALESCE(record_item->>'media_type', 'article'),
        COALESCE(record_item->>'content_type', 'full_text'),
        COALESCE((record_item->>'content_compressed')::boolean, false),
        CASE WHEN record_item->>'content_length' IS NOT NULL AND record_item->>'content_length' != 'null'
             THEN (record_item->>'content_length')::integer
             ELSE NULL END
      )
      ON CONFLICT ON CONSTRAINT source_records_content_hash_unique
      DO NOTHING
      RETURNING id INTO inserted_id;
      
      -- Check if insert succeeded
      -- When ON CONFLICT DO NOTHING triggers, RETURNING returns nothing and inserted_id stays NULL
      -- When insert succeeds, RETURNING returns the ID
      IF inserted_id IS NOT NULL THEN
        inserted := inserted + 1;
        inserted_ids_array := array_append(inserted_ids_array, inserted_id);
      ELSE
        -- No ID returned means it was skipped due to duplicate (ON CONFLICT DO NOTHING)
        -- OR there was an issue with the insert that didn't raise an exception
        skipped := skipped + 1;
      END IF;
    EXCEPTION
      WHEN unique_violation THEN
        -- Unique constraint violation - this is a duplicate
        skipped := skipped + 1;
      WHEN OTHERS THEN
        -- Other errors (foreign key, not null, etc.) - log and skip
        -- This includes any errors that weren't unique_violation
        RAISE WARNING 'Failed to insert record (title: %, hash: %): % (SQLSTATE: %)', 
          COALESCE(record_item->>'title', 'unknown'),
          COALESCE(record_item->>'content_hash', 'null'),
          SQLERRM,
          SQLSTATE;
        skipped := skipped + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT inserted, skipped, inserted_ids_array;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION batch_insert_source_records(jsonb) TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION batch_insert_source_records(jsonb) IS 'Efficiently inserts multiple source records, skipping duplicates based on content_hash unique constraint. Also checks archived_source_records to prevent re-ingestion of archived records. Returns count of inserted and skipped records, plus array of inserted record IDs for audit logging.';

