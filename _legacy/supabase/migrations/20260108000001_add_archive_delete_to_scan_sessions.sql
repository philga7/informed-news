-- Add archive and delete columns to scan_sessions table
-- Replaces items_dismissed with items_archived and items_deleted

ALTER TABLE scan_sessions
ADD COLUMN IF NOT EXISTS items_archived INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS items_deleted INTEGER DEFAULT 0;

-- Update existing records: migrate items_dismissed to items_archived
-- (assuming dismissed records should be considered archived)
UPDATE scan_sessions
SET items_archived = COALESCE(items_dismissed, 0)
WHERE items_archived = 0 AND items_dismissed > 0;

-- Drop the existing function first (return type is changing)
DROP FUNCTION IF EXISTS get_scan_session_stats(UUID, INTEGER);

-- Recreate the get_scan_session_stats function with archived/deleted columns
CREATE FUNCTION get_scan_session_stats(
  p_organization_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  total_sessions BIGINT,
  total_items_reviewed BIGINT,
  total_linked INTEGER,
  total_watch_items INTEGER,
  total_archived INTEGER,
  total_deleted INTEGER,
  avg_items_per_session NUMERIC,
  avg_session_duration_minutes NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_sessions,
    COALESCE(SUM(items_reviewed), 0)::BIGINT as total_items_reviewed,
    COALESCE(SUM(items_linked_to_topics), 0)::INTEGER as total_linked,
    COALESCE(SUM(items_created_watch), 0)::INTEGER as total_watch_items,
    COALESCE(SUM(items_archived), 0)::INTEGER as total_archived,
    COALESCE(SUM(items_deleted), 0)::INTEGER as total_deleted,
    COALESCE(AVG(items_reviewed), 0)::NUMERIC as avg_items_per_session,
    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0
      ),
      0
    )::NUMERIC as avg_session_duration_minutes
  FROM scan_sessions
  WHERE organization_id = p_organization_id
    AND started_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Drop the existing function first (return type is changing)
DROP FUNCTION IF EXISTS get_recent_scan_sessions(UUID, INTEGER);

-- Recreate the get_recent_scan_sessions function with archived/deleted columns
-- Note: Maintaining original return structure but replacing items_dismissed with items_archived/items_deleted
CREATE FUNCTION get_recent_scan_sessions(
  p_organization_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  items_reviewed INTEGER,
  items_linked_to_topics INTEGER,
  items_created_watch INTEGER,
  items_archived INTEGER,
  items_deleted INTEGER,
  notes TEXT,
  session_duration_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ss.id,
    ss.user_id,
    ss.started_at,
    ss.ended_at,
    ss.items_reviewed,
    ss.items_linked_to_topics,
    ss.items_created_watch,
    ss.items_archived,
    ss.items_deleted,
    ss.notes,
    CASE 
      WHEN ss.ended_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (ss.ended_at - ss.started_at))::INTEGER / 60
      ELSE NULL
    END as session_duration_minutes
  FROM scan_sessions ss
  WHERE ss.organization_id = p_organization_id
  ORDER BY ss.started_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add comments
COMMENT ON COLUMN scan_sessions.items_archived IS 'Number of records archived during this session';
COMMENT ON COLUMN scan_sessions.items_deleted IS 'Number of records permanently deleted during this session';

