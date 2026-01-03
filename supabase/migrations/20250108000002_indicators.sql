-- Phase 7: Indicators & Warnings System
-- Creates the indicators table for Tier 1 situational awareness

-- Create indicator check frequency enum
CREATE TYPE indicator_check_frequency AS ENUM ('daily', 'weekly', 'monthly');

-- Create indicators table
CREATE TABLE indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain watch_item_category NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT,
  check_frequency indicator_check_frequency DEFAULT 'weekly',
  is_triggered BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ,
  action_on_trigger TEXT,
  last_checked_at TIMESTAMPTZ,
  triggered_topic_id UUID REFERENCES osint_topics(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_indicators_organization ON indicators(organization_id);
CREATE INDEX idx_indicators_domain ON indicators(domain);
CREATE INDEX idx_indicators_triggered ON indicators(is_triggered, organization_id);
CREATE INDEX idx_indicators_check_frequency ON indicators(check_frequency, last_checked_at);

-- Enable Row Level Security
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access indicators for their organizations
CREATE POLICY "Users can view indicators for their organizations"
  ON indicators FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.org_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create indicators for their organizations"
  ON indicators FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM public.org_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update indicators for their organizations"
  ON indicators FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.org_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete indicators for their organizations"
  ON indicators FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.org_members 
      WHERE user_id = auth.uid()
    )
  );

-- Function to get indicators that are due for checking
CREATE OR REPLACE FUNCTION get_indicators_due_for_check(p_organization_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  check_frequency indicator_check_frequency,
  last_checked_at TIMESTAMPTZ,
  days_since_check INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id,
    i.name,
    i.check_frequency,
    i.last_checked_at,
    EXTRACT(DAY FROM (NOW() - COALESCE(i.last_checked_at, i.created_at)))::INTEGER as days_since_check
  FROM indicators i
  WHERE i.organization_id = p_organization_id
    AND i.is_triggered = false
    AND (
      (i.check_frequency = 'daily' AND (i.last_checked_at IS NULL OR i.last_checked_at < NOW() - INTERVAL '1 day'))
      OR (i.check_frequency = 'weekly' AND (i.last_checked_at IS NULL OR i.last_checked_at < NOW() - INTERVAL '7 days'))
      OR (i.check_frequency = 'monthly' AND (i.last_checked_at IS NULL OR i.last_checked_at < NOW() - INTERVAL '30 days'))
    )
  ORDER BY days_since_check DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to trigger an indicator and optionally create a topic
CREATE OR REPLACE FUNCTION trigger_indicator(
  p_indicator_id UUID,
  p_topic_name TEXT DEFAULT NULL,
  p_topic_description TEXT DEFAULT NULL,
  p_topic_keywords TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID AS $$
DECLARE
  v_organization_id UUID;
  v_domain watch_item_category;
  v_indicator_name TEXT;
  v_action_text TEXT;
  v_topic_id UUID;
BEGIN
  -- Get indicator details
  SELECT organization_id, domain, name, action_on_trigger
  INTO v_organization_id, v_domain, v_indicator_name, v_action_text
  FROM indicators
  WHERE id = p_indicator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Indicator not found';
  END IF;

  -- Create topic if requested
  IF p_topic_name IS NOT NULL THEN
    INSERT INTO osint_topics (
      organization_id,
      name,
      description,
      keywords,
      status
    ) VALUES (
      v_organization_id,
      p_topic_name,
      COALESCE(
        p_topic_description,
        'Topic created from triggered indicator: ' || v_indicator_name
      ),
      p_topic_keywords,
      'active'
    )
    RETURNING id INTO v_topic_id;
  END IF;

  -- Mark indicator as triggered
  UPDATE indicators
  SET 
    is_triggered = true,
    triggered_at = NOW(),
    triggered_topic_id = v_topic_id,
    updated_at = NOW()
  WHERE id = p_indicator_id;

  RETURN v_topic_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset a triggered indicator
CREATE OR REPLACE FUNCTION reset_indicator(p_indicator_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE indicators
  SET 
    is_triggered = false,
    triggered_at = NULL,
    triggered_topic_id = NULL,
    last_checked_at = NOW(),
    updated_at = NOW()
  WHERE id = p_indicator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment documentation
COMMENT ON TABLE indicators IS 'Indicators & Warnings system for Tier 1 situational awareness';
COMMENT ON COLUMN indicators.domain IS 'Domain/category this indicator belongs to (reuses watch_item_category enum)';
COMMENT ON COLUMN indicators.action_on_trigger IS 'Description of what should happen when this indicator is triggered';
COMMENT ON COLUMN indicators.triggered_topic_id IS 'If triggered and escalated, the topic that was created';
COMMENT ON FUNCTION get_indicators_due_for_check IS 'Returns indicators that are past their check frequency interval';
COMMENT ON FUNCTION trigger_indicator IS 'Marks an indicator as triggered and optionally creates a topic from it';
COMMENT ON FUNCTION reset_indicator IS 'Resets a triggered indicator back to active monitoring state';

