-- Add audit actions for content optimization and source record operations
-- Phase 1: Enhanced AI Analysis & Daily Briefs

-- Add new enum values to audit_action
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'source_record_created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'source_record_optimized';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'retention_policy_updated';

COMMENT ON TYPE audit_action IS 'Types of actions that can be logged in the audit trail, including source record operations and content optimization';

