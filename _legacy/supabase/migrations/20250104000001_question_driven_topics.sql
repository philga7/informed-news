-- ============================================================================
-- Phase 1: Question-Driven Topic Structure
-- ============================================================================
-- Add intelligence requirement fields to osint_topics and create collection_plans table.
-- This migration supports the intelligence-style workflow by capturing:
-- - Decision context (why does this topic matter?)
-- - Key indicators (what evidence would change your mind?)
-- - Resolution criteria (when is the question answered?)
-- - Collection planning (what evidence types are needed?)

-- ============================================================================
-- Add question-driven fields to osint_topics
-- ============================================================================

ALTER TABLE public.osint_topics
ADD COLUMN decision_question TEXT,
ADD COLUMN decision_context TEXT,
ADD COLUMN key_indicators TEXT[],
ADD COLUMN resolution_criteria TEXT;

-- Add helpful comments
COMMENT ON COLUMN public.osint_topics.decision_question IS 'The specific question this topic is answering (e.g., "Is Actor X developing capability Y?")';
COMMENT ON COLUMN public.osint_topics.decision_context IS 'What decision or assessment depends on this intelligence (explains why it matters)';
COMMENT ON COLUMN public.osint_topics.key_indicators IS 'Array of observable indicators that would confirm or refute the hypothesis';
COMMENT ON COLUMN public.osint_topics.resolution_criteria IS 'Conditions under which the question would be considered answered';

-- ============================================================================
-- Create collection_plans table
-- ============================================================================

CREATE TABLE public.collection_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.osint_topics(id) ON DELETE CASCADE,
  
  -- Collection planning fields
  source_types_needed TEXT[], -- e.g., ['government', 'academic', 'primary', 'expert_analysis']
  claims_to_verify TEXT[], -- Specific claims that need corroboration
  coverage_gaps TEXT[], -- Identified gaps in evidence coverage
  sources_to_avoid TEXT[], -- Known biased or unreliable sources to skip
  
  -- Metadata
  notes TEXT, -- Additional collection planning notes
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Constraints
  CONSTRAINT collection_plans_topic_id_unique UNIQUE(topic_id)
);

-- Add helpful comments
COMMENT ON TABLE public.collection_plans IS 'Collection planning for intelligence topics - defines what evidence is needed';
COMMENT ON COLUMN public.collection_plans.source_types_needed IS 'Array of source types required for comprehensive analysis';
COMMENT ON COLUMN public.collection_plans.claims_to_verify IS 'Specific claims or assertions that require corroboration';
COMMENT ON COLUMN public.collection_plans.coverage_gaps IS 'Known gaps in evidence or areas needing more collection';
COMMENT ON COLUMN public.collection_plans.sources_to_avoid IS 'Sources to exclude due to bias, noise, or unreliability';

-- ============================================================================
-- Create indexes for performance
-- ============================================================================

CREATE INDEX idx_collection_plans_topic_id ON public.collection_plans(topic_id);
CREATE INDEX idx_osint_topics_decision_question ON public.osint_topics(decision_question) WHERE decision_question IS NOT NULL;

-- ============================================================================
-- Row Level Security for collection_plans
-- ============================================================================

ALTER TABLE public.collection_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view collection plans for topics in their organizations
CREATE POLICY "Users can view collection plans in their organizations"
  ON public.collection_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.osint_topics t
      INNER JOIN public.org_members om ON om.organization_id = t.organization_id
      WHERE t.id = collection_plans.topic_id
        AND om.user_id = auth.uid()
    )
  );

-- Policy: Analysts and admins can create collection plans
CREATE POLICY "Analysts can create collection plans"
  ON public.collection_plans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.osint_topics t
      INNER JOIN public.org_members om ON om.organization_id = t.organization_id
      WHERE t.id = collection_plans.topic_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'analyst')
    )
  );

-- Policy: Analysts and admins can update collection plans
CREATE POLICY "Analysts can update collection plans"
  ON public.collection_plans
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.osint_topics t
      INNER JOIN public.org_members om ON om.organization_id = t.organization_id
      WHERE t.id = collection_plans.topic_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'analyst')
    )
  );

-- Policy: Only owners and admins can delete collection plans
CREATE POLICY "Admins can delete collection plans"
  ON public.collection_plans
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.osint_topics t
      INNER JOIN public.org_members om ON om.organization_id = t.organization_id
      WHERE t.id = collection_plans.topic_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- Updated_at trigger for collection_plans
-- ============================================================================

CREATE TRIGGER update_collection_plans_updated_at
  BEFORE UPDATE ON public.collection_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

