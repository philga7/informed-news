import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import {
  createAuthRouter,
  createSessionMiddleware,
  requireApiSession,
} from './auth/index.js';
import {
  classifyArticleById,
  classifyUnclassifiedArticles,
  createKiteBriefRouter,
  createManualSeed,
  enrichUnenrichedClusters,
  fetchAllSources,
  ManualSeedValidationError,
  parseManualSeedBody,
  sortNewestFirst,
  buildRadarFeed,
  briefClusterKey,
} from './services/index.js';
import {
  acceptCluster,
  getArticleById,
  readArticles,
  readBriefMembership,
  readMeta,
  readTrackedStories,
  syncTrackedAfterFetch,
  trackCluster,
  unacceptCluster,
  untrackCluster,
} from './store/index.js';
import type { TrackedEntry } from './store/index.js';
import type { Article } from './types/article.js';

export type CreateAppDeps = {
  fetchAllSources?: typeof fetchAllSources;
  syncTrackedAfterFetch?: typeof syncTrackedAfterFetch;
  readArticles?: typeof readArticles;
  readMeta?: typeof readMeta;
  acceptCluster?: typeof acceptCluster;
  unacceptCluster?: typeof unacceptCluster;
  readBriefMembership?: typeof readBriefMembership;
  createManualSeed?: typeof createManualSeed;
  parseManualSeedBody?: typeof parseManualSeedBody;
  trackCluster?: typeof trackCluster;
  untrackCluster?: typeof untrackCluster;
  readTrackedStories?: typeof readTrackedStories;
  getArticleById?: typeof getArticleById;
  classifyUnclassifiedArticles?: typeof classifyUnclassifiedArticles;
  classifyArticleById?: typeof classifyArticleById;
  enrichUnenrichedClusters?: typeof enrichUnenrichedClusters;
};

