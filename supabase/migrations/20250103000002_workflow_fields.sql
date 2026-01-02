-- Workflow and Quality Assurance Fields Migration
-- Adds status tracking, review indicators, and source value ratings
-- Part of Plan 9: Audit Trails, Workflow, and Quality Assurance

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- Create enum types only if they don't exist
DO $$ BEGIN
    CREATE TYPE topic_status AS ENUM ('active', 'monitoring', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE link_review_status AS ENUM ('pending', 'reviewed', 'disputed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- ADD WORKFLOW FIELDS TO EXISTING TABLES
-- ============================================================================

-- Topic status for workflow management
DO $$ BEGIN
    ALTER TABLE public.osint_topics
      ADD COLUMN status topic_status NOT NULL DEFAULT 'active';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Link review status for QA tracking
DO $$ BEGIN
    ALTER TABLE public.topic_source_links
      ADD COLUMN review_status link_review_status NOT NULL DEFAULT 'pending';
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Source value rating for collection feedback (1-5 stars)
DO $$ BEGIN
    ALTER TABLE public.sources
      ADD COLUMN value_rating INTEGER CHECK (value_rating >= 1 AND value_rating <= 5);
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS idx_osint_topics_status ON public.osint_topics(status);
CREATE INDEX IF NOT EXISTS idx_topic_source_links_review_status ON public.topic_source_links(review_status) 
  WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sources_value_rating ON public.sources(value_rating) 
  WHERE value_rating IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.osint_topics.status IS 'Workflow status: active (ongoing work), monitoring (watching for updates), archived (completed/inactive)';
COMMENT ON COLUMN public.topic_source_links.review_status IS 'QA review status: pending (needs review), reviewed (validated), disputed (requires further analysis)';
COMMENT ON COLUMN public.sources.value_rating IS 'Analyst-assigned usefulness rating (1-5 stars) for collection management feedback';

