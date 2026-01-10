/**
 * X.com Scraping Rate Limits
 * 
 * Tracks global scraping rate limits to prevent exceeding X.com's 300 requests/hour limit
 * across all Hetzner servers and manual triggers.
 */

-- Create table to track scraping rate limits
CREATE TABLE IF NOT EXISTS xcom_scraping_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour_window TIMESTAMPTZ NOT NULL, -- The hour window (e.g., 2024-01-15 14:00:00)
  request_count INTEGER NOT NULL DEFAULT 0,
  last_request_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one record per hour window
  UNIQUE (hour_window)
);

-- Create index on hour_window for fast lookups
CREATE INDEX IF NOT EXISTS idx_xcom_rate_limits_hour_window 
  ON xcom_scraping_rate_limits (hour_window DESC);

-- Create index on updated_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_xcom_rate_limits_updated_at 
  ON xcom_scraping_rate_limits (updated_at);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_xcom_rate_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists (for idempotent migrations)
DROP TRIGGER IF EXISTS update_xcom_rate_limits_updated_at ON xcom_scraping_rate_limits;

CREATE TRIGGER update_xcom_rate_limits_updated_at
  BEFORE UPDATE ON xcom_scraping_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_xcom_rate_limits_updated_at();

-- Function to get or create current hour window record
CREATE OR REPLACE FUNCTION get_current_xcom_rate_limit()
RETURNS TABLE (
  id UUID,
  hour_window TIMESTAMPTZ,
  request_count INTEGER,
  last_request_at TIMESTAMPTZ
) AS $$
DECLARE
  current_hour TIMESTAMPTZ;
  limit_record xcom_scraping_rate_limits%ROWTYPE;
BEGIN
  -- Get the current hour window (truncate to hour)
  current_hour := date_trunc('hour', NOW());
  
  -- Try to get existing record
  SELECT * INTO limit_record
  FROM xcom_scraping_rate_limits
  WHERE xcom_scraping_rate_limits.hour_window = current_hour;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO xcom_scraping_rate_limits (hour_window, request_count)
    VALUES (current_hour, 0)
    RETURNING * INTO limit_record;
  END IF;
  
  -- Return the record
  RETURN QUERY
  SELECT 
    limit_record.id,
    limit_record.hour_window,
    limit_record.request_count,
    limit_record.last_request_at;
END;
$$ LANGUAGE plpgsql;

-- Function to increment rate limit counter
CREATE OR REPLACE FUNCTION increment_xcom_rate_limit()
RETURNS TABLE (
  id UUID,
  hour_window TIMESTAMPTZ,
  request_count INTEGER,
  last_request_at TIMESTAMPTZ,
  can_proceed BOOLEAN
) AS $$
DECLARE
  current_hour TIMESTAMPTZ;
  limit_record xcom_scraping_rate_limits%ROWTYPE;
  max_requests INTEGER := 300;
  updated_record xcom_scraping_rate_limits%ROWTYPE;
BEGIN
  -- Get the current hour window
  current_hour := date_trunc('hour', NOW());
  
  -- Get or create record
  SELECT * INTO limit_record
  FROM xcom_scraping_rate_limits
  WHERE xcom_scraping_rate_limits.hour_window = current_hour;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO xcom_scraping_rate_limits (hour_window, request_count, last_request_at)
    VALUES (current_hour, 1, NOW())
    RETURNING * INTO limit_record;
  ELSE
    -- Update existing record with explicit table reference
    UPDATE xcom_scraping_rate_limits AS rl
    SET 
      request_count = rl.request_count + 1,
      last_request_at = NOW()
    WHERE rl.id = limit_record.id
    RETURNING rl.* INTO updated_record;
    
    limit_record := updated_record;
  END IF;
  
  -- Return record with can_proceed flag
  RETURN QUERY
  SELECT 
    limit_record.id,
    limit_record.hour_window,
    limit_record.request_count,
    limit_record.last_request_at,
    (limit_record.request_count <= max_requests) AS can_proceed;
END;
$$ LANGUAGE plpgsql;

-- Function to check if scraping can proceed (without incrementing)
CREATE OR REPLACE FUNCTION check_xcom_rate_limit()
RETURNS TABLE (
  can_proceed BOOLEAN,
  current_count INTEGER,
  max_requests INTEGER,
  reset_at TIMESTAMPTZ,
  requests_remaining INTEGER
) AS $$
DECLARE
  current_hour TIMESTAMPTZ;
  limit_record xcom_scraping_rate_limits%ROWTYPE;
  max_requests INTEGER := 300;
BEGIN
  -- Get the current hour window
  current_hour := date_trunc('hour', NOW());
  
  -- Get current record
  SELECT * INTO limit_record
  FROM xcom_scraping_rate_limits
  WHERE xcom_scraping_rate_limits.hour_window = current_hour;
  
  -- If no record exists, we can proceed
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      true AS can_proceed,
      0 AS current_count,
      max_requests AS max_requests,
      (current_hour + INTERVAL '1 hour') AS reset_at,
      max_requests AS requests_remaining;
    RETURN;
  END IF;
  
  -- Return status
  RETURN QUERY
  SELECT 
    (limit_record.request_count < max_requests) AS can_proceed,
    limit_record.request_count AS current_count,
    max_requests AS max_requests,
    (limit_record.hour_window + INTERVAL '1 hour') AS reset_at,
    GREATEST(0, max_requests - limit_record.request_count) AS requests_remaining;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function to remove old rate limit records (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_xcom_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM xcom_scraping_rate_limits
  WHERE hour_window < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE xcom_scraping_rate_limits IS 'Tracks global X.com scraping rate limits (300 requests/hour) across all Hetzner servers';
COMMENT ON COLUMN xcom_scraping_rate_limits.hour_window IS 'The hour window this record tracks (truncated to hour)';
COMMENT ON COLUMN xcom_scraping_rate_limits.request_count IS 'Number of requests made in this hour window';
COMMENT ON FUNCTION check_xcom_rate_limit() IS 'Check if scraping can proceed without incrementing counter';
COMMENT ON FUNCTION increment_xcom_rate_limit() IS 'Increment rate limit counter and return whether scraping can proceed';
COMMENT ON FUNCTION get_current_xcom_rate_limit() IS 'Get or create current hour window rate limit record';
