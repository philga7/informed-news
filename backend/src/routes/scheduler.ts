import { Router } from 'express';
import type { Request, Response } from 'express';
import { feedScheduler } from '../services/scheduler.js';
import type { NewsSource } from '../types/index.js';

const router = Router();

/**
 * POST /api/scheduler/start
 * Start scheduled feed fetching
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { sources, schedule } = req.body as {
      sources: NewsSource[];
      schedule?: string;
    };

    if (!sources || !Array.isArray(sources)) {
      return res.status(400).json({ error: 'Sources array is required' });
    }

    feedScheduler.scheduleFeeds(sources, schedule);

    res.json({
      message: 'Scheduler started',
      schedule: schedule || '*/15 * * * *',
      sourceCount: sources.filter((s) => s.enabled).length,
    });
  } catch (error) {
    console.error('Error starting scheduler:', error);
    res.status(500).json({
      error: 'Failed to start scheduler',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/stop
 * Stop scheduled feed fetching
 */
router.post('/stop', (_req: Request, res: Response) => {
  feedScheduler.clearAll();
  res.json({ message: 'Scheduler stopped' });
});

/**
 * GET /api/scheduler/status
 * Get scheduler status
 */
router.get('/status', (_req: Request, res: Response) => {
  const activeCount = feedScheduler.getActiveScheduleCount();
  res.json({
    active: activeCount > 0,
    activeScheduleCount: activeCount,
  });
});

export default router;

