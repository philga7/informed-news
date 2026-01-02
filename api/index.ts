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
  
  // Dynamically import routes to defer jsdom loading
  const feedsRouter = (await import('../backend/src/routes/feeds.js')).default;
  const sourcesRouter = (await import('../backend/src/routes/sources.js')).default;
  const ingestRouter = (await import('../backend/src/routes/ingest.js')).default;
  const topicsRouter = (await import('../backend/src/routes/topics.js')).default;
  const sourceRecordsRouter = (await import('../backend/src/routes/sourceRecords.js')).default;
  const analysisRouter = (await import('../backend/src/routes/analysis.js')).default;

  // API Routes
  app.use('/api/feeds', feedsRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/ingest', ingestRouter);
  app.use('/api/topics', topicsRouter);
  app.use('/api/source-records', sourceRecordsRouter);
  app.use('/api/analysis', analysisRouter);
  
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

