/**
 * Vercel Serverless Function - API Handler
 * 
 * This is the main entry point for all /api/* requests on Vercel.
 * It wraps the Express backend to work in a serverless environment.
 * 
 * Uses dynamic imports to avoid loading jsdom (which has dependency issues)
 * until routes that need it are actually called.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { type Request, type Response } from 'express';
import cors from 'cors';

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Lazy load routes to avoid importing jsdom at module load time
let routesLoaded = false;

async function loadRoutes() {
  if (routesLoaded) return;
  
  // Dynamically import routes
  // Note: ingest routes use cheerio/axios for basic RSS parsing (works in serverless)
  // Full content extraction uses jsdom (dynamically loaded, may fail in serverless)
  const organizationsRouter = (await import('../backend/src/routes/organizations.js')).default;
  const sourcesRouter = (await import('../backend/src/routes/sources.js')).default;
  const ingestRouter = (await import('../backend/src/routes/ingest.js')).default;
  const topicsRouter = (await import('../backend/src/routes/topics.js')).default;
  const sourceRecordsRouter = (await import('../backend/src/routes/sourceRecords.js')).default;
  const analysisRouter = (await import('../backend/src/routes/analysis.js')).default;
  const auditLogsRouter = (await import('../backend/src/routes/auditLogs.js')).default;
  const qaRouter = (await import('../backend/src/routes/qa.js')).default;
  const claimsRouter = (await import('../backend/src/routes/claims.js')).default;
  const watchItemsRouter = (await import('../backend/src/routes/watchItems.js')).default;
  const indicatorsRouter = (await import('../backend/src/routes/indicators.js')).default;
  const scanSessionsRouter = (await import('../backend/src/routes/scanSessions.js')).default;
  const retentionRouter = (await import('../backend/src/routes/retention.js')).default;
  const optimizationRouter = (await import('../backend/src/routes/optimization.js')).default;
  const schedulerRouter = (await import('../backend/src/routes/scheduler.js')).default;
  const xcomRateLimitRouter = (await import('../backend/src/routes/xcomRateLimit.js')).default;

  // API Routes
  app.use('/api/organizations', organizationsRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/topics', topicsRouter);
  app.use('/api/source-records', sourceRecordsRouter);
  app.use('/api/analysis', analysisRouter);
  app.use('/api/audit-logs', auditLogsRouter);
  app.use('/api/qa', qaRouter);
  app.use('/api/claims', claimsRouter);
  app.use('/api/watch-items', watchItemsRouter);
  app.use('/api/indicators', indicatorsRouter);
  app.use('/api/scan-sessions', scanSessionsRouter);
  app.use('/api/retention', retentionRouter);
  app.use('/api/optimization', optimizationRouter);
  app.use('/api/scheduler', schedulerRouter);
  app.use('/api/xcom-rate-limit', xcomRateLimitRouter);
  // Note: /api/feeds routes are deprecated in favor of /api/ingest
  app.use('/api/feeds', (_req, res) => {
    res.status(503).json({
      error: 'Feeds endpoint deprecated',
      message: 'Use /api/ingest/rss/all for RSS ingestion',
    });
  });
  
  routesLoaded = true;
}

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Vercel serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Load routes on first request
  await loadRoutes();
  
  return new Promise<void>((resolve) => {
    const expressReq = req as unknown as Request;
    const expressRes = res as unknown as Response;
    
    // Handle response finish
    const originalEnd = res.end.bind(res);
    res.end = function(...args: any[]) {
      originalEnd(...args);
      resolve();
      return res;
    };
    
    // Handle the request through Express
    app(expressReq, expressRes);
  });
}

