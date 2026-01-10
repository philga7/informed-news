/**
 * Express Webhook Server for X.com Scraping
 * 
 * Receives webhook triggers from GitHub Actions, discovers enabled X.com sources
 * from Vercel API, and orchestrates profile-by-profile scraping.
 */

import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { createLogger } from './utils.js';
import { authenticateX } from './auth.js';
import { scrapeProfile } from './scraper.js';
import { sendTweetsToVercel, fetchEnabledSources, incrementSupabaseRateLimit } from './utils.js';
import type { XcomSource, ScrapeResult, ProcessingSummary } from './utils.js';

const app = express();
const PORT = process.env.PORT || 3000;
const logger = createLogger('server');

// Middleware
app.use(express.json());

// Environment variables validation
const requiredEnvVars = ['X_USERNAME', 'X_PASSWORD', 'VERCEL_API_ENDPOINT', 'WEBHOOK_SECRET', 'ORGANIZATION_ID'];
const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

const VERCEL_API_ENDPOINT = process.env.VERCEL_API_ENDPOINT!;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID!;

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'x-scraper',
  });
});

/**
 * Webhook endpoint for GitHub Actions triggers
 * 
 * Validates webhook secret and orchestrates scraping of all enabled X.com sources
 */
app.post('/webhook', async (req: Request, res: Response) => {
  const startTime = Date.now();
  logger.info('Webhook triggered', { headers: req.headers });

  try {
    // Validate webhook secret
    const webhookSecret = req.headers['x-webhook-secret'] || req.body.secret;
    if (webhookSecret !== WEBHOOK_SECRET) {
      logger.warn('Invalid webhook secret', { received: webhookSecret ? 'present' : 'missing' });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid webhook secret',
      });
    }

    logger.info('Webhook validated, starting scraping process');

    // Step 1: Check Supabase rate limit BEFORE starting (critical for manual triggers)
    logger.info('Checking Supabase rate limit before starting scraping');
    const rateLimitCheck = await incrementSupabaseRateLimit(VERCEL_API_ENDPOINT);
    
    if (!rateLimitCheck.can_proceed) {
      logger.warn('Rate limit check failed - cannot proceed with scraping', {
        current_count: rateLimitCheck.current_count,
        max_requests: rateLimitCheck.max_requests,
        reset_at: rateLimitCheck.reset_at,
        error: rateLimitCheck.error,
      });
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: rateLimitCheck.error || `Rate limit of ${rateLimitCheck.max_requests} requests/hour exceeded. Current count: ${rateLimitCheck.current_count}. Reset at ${rateLimitCheck.reset_at}`,
        rate_limit: {
          current_count: rateLimitCheck.current_count,
          max_requests: rateLimitCheck.max_requests,
          reset_at: rateLimitCheck.reset_at,
          requests_remaining: rateLimitCheck.requests_remaining,
        },
      });
    }
    
    logger.info('Rate limit check passed - proceeding with scraping', {
      current_count: rateLimitCheck.current_count,
      requests_remaining: rateLimitCheck.requests_remaining,
    });

    // Step 2: Discover enabled X.com sources from Vercel API
    logger.info('Fetching enabled X.com sources from Vercel API');
    const sources = await fetchEnabledSources(VERCEL_API_ENDPOINT, ORGANIZATION_ID);
    
    if (sources.length === 0) {
      logger.info('No enabled X.com sources found');
      return res.json({
        success: true,
        message: 'No enabled sources to process',
        summary: {
          total: 0,
          processed: 0,
          succeeded: 0,
          failed: 0,
          duration: Date.now() - startTime,
        },
      });
    }

    logger.info(`Found ${sources.length} enabled X.com source(s) to process`);

    // Step 3: Authenticate with X.com (reuse session if valid)
    logger.info('Authenticating with X.com');
    const authResult = await authenticateX();
    if (!authResult.success) {
      logger.error('X.com authentication failed', { error: authResult.error });
      return res.status(500).json({
        error: 'Authentication failed',
        message: authResult.error,
      });
    }
    logger.info('X.com authentication successful');

    // Step 4: Process each source sequentially (one at a time)
    const summary: ProcessingSummary = {
      total: sources.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };

    for (const source of sources) {
      logger.info(`Processing source: ${source.name} (${source.username})`, {
        sourceId: source.id,
        organizationId: source.organization_id,
      });

      try {
        // Scrape tweets from profile
        const scrapeResult = await scrapeProfile(source.username);
        
        if (!scrapeResult.success || !scrapeResult.tweets || scrapeResult.tweets.length === 0) {
          logger.warn(`No tweets scraped for ${source.username}`, {
            error: scrapeResult.error,
            tweetsFound: scrapeResult.tweets?.length || 0,
          });
          
          summary.results.push({
            sourceId: source.id,
            sourceName: source.name,
            username: source.username,
            success: false,
            tweetsScraped: 0,
            tweetsSent: 0,
            error: scrapeResult.error || 'No tweets found',
          });
          summary.failed++;
          continue;
        }

        logger.info(`Scraped ${scrapeResult.tweets.length} tweets from ${source.username}`);

        // Send tweets to Vercel API with retry logic
        const sendResult = await sendTweetsToVercel(
          VERCEL_API_ENDPOINT,
          source.organization_id,
          source.id,
          scrapeResult.tweets,
        );

        if (sendResult.success) {
          logger.info(`Successfully sent ${sendResult.sent} tweets to Vercel for ${source.username}`);
          summary.results.push({
            sourceId: source.id,
            sourceName: source.name,
            username: source.username,
            success: true,
            tweetsScraped: scrapeResult.tweets.length,
            tweetsSent: sendResult.sent,
            tweetsSkipped: sendResult.skipped || 0,
          });
          summary.succeeded++;
        } else {
          logger.error(`Failed to send tweets to Vercel for ${source.username}`, {
            error: sendResult.error,
            attempts: sendResult.attempts || 0,
          });
          summary.results.push({
            sourceId: source.id,
            sourceName: source.name,
            username: source.username,
            success: false,
            tweetsScraped: scrapeResult.tweets.length,
            tweetsSent: 0,
            error: sendResult.error || 'Failed to send to Vercel',
          });
          summary.failed++;
        }
      } catch (error) {
        logger.error(`Error processing source ${source.name}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        
        summary.results.push({
          sourceId: source.id,
          sourceName: source.name,
          username: source.username,
          success: false,
          tweetsScraped: 0,
          tweetsSent: 0,
          error: error instanceof Error ? error.message : String(error),
        });
        summary.failed++;
      }

      summary.processed++;
    }

    const duration = Date.now() - startTime;
    logger.info('Scraping process completed', {
      summary,
      duration,
    });

    res.json({
      success: true,
      summary: {
        ...summary,
        duration,
      },
    });
  } catch (error) {
    logger.error('Webhook processing error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`X.com scraper server running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Webhook endpoint: http://localhost:${PORT}/webhook`);
});

export default app;
