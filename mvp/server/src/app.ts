import cors from 'cors';
import express from 'express';
import type { Express, Response } from 'express';
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
  enrichAcceptedClaims,
  enrichUnenrichedClusters,
  extractClaimsFromArticles,
  fetchAllSources,
  listTriageRecords,
  ManualSeedValidationError,
  buildFilteredOut,
  parseFilteredOutScope,
  parseManualSeedBody,
  parseTopicCreate,
  parseTopicPatch,
  sortNewestFirst,
  TopicValidationError,
  buildRadarFeed,
  briefClusterKey,
  clusterMatchesMute,
  createRefreshRunner,
  createTrackedStoriesSync,
  generateRefreshSummaries,
  generateFullStory,
  getRefreshRunner,
  loadClaimsRadar,
  markBriefSeen,
  summarizeBriefStory,
} from './services/index.js';
import type { RefreshRunner } from './services/index.js';
import {
  acceptCluster,
  acceptClaim,
  ackTrackedClaimUpdate,
  addMuteRule,
  dismissClaimReview,
  ackTrackedUpdate,
  createTopic,
  getArticleById,
  getClaimById,
  readArticles,
  readBriefMembership,
  readBriefSeen,
  readBriefFullStories,
  readBriefSummaries,
  readClaimMembership,
  readMuteRules,
  readMeta,
  readTopics,
  readTrackedClaims,
  readTrackedStories,
  readTriage,
  removeMuteRule,
  removeTopic,
  syncTrackedAfterFetch,
  TopicConflictError,
  trackClaim,
  trackCluster,
  unacceptCluster,
  unacceptClaim,
  untrackClaim,
  untrackCluster,
  updateMeta,
  updateTopic,
  writeBriefSeen,
} from './store/index.js';
import type { TrackedEntry } from './store/index.js';
import type { TrackedClaimEntry } from './store/index.js';
import type { Article } from './types/article.js';

export type CreateAppDeps = {
  /** Default: the process runner, or one built from the deps below when `fetchAllSources` is injected */
  refreshRunner?: RefreshRunner;
  /**
   * Injecting this builds a fresh runner from the deps below. Inject
   * `generateRefreshSummaries` and `updateMeta` too (or pass a `refreshRunner`
   * instead): any left out fall back to the real stores (mvp/data) and Ollama.
   */
  fetchAllSources?: typeof fetchAllSources;
  syncTrackedAfterFetch?: typeof syncTrackedAfterFetch;
  generateRefreshSummaries?: typeof generateRefreshSummaries;
  updateMeta?: typeof updateMeta;
  readArticles?: typeof readArticles;
  readMeta?: typeof readMeta;
  acceptCluster?: typeof acceptCluster;
  unacceptCluster?: typeof unacceptCluster;
  readBriefMembership?: typeof readBriefMembership;
  createManualSeed?: typeof createManualSeed;
  parseManualSeedBody?: typeof parseManualSeedBody;
  trackCluster?: typeof trackCluster;
  untrackCluster?: typeof untrackCluster;
  ackTrackedUpdate?: typeof ackTrackedUpdate;
  readTrackedStories?: typeof readTrackedStories;
  getArticleById?: typeof getArticleById;
  classifyUnclassifiedArticles?: typeof classifyUnclassifiedArticles;
  classifyArticleById?: typeof classifyArticleById;
  extractClaimsFromArticles?: typeof extractClaimsFromArticles;
  enrichUnenrichedClusters?: typeof enrichUnenrichedClusters;
  enrichAcceptedClaims?: typeof enrichAcceptedClaims;
  readMuteRules?: typeof readMuteRules;
  addMuteRule?: typeof addMuteRule;
  removeMuteRule?: typeof removeMuteRule;
  readTopics?: typeof readTopics;
  createTopic?: typeof createTopic;
  updateTopic?: typeof updateTopic;
  removeTopic?: typeof removeTopic;
  readTriage?: typeof readTriage;
  loadClaimsRadar?: typeof loadClaimsRadar;
  readClaimMembership?: typeof readClaimMembership;
  acceptClaim?: typeof acceptClaim;
  dismissClaimReview?: typeof dismissClaimReview;
  unacceptClaim?: typeof unacceptClaim;
  readTrackedClaims?: typeof readTrackedClaims;
  trackClaim?: typeof trackClaim;
  untrackClaim?: typeof untrackClaim;
  ackTrackedClaimUpdate?: typeof ackTrackedClaimUpdate;
  getClaimById?: typeof getClaimById;
  readBriefSeen?: typeof readBriefSeen;
  writeBriefSeen?: typeof writeBriefSeen;
  readBriefSummaries?: typeof readBriefSummaries;
  readBriefFullStories?: typeof readBriefFullStories;
  summarizeBriefStory?: typeof summarizeBriefStory;
  generateFullStory?: typeof generateFullStory;
  now?: () => Date;
};

