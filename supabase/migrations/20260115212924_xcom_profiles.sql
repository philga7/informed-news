-- Phase 1: X.com Profiles Integration
-- X.com Embedded Timelines - Profiles Table
-- Creates xcom_profiles table for storing organization-scoped X.com profile timelines

-- ============================================================================
-- CREATE XCOM_PROFILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.xcom_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  username TEXT NOT NULL, -- X.com username (without @)
  display_name TEXT, -- Optional custom display name
  display_order INTEGER NOT NULL DEFAULT 0, -- For drag-and-drop ordering
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, -- Timeline configuration
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT xcom_profiles_username_length CHECK (char_length(username) > 0),
  CONSTRAINT xcom_profiles_unique_org_username UNIQUE(organization_id, username)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for querying profiles by organization
CREATE INDEX IF NOT EXISTS idx_xcom_profiles_organization_id 
  ON public.xcom_profiles(organization_id);

-- Composite index for ordering profiles by organization
CREATE INDEX IF NOT EXISTS idx_xcom_profiles_display_order 
  ON public.xcom_profiles(organization_id, display_order);

-- Index for filtering enabled profiles
CREATE INDEX IF NOT EXISTS idx_xcom_profiles_enabled 
  ON public.xcom_profiles(organization_id, enabled) WHERE enabled = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.xcom_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for xcom_profiles
-- Users can view profiles from their organization
CREATE POLICY xcom_profiles_select_policy ON public.xcom_profiles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can insert profiles for their organization
CREATE POLICY xcom_profiles_insert_policy ON public.xcom_profiles
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can update profiles for their organization
CREATE POLICY xcom_profiles_update_policy ON public.xcom_profiles
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

-- Users can delete profiles for their organization
CREATE POLICY xcom_profiles_delete_policy ON public.xcom_profiles
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
CREATE TRIGGER update_xcom_profiles_updated_at
  BEFORE UPDATE ON public.xcom_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.xcom_profiles IS 'X.com profile timelines for organizations';
COMMENT ON COLUMN public.xcom_profiles.username IS 'X.com username (without @ symbol)';
COMMENT ON COLUMN public.xcom_profiles.display_name IS 'Optional custom display name for the profile';
COMMENT ON COLUMN public.xcom_profiles.display_order IS 'Order for drag-and-drop reordering within organization';
COMMENT ON COLUMN public.xcom_profiles.settings IS 'Timeline configuration (theme, tweet limit, width, height, chrome options)';
COMMENT ON COLUMN public.xcom_profiles.enabled IS 'Whether this profile timeline is currently enabled';
