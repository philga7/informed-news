-- Add audit action for Collection Plan suggestions generation
-- Phase 3: GenAI Collection Plan Generation
-- This action is logged when AI-generated collection plan suggestions are created for a topic
--
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block.
-- Supabase migrations may need special handling. If this fails, run manually outside a transaction.

-- Add new enum value to audit_action
-- Note: This operation requires ACCESS EXCLUSIVE lock on the enum type (very brief, ~microseconds)
-- It only locks the enum type itself, not tables using it, so impact is minimal
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'collection_plan_suggestions_generated';

-- Update type comment to document the new action
COMMENT ON TYPE audit_action IS 'Types of actions that can be logged in the audit trail, including source record operations, content optimization, record lifecycle management, and collection plan generation';
