-- Add enabled field to sources table
-- Allows users to disable feed fetching without deleting the source

ALTER TABLE public.sources
ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;

-- Add index for filtering enabled sources during ingestion
CREATE INDEX idx_sources_enabled ON public.sources(enabled) WHERE enabled = true;

-- Add comment
COMMENT ON COLUMN public.sources.enabled IS 'When false, this source will be skipped during automated feed ingestion';

