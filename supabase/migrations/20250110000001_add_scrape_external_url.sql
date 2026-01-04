-- Add scrape_external_url field to sources table
-- This enables scraping of original article URLs from aggregator sites like Citizen Free Press
-- Part of RSS aggregation enhancement

ALTER TABLE public.sources
ADD COLUMN scrape_external_url BOOLEAN NOT NULL DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN public.sources.scrape_external_url IS 'When enabled, scrapes article pages to find the original source URL (useful for aggregator sites like Citizen Free Press)';

