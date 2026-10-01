import { Router } from 'express';
import type { Response } from 'express';
import {
  readArticles,
  readBriefMembership,
  readBriefSeen,
  readBriefSummaries,
  readClaimEnrichments,
  readClaimMembership,
  readClaims,
  readClusterEnrichments,
  readEvidenceLinks,
  readMeta,
  readMuteRules,
  readTopics,
  readTriage,
} from '../store/index.js';
import type { Article, StoreMeta } from '../types/article.js';
import {
  OWNED_BATCH_ID,
  buildBriefOverview,
  buildOwnedBatchInfo,
  buildOwnedCategoriesResponse,
  buildOwnedStoriesResponse,
  buildTopicBriefBatchInfo,
  buildTopicBriefCategoriesResponse,
  buildTopicBriefStoriesResponse,
  ownedBriefFixtureEnrichments,
  resolveOwnedBriefArticles,
  type KiteBatchStoriesResponse,
} from './kiteBriefAdapter.js';
import { loadBriefClaims } from './briefClaims.js';
import { resolveRefreshIntervalHours } from './briefConfig.js';
import { getRefreshRunner } from './refreshRunner.js';
import { composeTopicBrief, type TopicBrief } from './topicBrief.js';

export type CreateKiteBriefRouterDeps = {
  loadBriefClaims?: typeof loadBriefClaims;
  readArticles?: typeof readArticles;
  readTriage?: typeof readTriage;
  readTopics?: typeof readTopics;
  readMuteRules?: typeof readMuteRules;
  readBriefSeen?: typeof readBriefSeen;
  readBriefSummaries?: typeof readBriefSummaries;
  readMeta?: typeof readMeta;
  readBriefMembership?: typeof readBriefMembership;
  readClusterEnrichments?: typeof readClusterEnrichments;
  now?: () => Date;
  /** Default: the process refresh runner */
  isRefreshRunning?: () => boolean;
  /** Read for `REFRESH_INTERVAL_HOURS`; default `process.env` */
  env?: NodeJS.ProcessEnv;
};

/** Empty article store → the fixture stories; otherwise the topic Brief from triage kept records. */
type OwnedBrief =
  | { fixture: true; articles: Article[] }
  | { fixture: false; brief: TopicBrief; meta: StoreMeta };

function isOwnedBatchId(batchId: string): boolean {
  return batchId === OWNED_BATCH_ID || batchId === 'latest';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Public Kite-shaped brief endpoints (no session).
 * Proxied from apps/kite via KITE_API_BASE → this server's /api.
 */
export function createKiteBriefRouter(
  deps: CreateKiteBriefRouterDeps = {},
): Router {
  const loadClaims = deps.loadBriefClaims ?? loadBriefClaims;
  const readAllArticles = deps.readArticles ?? readArticles;
  const readTriageStore = deps.readTriage ?? readTriage;
  const readTopicList = deps.readTopics ?? readTopics;
  const readMutes = deps.readMuteRules ?? readMuteRules;
  const readSeen = deps.readBriefSeen ?? readBriefSeen;
  const readSummaries = deps.readBriefSummaries ?? readBriefSummaries;
  const readServerMeta = deps.readMeta ?? readMeta;
  const readMembership = deps.readBriefMembership ?? readBriefMembership;
  const readEnrichments = deps.readClusterEnrichments ?? readClusterEnrichments;
  const now = deps.now ?? (() => new Date());
  const isRefreshRunning = deps.isRefreshRunning ?? (() => getRefreshRunner().isRunning());
  const router = Router();

  async function loadOwnedBrief(at: Date): Promise<OwnedBrief> {
    const stored = await readAllArticles();
    if (stored.length === 0) {
      const [membership, mutes] = await Promise.all([readMembership(), readMutes()]);
      const { articles } = resolveOwnedBriefArticles(
        stored,
        membership.acceptedClusterIds,
        at,
        mutes.rules,
      );
      return { fixture: true, articles };
    }

    const [triage, topics, mutes, seen, summaries, meta] = await Promise.all([
      readTriageStore(),
      readTopicList(),
      readMutes(),
      readSeen(),
      readSummaries(),
      readServerMeta(),
    ]);
    const brief = composeTopicBrief({
      topics: topics.topics,
      muteRules: mutes.rules,
      articles: stored,
      triage,
      seen,
      summaries,
      refresh: meta.refresh ?? null,
      now: at,
    });
    return { fixture: false, brief, meta };
  }

  async function loadEnrichments() {
    const records = await readEnrichments();
    const map = new Map(
      records
        .filter((r) => r.enrichment !== null)
        .map((r) => [r.key, r.enrichment!] as const),
    );

    const fixture = ownedBriefFixtureEnrichments();
    for (const [key, enrichment] of fixture.entries()) {
      if (!map.has(key)) map.set(key, enrichment);
    }

    return map;
  }

  async function sendBatchInfo(res: Response): Promise<void> {
    const at = now();
    const owned = await loadOwnedBrief(at);
    res.json(
      owned.fixture
        ? buildOwnedBatchInfo(owned.articles)
        : buildTopicBriefBatchInfo(owned.brief, at),
    );
  }

  router.get('/batches/latest', async (_req, res) => {
    try {
      await sendBatchInfo(res);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  router.get('/batches/:batchId/categories/:categoryId/stories', async (req, res) => {
    try {
      if (!isOwnedBatchId(req.params.batchId)) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      const at = now();
      const owned = await loadOwnedBrief(at);
      let body: KiteBatchStoriesResponse | null;
      if (owned.fixture) {
        const limitRaw = req.query.limit;
        const limit =
          limitRaw !== undefined && limitRaw !== ''
            ? Number(limitRaw)
            : undefined;
        body = buildOwnedStoriesResponse(owned.articles, req.params.categoryId, {
          limit: Number.isFinite(limit) ? limit : undefined,
          enrichments: await loadEnrichments(),
        });
      } else {
        body = buildTopicBriefStoriesResponse(owned.brief, req.params.categoryId, {
          now: at,
          lastSuccess: owned.meta.refresh?.lastSuccess ?? null,
        });
      }
      if (!body) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }
      res.json(body);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  router.get('/batches/:batchId/categories', async (req, res) => {
    try {
      if (!isOwnedBatchId(req.params.batchId)) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      const at = now();
      const owned = await loadOwnedBrief(at);
      res.json(
        owned.fixture
          ? buildOwnedCategoriesResponse(owned.articles)
          : buildTopicBriefCategoriesResponse(owned.brief, {
              now: at,
              lastSuccess: owned.meta.refresh?.lastSuccess ?? null,
            }),
      );
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
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
      if (!isOwnedBatchId(req.params.batchId)) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }
      await sendBatchInfo(res);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  /**
   * Topic Brief layout for Kite (NEWS-88): section order, top/"More" split,
   * quiet topics, refresh status and plain-language notices.
   */
  router.get('/brief/overview', async (_req, res) => {
    try {
      const owned = await loadOwnedBrief(now());
      const meta = owned.fixture ? await readServerMeta() : owned.meta;
      res.json(
        buildBriefOverview({
          brief: owned.fixture ? null : owned.brief,
          meta,
          intervalHours: resolveRefreshIntervalHours(deps.env ?? process.env),
          running: isRefreshRunning(),
        }),
      );
    } catch (err) {
      res.status(500).json({ ok: false, error: errorMessage(err) });
    }
  });

  return router;
}
