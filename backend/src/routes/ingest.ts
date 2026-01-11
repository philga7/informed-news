/**
 * Ingestion API Routes
 * 
 * Endpoints for ingesting content from various sources into the OSINT schema.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { supabase } from '../utils/supabase.js';
import {
  IngestionController,
  RssIngestionService,
  ManualInputService,
} from '../services/ingestion/index.js';

const router = Router();

/**
 * Check if a URL is a Nitter instance URL
 */
function isNitterUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    // Check if hostname contains 'nitter' (e.g., nitter.poast.org, nitter.net, etc.)
    return urlObj.hostname.toLowerCase().includes('nitter');
  } catch {
    // If URL parsing fails, check if string contains 'nitter'
    return url.toLowerCase().includes('nitter');
  }
}

/**
 * Process sources in parallel with a concurrency limit
 * Uses a semaphore pattern to limit concurrent executions
 */
async function processSourcesInParallel<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing: Array<{ promise: Promise<void>; index: number }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Create a promise that processes the item
    const promise = processor(item, i).then(result => {
      results[i] = result;
    }).then(() => {
      // Remove self from executing array when done
      const idx = executing.findIndex(e => e.index === i);
      if (idx >= 0) {
        executing.splice(idx, 1);
      }
    });

    executing.push({ promise, index: i });

    // When we hit the concurrency limit, wait for one to finish
    if (executing.length >= concurrency) {
      await Promise.race(executing.map(e => e.promise));
    }
  }

  // Wait for all remaining promises
  await Promise.all(executing.map(e => e.promise));

  return results;
}

/**
 * POST /api/ingest/rss/all
 * Trigger RSS ingestion for all enabled RSS sources in an organization (sequential, one at a time)
 * If organization_id is "all", processes all organizations
 * 
 * NOTE: Vercel serverless functions have timeout limits:
 * - Free tier: 10 seconds
 * - Pro tier: 60 seconds
 * - Enterprise: 300 seconds (5 minutes)
 * 
 * For large ingestion jobs (>60 seconds), consider:
 * - Using a background job queue (e.g., GitHub Actions, cron jobs)
 * - Splitting into smaller batches
 * - Using the scheduler endpoint instead of manual triggers
 * 
 * Sources are processed sequentially (one at a time) to:
 * - Reduce server load and avoid rate limiting
 * - Make error tracking easier
 * - Provide clearer progress logging
 * 
 * Body:
 *   - organization_id: string (required) - organization ID or "all" for all organizations
 */
