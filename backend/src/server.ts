import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sourcesRouter from './routes/sources.js';
import schedulerRouter from './routes/scheduler.js';
import ingestRouter from './routes/ingest.js';
import topicsRouter from './routes/topics.js';
import sourceRecordsRouter from './routes/sourceRecords.js';
import analysisRouter from './routes/analysis.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/sources', sourcesRouter);
app.use('/api/scheduler', schedulerRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/source-records', sourceRecordsRouter);
app.use('/api/analysis', analysisRouter);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});

export default app;

