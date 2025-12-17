import { Router } from 'express';
import type { Request, Response } from 'express';
import { fetchNewsFromSource } from '../services/feedFetcher.js';
import type { NewsSource } from '../types/index.js';

const router = Router();

/**
 * POST /api/sources/test
 * Test a news source configuration
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { source } = req.body as { source: NewsSource };

    if (!source) {
      return res.status(400).json({ error: 'Source is required' });
    }

    // Try to fetch from the source
    const articles = await fetchNewsFromSource(source);

    res.json({
      success: true,
      articleCount: articles.length,
      sampleArticle: articles[0] || null,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

