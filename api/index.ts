/**
 * Vercel Serverless Function - API Handler
 * 
 * This is the main entry point for all /api/* requests on Vercel.
 * It wraps the Express backend to work in a serverless environment.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';

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

// Wrap Express app with serverless-http for Vercel
const handler = serverless(app);

// Export the handler for Vercel
export default handler;

