/**
 * Vercel Serverless Function - API Handler
 * 
 * This is the main entry point for all /api/* requests on Vercel.
 * It wraps the Express backend to work in a serverless environment.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { type Request, type Response } from 'express';
import cors from 'cors';

// Import routes with proper extensions for serverless
import feedsRouter from '../backend/src/routes/feeds.js';
import sourcesRouter from '../backend/src/routes/sources.js';
import ingestRouter from '../backend/src/routes/ingest.js';
import topicsRouter from '../backend/src/routes/topics.js';
import sourceRecordsRouter from '../backend/src/routes/sourceRecords.js';
import analysisRouter from '../backend/src/routes/analysis.js';

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/feeds', feedsRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/source-records', sourceRecordsRouter);
app.use('/api/analysis', analysisRouter);

// Note: Scheduler routes are excluded for production
// These will be handled by GitHub Actions workflows

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
  return new Promise<void>((resolve) => {
    // Create a mock Node.js request/response that Express expects
    // VercelRequest/VercelResponse are actually compatible with Express
    // but we need to ensure proper event handling
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

