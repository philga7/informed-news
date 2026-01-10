/**
 * X.com Scraping Rate Limit API Routes
 * 
 * Endpoints for checking and managing global X.com scraping rate limits
 * to prevent exceeding 300 requests/hour across all Hetzner servers.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';

const router = Router();

// Type definitions for RPC function return types
interface CheckRateLimitResult {
  can_proceed: boolean;
  current_count: number;
  max_requests: number;
  reset_at: string;
  requests_remaining: number;
}

interface IncrementRateLimitResult {
  id: string;
  hour_window: string;
  request_count: number;
  last_request_at: string | null;
  can_proceed: boolean;
}

/**
 * GET /api/xcom-rate-limit/check
 * Check if scraping can proceed without incrementing counter
 * 
 * Returns current rate limit status
 */
router.get('/check', async (_req: Request, res: Response) => {
  try {
    // Call the database function to check rate limit
    const { data, error } = await supabase.rpc('check_xcom_rate_limit') as {
      data: CheckRateLimitResult[] | null;
      error: any;
    };

    if (error) {
      console.error('Error checking X.com rate limit:', error);
      return res.status(500).json({
        error: 'Failed to check rate limit',
        message: error.message,
      });
    }

    if (!data || data.length === 0) {
      // No record exists, can proceed
      return res.json({
        can_proceed: true,
        current_count: 0,
        max_requests: 300,
        reset_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        requests_remaining: 300,
      });
    }

    const result = data[0];
    res.json({
      can_proceed: result.can_proceed,
      current_count: result.current_count,
      max_requests: result.max_requests,
      reset_at: result.reset_at,
      requests_remaining: result.requests_remaining,
    });
  } catch (error) {
    console.error('X.com rate limit check error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/xcom-rate-limit/increment
 * Increment rate limit counter and check if scraping can proceed
 * 
 * This should be called before starting a scraping session
 * Returns whether scraping can proceed after incrementing
 */
router.post('/increment', async (_req: Request, res: Response) => {
  try {
    // Call the database function to increment and check
    const { data, error } = await supabase.rpc('increment_xcom_rate_limit') as {
      data: IncrementRateLimitResult[] | null;
      error: any;
    };

    if (error) {
      console.error('Error incrementing X.com rate limit:', error);
      return res.status(500).json({
        error: 'Failed to increment rate limit',
        message: error.message,
      });
    }

    if (!data || data.length === 0) {
      return res.status(500).json({
        error: 'No data returned from rate limit function',
      });
    }

    const result = data[0];
    
    if (!result.can_proceed) {
      // Rate limit exceeded
      const resetAt = new Date(result.hour_window);
      resetAt.setHours(resetAt.getHours() + 1);
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        can_proceed: false,
        current_count: result.request_count,
        max_requests: 300,
        reset_at: resetAt.toISOString(),
        requests_remaining: 0,
        message: `Rate limit of 300 requests/hour exceeded. Reset at ${resetAt.toISOString()}`,
      });
    }

    // Calculate reset time (next hour)
    const resetAt = new Date(result.hour_window);
    resetAt.setHours(resetAt.getHours() + 1);

    res.json({
      can_proceed: true,
      current_count: result.request_count,
      max_requests: 300,
      reset_at: resetAt.toISOString(),
      requests_remaining: 300 - result.request_count,
    });
  } catch (error) {
    console.error('X.com rate limit increment error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
