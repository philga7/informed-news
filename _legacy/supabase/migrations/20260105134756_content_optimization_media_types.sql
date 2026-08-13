-- Content Optimization & Media Types Migration
-- Phase 1: Enhanced AI Analysis & Daily Briefs
-- Adds media type support, content optimization fields, retention policies, and archived records table

-- Add media type support to source_records
ALTER TABLE source_records 
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'article' 
  CHECK (media_type IN ('article', 'video', 'podcast', 'audio', 'other')),
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'full_text'
  CHECK (content_type IN ('full_text', 'summary', 'structured', 'minimal')),
ADD COLUMN IF NOT EXISTS content_compressed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS content_length INTEGER,
ADD COLUMN IF NOT EXISTS storage_optimized_at TIMESTAMPTZ;

-- Indexes for filtering and optimization
CREATE INDEX IF NOT EXISTS idx_source_records_media_type ON source_records(media_type);
CREATE INDEX IF NOT EXISTS idx_source_records_content_optimization 
  ON source_records(content_type, content_compressed, content_length);

-- Add retention policy configuration to sources
ALTER TABLE sources
ADD COLUMN IF NOT EXISTS retention_max_items INTEGER, -- Keep N most recent items (null = unlimited)
ADD COLUMN IF NOT EXISTS retention_days INTEGER, -- Keep items from last N days (null = unlimited)
ADD COLUMN IF NOT EXISTS retention_action TEXT DEFAULT 'archive' -- 'delete' | 'archive'
  CHECK (retention_action IN ('delete', 'archive'));

-- Create archived_source_records table for soft deletion
CREATE TABLE IF NOT EXISTS archived_source_records (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT,
  media_type TEXT,
  content_type TEXT,
  content_compressed BOOLEAN,
  content_length INTEGER,
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL,
  language TEXT,
  geographic_indicators JSONB,
  raw_metadata JSONB,
  initial_confidence_flags JSONB,
  scan_status TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archive_reason TEXT -- 'retention_policy' | 'manual' | 'dismissed'
);

CREATE INDEX IF NOT EXISTS idx_archived_source_records_source_id ON archived_source_records(source_id);
CREATE INDEX IF NOT EXISTS idx_archived_source_records_archived_at ON archived_source_records(archived_at DESC);

-- Function to check if record is protected from retention
CREATE OR REPLACE FUNCTION is_record_protected(record_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_topic_link BOOLEAN;
  has_artifact BOOLEAN;
  has_watch_link BOOLEAN;
  is_not_dismissed BOOLEAN;
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
  
  -- Check if not dismissed
  SELECT scan_status != 'dismissed' INTO is_not_dismissed
  FROM source_records WHERE id = record_id;
  
  -- Protected if ANY condition is true
  RETURN has_topic_link OR has_artifact OR has_watch_link OR is_not_dismissed;
END;
$$ LANGUAGE plpgsql;

-- Helper function to detect media type from URL
CREATE OR REPLACE FUNCTION detect_media_type_from_url(url TEXT)
RETURNS TEXT AS $$
BEGIN
  IF url ~* 'youtube\.com|youtu\.be|vimeo\.com' THEN
    RETURN 'video';
  ELSIF url ~* 'podcast|spotify\.com.*episode|anchor\.fm' THEN
    RETURN 'podcast';
  ELSIF url ~* '\.mp3|\.wav|\.m4a|soundcloud\.com' THEN
    RETURN 'audio';
  ELSE
    RETURN 'article';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comments for documentation
COMMENT ON COLUMN source_records.media_type IS 'Type of media: article, video, podcast, audio, or other';
COMMENT ON COLUMN source_records.content_type IS 'Content storage strategy: full_text, summary, structured, or minimal';
COMMENT ON COLUMN source_records.content_compressed IS 'Whether content is stored in compressed format';
COMMENT ON COLUMN source_records.content_length IS 'Original content length in characters';
COMMENT ON COLUMN source_records.storage_optimized_at IS 'When content was last optimized';
COMMENT ON COLUMN sources.retention_max_items IS 'Maximum number of recent items to keep (null = unlimited)';
COMMENT ON COLUMN sources.retention_days IS 'Number of days to keep items (null = unlimited)';
COMMENT ON COLUMN sources.retention_action IS 'Action to take with items outside retention window: delete or archive';
COMMENT ON FUNCTION is_record_protected(UUID) IS 'Checks if a source record is protected from retention policies';
COMMENT ON FUNCTION detect_media_type_from_url(TEXT) IS 'Detects media type from URL patterns';

