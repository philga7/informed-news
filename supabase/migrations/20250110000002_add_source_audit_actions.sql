-- Add missing source audit actions to audit_action enum
-- Adds 'source_created' and 'source_deleted' to support source CRUD operations
-- Part of Source Management Enhancement

-- Add new enum values to audit_action
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'source_created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'source_deleted';

COMMENT ON TYPE audit_action IS 'Types of actions that can be logged in the audit trail, including source management operations';

