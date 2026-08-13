-- =====================================================
-- Phase 6: Environmental Scan View - Database Schema
-- =====================================================
-- Add scan_status and reviewed_at to source_records
-- Add domain categorization to sources

-- Create scan_status enum
CREATE TYPE scan_status AS ENUM ('pending', 'reviewed', 'linked', 'dismissed');

-- Add scan tracking to source_records
ALTER TABLE source_records 
ADD COLUMN scan_status scan_status NOT NULL DEFAULT 'pending',
ADD COLUMN reviewed_at TIMESTAMPTZ,
ADD COLUMN reviewed_by UUID REFERENCES auth.users(id);

-- Create index for scan view queries
CREATE INDEX idx_source_records_scan_status ON source_records(scan_status, ingested_at DESC);

-- Add domain categorization to sources
ALTER TABLE sources 
ADD COLUMN domain watch_item_category;

-- Update source_records to inherit domain from sources (helper view)
CREATE OR REPLACE VIEW source_records_with_domain AS
SELECT 
  sr.*,
  s.domain as source_domain,
  s.name as source_name
FROM source_records sr
LEFT JOIN sources s ON sr.source_id = s.id;

-- Grant permissions
GRANT SELECT ON source_records_with_domain TO authenticated;

-- Add comment for documentation
COMMENT ON COLUMN source_records.scan_status IS 'Triage status for environmental scan view';
COMMENT ON COLUMN source_records.reviewed_at IS 'When this record was reviewed in scan view';
COMMENT ON COLUMN sources.domain IS 'Category domain for filtering in scan view';

