/**
 * Fix ambiguous column reference in increment_xcom_rate_limit function
 * 
 * The UPDATE statement was ambiguous about which hour_window column to use.
 * This migration fixes the function to explicitly qualify table references.
 */

-- Fix increment function with explicit table aliases
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

-- Also fix check function for consistency
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

-- Fix get_current function for consistency
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
