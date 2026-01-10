/**
 * Utility Functions
 * 
 * Helper functions for rate limiting, API communication, logging, and other utilities.
 */

import winston from 'winston';
import * as path from 'path';
import * as fs from 'fs/promises';

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Create a Winston logger instance
 */
export function createLogger(module: string): winston.Logger {
  const logsDir = path.join(process.cwd(), 'logs');
  
  // Ensure logs directory exists (async, but we'll handle errors)
  fs.mkdir(logsDir, { recursive: true }).catch(() => {
    // Ignore errors creating logs directory
  });

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: { module },
    transports: [
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 10485760, // 10MB
        maxFiles: 5,
      }),
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
            return `${timestamp} [${module || 'app'}] ${level}: ${message} ${metaStr}`;
          }),
        ),
      }),
    ],
  });
}

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitState {
  count: number;
  resetAt: number;
  lastRequestAt: number;
}

const RATE_LIMIT_FILE = path.join(process.cwd(), 'sessions', 'rate-limit.json');
const MAX_REQUESTS_PER_HOUR = 300;
const MIN_DELAY_MS = 2000; // 2 seconds
const MAX_DELAY_MS = 10000; // 10 seconds

let rateLimitState: RateLimitState | null = null;

/**
 * Load rate limit state from disk
 */
async function loadRateLimitState(): Promise<RateLimitState> {
  try {
    const data = await fs.readFile(RATE_LIMIT_FILE, 'utf-8');
    const state = JSON.parse(data) as RateLimitState;
    
    // Check if reset time has passed
    if (Date.now() > state.resetAt) {
      // Reset counter
      return {
        count: 0,
        resetAt: Date.now() + 3600000, // 1 hour from now
        lastRequestAt: 0,
      };
    }
    
    return state;
  } catch {
    // File doesn't exist or is invalid, create new state
    return {
      count: 0,
      resetAt: Date.now() + 3600000, // 1 hour from now
      lastRequestAt: 0,
    };
  }
}

/**
 * Save rate limit state to disk
 */
