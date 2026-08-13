import { Router } from 'express';
import type { Request, Response } from 'express';
import { feedScheduler } from '../services/scheduler.js';
import { ingestionScheduler } from '../services/ingestion/IngestionScheduler.js';
import type { NewsSource } from '../types/index.js';

const router = Router();

/**
 * POST /api/scheduler/start
 * Start scheduled feed fetching
 * @deprecated Use POST /api/scheduler/organization/start instead
 */
router.post('/start', async (req: Request, res: Response) => {
  console.warn('⚠️  DEPRECATED: POST /api/scheduler/start is deprecated. Use POST /api/scheduler/organization/start instead.');
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

// ============================================================================
// NEW INGESTION SCHEDULER ENDPOINTS
// ============================================================================

/**
 * POST /api/scheduler/organization/start
 * Start scheduled ingestion for an organization
 * 
 * Body:
 *   - organization_id: string (required)
 *   - schedule: string (optional, cron expression, defaults to every 15 minutes)
 */
router.post('/organization/start', async (req: Request, res: Response) => {
  try {
    const { organization_id, schedule } = req.body;

    if (!organization_id) {
      return res.status(400).json({
        error: 'Missing required field',
        required: ['organization_id'],
      });
    }

    await ingestionScheduler.scheduleForOrganization({
      organizationId: organization_id,
      schedule,
    });

    res.json({
      success: true,
      message: 'Ingestion scheduler started',
      organization_id,
      schedule: schedule || '*/15 * * * *',
    });
  } catch (error) {
    console.error('Error starting ingestion scheduler:', error);
    res.status(500).json({
      error: 'Failed to start scheduler',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/scheduler/organization/stop
 * Stop scheduled ingestion for an organization
 * 
 * Body:
 *   - organization_id: string (required)
 */
router.post('/organization/stop', (req: Request, res: Response) => {
  const { organization_id } = req.body;

  if (!organization_id) {
    return res.status(400).json({
      error: 'Missing required field',
      required: ['organization_id'],
    });
  }

  ingestionScheduler.clearOrganization(organization_id);

  res.json({
    success: true,
    message: 'Ingestion scheduler stopped',
    organization_id,
  });
});

/**
 * GET /api/scheduler/organizations
 * Get list of organizations with active schedulers
 */
router.get('/organizations', (_req: Request, res: Response) => {
  const organizations = ingestionScheduler.getScheduledOrganizations();
  res.json({
    active_organizations: organizations,
    count: organizations.length,
  });
});

export default router;