function parseClusterId(body: unknown): string | null {
  const raw = (body as { clusterId?: unknown } | null)?.clusterId;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function countMembersForClusterId(
  articles: ReadonlyArray<Pick<Article, 'id' | 'clusterId'>>,
  clusterId: string,
): number {
  let count = 0;
  for (const article of articles) {
    if (briefClusterKey(article) === clusterId) {
      count += 1;
    }
  }
  return count;
}

function countByClusterIdFromArticles(
  articles: ReadonlyArray<Pick<Article, 'id' | 'clusterId'>>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const article of articles) {
    const key = briefClusterKey(article);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function createApp(deps: CreateAppDeps = {}): Express {
  const fetchAll = deps.fetchAllSources ?? fetchAllSources;
  const syncTracked = deps.syncTrackedAfterFetch ?? syncTrackedAfterFetch;
  const readAllArticles = deps.readArticles ?? readArticles;
  const readServerMeta = deps.readMeta ?? readMeta;
  const accept = deps.acceptCluster ?? acceptCluster;
  const unaccept = deps.unacceptCluster ?? unacceptCluster;
  const readMembership = deps.readBriefMembership ?? readBriefMembership;
  const seed = deps.createManualSeed ?? createManualSeed;
  const parseSeedBody = deps.parseManualSeedBody ?? parseManualSeedBody;
  const track = deps.trackCluster ?? trackCluster;
  const untrack = deps.untrackCluster ?? untrackCluster;
  const readTracked = deps.readTrackedStories ?? readTrackedStories;
  const getById = deps.getArticleById ?? getArticleById;
  const classifyBatch = deps.classifyUnclassifiedArticles ?? classifyUnclassifiedArticles;
  const classifyOne = deps.classifyArticleById ?? classifyArticleById;
  const enrich = deps.enrichUnenrichedClusters ?? enrichUnenrichedClusters;

  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(createSessionMiddleware());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', app: 'mvp-server' });
  });

  app.get('/', (_req, res) => {
    res.json({ message: 'Informed News MVP server' });
  });

  // Public Kite brief adapter (NEWS-44) — must stay before requireApiSession.
  app.use('/api', createKiteBriefRouter());

  app.use('/api', requireApiSession);
  app.use('/api', createAuthRouter());

  /**
   * Unified refresh: CFP → curated RSS → xcancel (when configured).
   * Optional body/query: { limit?: number, feedUrl?: string }
   * Empty/missing radar-sources.json skips curated without failing CFP.
   * Empty XCANCEL_PROFILES / x-profiles.json skips xcancel without failing CFP.
   * Curated/xcancel errors are returned in the payload; CFP still succeeds.
   */
  app.post('/api/fetch', async (req, res) => {
    try {
      const limitRaw = req.body?.limit ?? req.query.limit;
      const feedUrlRaw = req.body?.feedUrl ?? req.query.feedUrl;
      const limit =
        limitRaw !== undefined && limitRaw !== '' ? Number(limitRaw) : undefined;
      const feedUrl = typeof feedUrlRaw === 'string' ? feedUrlRaw : undefined;

      const result = await fetchAll({ limit, feedUrl });

      try {
        // Important: build counts from the full rewritten store (same denominator as Accept),
        // not just the upserted rows from this fetch result.
        const allArticles = await readAllArticles();
        const countByClusterId = countByClusterIdFromArticles(allArticles);
        await syncTracked(countByClusterId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('Tracked stories sync after fetch failed:', message);
      }

      res.json({
        ok: true,
        feedUrl: result.cfp.feedUrl,
        limit: result.cfp.limit,
        fetched: result.fetched,
        clustered: result.clustered,
        clusters: result.clusters,
        cfp: { fetched: result.cfp.fetched, articles: result.cfp.upserted },
        curated: {
          skipped: result.curated.skipped,
          sources: result.curated.sources,
          fetched: result.curated.fetched,
          errors: result.curated.errors,
          articles: result.curated.upserted,
        },
        xcancel: {
          skipped: result.xcancel.skipped,
          handles: result.xcancel.handles,
          fetched: result.xcancel.fetched,
          errors: result.xcancel.errors,
          articles: result.xcancel.upserted,
        },
        articles: result.articles,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Fetch failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * List articles newest-first (publishedAt, then fetchedAt).
   */
  app.get('/api/articles', async (_req, res) => {
    try {
      const [articles, meta] = await Promise.all([readAllArticles(), readServerMeta()]);
      res.json({ articles: sortNewestFirst(articles), meta });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Brief membership: accepted cluster ids for the session operator.
   */
  app.get('/api/brief/membership', async (_req, res) => {
    try {
      const membership = await readMembership();
      res.json({
        ok: true,
        acceptedClusterIds: membership.acceptedClusterIds,
        updatedAt: membership.updatedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief membership read failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Accept a cluster onto the Brief (idempotent).
   * Also default-track it for developing-story alerts (idempotent).
   */
  app.post('/api/brief/accept', async (req, res) => {
    try {
      const clusterId = parseClusterId(req.body);
      if (!clusterId) {
        res.status(400).json({ ok: false, error: 'clusterId is required' });
        return;
      }

      const result = await accept(clusterId);
      const articles = await readAllArticles();
      const memberCount = countMembersForClusterId(articles, clusterId);
      await track(clusterId, memberCount);

      res.json({ ok: true, acceptedClusterIds: result.acceptedClusterIds });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief accept failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Create an operator-seeded Brief story (Accepted immediately).
   * Also default-track it for developing-story alerts (idempotent).
   */
  app.post('/api/brief/seed', async (req, res) => {
    try {
      const input = parseSeedBody(req.body);
      const result = await seed(input);
      res.json({
        ok: true,
        articleId: result.article.id,
        clusterId: result.article.clusterId!,
        acceptedClusterIds: result.acceptedClusterIds,
      });
    } catch (err) {
      if (err instanceof ManualSeedValidationError) {
        res.status(400).json({ ok: false, error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief seed failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Remove a cluster from Brief membership (idempotent).
   */
  app.post('/api/brief/unaccept', async (req, res) => {
    try {
      const clusterId = parseClusterId(req.body);
      if (!clusterId) {
        res.status(400).json({ ok: false, error: 'clusterId is required' });
        return;
      }

      const result = await unaccept(clusterId);
      res.json({ ok: true, acceptedClusterIds: result.acceptedClusterIds });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief unaccept failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Track a developing story (idempotent).
   * Does NOT Accept the cluster (Track ≠ Accept).
   */
  app.post('/api/brief/track', async (req, res) => {
    try {
      const clusterId = parseClusterId(req.body);
      if (!clusterId) {
        res.status(400).json({ ok: false, error: 'clusterId is required' });
        return;
      }

      const articles = await readAllArticles();
      const memberCount = countMembersForClusterId(articles, clusterId);
      const result = await track(clusterId, memberCount);
      res.json({ ok: true, entries: result.entries satisfies TrackedEntry[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief track failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** Untrack a developing story (idempotent). */
  app.post('/api/brief/untrack', async (req, res) => {
    try {
      const clusterId = parseClusterId(req.body);
      if (!clusterId) {
        res.status(400).json({ ok: false, error: 'clusterId is required' });
        return;
      }

      const result = await untrack(clusterId);
      res.json({ ok: true, entries: result.entries satisfies TrackedEntry[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief untrack failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** List tracked developing stories for the operator. */
  app.get('/api/brief/tracked', async (_req, res) => {
    try {
      const tracked = await readTracked();
      res.json({
        ok: true,
        entries: tracked.entries satisfies TrackedEntry[],
        updatedAt: tracked.updatedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief tracked read failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Radar feed: clustered CFP + curated RSS headlines only.
   */
  app.get('/api/radar', async (_req, res) => {
    try {
      const [articles, meta, membership, tracked] = await Promise.all([
        readAllArticles(),
        readServerMeta(),
        readMembership(),
        readTracked(),
      ]);
      const clusters = buildRadarFeed(
        articles,
        membership.acceptedClusterIds,
        tracked.entries.map((entry) => ({
          clusterId: entry.clusterId,
          pendingUpdate: entry.pendingUpdate,
        })),
      );
      res.json({
        ok: true,
        clusters,
        meta: {
          lastFetchAt: meta.lastFetchAt,
          lastError: meta.lastError,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Radar feed failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * One article by id (includes classification fields).
   */
  app.get('/api/articles/:id', async (req, res) => {
    try {
      const article = await getById(req.params.id);
      if (!article) {
        res.status(404).json({ error: 'Article not found' });
        return;
      }
      res.json({ article });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  /**
   * Classify unclassified articles (batch). Optional body/query: { limit?: number }
   */
  app.post('/api/classify', async (req, res) => {
    try {
      const limitRaw = req.body?.limit ?? req.query.limit;
      const limit =
        limitRaw !== undefined && limitRaw !== '' ? Number(limitRaw) : undefined;

      const result = await classifyBatch({ limit });
      res.json({
        ok: true,
        limit: result.limit,
        attempted: result.attempted,
        succeeded: result.succeeded,
        failed: result.failed,
        bySourceKind: result.bySourceKind,
        articles: result.articles,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Batch classify failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Reclassify a single article by id.
   */
  app.post('/api/classify/:id', async (req, res) => {
    try {
      const result = await classifyOne(req.params.id);
      if (!result) {
        res.status(404).json({ ok: false, error: 'Article not found' });
        return;
      }
      res.json({
        ok: result.ok,
        article: result.article,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Classify by id failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Enrich unenriched clusters (batch). Optional body/query: { limit?: number, force?: boolean }
   */
  app.post('/api/enrich', async (req, res) => {
    try {
      const limitRaw = req.body?.limit ?? req.query.limit;
      const limit =
        limitRaw !== undefined && limitRaw !== '' ? Number(limitRaw) : undefined;

      const forceRaw = req.body?.force ?? req.query.force;
      const force =
        forceRaw === undefined || forceRaw === ''
          ? undefined
          : typeof forceRaw === 'boolean'
            ? forceRaw
            : typeof forceRaw === 'number'
              ? forceRaw !== 0
              : typeof forceRaw === 'string'
                ? ['1', 'true', 'yes', 'on'].includes(forceRaw.trim().toLowerCase())
                : undefined;

      const result = await enrich({ limit, force });
      res.json({
        ok: true,
        limit: result.limit,
        attempted: result.attempted,
        succeeded: result.succeeded,
        failed: result.failed,
        keys: result.keys,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Batch enrich failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return app;
}

