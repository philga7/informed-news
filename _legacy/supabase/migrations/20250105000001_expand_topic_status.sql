-- Phase 2: Expand Topic Status Enum
-- Adds 'suspended' and 'resolved' status options for enhanced lifecycle management
-- Part of OSINT Workflow Enhancement Phase 2

-- ============================================================================
-- EXPAND TOPIC STATUS ENUM
-- ============================================================================

-- Add 'suspended' and 'resolved' to the topic_status enum
-- This requires recreating the enum in PostgreSQL

-- First, add the new enum values
ALTER TYPE topic_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE topic_status ADD VALUE IF NOT EXISTS 'resolved';

-- ============================================================================
-- ADD RESOLUTION METADATA FIELDS
-- ============================================================================

-- Add fields to track resolution details when topics are marked as resolved
DO $$ BEGIN
    ALTER TABLE public.osint_topics
      ADD COLUMN resolution_summary TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.osint_topics
      ADD COLUMN resolution_confidence TEXT CHECK (resolution_confidence IN ('HIGH', 'MEDIUM', 'LOW'));
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.osint_topics
      ADD COLUMN lessons_learned TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.osint_topics
      ADD COLUMN resolved_at TIMESTAMPTZ;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for querying resolved topics
CREATE INDEX IF NOT EXISTS idx_osint_topics_resolved_at ON public.osint_topics(resolved_at) 
  WHERE resolved_at IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.osint_topics.status IS 'Workflow status: active (collecting/analyzing), monitoring (periodic check-ins), suspended (waiting for new info), resolved (question answered), archived (historical reference)';
COMMENT ON COLUMN public.osint_topics.resolution_summary IS 'Summary of what was decided or concluded when topic was resolved';
COMMENT ON COLUMN public.osint_topics.resolution_confidence IS 'Confidence level in the resolution (HIGH/MEDIUM/LOW)';
COMMENT ON COLUMN public.osint_topics.lessons_learned IS 'Optional lessons learned during the investigation';
COMMENT ON COLUMN public.osint_topics.resolved_at IS 'Timestamp when topic was marked as resolved';

