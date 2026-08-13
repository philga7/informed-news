-- Phase 1: X.com Lists Integration
-- X.com Embedded Timelines - Lists Table
-- Creates xcom_lists table for storing organization-scoped X.com list timelines

-- ============================================================================
-- CREATE XCOM_LISTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.xcom_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_screen_name TEXT NOT NULL, -- List owner's X.com username (without @)
  slug TEXT NOT NULL, -- List slug/identifier
  display_name TEXT, -- Optional custom display name
  display_order INTEGER NOT NULL DEFAULT 0, -- For drag-and-drop ordering
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, -- Timeline configuration (same as profiles)
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT xcom_lists_owner_length CHECK (char_length(owner_screen_name) > 0),
  CONSTRAINT xcom_lists_slug_length CHECK (char_length(slug) > 0),
  CONSTRAINT xcom_lists_unique_org_list UNIQUE(organization_id, owner_screen_name, slug)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for querying lists by organization
CREATE INDEX IF NOT EXISTS idx_xcom_lists_organization_id 
  ON public.xcom_lists(organization_id);

-- Composite index for ordering lists by organization
CREATE INDEX IF NOT EXISTS idx_xcom_lists_display_order 
  ON public.xcom_lists(organization_id, display_order);

-- Index for filtering enabled lists
CREATE INDEX IF NOT EXISTS idx_xcom_lists_enabled 
  ON public.xcom_lists(organization_id, enabled) WHERE enabled = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.xcom_lists ENABLE ROW LEVEL SECURITY;

-- RLS Policies for xcom_lists
-- Users can view lists from their organization
CREATE POLICY xcom_lists_select_policy ON public.xcom_lists
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert lists for their organization
CREATE POLICY xcom_lists_insert_policy ON public.xcom_lists
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can update lists for their organization
CREATE POLICY xcom_lists_update_policy ON public.xcom_lists
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can delete lists for their organization
CREATE POLICY xcom_lists_delete_policy ON public.xcom_lists
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER update_xcom_lists_updated_at
  BEFORE UPDATE ON public.xcom_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.xcom_lists IS 'X.com list timelines for organizations';
COMMENT ON COLUMN public.xcom_lists.owner_screen_name IS 'List owner X.com username (without @ symbol)';
COMMENT ON COLUMN public.xcom_lists.slug IS 'List slug/identifier';
COMMENT ON COLUMN public.xcom_lists.display_name IS 'Optional custom display name for the list';
COMMENT ON COLUMN public.xcom_lists.display_order IS 'Order for drag-and-drop reordering within organization';
COMMENT ON COLUMN public.xcom_lists.settings IS 'Timeline configuration (theme, tweet limit, width, height, chrome options)';
COMMENT ON COLUMN public.xcom_lists.enabled IS 'Whether this list timeline is currently enabled';
