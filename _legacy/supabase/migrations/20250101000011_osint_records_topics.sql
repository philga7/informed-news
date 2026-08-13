-- OSINT Sources, SourceRecords, and Topics Migration
-- Creates the core OSINT data tables
-- Part of Plan 1: OSINT Data Model & Database Migrations

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE osint_source_type AS ENUM ('rss', 'api', 'email', 'manual');
CREATE TYPE reliability_rating AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- ============================================================================
-- SOURCES TABLE
-- ============================================================================
-- OSINT sources (RSS feeds, APIs, email, manual entries)

CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type osint_source_type NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  reliability_rating reliability_rating NOT NULL DEFAULT 'UNKNOWN',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sources_name_length CHECK (char_length(name) > 0)
);

-- Indexes for common queries
CREATE INDEX idx_sources_organization_id ON public.sources(organization_id);
CREATE INDEX idx_sources_source_type ON public.sources(source_type);
CREATE INDEX idx_sources_reliability_rating ON public.sources(reliability_rating);

-- ============================================================================
-- SOURCE RECORDS TABLE
-- ============================================================================
-- Individual records/articles ingested from sources

CREATE TABLE public.source_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT,
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  language TEXT,
  geographic_indicators JSONB,
  raw_metadata JSONB,
  initial_confidence_flags JSONB,
  CONSTRAINT source_records_title_length CHECK (char_length(title) > 0)
);

-- Indexes for common queries
CREATE INDEX idx_source_records_source_id ON public.source_records(source_id);
CREATE INDEX idx_source_records_published_at ON public.source_records(published_at DESC);
CREATE INDEX idx_source_records_ingested_at ON public.source_records(ingested_at DESC);

-- Full-text search index on title and content
CREATE INDEX idx_source_records_search ON public.source_records 
  USING GIN(to_tsvector('english', title || ' ' || COALESCE(content, '')));

-- GIN index for JSONB fields
CREATE INDEX idx_source_records_geographic ON public.source_records USING GIN(geographic_indicators);
CREATE INDEX idx_source_records_metadata ON public.source_records USING GIN(raw_metadata);
CREATE INDEX idx_source_records_confidence ON public.source_records USING GIN(initial_confidence_flags);

-- ============================================================================
-- OSINT TOPICS TABLE
-- ============================================================================
-- Topic-centric analysis units for OSINT investigations

CREATE TABLE public.osint_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  keywords JSONB NOT NULL DEFAULT '[]',
  related_topics JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, name),
  CONSTRAINT osint_topics_name_length CHECK (char_length(name) > 0)
);

-- Indexes for common queries
CREATE INDEX idx_osint_topics_organization_id ON public.osint_topics(organization_id);
CREATE INDEX idx_osint_topics_name ON public.osint_topics(name);

-- GIN indexes for JSONB array searches
CREATE INDEX idx_osint_topics_keywords ON public.osint_topics USING GIN(keywords);
CREATE INDEX idx_osint_topics_related_topics ON public.osint_topics USING GIN(related_topics);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER update_sources_updated_at
  BEFORE UPDATE ON public.sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_osint_topics_updated_at
  BEFORE UPDATE ON public.osint_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.sources IS 'OSINT sources (RSS, API, email, manual) with reliability ratings';
COMMENT ON TABLE public.source_records IS 'Individual records/articles ingested from sources with OSINT metadata';
COMMENT ON TABLE public.osint_topics IS 'Topic-centric analysis units for OSINT investigations';

