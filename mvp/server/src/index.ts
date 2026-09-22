import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAuthRouter,
  createSessionMiddleware,
  requireApiSession,
} from './auth/index.js';
import {
  classifyArticleById,
  classifyUnclassifiedArticles,
  createKiteBriefRouter,
  enrichUnenrichedClusters,
  fetchAllSources,
  sortNewestFirst,
  buildRadarFeed,
} from './services/index.js';
import {
  acceptCluster,
  getArticleById,
  readArticles,
  readBriefMembership,
  readMeta,
  unacceptCluster,
} from './store/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const app = express();
const port = Number(process.env.PORT) || 3001;

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

    const result = await fetchAllSources({ limit, feedUrl });
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
    const [articles, meta] = await Promise.all([readArticles(), readMeta()]);
    res.json({ articles: sortNewestFirst(articles), meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

function parseClusterId(body: unknown): string | null {
  const raw = (body as { clusterId?: unknown } | null)?.clusterId;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Brief membership: accepted cluster ids for the session operator.
 */
app.get('/api/brief/membership', async (_req, res) => {
  try {
    const membership = await readBriefMembership();
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
 */
app.post('/api/brief/accept', async (req, res) => {
  try {
    const clusterId = parseClusterId(req.body);
    if (!clusterId) {
      res.status(400).json({ ok: false, error: 'clusterId is required' });
      return;
    }

    const result = await acceptCluster(clusterId);
    res.json({ ok: true, acceptedClusterIds: result.acceptedClusterIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Brief accept failed:', message);
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

    const result = await unacceptCluster(clusterId);
    res.json({ ok: true, acceptedClusterIds: result.acceptedClusterIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Brief unaccept failed:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

/**
 * Radar feed: clustered CFP + curated RSS headlines only.
 */
app.get('/api/radar', async (_req, res) => {
  try {
    const [articles, meta, membership] = await Promise.all([
      readArticles(),
      readMeta(),
      readBriefMembership(),
    ]);
    const clusters = buildRadarFeed(articles, membership.acceptedClusterIds);
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
    const article = await getArticleById(req.params.id);
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

    const result = await classifyUnclassifiedArticles({ limit });
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
    const result = await classifyArticleById(req.params.id);
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

    const result = await enrichUnenrichedClusters({ limit, force });
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

app.listen(port, () => {
  console.log(`MVP server listening on http://localhost:${port}`);
});
