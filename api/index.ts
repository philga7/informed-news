/**
 * Vercel Serverless Function - API Handler
 * 
 * This is the main entry point for all /api/* requests on Vercel.
 * It wraps the Express backend to work in a serverless environment.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
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
app.get('/health', (_req, res) => {
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
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Export the Express app as a Vercel serverless function
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set up proper CORS for Vercel
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Create a promise to handle the Express app response
  return new Promise<void>((resolve, reject) => {
    // Convert Vercel request/response to Express-compatible format
    const expressReq = req as any;
    const expressRes = res as any;

    // Ensure proper URL path handling
    expressReq.url = req.url || '/';
    expressReq.path = req.url || '/';

    // Handle the request through Express
    app(expressReq, expressRes);

    // Resolve when response is finished
    expressRes.on('finish', () => resolve());
    expressRes.on('error', (err: Error) => reject(err));
  });
}

