-- Phase 5: Watch Items Foundation
-- Two-Tier Intelligence Model - Situational Awareness Layer
-- Creates watch_items and watch_item_records tables for Tier 1 tracking

-- ============================================================================
-- CREATE ENUMS
-- ============================================================================

-- Watch item status enum
CREATE TYPE watch_item_status AS ENUM ('watching', 'escalated', 'archived');

-- Watch item category enum (aligned with domain categorization)
CREATE TYPE watch_item_category AS ENUM (
  'politics', 
  'finance', 
  'technology', 
  'local', 
  'international', 
  'health', 
  'security', 
  'other'
);

-- ============================================================================
-- CREATE WATCH_ITEMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.watch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category watch_item_category NOT NULL DEFAULT 'other',
  notes TEXT,
  indicator_triggers TEXT[], -- What would escalate this to a full topic?
  status watch_item_status NOT NULL DEFAULT 'watching',
  escalated_topic_id UUID REFERENCES public.osint_topics(id) ON DELETE SET NULL,
  first_noted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_reviewed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ============================================================================
-- CREATE WATCH_ITEM_RECORDS JUNCTION TABLE
-- ============================================================================

-- Links watch items to source records (loosely coupled relationship)
CREATE TABLE IF NOT EXISTS public.watch_item_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_item_id UUID NOT NULL REFERENCES public.watch_items(id) ON DELETE CASCADE,
  source_record_id UUID NOT NULL REFERENCES public.source_records(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(watch_item_id, source_record_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for querying watch items by organization
CREATE INDEX IF NOT EXISTS idx_watch_items_organization_id 
  ON public.watch_items(organization_id);

-- Index for querying by status (for filtering active items)
CREATE INDEX IF NOT EXISTS idx_watch_items_status 
  ON public.watch_items(status) WHERE status = 'watching';

-- Index for querying by category (for domain filtering)
CREATE INDEX IF NOT EXISTS idx_watch_items_category 
  ON public.watch_items(category);

-- Index for finding escalated items
CREATE INDEX IF NOT EXISTS idx_watch_items_escalated_topic 
  ON public.watch_items(escalated_topic_id) WHERE escalated_topic_id IS NOT NULL;

-- Index for querying watch item records by watch item
CREATE INDEX IF NOT EXISTS idx_watch_item_records_watch_item_id 
  ON public.watch_item_records(watch_item_id);

-- Index for querying watch item records by source record
CREATE INDEX IF NOT EXISTS idx_watch_item_records_source_record_id 
  ON public.watch_item_records(source_record_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.watch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_item_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for watch_items
-- Users can view watch items from their organization
CREATE POLICY watch_items_select_policy ON public.watch_items
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert watch items for their organization
CREATE POLICY watch_items_insert_policy ON public.watch_items
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can update watch items for their organization
CREATE POLICY watch_items_update_policy ON public.watch_items
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete watch items for their organization
CREATE POLICY watch_items_delete_policy ON public.watch_items
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for watch_item_records
-- Users can view watch item records for their organization's watch items
CREATE POLICY watch_item_records_select_policy ON public.watch_item_records
  FOR SELECT
  USING (
    watch_item_id IN (
      SELECT id FROM public.watch_items
      WHERE organization_id IN (
        SELECT organization_id FROM public.org_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can insert watch item records for their organization's watch items
CREATE POLICY watch_item_records_insert_policy ON public.watch_item_records
  FOR INSERT
  WITH CHECK (
    watch_item_id IN (
      SELECT id FROM public.watch_items
      WHERE organization_id IN (
        SELECT organization_id FROM public.org_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Users can delete watch item records for their organization's watch items
CREATE POLICY watch_item_records_delete_policy ON public.watch_item_records
  FOR DELETE
  USING (
    watch_item_id IN (
      SELECT id FROM public.watch_items
      WHERE organization_id IN (
        SELECT organization_id FROM public.org_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get signal count (linked source records) for a watch item
CREATE OR REPLACE FUNCTION get_watch_item_signal_count(p_watch_item_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.watch_item_records
  WHERE watch_item_id = p_watch_item_id;
$$;

-- Function to escalate a watch item to a topic
CREATE OR REPLACE FUNCTION escalate_watch_item_to_topic(
  p_watch_item_id UUID,
  p_topic_name TEXT,
  p_topic_description TEXT DEFAULT NULL,
  p_topic_keywords TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_organization_id UUID;
  v_watch_item_category watch_item_category;
  v_watch_item_notes TEXT;
  v_indicator_triggers TEXT[];
  v_new_topic_id UUID;
  v_record_id UUID;
BEGIN
  -- Get watch item details
  SELECT organization_id, category, notes, indicator_triggers
  INTO v_organization_id, v_watch_item_category, v_watch_item_notes, v_indicator_triggers
  FROM public.watch_items
  WHERE id = p_watch_item_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Watch item not found';
  END IF;
  
  -- Create the new topic
  INSERT INTO public.osint_topics (
    organization_id,
    name,
    description,
    keywords,
    status
  ) VALUES (
    v_organization_id,
    p_topic_name,
    COALESCE(p_topic_description, v_watch_item_notes),
    p_topic_keywords,
    'active'
  )
  RETURNING id INTO v_new_topic_id;
  
  -- Link all watch item records to the new topic
  FOR v_record_id IN 
    SELECT source_record_id 
    FROM public.watch_item_records 
    WHERE watch_item_id = p_watch_item_id
  LOOP
    INSERT INTO public.topic_source_links (
      topic_id,
      source_record_id,
      analyst_notes
    ) VALUES (
      v_new_topic_id,
      v_record_id,
      'Escalated from watch item: ' || p_topic_name
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
  
  -- Update watch item status
  UPDATE public.watch_items
  SET 
    status = 'escalated',
    escalated_topic_id = v_new_topic_id,
    updated_at = NOW()
  WHERE id = p_watch_item_id;
  
  RETURN v_new_topic_id;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.watch_items IS 'Tier 1 situational awareness: potential topics under light monitoring';
COMMENT ON TABLE public.watch_item_records IS 'Junction table linking watch items to source records';

COMMENT ON COLUMN public.watch_items.title IS 'Short descriptive title for the watch item';
COMMENT ON COLUMN public.watch_items.category IS 'Domain category for filtering (politics, finance, tech, etc.)';
COMMENT ON COLUMN public.watch_items.notes IS 'Analyst notes about why this is being watched';
COMMENT ON COLUMN public.watch_items.indicator_triggers IS 'Array of conditions that would warrant escalation to a full topic';
COMMENT ON COLUMN public.watch_items.status IS 'Current status: watching, escalated, or archived';
COMMENT ON COLUMN public.watch_items.escalated_topic_id IS 'If escalated, the ID of the topic it became';
COMMENT ON COLUMN public.watch_items.first_noted_at IS 'When this item was first identified';
COMMENT ON COLUMN public.watch_items.last_reviewed_at IS 'Last time analyst reviewed this item';

COMMENT ON FUNCTION get_watch_item_signal_count IS 'Count the number of source records linked to a watch item (signal strength)';
COMMENT ON FUNCTION escalate_watch_item_to_topic IS 'Convert a watch item into a full topic, transferring all linked records';

