-- ============================================================================
-- SCAN SESSIONS TABLE
-- Tracks environmental scan sessions for workflow metrics and decision logging
-- Part of Phase 8: Scan Workflow Integration
-- ============================================================================

-- Create scan_sessions table
CREATE TABLE scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  items_reviewed INTEGER DEFAULT 0,
  items_linked_to_topics INTEGER DEFAULT 0,
  items_created_watch INTEGER DEFAULT 0,
  items_dismissed INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for query performance
CREATE INDEX idx_scan_sessions_org ON scan_sessions(organization_id);
CREATE INDEX idx_scan_sessions_user ON scan_sessions(user_id);
CREATE INDEX idx_scan_sessions_started_at ON scan_sessions(started_at DESC);

-- Add RLS policies
ALTER TABLE scan_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view scan sessions for their organization
CREATE POLICY scan_sessions_select_policy ON scan_sessions
  FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM organizations
      WHERE id = organization_id
    )
  );

-- Policy: Users can create scan sessions for their organization
CREATE POLICY scan_sessions_insert_policy ON scan_sessions
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT id FROM organizations
      WHERE id = organization_id
    )
  );

-- Policy: Users can update their own scan sessions
CREATE POLICY scan_sessions_update_policy ON scan_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own scan sessions
CREATE POLICY scan_sessions_delete_policy ON scan_sessions
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- HELPER FUNCTIONS FOR SCAN SESSIONS
-- ============================================================================

-- Get scan session statistics for an organization (last 30 days)
CREATE OR REPLACE FUNCTION get_scan_session_stats(p_organization_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  total_sessions BIGINT,
  total_items_reviewed BIGINT,
  total_linked INTEGER,
  total_watch_items INTEGER,
  total_dismissed INTEGER,
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
    COALESCE(SUM(items_dismissed), 0)::INTEGER as total_dismissed,
    COALESCE(AVG(items_reviewed), 0)::NUMERIC as avg_items_per_session,
    COALESCE(
      AVG(
        EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
      ), 0
    )::NUMERIC as avg_session_duration_minutes
  FROM scan_sessions
  WHERE organization_id = p_organization_id
    AND started_at >= NOW() - (p_days || ' days')::INTERVAL
    AND ended_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get recent scan sessions for an organization
CREATE OR REPLACE FUNCTION get_recent_scan_sessions(
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
  items_dismissed INTEGER,
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
    ss.items_dismissed,
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

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE scan_sessions IS 'Tracks environmental scan workflow sessions for metrics and decision logging';
COMMENT ON COLUMN scan_sessions.started_at IS 'When the scan session began';
COMMENT ON COLUMN scan_sessions.ended_at IS 'When the scan session ended (NULL if still in progress)';
COMMENT ON COLUMN scan_sessions.items_reviewed IS 'Total number of source records reviewed in this session';
COMMENT ON COLUMN scan_sessions.items_linked_to_topics IS 'Number of records linked to topics during this session';
COMMENT ON COLUMN scan_sessions.items_created_watch IS 'Number of watch items created during this session';
COMMENT ON COLUMN scan_sessions.items_dismissed IS 'Number of records dismissed during this session';
COMMENT ON COLUMN scan_sessions.notes IS 'Optional session notes or observations';

