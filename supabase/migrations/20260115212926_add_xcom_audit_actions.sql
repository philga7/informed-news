-- Add audit actions for X.com profiles and lists operations
-- Phase 1: X.com Embedded Timelines Integration
-- These actions are used when managing X.com profiles and lists

-- Add new enum values to audit_action
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'xcom_profile_created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'xcom_profile_updated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'xcom_profile_deleted';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'xcom_list_created';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'xcom_list_updated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'xcom_list_deleted';

-- Add new enum values to entity_type
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'xcom_profile';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'xcom_list';

COMMENT ON TYPE audit_action IS 'Types of actions that can be logged in the audit trail, including X.com profile and list management operations';