async function saveRateLimitState(state: RateLimitState): Promise<void> {
  try {
    const dir = path.dirname(RATE_LIMIT_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(RATE_LIMIT_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Failed to save rate limit state', error);
  }
}

/**
 * Check rate limit and wait if necessary
 */
export async function checkRateLimit(): Promise<void> {
  if (!rateLimitState) {
    rateLimitState = await loadRateLimitState();
  }

  const now = Date.now();

  // Reset if hour has passed
  if (now > rateLimitState.resetAt) {
    rateLimitState = {
      count: 0,
      resetAt: now + 3600000,
      lastRequestAt: 0,
    };
    await saveRateLimitState(rateLimitState);
  }

  // Check if we've hit the limit
  if (rateLimitState.count >= MAX_REQUESTS_PER_HOUR) {
    const waitTime = rateLimitState.resetAt - now;
    const logger = createLogger('rate-limiter');
    logger.warn(`Rate limit reached (${rateLimitState.count}/${MAX_REQUESTS_PER_HOUR}), waiting ${Math.ceil(waitTime / 1000)}s`);
    
    // Wait until reset time
    await new Promise((resolve) => setTimeout(resolve, waitTime + 1000)); // Add 1s buffer
    
    // Reset after waiting
    rateLimitState = {
      count: 0,
      resetAt: Date.now() + 3600000,
      lastRequestAt: 0,
    };
    await saveRateLimitState(rateLimitState);
  }

  // Update count
  rateLimitState.count++;
  rateLimitState.lastRequestAt = now;
  await saveRateLimitState(rateLimitState);
}

/**
 * Wait for randomized delay (2-10 seconds)
 */
export async function waitForDelay(): Promise<void> {
  const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Exponential backoff delay for retries
 */
export async function waitForBackoff(attempt: number, maxBackoff: number = 60000): Promise<void> {
  const backoff = Math.min(1000 * Math.pow(2, attempt), maxBackoff);
  const jitter = Math.random() * 1000; // Add jitter to avoid thundering herd
  await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
}

// ============================================================================
// API COMMUNICATION
// ============================================================================

export interface XcomSource {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  username: string; // Extracted from URL
}

/**
 * Fetch enabled X.com sources from Vercel API
 */
export async function fetchEnabledSources(vercelEndpoint: string): Promise<XcomSource[]> {
  const logger = createLogger('utils');
  
  try {
    const url = `${vercelEndpoint}/api/sources?source_type=xcom&enabled=true`;
    logger.info('Fetching enabled sources', { url });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sources: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Transform sources to include username extracted from URL
    const sources: XcomSource[] = (data.sources || []).map((source: any) => {
      // Extract username from URL (e.g., https://x.com/username -> username)
      const urlMatch = source.url?.match(/x\.com\/([^/?]+)/i);
      const username = urlMatch ? urlMatch[1] : source.name;

      return {
        id: source.id,
        organization_id: source.organization_id,
        name: source.name,
        url: source.url,
        username,
      };
    });

    logger.info(`Fetched ${sources.length} enabled X.com source(s)`);
    return sources;
  } catch (error) {
    logger.error('Failed to fetch enabled sources', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export interface RateLimitCheckResult {
  can_proceed: boolean;
  current_count: number;
  max_requests: number;
  reset_at: string;
  requests_remaining: number;
  error?: string;
}

/**
 * Check rate limit from Supabase via Vercel API (without incrementing)
 */
export async function checkSupabaseRateLimit(vercelEndpoint: string): Promise<RateLimitCheckResult> {
  const logger = createLogger('rate-limit');
  
  try {
    const url = `${vercelEndpoint}/api/xcom-rate-limit/check`;
    logger.info('Checking Supabase rate limit', { url });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to check rate limit: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    logger.info('Rate limit check result', {
      can_proceed: data.can_proceed,
      current_count: data.current_count,
      requests_remaining: data.requests_remaining,
    });

    return data;
  } catch (error) {
    logger.error('Failed to check Supabase rate limit', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    // On error, be conservative and don't allow proceeding
    return {
      can_proceed: false,
      current_count: 0,
      max_requests: 300,
      reset_at: new Date(Date.now() + 3600000).toISOString(),
      requests_remaining: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Increment rate limit in Supabase via Vercel API and check if can proceed
 * This should be called before starting scraping to reserve a slot
 */
export async function incrementSupabaseRateLimit(vercelEndpoint: string): Promise<RateLimitCheckResult> {
  const logger = createLogger('rate-limit');
  
  try {
    const url = `${vercelEndpoint}/api/xcom-rate-limit/increment`;
    logger.info('Incrementing Supabase rate limit', { url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 429) {
      // Rate limit exceeded
      const data = await response.json();
      logger.warn('Rate limit exceeded', {
        current_count: data.current_count,
        reset_at: data.reset_at,
      });
      return data;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to increment rate limit: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    logger.info('Rate limit incremented', {
      can_proceed: data.can_proceed,
      current_count: data.current_count,
      requests_remaining: data.requests_remaining,
    });

    return data;
  } catch (error) {
    logger.error('Failed to increment Supabase rate limit', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    // On error, be conservative and don't allow proceeding
    return {
      can_proceed: false,
      current_count: 0,
      max_requests: 300,
      reset_at: new Date(Date.now() + 3600000).toISOString(),
      requests_remaining: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface SendTweetsResult {
  success: boolean;
  sent?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
  attempts?: number;
}

/**
 * Send tweets to Vercel API with retry logic
 */
export async function sendTweetsToVercel(
  vercelEndpoint: string,
  organizationId: string,
  sourceId: string,
  tweets: Array<{
    title: string;
    content: string;
    url: string;
    published_at: string;
    raw_metadata?: any;
  }>,
  maxRetries: number = 3
): Promise<SendTweetsResult> {
  const logger = createLogger('utils');
  const endpoint = `${vercelEndpoint}/api/ingest/xcom`;

  logger.info(`Sending ${tweets.length} tweets to Vercel API`, {
    organizationId,
    sourceId,
    endpoint,
  });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          source_id: sourceId,
          tweets: tweets.map((tweet) => ({
            title: tweet.title,
            content: tweet.content,
            url: tweet.url,
            published_at: tweet.published_at,
            raw_metadata: tweet.raw_metadata,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      logger.info('Successfully sent tweets to Vercel', {
        sent: result.added || result.sent || tweets.length,
        skipped: result.skipped || 0,
      });

      return {
        success: true,
        sent: result.added || result.sent || tweets.length,
        skipped: result.skipped || 0,
        errors: result.errors || [],
      };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn(`Failed to send tweets to Vercel (attempt ${attempt + 1}/${maxRetries})`, {
        error: errorMessage,
        isLastAttempt,
      });

      if (isLastAttempt) {
        return {
          success: false,
          error: errorMessage,
          attempts: attempt + 1,
        };
      }

      // Wait before retry with exponential backoff
      await waitForBackoff(attempt);
    }
  }

  return {
    success: false,
    error: 'Max retries exceeded',
    attempts: maxRetries,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessingResult {
  sourceId: string;
  sourceName: string;
  username: string;
  success: boolean;
  tweetsScraped: number;
  tweetsSent: number;
  tweetsSkipped?: number;
  error?: string;
}

export interface ProcessingSummary {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  results: ProcessingResult[];
}
