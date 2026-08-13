-- Add 'notes' to artifact_type enum
-- Part of Notes feature implementation

-- Add new value to artifact_type enum
ALTER TYPE artifact_type ADD VALUE IF NOT EXISTS 'notes';

-- Update comment
COMMENT ON TYPE artifact_type IS 'Types of analytic artifacts: summary, entity_extraction, tone_analysis, sentiment, key_facts, timeline, network_graph, coordination_check, notes';

