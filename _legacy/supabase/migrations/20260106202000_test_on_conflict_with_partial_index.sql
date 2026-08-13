-- Test ON CONFLICT with partial unique index
-- This migration tests if ON CONFLICT works correctly with the partial unique index
-- If it doesn't work, we'll need to use a different approach

-- First, let's verify the index exists and is unique
DO $$
DECLARE
  index_exists boolean;
  is_unique boolean;
BEGIN
  -- Check if index exists
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_source_records_content_hash_unique'
  ) INTO index_exists;
  
  IF NOT index_exists THEN
    RAISE EXCEPTION 'Unique index idx_source_records_content_hash_unique does not exist';
  END IF;
  
  -- Check if it's a unique index
  SELECT indisunique INTO is_unique
  FROM pg_index i
  JOIN pg_class c ON i.indexrelid = c.oid
  WHERE c.relname = 'idx_source_records_content_hash_unique';
  
  IF NOT is_unique THEN
    RAISE EXCEPTION 'Index idx_source_records_content_hash_unique is not unique';
  END IF;
  
  RAISE NOTICE '✓ Index exists and is unique';
END $$;

-- Test if ON CONFLICT works with the partial index
-- This is a dry-run test that will be rolled back
DO $$
DECLARE
  test_hash TEXT := 'test_hash_' || md5(random()::text);
  test_source_id UUID;
  inserted_id UUID;
  inserted_count INTEGER := 0;
BEGIN
  -- Get a valid source_id for testing (use the first available)
  SELECT id INTO test_source_id FROM sources LIMIT 1;
  
  IF test_source_id IS NULL THEN
    RAISE NOTICE '⚠ No sources available for testing - skipping ON CONFLICT test';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing ON CONFLICT with hash: %', test_hash;
  
  -- Try to insert the same record twice with ON CONFLICT
  BEGIN
    -- First insert should succeed
    INSERT INTO source_records (
      source_id, title, url, content_hash, published_at
    )
    VALUES (
      test_source_id, 'Test Record 1', 'http://test.com', test_hash, NOW()
    )
    ON CONFLICT (content_hash) DO NOTHING
    RETURNING id INTO inserted_id;
    
    IF inserted_id IS NOT NULL THEN
      inserted_count := inserted_count + 1;
      RAISE NOTICE '✓ First insert succeeded: ID = %', inserted_id;
    ELSE
      RAISE WARNING '✗ First insert failed (unexpected - hash is unique)';
      RETURN;
    END IF;
    
    -- Second insert with same hash should be skipped
    INSERT INTO source_records (
      source_id, title, url, content_hash, published_at
    )
    VALUES (
      test_source_id, 'Test Record 2', 'http://test.com', test_hash, NOW()
    )
    ON CONFLICT (content_hash) DO NOTHING
    RETURNING id INTO inserted_id;
    
    IF inserted_id IS NULL THEN
      RAISE NOTICE '✓ Second insert correctly skipped (ON CONFLICT working)';
    ELSE
      RAISE WARNING '✗ Second insert succeeded (should have been skipped)';
      RAISE WARNING '  This indicates ON CONFLICT is not working with the partial unique index!';
    END IF;
    
    -- Clean up test record
    DELETE FROM source_records WHERE content_hash = test_hash;
    RAISE NOTICE '✓ Test completed and cleaned up';
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Test failed with error: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
      -- Clean up on error
      DELETE FROM source_records WHERE content_hash = test_hash;
      RAISE;
  END;
END $$;

-- If the test above shows ON CONFLICT is not working, we may need to:
-- 1. Create a UNIQUE CONSTRAINT instead of a unique index
-- 2. Or use a different conflict detection strategy

