import { Router } from 'express';
import type { Request, Response } from 'express';
import { fetchAllNews, fetchNewsFromSource } from '../services/feedFetcher.js';
import { feedCache } from '../services/feedCache.js';
import type { NewsSource, NewsArticle } from '../types/index.js';

const router = Router();

/**
 * POST /api/feeds/fetch
 * Fetch news from all enabled sources
 */
router.post('/fetch', async (req: Request, res: Response) => {
  try {
    const { sources } = req.body as { sources: NewsSource[] };

    if (!sources || !Array.isArray(sources)) {
      return res.status(400).json({ error: 'Sources array is required' });
    }

    const { articles, errors } = await fetchAllNews(sources);

    res.json({
      articles,
      errors,
      count: articles.length,
    });
  } catch (error) {
    console.error('Error fetching feeds:', error);
    res.status(500).json({
      error: 'Failed to fetch feeds',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/feeds/fetch/:sourceId
 * Fetch news from a specific source
 */
router.post('/fetch/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { source } = req.body as { source: NewsSource };

    if (!source || source.id !== sourceId) {
      return res.status(400).json({ error: 'Valid source is required' });
    }

    // Check cache first
    const cached = feedCache.get(sourceId);
    if (cached) {
      return res.json({
        articles: cached,
        errors: [],
        cached: true,
      });
    }

    const articles = await fetchNewsFromSource(source);
    feedCache.set(sourceId, articles);

    res.json({
      articles,
      errors: [],
      cached: false,
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({
      error: 'Failed to fetch feed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/feeds/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', (_req: Request, res: Response) => {
  const stats = feedCache.getStats();
  res.json(stats);
});

/**
 * DELETE /api/feeds/cache/:sourceId
 * Clear cache for a specific source
 */
router.delete('/cache/:sourceId', (req: Request, res: Response) => {
  const { sourceId } = req.params;
  feedCache.clear(sourceId);
  res.json({ message: `Cache cleared for source ${sourceId}` });
});

/**
 * DELETE /api/feeds/cache
 * Clear all cache
 */
router.delete('/cache', (_req: Request, res: Response) => {
  feedCache.clearAll();
  res.json({ message: 'All cache cleared' });
});

export default router;

