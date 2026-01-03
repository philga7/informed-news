-- Phase 3: Claims and Corroboration Tracking
-- Enables structured tracking of claims across sources with corroboration analysis
-- Part of OSINT Workflow Enhancement Phase 3

-- ============================================================================
-- CREATE CLAIMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.osint_topics(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  claim_type TEXT CHECK (claim_type IN ('factual', 'assessment', 'prediction')),
  is_falsifiable BOOLEAN DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- CREATE CLAIM EVIDENCE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.claim_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  link_id UUID NOT NULL REFERENCES public.topic_source_links(id) ON DELETE CASCADE,
  supports BOOLEAN, -- true = corroborates, false = contradicts, null = neutral/mentions
  evidence_excerpt TEXT,
  analyst_notes TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Ensure unique claim-link pairs
  UNIQUE(claim_id, link_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for querying claims by topic
CREATE INDEX IF NOT EXISTS idx_claims_topic_id ON public.claims(topic_id);

-- Index for querying evidence by claim
CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim_id ON public.claim_evidence(claim_id);

-- Index for querying evidence by link
CREATE INDEX IF NOT EXISTS idx_claim_evidence_link_id ON public.claim_evidence(link_id);

-- Index for corroboration analysis (filtering by support status)
CREATE INDEX IF NOT EXISTS idx_claim_evidence_supports ON public.claim_evidence(supports) 
  WHERE supports IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_evidence ENABLE ROW LEVEL SECURITY;

-- RLS Policies for claims
-- Users can view claims from their organization's topics
CREATE POLICY claims_select_policy ON public.claims
  FOR SELECT
  USING (
    topic_id IN (
      SELECT id FROM public.osint_topics
      WHERE organization_id IN (
        SELECT organization_id FROM public.org_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can insert claims for their organization's topics
CREATE POLICY claims_insert_policy ON public.claims
  FOR INSERT
  WITH CHECK (
    topic_id IN (
      SELECT id FROM public.osint_topics
      WHERE organization_id IN (
        SELECT organization_id FROM public.org_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can update claims for their organization's topics
CREATE POLICY claims_update_policy ON public.claims
  FOR UPDATE
  USING (
    topic_id IN (
      SELECT id FROM public.osint_topics
      WHERE organization_id IN (
        SELECT organization_id FROM public.org_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can delete claims for their organization's topics
CREATE POLICY claims_delete_policy ON public.claims
  FOR DELETE
  USING (
    topic_id IN (
      SELECT id FROM public.osint_topics
      WHERE organization_id IN (
        SELECT organization_id FROM public.org_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for claim_evidence
-- Users can view evidence for claims from their organization's topics
CREATE POLICY claim_evidence_select_policy ON public.claim_evidence
  FOR SELECT
  USING (
    claim_id IN (
      SELECT id FROM public.claims
      WHERE topic_id IN (
        SELECT id FROM public.osint_topics
        WHERE organization_id IN (
          SELECT organization_id FROM public.org_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Users can insert evidence for claims from their organization's topics
CREATE POLICY claim_evidence_insert_policy ON public.claim_evidence
  FOR INSERT
  WITH CHECK (
    claim_id IN (
      SELECT id FROM public.claims
      WHERE topic_id IN (
        SELECT id FROM public.osint_topics
        WHERE organization_id IN (
          SELECT organization_id FROM public.org_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Users can update evidence for claims from their organization's topics
CREATE POLICY claim_evidence_update_policy ON public.claim_evidence
  FOR UPDATE
  USING (
    claim_id IN (
      SELECT id FROM public.claims
      WHERE topic_id IN (
        SELECT id FROM public.osint_topics
        WHERE organization_id IN (
          SELECT organization_id FROM public.org_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Users can delete evidence for claims from their organization's topics
CREATE POLICY claim_evidence_delete_policy ON public.claim_evidence
  FOR DELETE
  USING (
    claim_id IN (
      SELECT id FROM public.claims
      WHERE topic_id IN (
        SELECT id FROM public.osint_topics
        WHERE organization_id IN (
          SELECT organization_id FROM public.org_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get corroboration status for a claim
CREATE OR REPLACE FUNCTION get_claim_corroboration_status(p_claim_id UUID)
RETURNS TABLE (
  claim_id UUID,
  total_evidence INTEGER,
  supporting_evidence INTEGER,
  contradicting_evidence INTEGER,
  neutral_evidence INTEGER,
  corroboration_status TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH evidence_counts AS (
    SELECT
      ce.claim_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ce.supports = true) AS supporting,
      COUNT(*) FILTER (WHERE ce.supports = false) AS contradicting,
      COUNT(*) FILTER (WHERE ce.supports IS NULL) AS neutral
    FROM public.claim_evidence ce
    WHERE ce.claim_id = p_claim_id
    GROUP BY ce.claim_id
  )
  SELECT
    ec.claim_id,
    ec.total::INTEGER,
    ec.supporting::INTEGER,
    ec.contradicting::INTEGER,
    ec.neutral::INTEGER,
    CASE
      WHEN ec.total = 0 THEN 'no_evidence'
      WHEN ec.contradicting > 0 THEN 'disputed'
      WHEN ec.supporting >= 2 THEN 'corroborated'
      WHEN ec.supporting = 1 THEN 'single_source'
      ELSE 'needs_review'
    END AS corroboration_status
  FROM evidence_counts ec;
END;
$$;

-- Function to get corroboration matrix for a topic
CREATE OR REPLACE FUNCTION get_corroboration_matrix(p_topic_id UUID)
RETURNS TABLE (
  claim_id UUID,
  claim_text TEXT,
  claim_type TEXT,
  link_id UUID,
  source_record_id UUID,
  source_name TEXT,
  supports BOOLEAN,
  evidence_excerpt TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS claim_id,
    c.claim_text,
    c.claim_type,
    ce.link_id,
    tsl.source_record_id,
    s.name AS source_name,
    ce.supports,
    ce.evidence_excerpt
  FROM public.claims c
  LEFT JOIN public.claim_evidence ce ON ce.claim_id = c.id
  LEFT JOIN public.topic_source_links tsl ON tsl.id = ce.link_id
  LEFT JOIN public.source_records sr ON sr.id = tsl.source_record_id
  LEFT JOIN public.sources s ON s.id = sr.source_id
  WHERE c.topic_id = p_topic_id
  ORDER BY c.created_at DESC, s.name ASC;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.claims IS 'Factual claims, assessments, or predictions extracted from intelligence analysis';
COMMENT ON TABLE public.claim_evidence IS 'Evidence from source records that supports, contradicts, or mentions claims';

COMMENT ON COLUMN public.claims.claim_text IS 'The specific claim being made or evaluated';
COMMENT ON COLUMN public.claims.claim_type IS 'Type: factual (verifiable fact), assessment (analytical judgment), prediction (future forecast)';
COMMENT ON COLUMN public.claims.is_falsifiable IS 'Whether the claim can be proven false (Popper criterion)';

COMMENT ON COLUMN public.claim_evidence.supports IS 'true = corroborates claim, false = contradicts claim, null = neutral mention';
COMMENT ON COLUMN public.claim_evidence.evidence_excerpt IS 'Relevant excerpt from source that relates to the claim';
COMMENT ON COLUMN public.claim_evidence.analyst_notes IS 'Analyst interpretation of how this evidence relates to the claim';

COMMENT ON FUNCTION get_claim_corroboration_status IS 'Calculate corroboration status for a claim based on supporting/contradicting evidence';
COMMENT ON FUNCTION get_corroboration_matrix IS 'Generate matrix view of claims vs sources for a topic';

