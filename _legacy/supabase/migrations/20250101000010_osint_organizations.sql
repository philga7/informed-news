-- OSINT Organizations Migration
-- Creates organizations and org_members tables for team-based multi-tenancy
-- Part of Plan 1: OSINT Data Model & Database Migrations

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================
-- Container for team/project data with organization-based access control

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organizations_name_length CHECK (char_length(name) > 0),
  CONSTRAINT organizations_slug_length CHECK (char_length(slug) > 0)
);

-- Index for slug lookups
CREATE INDEX idx_organizations_slug ON public.organizations(slug);

-- ============================================================================
-- ORG MEMBERS TABLE
-- ============================================================================
-- Links users to organizations with roles for access control

CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'analyst', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Indexes for common queries
CREATE INDEX idx_org_members_organization_id ON public.org_members(organization_id);
CREATE INDEX idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX idx_org_members_role ON public.org_members(role);

-- ============================================================================
-- UPDATED_AT TRIGGER FOR ORGANIZATIONS
-- ============================================================================

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.organizations IS 'Organizations/teams for OSINT collaboration and data sharing';
COMMENT ON TABLE public.org_members IS 'Many-to-many relationship between users and organizations with roles';

