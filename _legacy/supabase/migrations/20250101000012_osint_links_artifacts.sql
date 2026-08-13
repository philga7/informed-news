-- OSINT TopicSourceLinks and AnalyticArtifacts Migration
-- Creates linking tables and AI analysis artifacts
-- Part of Plan 1: OSINT Data Model & Database Migrations

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE confidence_level AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE artifact_type AS ENUM (
  'summary',
  'entity_extraction',
  'tone_analysis',
  'sentiment',
  'key_facts',
  'timeline',
  'network_graph'
);

-- ============================================================================
-- TOPIC SOURCE LINKS TABLE
-- ============================================================================
-- Links source records to topics with analysis metadata

CREATE TABLE public.topic_source_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_id UUID NOT NULL REFERENCES public.osint_topics(id) ON DELETE CASCADE,
  source_record_id UUID NOT NULL REFERENCES public.source_records(id) ON DELETE CASCADE,
  relevance_score NUMERIC(4,3) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  confidence_level confidence_level,
  assumptions TEXT,
  analyst_notes TEXT,
  linked_by_user_id UUID REFERENCES public.profiles(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(topic_id, source_record_id)
);

-- Indexes for common queries
CREATE INDEX idx_topic_source_links_topic_id ON public.topic_source_links(topic_id);
CREATE INDEX idx_topic_source_links_source_record_id ON public.topic_source_links(source_record_id);
CREATE INDEX idx_topic_source_links_linked_by_user_id ON public.topic_source_links(linked_by_user_id);
CREATE INDEX idx_topic_source_links_relevance_score ON public.topic_source_links(relevance_score DESC);
CREATE INDEX idx_topic_source_links_confidence_level ON public.topic_source_links(confidence_level);

-- ============================================================================
-- ANALYTIC ARTIFACTS TABLE
-- ============================================================================
-- AI-assisted analysis outputs (summaries, entity extraction, etc.)

CREATE TABLE public.analytic_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_record_id UUID REFERENCES public.source_records(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES public.osint_topics(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type artifact_type NOT NULL,
  payload JSONB NOT NULL,
  model_name TEXT NOT NULL,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT analytic_artifacts_model_name_length CHECK (char_length(model_name) > 0),
  CONSTRAINT analytic_artifacts_created_by_length CHECK (char_length(created_by) > 0),
  -- At least one of source_record_id or topic_id should be set
  CONSTRAINT analytic_artifacts_has_reference CHECK (
    source_record_id IS NOT NULL OR topic_id IS NOT NULL
  )
);

-- Indexes for common queries
CREATE INDEX idx_analytic_artifacts_source_record_id ON public.analytic_artifacts(source_record_id);
CREATE INDEX idx_analytic_artifacts_topic_id ON public.analytic_artifacts(topic_id);
CREATE INDEX idx_analytic_artifacts_organization_id ON public.analytic_artifacts(organization_id);
CREATE INDEX idx_analytic_artifacts_type ON public.analytic_artifacts(type);
CREATE INDEX idx_analytic_artifacts_reviewed ON public.analytic_artifacts(reviewed) WHERE reviewed = false;
CREATE INDEX idx_analytic_artifacts_created_by ON public.analytic_artifacts(created_by);
CREATE INDEX idx_analytic_artifacts_created_at ON public.analytic_artifacts(created_at DESC);

-- GIN index for JSONB payload searches
CREATE INDEX idx_analytic_artifacts_payload ON public.analytic_artifacts USING GIN(payload);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.topic_source_links IS 'Links source records to topics with relevance scores and analyst notes';
COMMENT ON TABLE public.analytic_artifacts IS 'AI-assisted analysis outputs (summaries, entity extraction, sentiment, etc.)';

