-- Add audit actions for record archival, deletion, and restoration
-- These actions are used when manually archiving/deleting source records

-- Add new enum values to audit_action
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'record_archived';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'record_deleted';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'record_restored';

COMMENT ON TYPE audit_action IS 'Types of actions that can be logged in the audit trail, including source record operations, content optimization, and record lifecycle management';