router.post('/rss/all', async (req: Request, res: Response) => {
  try {
    const { organization_id } = req.body;

    if (!organization_id) {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['organization_id'],
      });
    }

    // If organization_id is "all", process all organizations
    if (organization_id === 'all') {
      const { data: organizations, error: orgError } = await supabase
        .from('organizations')
        .select('id, name') as {
          data: Array<{ id: string; name: string }> | null;
          error: unknown;
        };

      if (orgError) {
        return res.status(500).json({
          error: 'Failed to fetch organizations',
          message: orgError instanceof Error ? orgError.message : 'Unknown error',
        });
      }

      if (!organizations || organizations.length === 0) {
        return res.json({
          success: true,
          message: 'No organizations found',
          results: [],
          summary: {
            total_organizations: 0,
            total_sources: 0,
            processed: 0,
            added: 0,
            skipped: 0,
            errors: 0,
          },
        });
      }

      const allResults: Array<{
        organization_id: string;
        organization_name: string;
        results: any[];
        summary: any;
      }> = [];

      // Process each organization by calling the same logic
      for (const org of organizations) {
        try {
          // Fetch RSS sources for this organization (only enabled ones)
          const { data: sources, error: sourcesError } = await supabase
            .from('sources')
            .select('*')
            .eq('organization_id', org.id)
            .eq('source_type', 'rss')
            .eq('enabled', true) as { data: Array<{
              id: string;
              organization_id: string;
              source_type: string;
              name: string;
              url: string | null;
              scrape_external_url: boolean | null;
              [key: string]: unknown;
            }> | null; error: unknown };

          if (sourcesError || !sources || sources.length === 0) {
            allResults.push({
              organization_id: org.id,
              organization_name: org.name,
              results: [],
              summary: {
                total_sources: 0,
                processed: 0,
                added: 0,
                skipped: 0,
                errors: 0,
              },
            });
            continue;
          }

          // Process sources (reuse the same logic below)
          const orgResults: Array<{
            source_id: string;
            source_name: string;
            success: boolean;
            added: number;
            skipped: number;
            errors: number;
            error?: string;
          }> = [];

          let orgAdded = 0;
          let orgSkipped = 0;
          let orgErrors = 0;

          for (const source of sources) {
            if (!source.url) {
              orgResults.push({
                source_id: source.id,
                source_name: source.name,
                success: false,
                added: 0,
                skipped: 0,
                errors: 0,
                error: 'Source missing URL',
              });
              continue;
            }

            try {
              const service = isNitterUrl(source.url)
                ? (() => {
                    throw new Error(
                      'Nitter HTML scraping ingestion is disabled for speed/safety. Please use an RSS feed URL for this source (or ingest via manual input), and reserve scraping for AI analysis.'
                    );
                  })()
                : new RssIngestionService({
                    sourceId: source.id,
                    feedUrl: source.url,
                    scrapeExternalUrl: source.scrape_external_url || false,
                    extractFullContent: false,
                  });

              const controller = new IngestionController(service);
              const result = await controller.ingest();

              orgAdded += result.added;
              orgSkipped += result.skipped;
              orgErrors += result.errors.length;

              orgResults.push({
                source_id: source.id,
                source_name: source.name,
                success: true,
                added: result.added,
                skipped: result.skipped,
                errors: result.errors.length,
              });
            } catch (err) {
              orgErrors++;
              orgResults.push({
                source_id: source.id,
                source_name: source.name,
                success: false,
                added: 0,
                skipped: 0,
                errors: 1,
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            }
          }

          allResults.push({
            organization_id: org.id,
            organization_name: org.name,
            results: orgResults,
            summary: {
              total_sources: sources.length,
              processed: sources.length,
              added: orgAdded,
              skipped: orgSkipped,
              errors: orgErrors,
            },
          });
        } catch (err) {
          console.error(`Error processing organization ${org.id}:`, err);
          allResults.push({
            organization_id: org.id,
            organization_name: org.name,
            results: [],
            summary: {
              error: err instanceof Error ? err.message : 'Unknown error',
            },
          });
        }
      }

      // Aggregate summary
      const summary = {
        total_organizations: organizations.length,
        total_sources: allResults.reduce((sum, r) => sum + (r.summary?.total_sources || 0), 0),
        processed: allResults.reduce((sum, r) => sum + (r.summary?.processed || 0), 0),
        added: allResults.reduce((sum, r) => sum + (r.summary?.added || 0), 0),
        skipped: allResults.reduce((sum, r) => sum + (r.summary?.skipped || 0), 0),
        errors: allResults.reduce((sum, r) => sum + (r.summary?.errors || 0), 0),
      };

      return res.json({
        success: true,
        results: allResults,
        summary,
      });
    }

    // Fetch all enabled RSS sources for this organization
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('source_type', 'rss')
      .eq('enabled', true) as { data: Array<{
        id: string;
        organization_id: string;
        source_type: string;
        name: string;
        url: string | null;
        scrape_external_url: boolean | null;
        [key: string]: unknown;
      }> | null; error: unknown };

    if (sourcesError) {
      return res.status(500).json({
        error: 'Failed to fetch sources',
        message: sourcesError instanceof Error ? sourcesError.message : 'Unknown error',
      });
    }

    if (!sources || sources.length === 0) {
      return res.json({
        success: true,
        message: 'No RSS sources found for this organization',
        results: [],
        summary: {
          total_sources: 0,
          processed: 0,
          added: 0,
          skipped: 0,
          errors: 0,
        },
      });
    }

    // Process sources sequentially (one at a time)
    console.log(`\n🔄 Starting RSS ingestion for organization ${organization_id}`);
    console.log(`📋 Found ${sources.length} RSS source(s) to process (sequential, one at a time)\n`);

    type SourceResult = {
      source_id: string;
      source_name: string;
      success: boolean;
      added: number;
      skipped: number;
      errors: number;
      error?: string;
    };

    const results: SourceResult[] = [];

    // Process sources sequentially (one at a time)
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      const sourceNum = index + 1;
      const result: SourceResult = {
        source_id: source.id,
        source_name: source.name,
        success: false,
        added: 0,
        skipped: 0,
        errors: 0,
      };

      console.log(`[${sourceNum}/${sources.length}] Processing source: "${source.name}" (${source.id})`);
      console.log(`  📡 Feed URL: ${source.url}`);
      
      if (!source.url) {
        console.log(`  ⚠️  Skipping: Source missing URL`);
        result.error = 'Source missing URL';
        results.push(result);
        continue;
      }

      // Verify source still exists before processing
      const { data: sourceCheck, error: sourceCheckError } = await supabase
        .from('sources')
        .select('id')
        .eq('id', source.id)
        .single();

      if (sourceCheckError || !sourceCheck) {
        console.log(`  ❌ Skipping: Source no longer exists in database`);
        result.error = 'Source no longer exists in database';
        results.push(result);
        continue;
      }

      try {
        const startTime = Date.now();
        console.log(`  🔍 Starting ingestion...`);
        
        // Check if this is a Nitter URL and use appropriate service
        let service: RssIngestionService;
        
        if (isNitterUrl(source.url)) {
          console.log(`  🐦 Detected Nitter URL, using scraping service`);
          throw new Error(
            'Nitter HTML scraping ingestion is disabled for speed/safety. Please use an RSS feed URL for this source (or ingest via manual input), and reserve scraping for AI analysis.'
          );
        } else {
          // Create RSS ingestion service with scrapeExternalUrl from source config
          service = new RssIngestionService({
            sourceId: source.id,
            feedUrl: source.url,
            scrapeExternalUrl: source.scrape_external_url || false,
            extractFullContent: false,
          });
        }

        // Create controller and ingest
        const controller = new IngestionController(service);
        const ingestResult = await controller.ingest();
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        // Update source updated_at timestamp
        await supabase
          .from('sources')
          // @ts-expect-error - Supabase type inference issue in serverless environment
          .update({ updated_at: new Date().toISOString() })
          .eq('id', source.id);

        result.success = true;
        result.added = ingestResult.added;
        result.skipped = ingestResult.skipped;
        result.errors = ingestResult.errors.length;

        console.log(`  ✅ Completed in ${duration}s: +${ingestResult.added} new, ~${ingestResult.skipped} duplicates, ❌${ingestResult.errors.length} errors`);
        if (ingestResult.errors.length > 0) {
          console.log(`  ⚠️  Errors encountered:`);
          ingestResult.errors.slice(0, 3).forEach((err, idx) => {
            console.log(`     ${idx + 1}. ${err}`);
          });
          if (ingestResult.errors.length > 3) {
            console.log(`     ... and ${ingestResult.errors.length - 3} more`);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.log(`  ❌ Failed: ${errorMsg}`);
        result.errors = 1;
        result.error = errorMsg;
      }
      
      console.log(''); // Empty line between sources
      results.push(result);
    }
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    console.log(`\n📊 Ingestion Summary for organization ${organization_id}:`);
    console.log(`  Total sources: ${sources.length}`);
    console.log(`  Successfully processed: ${results.filter((r) => r.success).length}`);
    console.log(`  Total articles added: ${totalAdded}`);
    console.log(`  Total duplicates skipped: ${totalSkipped}`);
    console.log(`  Total errors: ${totalErrors}\n`);

    res.json({
      success: true,
      results,
      summary: {
        total_sources: sources.length,
        processed: results.filter((r) => r.success).length,
        added: totalAdded,
        skipped: totalSkipped,
        errors: totalErrors,
      },
    });
  } catch (error) {
    console.error('RSS ingestion error (all sources):', error);
    res.status(500).json({
      error: 'RSS ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/ingest/rss
 * Trigger RSS ingestion for a configured source
 * 
 * Body:
 *   - organization_id: string (required)
 *   - source_id: string (required) - ID of the source in the sources table
 */
router.post('/rss', async (req: Request, res: Response) => {
  try {
    const { organization_id, source_id } = req.body;

    // Validate required fields
    if (!organization_id || !source_id) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['organization_id', 'source_id'],
      });
    }

    // Fetch the source configuration from database
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('*')
      .eq('id', source_id)
      .eq('organization_id', organization_id)
      .single() as {
        data: {
          id: string;
          organization_id: string;
          source_type: string;
          name: string;
          url: string | null;
          scrape_external_url: boolean | null;
          [key: string]: unknown;
        } | null;
        error: unknown;
      };

    if (sourceError || !source) {
      return res.status(404).json({
        error: 'Source not found',
        message: sourceError instanceof Error ? sourceError.message : 'Source does not exist or does not belong to this organization',
      });
    }

    // Validate source type
    if (source.source_type !== 'rss') {
      return res.status(400).json({
        error: 'Invalid source type',
        message: `Source type is '${source.source_type}', expected 'rss'`,
      });
    }

    // Validate source has URL
    if (!source.url) {
      return res.status(400).json({
        error: 'Source missing URL',
        message: 'RSS source must have a URL configured',
      });
    }

    // Check if this is a Nitter URL and use appropriate service
    let service: RssIngestionService;
    
    if (isNitterUrl(source.url)) {
      console.log(`  🐦 Detected Nitter URL, using scraping service`);
      throw new Error(
        'Nitter HTML scraping ingestion is disabled for speed/safety. Please use an RSS feed URL for this source (or ingest via manual input), and reserve scraping for AI analysis.'
      );
    } else {
      // Create RSS ingestion service with scrapeExternalUrl from source config
      service = new RssIngestionService({
        sourceId: source.id,
        feedUrl: source.url,
        scrapeExternalUrl: source.scrape_external_url || false,
        extractFullContent: false, // Ingestion uses feed content only; analysis can fetch full text later
      });
    }

    // Create controller and ingest
    const controller = new IngestionController(service);
    const result = await controller.ingest();

    // Log stats
    controller.logStats(result);

    // Update source updated_at timestamp
    await supabase
      .from('sources')
      // @ts-expect-error - Supabase type inference issue in serverless environment
      .update({ updated_at: new Date().toISOString() })
      .eq('id', source_id);

    res.json({
      success: true,
      source_id,
      source_name: source.name,
      result: {
        added: result.added,
        skipped: result.skipped,
        errors: result.errors,
        total_processed: (result.records?.length || 0),
      },
    });
  } catch (error) {
    console.error('RSS ingestion error:', error);
    res.status(500).json({
      error: 'RSS ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/ingest/manual
 * Submit manual content for ingestion
 * 
 * Body:
 *   - organization_id: string (required)
 *   - title: string (required)
 *   - content: string (required)
 *   - url: string (optional)
 *   - source_name: string (optional, defaults to "Manual Input")
 *   - language: string (optional)
 *   - published_at: string (optional, ISO date)
 */
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const {
      organization_id,
      title,
      content,
      url,
      source_name,
      language,
      published_at,
      user_id, // Optional: userId for audit logging
    } = req.body;

    // Validate required fields
    if (!organization_id || !title || !content) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['organization_id', 'title', 'content'],
      });
    }

    // Validate organization exists
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', organization_id)
      .single();

    if (orgError || !org) {
      return res.status(404).json({
        error: 'Organization not found',
        message: orgError instanceof Error ? orgError.message : 'Organization does not exist',
      });
    }

    // Create manual input service
    const manualService = new ManualInputService({
      organizationId: organization_id,
      title,
      content,
      url,
      sourceName: source_name,
      language,
      publishedAt: published_at ? new Date(published_at) : undefined,
    });

    // Create controller with userId for audit logging
    const controller = new IngestionController(manualService, user_id || null);
    const result = await controller.ingest();

    // Log stats
    controller.logStats(result);

    res.json({
      success: true,
      result: {
        added: result.added,
        skipped: result.skipped,
        errors: result.errors,
        record: result.records?.[0],
      },
    });
  } catch (error) {
    console.error('Manual ingestion error:', error);
    res.status(500).json({
      error: 'Manual ingestion failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/ingest/status
 * Get ingestion system status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    // Test database connection
    const { error } = await supabase
      .from('sources')
      .select('id')
      .limit(1);

    res.json({
      status: error ? 'degraded' : 'operational',
      database: error ? 'disconnected' : 'connected',
      timestamp: new Date().toISOString(),
      error: error?.message,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

