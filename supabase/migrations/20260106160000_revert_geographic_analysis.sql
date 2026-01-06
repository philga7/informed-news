-- ============================================================================
-- Revert Phase 1: Geographic Analysis Support
-- ============================================================================
-- This migration reverts the geographic_analysis field and index added in
-- Phase 1 of the Overture Maps integration.
--
-- Reverts: 20260106151033_add_geographic_analysis.sql
-- ============================================================================

-- Drop the GIN index
DROP INDEX IF EXISTS public.idx_osint_topics_geographic_analysis;

-- Remove the geographic_analysis JSONB column from osint_topics
ALTER TABLE public.osint_topics
DROP COLUMN IF EXISTS geographic_analysis;

