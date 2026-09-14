import { Router } from 'express';
import { readArticles } from '../store/index.js';
import {
  OWNED_BATCH_ID,
  buildOwnedBatchInfo,
  buildOwnedCategoriesResponse,
  buildOwnedStoriesResponse,
  resolveOwnedBriefArticles,
} from './kiteBriefAdapter.js';

/**
 * Public Kite-shaped brief endpoints (no session).
 * Proxied from apps/kite via KITE_API_BASE → this server's /api.
 */
export function createKiteBriefRouter(): Router {
  const router = Router();

  async function loadArticles() {
    const stored = await readArticles();
    return resolveOwnedBriefArticles(stored);
  }

  router.get('/batches/latest', async (_req, res) => {
    try {
      const { articles } = await loadArticles();
      res.json(buildOwnedBatchInfo(articles));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/batches/:batchId/categories/:categoryId/stories', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      if (batchId !== OWNED_BATCH_ID && batchId !== 'latest') {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      const limitRaw = req.query.limit;
      const limit =
        limitRaw !== undefined && limitRaw !== ''
          ? Number(limitRaw)
          : undefined;
      const { articles } = await loadArticles();
      const body = buildOwnedStoriesResponse(articles, req.params.categoryId, {
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      if (!body) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }
      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/batches/:batchId/categories', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      if (batchId !== OWNED_BATCH_ID && batchId !== 'latest') {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      const { articles } = await loadArticles();
      res.json(buildOwnedCategoriesResponse(articles));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.get('/batches/:batchId/chaos', (_req, res) => {
    res.status(404).json({ error: 'Chaos index not available for owned brief' });
  });

  router.get('/batches/:batchId', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      if (batchId !== OWNED_BATCH_ID && batchId !== 'latest') {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      const { articles } = await loadArticles();
      res.json(buildOwnedBatchInfo(articles));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
