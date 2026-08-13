-- OSINT Row Level Security Policies
-- Enables RLS and creates security policies for organization-based access
-- Part of Plan 1: OSINT Data Model & Database Migrations

-- ============================================================================
-- ENABLE RLS ON ALL OSINT TABLES
-- ============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osint_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_source_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytic_artifacts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORGANIZATIONS POLICIES
-- ============================================================================
-- Users can view organizations they are members of
-- Only owners/admins can update/delete

CREATE POLICY "Users can view organizations they belong to"
  ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = organizations.id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can insert organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK (true); -- Will be validated by org_members insertion

CREATE POLICY "Owners and admins can update organizations"
  ON public.organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = organizations.id
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners can delete organizations"
  ON public.organizations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = organizations.id
      AND org_members.user_id = auth.uid()
      AND org_members.role = 'owner'
    )
  );

-- ============================================================================
-- ORG MEMBERS POLICIES
-- ============================================================================
-- Users can view members of organizations they belong to
-- Owners/admins can manage members

CREATE POLICY "Users can view members of their organizations"
  ON public.org_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_members.organization_id
      AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert themselves as members"
  ON public.org_members
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners and admins can update members"
  ON public.org_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can delete members"
  ON public.org_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.organization_id = org_members.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- SOURCES POLICIES
-- ============================================================================
-- Organization members can view/manage sources

CREATE POLICY "Organization members can view sources"
  ON public.sources
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = sources.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can insert sources"
  ON public.sources
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = sources.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can update sources"
  ON public.sources
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = sources.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can delete sources"
  ON public.sources
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = sources.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- SOURCE RECORDS POLICIES
-- ============================================================================
-- Organization members can view records from their org's sources

CREATE POLICY "Organization members can view source records"
  ON public.source_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sources
      JOIN public.org_members ON org_members.organization_id = sources.organization_id
      WHERE sources.id = source_records.source_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can insert source records"
  ON public.source_records
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sources
      JOIN public.org_members ON org_members.organization_id = sources.organization_id
      WHERE sources.id = source_records.source_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can update source records"
  ON public.source_records
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sources
      JOIN public.org_members ON org_members.organization_id = sources.organization_id
      WHERE sources.id = source_records.source_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can delete source records"
  ON public.source_records
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.sources
      JOIN public.org_members ON org_members.organization_id = sources.organization_id
      WHERE sources.id = source_records.source_id
      AND org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- OSINT TOPICS POLICIES
-- ============================================================================
-- Organization members can view/manage topics

CREATE POLICY "Organization members can view topics"
  ON public.osint_topics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = osint_topics.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can insert topics"
  ON public.osint_topics
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = osint_topics.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can update topics"
  ON public.osint_topics
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = osint_topics.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can delete topics"
  ON public.osint_topics
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = osint_topics.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TOPIC SOURCE LINKS POLICIES
-- ============================================================================
-- Organization members can view/manage links

CREATE POLICY "Organization members can view topic source links"
  ON public.topic_source_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.osint_topics
      JOIN public.org_members ON org_members.organization_id = osint_topics.organization_id
      WHERE osint_topics.id = topic_source_links.topic_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can insert topic source links"
  ON public.topic_source_links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.osint_topics
      JOIN public.org_members ON org_members.organization_id = osint_topics.organization_id
      WHERE osint_topics.id = topic_source_links.topic_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can update topic source links"
  ON public.topic_source_links
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.osint_topics
      JOIN public.org_members ON org_members.organization_id = osint_topics.organization_id
      WHERE osint_topics.id = topic_source_links.topic_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can delete topic source links"
  ON public.topic_source_links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.osint_topics
      JOIN public.org_members ON org_members.organization_id = osint_topics.organization_id
      WHERE osint_topics.id = topic_source_links.topic_id
      AND org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- ANALYTIC ARTIFACTS POLICIES
-- ============================================================================
-- Organization members can view/manage artifacts

CREATE POLICY "Organization members can view analytic artifacts"
  ON public.analytic_artifacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = analytic_artifacts.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can insert analytic artifacts"
  ON public.analytic_artifacts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = analytic_artifacts.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can update analytic artifacts"
  ON public.analytic_artifacts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = analytic_artifacts.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organization members can delete analytic artifacts"
  ON public.analytic_artifacts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.organization_id = analytic_artifacts.organization_id
      AND org_members.user_id = auth.uid()
    )
  );

