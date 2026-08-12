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
  fetchCfpArticles,
  sortNewestFirst,
} from './services/index.js';
import { getArticleById, readArticles, readMeta } from './store/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

app.use('/api', requireApiSession);
app.use('/api', createAuthRouter());

/**
 * Fetch latest CFP RSS items, scrape publisher URLs, upsert into JSON store.
 * Optional body/query: { limit?: number, feedUrl?: string }
 */
app.post('/api/fetch', async (req, res) => {
  try {
    const limitRaw = req.body?.limit ?? req.query.limit;
    const feedUrlRaw = req.body?.feedUrl ?? req.query.feedUrl;
    const limit =
      limitRaw !== undefined && limitRaw !== '' ? Number(limitRaw) : undefined;
    const feedUrl = typeof feedUrlRaw === 'string' ? feedUrlRaw : undefined;

    const result = await fetchCfpArticles({ limit, feedUrl });
    res.json({
      ok: true,
      feedUrl: result.feedUrl,
      limit: result.limit,
      fetched: result.fetched,
      articles: result.upserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('CFP fetch failed:', message);
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

app.listen(port, () => {
  console.log(`MVP server listening on http://localhost:${port}`);
});
