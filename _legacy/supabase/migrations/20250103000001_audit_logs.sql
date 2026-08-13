-- Audit Logs Migration
-- Creates comprehensive audit trail for all key analyst actions
-- Part of Plan 9: Audit Trails, Workflow, and Quality Assurance

-- ============================================================================
-- ENUM TYPE FOR AUDIT ACTIONS
-- ============================================================================

-- Create enum types only if they don't exist
DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM (
      'topic_created',
      'topic_updated',
      'topic_deleted',
      'link_added',
      'link_updated',
      'link_removed',
      'confidence_changed',
      'artifact_created',
      'artifact_reviewed',
      'artifact_deleted',
      'source_updated',
      'source_rated'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE entity_type AS ENUM (
      'topic',
      'source_record',
      'link',
      'artifact',
      'source'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- AUDIT LOGS TABLE
-- ============================================================================

-- Create table only if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  action audit_action NOT NULL,
  entity_type entity_type NOT NULL,
  entity_id UUID NOT NULL,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR EFFICIENT QUERYING
-- ============================================================================

-- Primary query patterns: by entity, by user, by time
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- Composite index for entity history queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_time ON public.audit_logs(entity_type, entity_id, timestamp DESC);

-- ============================================================================
-- HELPER FUNCTION: JSON DIFF
-- ============================================================================

-- Helper function to highlight what changed between before/after states
CREATE OR REPLACE FUNCTION json_diff(before_json JSONB, after_json JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  key TEXT;
BEGIN
  -- Iterate through keys in after_json
  FOR key IN SELECT jsonb_object_keys(after_json) LOOP
    IF before_json IS NULL OR before_json->key IS DISTINCT FROM after_json->key THEN
      result := result || jsonb_build_object(key, jsonb_build_object(
        'before', COALESCE(before_json->key, 'null'::JSONB),
        'after', after_json->key
      ));
    END IF;
  END LOOP;
  
  -- Check for deleted keys (in before but not in after)
  IF before_json IS NOT NULL THEN
    FOR key IN SELECT jsonb_object_keys(before_json) LOOP
      IF NOT after_json ? key THEN
        result := result || jsonb_build_object(key, jsonb_build_object(
          'before', before_json->key,
          'after', 'null'::JSONB
        ));
      END IF;
    END LOOP;
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.audit_logs IS 'Comprehensive audit trail for all analyst actions and system changes';
COMMENT ON COLUMN public.audit_logs.user_id IS 'User who performed the action (NULL for system actions)';
COMMENT ON COLUMN public.audit_logs.action IS 'Type of action performed';
COMMENT ON COLUMN public.audit_logs.entity_type IS 'Type of entity affected';
COMMENT ON COLUMN public.audit_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN public.audit_logs.before_state IS 'State before the change (for updates/deletes)';
COMMENT ON COLUMN public.audit_logs.after_state IS 'State after the change (for creates/updates)';
COMMENT ON COLUMN public.audit_logs.metadata IS 'Additional context (notes, reason, etc.)';