const SEEN_IDS_MAX = 100;

/** `articleIds`: array of 1–SEEN_IDS_MAX non-empty strings; else null. */
function parseSeenArticleIds(body: unknown): string[] | null {
  const raw = (body as { articleIds?: unknown } | null)?.articleIds;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > SEEN_IDS_MAX) return null;
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string' || value.trim() === '') return null;
    ids.push(value.trim());
  }
  return ids;
}

/** In-process queue for brief-seen.json read-modify-write so concurrent marks aren't lost. */
let seenWriteChain: Promise<unknown> = Promise.resolve();

function serializeSeenWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = seenWriteChain.then(task, task);
  seenWriteChain = run.catch(() => undefined);
  return run;
}

const SUMMARY_ERROR_STATUS = { not_in_brief: 404, rate_limited: 429, error: 502 } as const;

function parseClusterId(body: unknown): string | null {
  const raw = (body as { clusterId?: unknown } | null)?.clusterId;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseClaimId(body: unknown): string | null {
  const raw = (body as { claimId?: unknown } | null)?.claimId;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseClaimIds(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const claimIds = raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
    return claimIds.length > 0 ? claimIds : undefined;
  }

  if (typeof raw === 'string' && raw.trim()) {
    const claimIds = raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return claimIds.length > 0 ? claimIds : undefined;
  }

  return undefined;
}

function parseBooleanLike(raw: unknown): boolean | undefined {
  return raw === undefined || raw === ''
    ? undefined
    : typeof raw === 'boolean'
      ? raw
      : typeof raw === 'number'
        ? raw !== 0
        : typeof raw === 'string'
          ? ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
          : undefined;
}

function sendTopicWriteError(res: Response, verb: string, err: unknown): void {
  if (err instanceof TopicValidationError) {
    res.status(400).json({ ok: false, error: err.message });
    return;
  }
  if (err instanceof TopicConflictError) {
    res.status(409).json({ ok: false, error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Topic ${verb} failed:`, message);
  res.status(500).json({ ok: false, error: message });
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

export function createApp(deps: CreateAppDeps = {}): Express {
  const readAllArticles = deps.readArticles ?? readArticles;
  const readServerMeta = deps.readMeta ?? readMeta;
  const refreshRunner =
    deps.refreshRunner ??
    (deps.fetchAllSources
      ? createRefreshRunner({
          fetchAll: deps.fetchAllSources,
          syncTracked: createTrackedStoriesSync({
            readArticles: readAllArticles,
            syncTrackedAfterFetch: deps.syncTrackedAfterFetch ?? syncTrackedAfterFetch,
          }),
          generateSummaries: deps.generateRefreshSummaries ?? generateRefreshSummaries,
          readMeta: readServerMeta,
          updateMeta: deps.updateMeta ?? updateMeta,
        })
      : getRefreshRunner());
  const accept = deps.acceptCluster ?? acceptCluster;
  const unaccept = deps.unacceptCluster ?? unacceptCluster;
  const readMembership = deps.readBriefMembership ?? readBriefMembership;
  const seed = deps.createManualSeed ?? createManualSeed;
  const parseSeedBody = deps.parseManualSeedBody ?? parseManualSeedBody;
  const track = deps.trackCluster ?? trackCluster;
  const untrack = deps.untrackCluster ?? untrackCluster;
  const ackTracked = deps.ackTrackedUpdate ?? ackTrackedUpdate;
  const readTracked = deps.readTrackedStories ?? readTrackedStories;
  const readMutes = deps.readMuteRules ?? readMuteRules;
  const addMute = deps.addMuteRule ?? addMuteRule;
  const removeMute = deps.removeMuteRule ?? removeMuteRule;
  const readTopicList = deps.readTopics ?? readTopics;
  const createOneTopic = deps.createTopic ?? createTopic;
  const updateOneTopic = deps.updateTopic ?? updateTopic;
  const removeOneTopic = deps.removeTopic ?? removeTopic;
  const readTriageStore = deps.readTriage ?? readTriage;
  const getById = deps.getArticleById ?? getArticleById;
  const classifyBatch = deps.classifyUnclassifiedArticles ?? classifyUnclassifiedArticles;
  const classifyOne = deps.classifyArticleById ?? classifyArticleById;
  const extractClaims = deps.extractClaimsFromArticles ?? extractClaimsFromArticles;
  const enrich = deps.enrichUnenrichedClusters ?? enrichUnenrichedClusters;
  const enrichClaims = deps.enrichAcceptedClaims ?? enrichAcceptedClaims;
  const loadRadarClaims = deps.loadClaimsRadar ?? loadClaimsRadar;
  const readClaimMember = deps.readClaimMembership ?? readClaimMembership;
  const acceptOneClaim = deps.acceptClaim ?? acceptClaim;
  const dismissOneClaimReview = deps.dismissClaimReview ?? dismissClaimReview;
  const unacceptOneClaim = deps.unacceptClaim ?? unacceptClaim;
  const readClaimTracked = deps.readTrackedClaims ?? readTrackedClaims;
  const trackOneClaim = deps.trackClaim ?? trackClaim;
  const untrackOneClaim = deps.untrackClaim ?? untrackClaim;
  const ackTrackedClaim = deps.ackTrackedClaimUpdate ?? ackTrackedClaimUpdate;
  const getClaim = deps.getClaimById ?? getClaimById;
  const readSeen = deps.readBriefSeen ?? readBriefSeen;
  const writeSeen = deps.writeBriefSeen ?? writeBriefSeen;
  const readSummaries = deps.readBriefSummaries ?? readBriefSummaries;
  const readFullStories = deps.readBriefFullStories ?? readBriefFullStories;
  const summarizeStory = deps.summarizeBriefStory ?? summarizeBriefStory;
  const generateStory = deps.generateFullStory ?? generateFullStory;
  const now = deps.now ?? (() => new Date());

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
  app.use(
    '/api',
    createKiteBriefRouter({
      readArticles: readAllArticles,
      readTriage: readTriageStore,
      readTopics: readTopicList,
      readMuteRules: readMutes,
      readBriefSeen: readSeen,
      readBriefSummaries: readSummaries,
      readBriefFullStories: readFullStories,
      readMeta: readServerMeta,
      readBriefMembership: readMembership,
      now,
      isRefreshRunning: () => refreshRunner.isRunning(),
    }),
  );

  app.use('/api', requireApiSession);
  app.use('/api', createAuthRouter());

  /**
   * Unified refresh: CFP → curated RSS → xcancel (when configured) → topic search → triage
   * → tracked-stories sync → Brief summaries (shared single-flight runner with the timer).
   * Optional body/query: { limit?: number, feedUrl?: string } — ignored when joining a running refresh.
   * Empty/missing radar-sources.json skips curated without failing CFP.
   * Empty XCANCEL_PROFILES / x-profiles.json skips xcancel without failing CFP.
   * Curated/xcancel/topic search errors are returned in the payload; CFP still succeeds.
   */
  app.post('/api/fetch', async (req, res) => {
    try {
      const limitRaw = req.body?.limit ?? req.query.limit;
      const feedUrlRaw = req.body?.feedUrl ?? req.query.feedUrl;
      const limit =
        limitRaw !== undefined && limitRaw !== '' ? Number(limitRaw) : undefined;
      const feedUrl = typeof feedUrlRaw === 'string' ? feedUrlRaw : undefined;

      const refresh = await refreshRunner.run('manual', { limit, feedUrl });
      const result = refresh.fetch;

      res.json({
        ok: true,
        feedUrl: result.cfp.feedUrl,
        limit: result.cfp.limit,
        fetched: result.fetched,
        tiers: result.tiers,
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
        topicSearch: {
          skipped: result.topicSearch.skipped,
          providers: result.topicSearch.providers,
          fetched: result.topicSearch.fetched,
          perTopic: result.topicSearch.perTopic,
          errors: result.topicSearch.errors,
          articles: result.topicSearch.upserted.length,
        },
        triage: {
          skipped: result.triage.skipped,
          candidates: result.triage.candidates,
          kept: result.triage.kept,
          dropped: result.triage.dropped,
          byReason: result.triage.byReason,
          jev: result.triage.jev,
          summaryBudget: result.triage.summaryBudget,
          errors: result.triage.errors,
        },
        articles: result.articles,
        refresh: {
          trigger: refresh.trigger,
          joined: refresh.joined,
          startedAt: refresh.startedAt,
          completedAt: refresh.completedAt,
        },
        brief: { summaries: refresh.brief.summaries },
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
   * Topic Brief read marks (NEWS-88): body { articleIds: string[] } (1–100).
   * Snapshots each kept record so the story stays hidden after the next
   * refresh unless significantly updated; unknown ids are ignored.
   */
  app.post('/api/brief/seen', async (req, res) => {
    const articleIds = parseSeenArticleIds(req.body);
    if (!articleIds) {
      res.status(400).json({
        ok: false,
        error: `articleIds must be an array of 1–${SEEN_IDS_MAX} non-empty strings`,
      });
      return;
    }
    try {
      const recorded = await serializeSeenWrite(async () => {
        const [seen, triage] = await Promise.all([readSeen(), readTriageStore()]);
        const result = markBriefSeen({ seen, triage, articleIds, now: now() });
        await writeSeen(result.store);
        return result.recorded;
      });
      res.json({ ok: true, recorded });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief seen write failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * On-demand AI summary for a story visible in the topic Brief (NEWS-88).
   * 404 not_in_brief · 429 rate_limited · 502 error (Ollama / store).
   */
  app.post('/api/brief/stories/:articleId/summary', async (req, res) => {
    try {
      const result = await summarizeStory(
        req.params.articleId,
        { now: now() },
        {
          readTopics: readTopicList,
          readMuteRules: readMutes,
          readArticles: readAllArticles,
          readTriage: readTriageStore,
          readBriefSeen: readSeen,
          readBriefSummaries: readSummaries,
          readMeta: readServerMeta,
        },
      );
      if (!result.ok) {
        res
          .status(SUMMARY_ERROR_STATUS[result.code])
          .json({ ok: false, error: result.code, message: result.error });
        return;
      }
      res.json({
        ok: true,
        summary: { status: result.summary.status, text: result.summary.text },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief summary failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * On-demand rich story for a story visible in the topic Brief (NEWS-89).
   * 404 not_in_brief · 429 rate_limited · 502 error (Ollama / store).
   */
  app.post('/api/brief/stories/:articleId/full', async (req, res) => {
    try {
      const result = await generateStory(
        req.params.articleId,
        { now: now() },
        {
          readTopics: readTopicList,
          readMuteRules: readMutes,
          readArticles: readAllArticles,
          readTriage: readTriageStore,
          readBriefSeen: readSeen,
          readBriefSummaries: readSummaries,
          readMeta: readServerMeta,
          readBriefFullStories: readFullStories,
        },
      );
      if (!result.ok) {
        res
          .status(SUMMARY_ERROR_STATUS[result.code])
          .json({ ok: false, error: result.code, message: result.error });
        return;
      }
      const { enrichment, deterministic, status, changeSummary } = result.record;
      res.json({
        ok: true,
        fullStory: {
          status,
          ...(enrichment ?? {}),
          ...(deterministic.perspectives ? { perspectives: deterministic.perspectives } : {}),
          ...(deterministic.quote ?? {}),
          ...(changeSummary ? { changeSummary } : {}),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief full story failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Global mute rules: veto on Radar + Brief.
   */
  app.get('/api/brief/mutes', async (_req, res) => {
    try {
      const store = await readMutes();
      res.json({ ok: true, rules: store.rules, updatedAt: store.updatedAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Mute rules read failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/brief/mutes', async (req, res) => {
    try {
      const keywordRaw = req.body?.keyword;
      const keyword = typeof keywordRaw === 'string' ? keywordRaw.trim() : '';
      if (!keyword) {
        res.status(400).json({ ok: false, error: 'keyword is required' });
        return;
      }
      const sourceRaw = req.body?.source;
      const source = typeof sourceRaw === 'string' ? sourceRaw : null;

      const result = await addMute(keyword, source);
      res.json({ ok: true, rules: result.rules });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Mute rule create failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.delete('/api/brief/mutes/:id', async (req, res) => {
    try {
      const result = await removeMute(req.params.id);
      res.json({ ok: true, rules: result.rules });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Mute rule delete failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Operator topic list (NEWS-85).
   * Mute rules still apply and always win over desired topics.
   */
  app.get('/api/topics', async (_req, res) => {
    try {
      const store = await readTopicList();
      res.json({ ok: true, topics: store.topics, updatedAt: store.updatedAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Topics read failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/topics', async (req, res) => {
    try {
      const fields = parseTopicCreate(req.body);
      const result = await createOneTopic(fields);
      res.status(201).json({ ok: true, topic: result.topic, topics: result.topics });
    } catch (err) {
      sendTopicWriteError(res, 'create', err);
    }
  });

  app.patch('/api/topics/:id', async (req, res) => {
    try {
      const patch = parseTopicPatch(req.body);
      const result = await updateOneTopic(req.params.id, patch);
      if (!result) {
        res.status(404).json({ ok: false, error: 'topic not found' });
        return;
      }
      res.json({ ok: true, topic: result.topic, topics: result.topics });
    } catch (err) {
      sendTopicWriteError(res, 'update', err);
    }
  });

  app.delete('/api/topics/:id', async (req, res) => {
    try {
      const result = await removeOneTopic(req.params.id);
      res.json({ ok: true, removed: result.removed, topics: result.topics });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Topic delete failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Triage records (NEWS-87): newest first, capped, joined with article fields,
   * plus the last run summary from meta.
   */
  app.get('/api/triage', async (_req, res) => {
    try {
      const [store, articles, meta] = await Promise.all([
        readTriageStore(),
        readAllArticles(),
        readServerMeta(),
      ]);
      res.json({
        ok: true,
        run: meta.triage ?? null,
        records: listTriageRecords(store, articles),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Triage read failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Filtered out (NEWS-90): dropped records for `scope=last` (default; the last
   * triage run) or `scope=window` (last TRIAGE_WINDOW_HOURS), grouped by reason.
   */
  app.get('/api/triage/filtered', async (req, res) => {
    try {
      const [store, articles, topics, mutes, meta] = await Promise.all([
        readTriageStore(),
        readAllArticles(),
        readTopicList(),
        readMutes(),
        readServerMeta(),
      ]);
      res.json({
        ok: true,
        ...buildFilteredOut({
          store,
          articles,
          topics: topics.topics,
          muteRules: mutes.rules,
          run: meta.triage ?? null,
          scope: parseFilteredOutScope(req.query.scope),
          now: now(),
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Filtered out read failed:', message);
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

  /**
   * Ack a tracked story update (idempotent).
   * Clears pendingUpdate and bumps memberCountSnapshot to the current full-store count.
   */
  app.post('/api/brief/tracked/ack', async (req, res) => {
    try {
      const clusterId = parseClusterId(req.body);
      if (!clusterId) {
        res.status(400).json({ ok: false, error: 'clusterId is required' });
        return;
      }

      const articles = await readAllArticles();
      const memberCount = countMembersForClusterId(articles, clusterId);
      const result = await ackTracked(clusterId, memberCount);
      res.json({ ok: true, entries: result.entries satisfies TrackedEntry[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Brief tracked ack failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** List tracked developing stories for the operator. */
  app.get('/api/brief/tracked', async (_req, res) => {
    try {
      const [tracked, articles, mutes] = await Promise.all([
        readTracked(),
        readAllArticles(),
        readMutes(),
      ]);

      const membersByClusterId = new Map<string, Article[]>();
      for (const article of articles) {
        const key = briefClusterKey(article);
        const list = membersByClusterId.get(key) ?? [];
        list.push(article);
        membersByClusterId.set(key, list);
      }

      const entries = tracked.entries.map((entry) => {
        const members = membersByClusterId.get(entry.clusterId) ?? [];
        const muted =
          members.length > 0
            ? clusterMatchesMute({ articles: members }, mutes.rules)
            : false;
        return { ...entry, muted };
      });

      res.json({
        ok: true,
        entries: entries satisfies Array<TrackedEntry & { muted: boolean }>,
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
      const [articles, meta, membership, tracked, mutes] = await Promise.all([
        readAllArticles(),
        readServerMeta(),
        readMembership(),
        readTracked(),
        readMutes(),
      ]);
      const allClusters = buildRadarFeed(
        articles,
        membership.acceptedClusterIds,
        tracked.entries.map((entry) => ({
          clusterId: entry.clusterId,
          pendingUpdate: entry.pendingUpdate,
        })),
      );
      const hiddenMutedCount = allClusters.filter((cluster) =>
        clusterMatchesMute(cluster, mutes.rules),
      ).length;
      const clusters = allClusters.filter(
        (cluster) => !clusterMatchesMute(cluster, mutes.rules),
      );
      res.json({
        ok: true,
        clusters,
        hiddenMutedCount,
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
   * Claims radar inbox: claims + evidence summary + linked headlines.
   */
  app.get('/api/claims/radar', async (_req, res) => {
    try {
      const feed = await loadRadarClaims();
      res.json({ ok: true, ...feed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claims radar feed failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** Claim membership: accepted claimIds for the operator. */
  app.get('/api/claims/membership', async (_req, res) => {
    try {
      const membership = await readClaimMember();
      res.json({
        ok: true,
        acceptedClaimIds: membership.acceptedClaimIds,
        updatedAt: membership.updatedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim membership read failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Accept a claim onto membership (idempotent).
   * Also default-track it for developing-claim alerts (idempotent).
   */
  app.post('/api/claims/accept', async (req, res) => {
    try {
      const claimId = parseClaimId(req.body);
      if (!claimId) {
        res.status(400).json({ ok: false, error: 'claimId is required' });
        return;
      }

      const existing = await getClaim(claimId);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Claim not found' });
        return;
      }

      const result = await acceptOneClaim(claimId);
      await trackOneClaim(claimId);
      await dismissOneClaimReview(claimId);

      res.json({ ok: true, acceptedClaimIds: result.acceptedClaimIds });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim accept failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/claims/review/dismiss', async (req, res) => {
    try {
      const claimId = parseClaimId(req.body);
      if (!claimId) {
        res.status(400).json({ ok: false, error: 'claimId is required' });
        return;
      }

      const existing = await getClaim(claimId);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Claim not found' });
        return;
      }

      const result = await dismissOneClaimReview(claimId);
      res.json({ ok: true, dismissedClaimIds: result.dismissedClaimIds });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim review dismiss failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post('/api/claims/review/dismiss-all', async (_req, res) => {
    try {
      const feed = await loadRadarClaims();
      const claimIds = Array.from(
        new Set(feed.needsReview.map((claim) => claim.claimId)),
      );
      const dismissedClaimIds: string[] = [];

      for (const claimId of claimIds) {
        const result = await dismissOneClaimReview(claimId);
        dismissedClaimIds.push(...result.dismissedClaimIds);
      }

      res.json({ ok: true, dismissedClaimIds });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim review dismiss-all failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** Remove a claim from membership (idempotent). */
  app.post('/api/claims/unaccept', async (req, res) => {
    try {
      const claimId = parseClaimId(req.body);
      if (!claimId) {
        res.status(400).json({ ok: false, error: 'claimId is required' });
        return;
      }

      const result = await unacceptOneClaim(claimId);
      res.json({ ok: true, acceptedClaimIds: result.acceptedClaimIds });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim unaccept failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** List tracked claims for the operator. */
  app.get('/api/claims/tracked', async (_req, res) => {
    try {
      const tracked = await readClaimTracked();
      res.json({
        ok: true,
        entries: tracked.entries satisfies TrackedClaimEntry[],
        updatedAt: tracked.updatedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Tracked claims read failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Track a claim for updates (idempotent).
   * Does NOT Accept the claim (Track ≠ Accept).
   */
  app.post('/api/claims/track', async (req, res) => {
    try {
      const claimId = parseClaimId(req.body);
      if (!claimId) {
        res.status(400).json({ ok: false, error: 'claimId is required' });
        return;
      }

      const existing = await getClaim(claimId);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Claim not found' });
        return;
      }

      const result = await trackOneClaim(claimId);
      res.json({ ok: true, entries: result.entries satisfies TrackedClaimEntry[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim track failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /** Untrack a claim (idempotent). */
  app.post('/api/claims/untrack', async (req, res) => {
    try {
      const claimId = parseClaimId(req.body);
      if (!claimId) {
        res.status(400).json({ ok: false, error: 'claimId is required' });
        return;
      }

      const result = await untrackOneClaim(claimId);
      res.json({ ok: true, entries: result.entries satisfies TrackedClaimEntry[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim untrack failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  /**
   * Ack a tracked claim update (idempotent).
   * Clears pendingUpdate.
   */
  app.post('/api/claims/tracked/ack', async (req, res) => {
    try {
      const claimId = parseClaimId(req.body);
      if (!claimId) {
        res.status(400).json({ ok: false, error: 'claimId is required' });
        return;
      }

      const existing = await getClaim(claimId);
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Claim not found' });
        return;
      }

      const result = await ackTrackedClaim(claimId);
      res.json({ ok: true, entries: result.entries satisfies TrackedClaimEntry[] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim tracked ack failed:', message);
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
   * Extract claims from articles (propose → judge → persist).
   * Optional body/query: { limit?: number, force?: boolean, articleIds?: string[] }
   */
  app.post('/api/claims/extract', async (req, res) => {
    try {
      const limitRaw = req.body?.limit ?? req.query.limit;
      const limit =
        limitRaw !== undefined && limitRaw !== '' ? Number(limitRaw) : undefined;

      const forceRaw = req.body?.force ?? req.query.force;
      const force = parseBooleanLike(forceRaw);

      const articleIdsRaw = req.body?.articleIds ?? req.query.articleIds;
      const articleIds = parseClaimIds(articleIdsRaw);

      const result = await extractClaims({
        limit,
        force,
        articleIds,
        readMuteRulesFn: readMutes,
      });
      res.json({
        ok: result.ok,
        limit: result.limit,
        attempted: result.attempted,
        proposed: result.proposed,
        judged: result.judged,
        persistedClaims: result.persistedClaims,
        persistedEvidence: result.persistedEvidence,
        needsReview: result.needsReview,
        failed: result.failed,
        articlesProcessed: result.articlesProcessed,
        skippedMuted: result.skippedMuted,
        claims: result.claims,
        evidence: result.evidence,
        reviewQueued: result.reviewQueued,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claims extract failed:', message);
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
      const force = parseBooleanLike(forceRaw);

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

  /**
   * Enrich accepted claims with AI-assisted verbiage.
   * Optional body/query: { claimIds?: string[], force?: boolean }
   */
  app.post('/api/claims/enrich', async (req, res) => {
    try {
      const forceRaw = req.body?.force ?? req.query.force;
      const force = parseBooleanLike(forceRaw);
      const claimIdsRaw = req.body?.claimIds ?? req.query.claimIds;
      const claimIds = parseClaimIds(claimIdsRaw);

      const result = await enrichClaims({ claimIds, force });
      res.json({
        ok: true,
        attempted: result.attempted,
        succeeded: result.succeeded,
        failed: result.failed,
        claimIds: result.claimIds,
        skippedClaimIds: result.skippedClaimIds,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Claim enrich failed:', message);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return app;
}

