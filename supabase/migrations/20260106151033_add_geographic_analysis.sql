-- ============================================================================
-- Phase 1: Geographic Analysis Support
-- ============================================================================
-- Add geographic_analysis JSONB field to osint_topics table for caching
-- geographic analysis results (locations, POIs, etc.) from Overture Maps API
-- and Nominatim geocoding services.
--
-- This migration is part of Phase 1 of the Overture Maps integration plan.
-- The geographic_analysis field will store structured geographic data including:
-- - Geocoded locations from source records
-- - Points of Interest (POIs) from Overture Maps API
-- - Cached analysis results to avoid repeated API calls
-- ============================================================================

-- Add geographic_analysis JSONB column to osint_topics
ALTER TABLE public.osint_topics
ADD COLUMN geographic_analysis JSONB;

-- Add helpful comment
COMMENT ON COLUMN public.osint_topics.geographic_analysis IS 
  'Cached geographic analysis results including geocoded locations and POIs. Structure: { locations: [{ placeName, coordinates: {lat, lng}, address?, sourceRecords: [] }], pois: [{ id, name, coordinates: {lat, lng}, category, address?, nearbyLocation }], lastUpdated: ISO timestamp, attribution: string }';

-- Create GIN index for efficient JSONB queries
CREATE INDEX idx_osint_topics_geographic_analysis 
  ON public.osint_topics 
  USING GIN(geographic_analysis);

-- Add helpful comment on index
COMMENT ON INDEX idx_osint_topics_geographic_analysis IS 
  'GIN index for efficient querying of geographic_analysis JSONB field';

