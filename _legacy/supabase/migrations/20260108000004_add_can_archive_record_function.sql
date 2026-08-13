-- Add function to check if a record can be archived
-- A record can be archived if:
-- - Not linked to any active (non-archived) topics
-- - Not linked to any watch items
-- - Has no artifacts
-- If linked to archived topics, archiving is allowed

CREATE OR REPLACE FUNCTION can_archive_record(record_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_active_topic_link BOOLEAN;
  has_artifact BOOLEAN;
  has_watch_link BOOLEAN;
BEGIN
  -- Check if linked to any active (non-archived) topic
  SELECT EXISTS(
    SELECT 1 
    FROM topic_source_links tsl
    INNER JOIN osint_topics ot ON tsl.topic_id = ot.id
    WHERE tsl.source_record_id = record_id
      AND ot.status != 'archived'
  ) INTO has_active_topic_link;
  
  -- Check if has any artifacts
  SELECT EXISTS(
    SELECT 1 FROM analytic_artifacts WHERE source_record_id = record_id
  ) INTO has_artifact;
  
  -- Check if linked to any watch item
  SELECT EXISTS(
    SELECT 1 FROM watch_item_records WHERE source_record_id = record_id
  ) INTO has_watch_link;
  
  -- Can archive if NO active topic links, NO artifacts, and NO watch item links
  RETURN NOT (has_active_topic_link OR has_artifact OR has_watch_link);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION can_archive_record(UUID) IS 'Checks if a source record can be archived. Returns true if record is not linked to active topics, has no artifacts, and is not linked to watch items. Records linked only to archived topics can be archived.';

