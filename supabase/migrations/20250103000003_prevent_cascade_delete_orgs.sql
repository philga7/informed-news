-- Prevent Cascade Delete for Organizations Migration
-- Changes ON DELETE CASCADE to ON DELETE RESTRICT for organizations
-- Part of Plan: OSINT Workflow Enhancement - Phase 0

-- This migration prevents accidental deletion of organizations that have data.
-- Organizations must transfer all artifacts to another organization before deletion.

-- ============================================================================
-- SOURCES - Change CASCADE to RESTRICT
-- ============================================================================

ALTER TABLE public.sources 
  DROP CONSTRAINT IF EXISTS sources_organization_id_fkey,
  ADD CONSTRAINT sources_organization_id_fkey 
    FOREIGN KEY (organization_id) 
    REFERENCES public.organizations(id) 
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT sources_organization_id_fkey ON public.sources IS 
  'Prevents deletion of organizations with sources. Use transfer API before deletion.';

-- ============================================================================
-- OSINT TOPICS - Change CASCADE to RESTRICT
-- ============================================================================

ALTER TABLE public.osint_topics 
  DROP CONSTRAINT IF EXISTS osint_topics_organization_id_fkey,
  ADD CONSTRAINT osint_topics_organization_id_fkey 
    FOREIGN KEY (organization_id) 
    REFERENCES public.organizations(id) 
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT osint_topics_organization_id_fkey ON public.osint_topics IS 
  'Prevents deletion of organizations with topics. Use transfer API before deletion.';

-- ============================================================================
-- ANALYTIC ARTIFACTS - Change CASCADE to RESTRICT
-- ============================================================================

ALTER TABLE public.analytic_artifacts 
  DROP CONSTRAINT IF EXISTS analytic_artifacts_organization_id_fkey,
  ADD CONSTRAINT analytic_artifacts_organization_id_fkey 
    FOREIGN KEY (organization_id) 
    REFERENCES public.organizations(id) 
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT analytic_artifacts_organization_id_fkey ON public.analytic_artifacts IS 
  'Prevents deletion of organizations with artifacts. Use transfer API before deletion.';

-- ============================================================================
-- NOTES
-- ============================================================================

-- With these changes:
-- 1. Organizations with sources, topics, or artifacts CANNOT be deleted directly
-- 2. Must use the transfer API (POST /api/organizations/:fromId/transfer/:toId)
-- 3. After transfer completes, org can be safely deleted
-- 4. org_members still uses CASCADE (safe to delete when org is deleted)

