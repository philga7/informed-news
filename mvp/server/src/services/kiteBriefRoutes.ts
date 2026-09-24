import { Router } from 'express';
import {
  readArticles,
  readBriefMembership,
  readClaimEnrichments,
  readClaimMembership,
  readClaims,
  readClusterEnrichments,
  readEvidenceLinks,
  readMuteRules,
} from '../store/index.js';
import {
  OWNED_BATCH_ID,
  buildOwnedBatchInfo,
  buildOwnedCategoriesResponse,
  buildOwnedStoriesResponse,
  ownedBriefFixtureEnrichments,
  resolveOwnedBriefArticles,
} from './kiteBriefAdapter.js';
import { loadBriefClaims } from './briefClaims.js';

export type CreateKiteBriefRouterDeps = {
  loadBriefClaims?: typeof loadBriefClaims;
};

/**
 * Public Kite-shaped brief endpoints (no session).
 * Proxied from apps/kite via KITE_API_BASE → this server's /api.
 */
export function createKiteBriefRouter(
  deps: CreateKiteBriefRouterDeps = {},
): Router {
  const loadClaims = deps.loadBriefClaims ?? loadBriefClaims;
  const router = Router();

  async function loadArticles() {
    const [stored, membership, mutes] = await Promise.all([
      readArticles(),
      readBriefMembership(),
      readMuteRules(),
    ]);
    return resolveOwnedBriefArticles(
      stored,
      membership.acceptedClusterIds,
      new Date(),
      mutes.rules,
    );
  }

  async function loadEnrichments(fromFixture: boolean) {
    const records = await readClusterEnrichments();
    const map = new Map(
      records
        .filter((r) => r.enrichment !== null)
        .map((r) => [r.key, r.enrichment!] as const),
    );

    if (fromFixture) {
      const fixture = ownedBriefFixtureEnrichments();
      for (const [key, enrichment] of fixture.entries()) {
        if (!map.has(key)) map.set(key, enrichment);
      }
    }

    return map;
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
      const { articles, fromFixture } = await loadArticles();
      const enrichments = await loadEnrichments(fromFixture);
      const body = buildOwnedStoriesResponse(articles, req.params.categoryId, {
        limit: Number.isFinite(limit) ? limit : undefined,
        enrichments,
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

  router.get('/batches/:batchId/claims', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      if (batchId !== OWNED_BATCH_ID && batchId !== 'latest') {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }

      const body = await loadClaims({
        readClaims,
        readEvidenceLinks,
        readArticles,
        readMuteRules,
        readClaimMembership,
        readClaimEnrichments,
      });
      res.json({ ok: true, claims: body.claims });
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
