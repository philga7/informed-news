-- Add 'coordination_check' to artifact_type enum
-- Part of Plan 7: Correlation and Coordination Detection

-- Add new value to artifact_type enum
ALTER TYPE artifact_type ADD VALUE IF NOT EXISTS 'coordination_check';

-- Comment
COMMENT ON TYPE artifact_type IS 'Types of analytic artifacts: summary, entity_extraction, tone_analysis, sentiment, key_facts, timeline, network_graph, coordination_check';

