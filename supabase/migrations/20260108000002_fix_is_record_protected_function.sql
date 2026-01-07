-- Fix is_record_protected function to remove dismissed check
-- The dismissed check was causing all non-dismissed records to be protected
-- Since we removed dismiss functionality, we should only protect records with actual relationships

CREATE OR REPLACE FUNCTION is_record_protected(record_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_topic_link BOOLEAN;
  has_artifact BOOLEAN;
  has_watch_link BOOLEAN;
BEGIN
  -- Check if linked to any topic
  SELECT EXISTS(
    SELECT 1 FROM topic_source_links WHERE source_record_id = record_id
  ) INTO has_topic_link;
  
  -- Check if has any artifacts
  SELECT EXISTS(
    SELECT 1 FROM analytic_artifacts WHERE source_record_id = record_id
  ) INTO has_artifact;
  
  -- Check if linked to any watch item
  SELECT EXISTS(
    SELECT 1 FROM watch_item_records WHERE source_record_id = record_id
  ) INTO has_watch_link;
  
  -- Protected if ANY relationship exists (removed dismissed check)
  RETURN has_topic_link OR has_artifact OR has_watch_link;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_record_protected(UUID) IS 'Checks if a source record is protected from deletion/archival. Protected if linked to topics, has artifacts, or linked to watch items.';

