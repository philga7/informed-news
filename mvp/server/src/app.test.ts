import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Server } from 'node:http';
import express from 'express';

import type { CreateAppDeps } from './app.js';
import type { Article, StoreMeta } from './types/article.js';
import type { BriefRunMeta, BriefSeenStore } from './types/brief.js';
import type { Topic } from './types/topic.js';
import type { TriageRecord, TriageRunMeta, TriageStore } from './types/triage.js';
import type { RefreshResult, RefreshRunner } from './services/refreshRunner.js';
import type { SummarizeBriefStoryResult } from './services/briefSummaries.js';
import type { GenerateFullStoryResult } from './services/briefFullStories.js';
import {
  OWNED_FIXTURE_TITLE,
  buildOwnedStoriesResponse,
  ownedBriefFixtureEnrichments,
  resolveOwnedBriefArticles,
  type KiteBatchCategoriesResponse,
  type KiteBatchStoriesResponse,
} from './services/kiteBriefAdapter.js';
import { acceptCluster, readBriefMembership } from './store/briefMembershipStore.js';
import {
  ackTrackedUpdate,
  readTrackedStories,
  syncTrackedAfterFetch,
  trackCluster,
} from './store/trackedStoriesStore.js';
import {
  acceptClaim,
  readClaimMembership,
  unacceptClaim,
} from './store/claimMembershipStore.js';
import {
  dismissClaimReview as storeDismissClaimReview,
  enqueueClaimReview,
  readClaimReviewQueue,
  writeClaimReviewQueue,
} from './store/claimReviewQueueStore.js';
import {
  ackTrackedClaimUpdate,
  markTrackedClaimPending,
  readTrackedClaims,
  trackClaim,
} from './store/trackedClaimsStore.js';
import {
  addMuteRule,
  readMuteRules,
  removeMuteRule,
  type MuteRule,
} from './store/muteRulesStore.js';
import {
  createTopic,
  readTopics,
  removeTopic,
  updateTopic,
} from './store/topicsStore.js';
import { loadBriefClaims } from './services/briefClaims.js';
import { enrichAcceptedClaims } from './services/enrichClaims.js';
import { createKiteBriefRouter, type CreateKiteBriefRouterDeps } from './services/kiteBriefRoutes.js';
import { createManualSeed } from './services/manualBriefSeed.js';

function tempMembershipPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'brief-membership-'));
  return path.join(dir, 'brief-membership.json');
}

function tempTrackedPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracked-stories-'));
  return path.join(dir, 'tracked-stories.json');
}

function tempMuteRulesPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mute-rules-'));
  return path.join(dir, 'mute-rules.json');
}

function tempTopicsPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'topics-'));
  return path.join(dir, 'topics.json');
}

function tempClaimMembershipPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-membership-'));
  return path.join(dir, 'claim-membership.json');
}

function tempTrackedClaimsPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracked-claims-'));
  return path.join(dir, 'tracked-claims.json');
}

function tempClaimReviewQueuePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-review-queue-'));
  return path.join(dir, 'claim-review-queue.json');
}

const BRIEF_RUN: BriefRunMeta = {
  at: '2026-09-30T12:00:05.000Z',
  summaries: { budget: 60, used: 2, generated: 1, reused: 1, unavailable: 0, errors: ['Ollama: x'] },
};

/** Keeps refresh-time summaries and meta.refresh writes out of mvp/data. */
const noRefreshSideEffects = {
  generateRefreshSummaries: async () => BRIEF_RUN,
  updateMeta: async () => ({ lastFetchAt: null, lastError: null }),
};

async function startServer(app: { listen: (...args: any[]) => Server }): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object' && typeof address.port === 'number');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function login(baseUrl: string): Promise<string> {
  const resp = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'pw' }),
  });
  assert.equal(resp.status, 200);
  const anyHeaders = resp.headers as unknown as {
    getSetCookie?: () => string[];
    get: (key: string) => string | null;
  };
  const setCookies =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : (() => {
          const single = anyHeaders.get('set-cookie');
          return single ? [single] : [];
        })();

  assert.ok(setCookies.length >= 1);
  return setCookies.map((c) => c.split(';')[0]!).join('; ');
}

test('POST /api/brief/accept default-tracks with computed memberCount', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const membershipPath = tempMembershipPath();
  const trackedPath = tempTrackedPath();

  const articles: Article[] = [
    { id: 'a1', clusterId: 'c1' } as Article,
    { id: 'a2', clusterId: 'c1' } as Article,
    { id: 'solo-1', clusterId: null } as Article,
  ];

  const { createApp } = await import('./app.js');
  const app = createApp({
    readArticles: async () => articles,
    acceptCluster: async (clusterId) => await acceptCluster(clusterId, membershipPath),
    trackCluster: async (clusterId, memberCount) =>
      await trackCluster(clusterId, memberCount, trackedPath),
    readTrackedStories: async () => await readTrackedStories(trackedPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const acceptResp = await fetch(`${baseUrl}/api/brief/accept`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ clusterId: 'c1' }),
    });
    assert.equal(acceptResp.status, 200);

    const trackedResp = await fetch(`${baseUrl}/api/brief/tracked`, {
      headers: { cookie },
    });
    assert.equal(trackedResp.status, 200);
    const tracked = (await trackedResp.json()) as {
      ok: true;
      entries: Array<{
        clusterId: string;
        memberCountSnapshot: number;
        pendingUpdate: boolean;
        trackedAt: string;
      }>;
    };
    assert.equal(tracked.ok, true);
    const entry = tracked.entries.find((e) => e.clusterId === 'c1');
    assert.ok(entry);
    assert.equal(entry.memberCountSnapshot, 2);
    assert.equal(entry.pendingUpdate, false);
    assert.equal(typeof entry.trackedAt, 'string');
  } finally {
    await close();
  }
});

test('POST /api/brief/seed default-tracks with count 1', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const membershipPath = tempMembershipPath();
  const trackedPath = tempTrackedPath();

  const { createApp } = await import('./app.js');
  const app = createApp({
    createManualSeed: async (input) =>
      await createManualSeed(input, {
        now: () => '2026-09-21T12:00:00.000Z',
        uuid: () => '11111111-2222-4333-8444-555555555555',
        upsertArticle: async (article) => article as Article,
        acceptCluster: async (clusterId) => await acceptCluster(clusterId, membershipPath),
        trackCluster: async (clusterId, memberCount) =>
          await trackCluster(clusterId, memberCount, trackedPath),
      }),
    readTrackedStories: async () => await readTrackedStories(trackedPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const seedResp = await fetch(`${baseUrl}/api/brief/seed`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Manual seed' }),
    });
    assert.equal(seedResp.status, 200);
    const seedJson = (await seedResp.json()) as {
      ok: true;
      clusterId: string;
    };
    assert.equal(seedJson.ok, true);
    assert.equal(typeof seedJson.clusterId, 'string');
    assert.ok(seedJson.clusterId.length > 0);

    const trackedResp = await fetch(`${baseUrl}/api/brief/tracked`, {
      headers: { cookie },
    });
    const tracked = (await trackedResp.json()) as {
      ok: true;
      entries: Array<{ clusterId: string; memberCountSnapshot: number }>;
    };
    const entry = tracked.entries.find((e) => e.clusterId === seedJson.clusterId);
    assert.ok(entry);
    assert.equal(entry.memberCountSnapshot, 1);
  } finally {
    await close();
  }
});

test('POST /api/brief/track does not Accept the cluster', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const membershipPath = tempMembershipPath();
  const trackedPath = tempTrackedPath();

  const articles: Article[] = [{ id: 'a1', clusterId: 'c1' } as Article];

  const { createApp } = await import('./app.js');
  const app = createApp({
    readArticles: async () => articles,
    readBriefMembership: async () => await readBriefMembership(membershipPath),
    trackCluster: async (clusterId, memberCount) =>
      await trackCluster(clusterId, memberCount, trackedPath),
    readTrackedStories: async () => await readTrackedStories(trackedPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const trackResp = await fetch(`${baseUrl}/api/brief/track`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ clusterId: 'c1' }),
    });
    assert.equal(trackResp.status, 200);

    const membershipResp = await fetch(`${baseUrl}/api/brief/membership`, {
      headers: { cookie },
    });
    assert.equal(membershipResp.status, 200);
    const membership = (await membershipResp.json()) as {
      ok: true;
      acceptedClusterIds: string[];
    };
    assert.deepEqual(membership.acceptedClusterIds, []);
  } finally {
    await close();
  }
});

test('POST /api/fetch calls syncTrackedAfterFetch with briefClusterKey counts', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const fullStoreArticles: Article[] = [
    { id: 'a1', clusterId: 'c1' } as Article,
    { id: 'a2', clusterId: 'c1' } as Article,
    { id: 'a3', clusterId: 'c1' } as Article,
    { id: 'solo-1', clusterId: null } as Article,
  ];

  let seenMap: Readonly<Record<string, number>> | null = null;

  const { createApp } = await import('./app.js');
  const app = createApp({
    fetchAllSources: async () =>
      ({
        fetched: 3,
        clustered: 1,
        clusters: [],
        cfp: { feedUrl: 'x', limit: 3, fetched: 3, upserted: [] },
        curated: { skipped: true, sources: [], fetched: 0, errors: [], upserted: [] },
        xcancel: { skipped: true, handles: [], fetched: 0, errors: [], upserted: [] },
        topicSearch: {
          skipped: false,
          providers: {
            google_news: { state: 'ok', topicsAttempted: 1, topicsFailed: 0, items: 2, errors: [] },
            searxng: { state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] },
          },
          fetched: 2,
          perTopic: { t1: { found: 2, merged: 2, skippedSeen: 1, new: 1 } },
          upserted: [{ id: 'a2', clusterId: 'c1' } as Article],
          errors: [],
        },
        triage: {
          at: '2026-09-30T12:00:00.000Z',
          skipped: false,
          candidates: 3,
          kept: 1,
          dropped: 2,
          byReason: { off_topic: 1, duplicate: 1 },
          jev: { budget: 300, used: 1, errors: 0 },
          summaryBudget: 60,
          errors: [],
          keptIds: ['a2'],
        },
        // NOTE: syncTrackedAfterFetch must be based on the full rewritten store, not only
        // the upserted article set returned from the fetch result.
        articles: [{ id: 'a2', clusterId: 'c1' } as Article],
      }) as any,
    readArticles: async () => fullStoreArticles,
    syncTrackedAfterFetch: async (countByClusterId) => {
      seenMap = countByClusterId;
      return { entries: [] };
    },
    ...noRefreshSideEffects,
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 3 }),
    });
    assert.equal(resp.status, 200);
    const json = (await resp.json()) as { ok: boolean; topicSearch: unknown; triage: unknown };
    assert.equal(json.ok, true);
    assert.deepEqual(json.triage, {
      skipped: false,
      candidates: 3,
      kept: 1,
      dropped: 2,
      byReason: { off_topic: 1, duplicate: 1 },
      jev: { budget: 300, used: 1, errors: 0 },
      summaryBudget: 60,
      errors: [],
    });
    assert.deepEqual(json.topicSearch, {
      skipped: false,
      providers: {
        google_news: { state: 'ok', topicsAttempted: 1, topicsFailed: 0, items: 2, errors: [] },
        searxng: { state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] },
      },
      fetched: 2,
      perTopic: { t1: { found: 2, merged: 2, skippedSeen: 1, new: 1 } },
      errors: [],
      articles: 1,
    });
    assert.deepEqual(seenMap, { c1: 3, 'solo:solo-1': 1 });
    assert.deepEqual((json as { brief?: unknown }).brief, { summaries: BRIEF_RUN.summaries });
  } finally {
    await close();
  }
});

test('POST /api/fetch succeeds even when syncTrackedAfterFetch throws', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    fetchAllSources: async () =>
      ({
        fetched: 0,
        clustered: 0,
        clusters: [],
        cfp: { feedUrl: 'x', limit: 1, fetched: 0, upserted: [] },
        curated: { skipped: true, sources: [], fetched: 0, errors: [], upserted: [] },
        xcancel: { skipped: true, handles: [], fetched: 0, errors: [], upserted: [] },
        topicSearch: {
          skipped: true,
          providers: {
            google_news: { state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] },
            searxng: { state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] },
          },
          fetched: 0,
          perTopic: {},
          upserted: [],
          errors: [],
        },
        triage: {
          at: '2026-09-30T12:00:00.000Z',
          skipped: true,
          candidates: 0,
          kept: 0,
          dropped: 0,
          byReason: {},
          jev: { budget: 300, used: 0, errors: 0 },
          summaryBudget: 60,
          errors: [],
          keptIds: [],
        },
        articles: [],
      }) as any,
    syncTrackedAfterFetch: async () => {
      throw new Error('boom');
    },
    ...noRefreshSideEffects,
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    });
    assert.equal(resp.status, 200);
    const json = (await resp.json()) as { ok: boolean };
    assert.equal(json.ok, true);
  } finally {
    await close();
  }
});

function stubFetchResult(): RefreshResult['fetch'] {
  return {
    fetched: 1,
    clustered: 0,
    clusters: 0,
    tiers: { sensor: { fetched: 1, upserted: 1 }, primary: { fetched: 0, upserted: 0 } },
    cfp: { feedUrl: 'x', limit: 5, fetched: 1, upserted: [] },
    curated: { skipped: true, sources: [], fetched: 0, errors: [], upserted: [] },
    xcancel: { skipped: true, handles: [], fetched: 0, errors: [], upserted: [] },
    topicSearch: {
      skipped: true,
      providers: {
        google_news: { state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] },
        searxng: { state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] },
      },
      fetched: 0,
      perTopic: {},
      upserted: [],
      errors: [],
    },
    triage: {
      at: '2026-09-30T12:00:00.000Z',
      skipped: true,
      candidates: 0,
      kept: 0,
      dropped: 0,
      byReason: {},
      jev: { budget: 300, used: 0, errors: 0 },
      summaryBudget: 60,
      errors: [],
      keptIds: [],
    },
    articles: [],
  } as unknown as RefreshResult['fetch'];
}

test('POST /api/fetch runs the refresh runner (manual) and returns refresh + brief', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const calls: Array<{ trigger: string; options: unknown }> = [];
  const refreshRunner: RefreshRunner = {
    isRunning: () => false,
    run: async (trigger, options) => {
      calls.push({ trigger, options });
      return {
        trigger: 'timer',
        joined: true,
        startedAt: '2026-09-30T12:00:00.000Z',
        completedAt: '2026-09-30T12:00:06.000Z',
        fetch: stubFetchResult(),
        brief: BRIEF_RUN,
      };
    },
  };

  const { createApp } = await import('./app.js');
  const app = createApp({ refreshRunner });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 5, feedUrl: 'https://feed.example/rss' }),
    });
    assert.equal(resp.status, 200);
    const json = (await resp.json()) as {
      ok: boolean;
      feedUrl: string;
      limit: number;
      fetched: number;
      refresh: unknown;
      brief: unknown;
    };
    assert.deepEqual(calls, [
      { trigger: 'manual', options: { limit: 5, feedUrl: 'https://feed.example/rss' } },
    ]);
    assert.equal(json.ok, true);
    assert.equal(json.feedUrl, 'x');
    assert.equal(json.limit, 5);
    assert.equal(json.fetched, 1);
    assert.deepEqual(json.refresh, {
      trigger: 'timer',
      joined: true,
      startedAt: '2026-09-30T12:00:00.000Z',
      completedAt: '2026-09-30T12:00:06.000Z',
    });
    assert.deepEqual(json.brief, { summaries: BRIEF_RUN.summaries });
  } finally {
    await close();
  }
});

test('POST /api/fetch returns 500 when the refresh fails (CFP)', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const refreshRunner: RefreshRunner = {
    isRunning: () => false,
    run: async () => {
      throw new Error('CFP feed unreachable');
    },
  };

  const { createApp } = await import('./app.js');
  const app = createApp({ refreshRunner });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(resp.status, 500);
    assert.deepEqual(await resp.json(), { ok: false, error: 'CFP feed unreachable' });
  } finally {
    await close();
  }
});

test('POST /api/fetch with injected fetchAllSources records a failed refresh and 500s', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const patches: unknown[] = [];
  const { createApp } = await import('./app.js');
  const app = createApp({
    fetchAllSources: async () => {
      throw new Error('CFP down');
    },
    readMeta: async () => ({ lastFetchAt: null, lastError: null }),
    updateMeta: async (patch) => {
      patches.push(patch);
      return { lastFetchAt: null, lastError: null };
    },
    generateRefreshSummaries: async () => {
      throw new Error('summaries must not run after a failed fetch');
    },
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/fetch`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(resp.status, 500);
    assert.deepEqual(await resp.json(), { ok: false, error: 'CFP down' });
    assert.equal(patches.length, 1);
    const refresh = (patches[0] as { refresh: { last: { ok: boolean; trigger: string; error: string }; lastSuccess: unknown } }).refresh;
    assert.equal(refresh.last.ok, false);
    assert.equal(refresh.last.trigger, 'manual');
    assert.equal(refresh.last.error, 'CFP down');
    assert.equal(refresh.lastSuccess, null);
  } finally {
    await close();
  }
});

test('POST /api/brief/tracked/ack clears pendingUpdate and bumps snapshot via full-store count', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const trackedPath = tempTrackedPath();

  const articles: Article[] = [
    { id: 'a1', clusterId: 'c1' } as Article,
    { id: 'a2', clusterId: 'c1' } as Article,
    { id: 'a3', clusterId: 'c1' } as Article,
  ];

  // Seed tracked state with a smaller snapshot, then mark pendingUpdate true.
  await trackCluster('c1', 2, trackedPath);
  await syncTrackedAfterFetch({ c1: 3 }, trackedPath);
  const before = await readTrackedStories(trackedPath);
  assert.equal(before.entries.find((e) => e.clusterId === 'c1')?.pendingUpdate, true);

  const { createApp } = await import('./app.js');
  const app = createApp({
    readArticles: async () => articles,
    ackTrackedUpdate: async (clusterId, memberCount) =>
      await ackTrackedUpdate(clusterId, memberCount, trackedPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/brief/tracked/ack`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ clusterId: 'c1' }),
    });
    assert.equal(resp.status, 200);
    const json = (await resp.json()) as {
      ok: true;
      entries: Array<{
        clusterId: string;
        memberCountSnapshot: number;
        pendingUpdate: boolean;
      }>;
    };
    assert.equal(json.ok, true);
    const entry = json.entries.find((e) => e.clusterId === 'c1');
    assert.ok(entry);
    assert.equal(entry.pendingUpdate, false);
    assert.equal(entry.memberCountSnapshot, 3);

    const stored = await readTrackedStories(trackedPath);
    const storedEntry = stored.entries.find((e) => e.clusterId === 'c1');
    assert.ok(storedEntry);
    assert.equal(storedEntry.pendingUpdate, false);
    assert.equal(storedEntry.memberCountSnapshot, 3);
  } finally {
    await close();
  }
});

test('GET /api/brief/mutes returns empty store when missing', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const mutesPath = tempMuteRulesPath();

  const { createApp } = await import('./app.js');
  const app = createApp({
    readMuteRules: async () => await readMuteRules(mutesPath),
    addMuteRule: async (keyword, source) => await addMuteRule(keyword, source, mutesPath),
    removeMuteRule: async (id) => await removeMuteRule(id, mutesPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/brief/mutes`, { headers: { cookie } });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      rules: unknown[];
      updatedAt: string | null;
    };
    assert.equal(body.ok, true);
    assert.deepEqual(body.rules, []);
    assert.equal(body.updatedAt, null);
  } finally {
    await close();
  }
});

test('POST /api/brief/mutes returns 400 on empty keyword', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const mutesPath = tempMuteRulesPath();

  const { createApp } = await import('./app.js');
  const app = createApp({
    readMuteRules: async () => await readMuteRules(mutesPath),
    addMuteRule: async (keyword, source) => await addMuteRule(keyword, source, mutesPath),
    removeMuteRule: async (id) => await removeMuteRule(id, mutesPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/brief/mutes`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ keyword: '   ' }),
    });
    assert.equal(resp.status, 400);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /keyword/i);
  } finally {
    await close();
  }
});

test('POST /api/brief/mutes persists rule; DELETE /api/brief/mutes/:id removes it', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const mutesPath = tempMuteRulesPath();

  const { createApp } = await import('./app.js');
  const app = createApp({
    readMuteRules: async () => await readMuteRules(mutesPath),
    addMuteRule: async (keyword, source) => await addMuteRule(keyword, source, mutesPath),
    removeMuteRule: async (id) => await removeMuteRule(id, mutesPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);

    const createResp = await fetch(`${baseUrl}/api/brief/mutes`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ keyword: 'Alpha', source: 'example.com' }),
    });
    assert.equal(createResp.status, 200);
    const created = (await createResp.json()) as {
      ok: true;
      rules: Array<{ id: string; keyword: string; source: string | null; createdAt: string }>;
    };
    assert.equal(created.ok, true);
    assert.equal(created.rules.length, 1);
    assert.equal(created.rules[0]!.keyword, 'Alpha');
    assert.equal(created.rules[0]!.source, 'example.com');
    assert.equal(typeof created.rules[0]!.id, 'string');

    const listResp = await fetch(`${baseUrl}/api/brief/mutes`, { headers: { cookie } });
    assert.equal(listResp.status, 200);
    const listed = (await listResp.json()) as {
      ok: true;
      rules: Array<{ id: string }>;
      updatedAt: string | null;
    };
    assert.equal(listed.ok, true);
    assert.equal(listed.rules.length, 1);
    assert.equal(listed.rules[0]!.id, created.rules[0]!.id);
    assert.equal(typeof listed.updatedAt, 'string');

    const deleteResp = await fetch(
      `${baseUrl}/api/brief/mutes/${encodeURIComponent(created.rules[0]!.id)}`,
      { method: 'DELETE', headers: { cookie } },
    );
    assert.equal(deleteResp.status, 200);
    const deleted = (await deleteResp.json()) as {
      ok: true;
      rules: unknown[];
    };
    assert.equal(deleted.ok, true);
    assert.deepEqual(deleted.rules, []);

    const listAfterResp = await fetch(`${baseUrl}/api/brief/mutes`, { headers: { cookie } });
    assert.equal(listAfterResp.status, 200);
    const after = (await listAfterResp.json()) as {
      ok: true;
      rules: unknown[];
    };
    assert.equal(after.ok, true);
    assert.deepEqual(after.rules, []);
  } finally {
    await close();
  }
});

type TopicBody = {
  id: string;
  name: string;
  kind: string;
  level: string | null;
  sections: string[];
};

async function startTopicsServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const topicsPath = tempTopicsPath();

  const { createApp } = await import('./app.js');
  const app = createApp({
    readTopics: async () => await readTopics({ topicsPath }),
    createTopic: async (fields) => await createTopic(fields, { topicsPath }),
    updateTopic: async (id, patch) => await updateTopic(id, patch, { topicsPath }),
    removeTopic: async (id) => await removeTopic(id, { topicsPath }),
  });
  return await startServer(app);
}

async function postTopic(baseUrl: string, cookie: string, body: unknown): Promise<Response> {
  return await fetch(`${baseUrl}/api/topics`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function patchTopic(
  baseUrl: string,
  cookie: string,
  id: string,
  body: unknown,
): Promise<Response> {
  return await fetch(`${baseUrl}/api/topics/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function listTopics(baseUrl: string, cookie: string): Promise<TopicBody[]> {
  const resp = await fetch(`${baseUrl}/api/topics`, { headers: { cookie } });
  assert.equal(resp.status, 200);
  const body = (await resp.json()) as { ok: true; topics: TopicBody[] };
  assert.equal(body.ok, true);
  return body.topics;
}

test('GET /api/topics requires session', async () => {
  const { baseUrl, close } = await startTopicsServer();
  try {
    const resp = await fetch(`${baseUrl}/api/topics`);
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await close();
  }
});

test('GET /api/topics seeds 23 topics on an empty store', async () => {
  const { baseUrl, close } = await startTopicsServer();
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/topics`, { headers: { cookie } });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      topics: TopicBody[];
      updatedAt: string | null;
    };
    assert.equal(body.ok, true);
    assert.equal(body.topics.length, 23);
    assert.equal(typeof body.updatedAt, 'string');
  } finally {
    await close();
  }
});

test('POST /api/topics creates desired and undesired topics', async () => {
  const { baseUrl, close } = await startTopicsServer();
  try {
    const cookie = await login(baseUrl);

    const desiredResp = await postTopic(baseUrl, cookie, {
      name: 'Arctic shipping',
      kind: 'desired',
      level: 'watch',
      sections: ['map', 'business'],
    });
    assert.equal(desiredResp.status, 201);
    const desired = (await desiredResp.json()) as {
      ok: true;
      topic: TopicBody;
      topics: TopicBody[];
    };
    assert.equal(desired.ok, true);
    assert.equal(desired.topic.name, 'Arctic shipping');
    assert.equal(desired.topic.level, 'watch');
    assert.deepEqual(desired.topic.sections, ['business', 'map']);
    assert.ok(desired.topics.some((t) => t.id === desired.topic.id));
    assert.ok((await listTopics(baseUrl, cookie)).some((t) => t.id === desired.topic.id));

    const undesiredResp = await postTopic(baseUrl, cookie, {
      name: 'Celebrity gossip',
      kind: 'undesired',
      level: 'core',
      sections: ['business'],
    });
    assert.equal(undesiredResp.status, 201);
    const undesired = (await undesiredResp.json()) as { ok: true; topic: TopicBody };
    assert.equal(undesired.topic.kind, 'undesired');
    assert.equal(undesired.topic.level, null);
    assert.deepEqual(undesired.topic.sections, []);
  } finally {
    await close();
  }
});

test('POST /api/topics returns 400 on invalid bodies', async () => {
  const { baseUrl, close } = await startTopicsServer();
  try {
    const cookie = await login(baseUrl);

    const missingName = await postTopic(baseUrl, cookie, { kind: 'desired', level: 'core' });
    assert.equal(missingName.status, 400);
    const missingNameBody = (await missingName.json()) as { ok: false; error: string };
    assert.equal(missingNameBody.ok, false);
    assert.equal(missingNameBody.error, 'name is required');

    const noLevel = await postTopic(baseUrl, cookie, { name: 'No level', kind: 'desired' });
    assert.equal(noLevel.status, 400);
    const noLevelBody = (await noLevel.json()) as { ok: false; error: string };
    assert.equal(noLevelBody.error, 'level is required for desired topics');

    const badSection = await postTopic(baseUrl, cookie, {
      name: 'Bad section',
      kind: 'desired',
      level: 'core',
      sections: ['sports'],
    });
    assert.equal(badSection.status, 400);
    const badSectionBody = (await badSection.json()) as { ok: false; error: string };
    assert.match(badSectionBody.error, /sections/);
  } finally {
    await close();
  }
});

test('POST /api/topics returns 409 on duplicate name', async () => {
  const { baseUrl, close } = await startTopicsServer();
  try {
    const cookie = await login(baseUrl);
    const first = await postTopic(baseUrl, cookie, {
      name: 'Arctic shipping',
      kind: 'desired',
      level: 'core',
    });
    assert.equal(first.status, 201);

    const dup = await postTopic(baseUrl, cookie, {
      name: '  arctic SHIPPING ',
      kind: 'undesired',
    });
    assert.equal(dup.status, 409);
    const body = (await dup.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /already exists/);
  } finally {
    await close();
  }
});

test('PATCH /api/topics/:id updates, 404s unknown ids, 400s invalid bodies', async () => {
  const { baseUrl, close } = await startTopicsServer();
  try {
    const cookie = await login(baseUrl);

    const resp = await patchTopic(baseUrl, cookie, 'iran', { level: 'watch' });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as { ok: true; topic: TopicBody; topics: TopicBody[] };
    assert.equal(body.ok, true);
    assert.equal(body.topic.id, 'iran');
    assert.equal(body.topic.level, 'watch');
    assert.equal(body.topics.length, 23);
    const iran = (await listTopics(baseUrl, cookie)).find((t) => t.id === 'iran');
    assert.equal(iran?.level, 'watch');

    const missing = await patchTopic(baseUrl, cookie, 'no-such-topic', { level: 'watch' });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { ok: false, error: 'topic not found' });

    const invalid = await patchTopic(baseUrl, cookie, 'iran', { kind: 'bogus' });
    assert.equal(invalid.status, 400);
    const invalidBody = (await invalid.json()) as { ok: false; error: string };
    assert.equal(invalidBody.ok, false);
    assert.match(invalidBody.error, /kind/);
  } finally {
    await close();
  }
});

test('DELETE /api/topics/:id removes a topic idempotently', async () => {
  const { baseUrl, close } = await startTopicsServer();
  try {
    const cookie = await login(baseUrl);

    const first = await fetch(`${baseUrl}/api/topics/iran`, {
      method: 'DELETE',
      headers: { cookie },
    });
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as {
      ok: true;
      removed: boolean;
      topics: TopicBody[];
    };
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.removed, true);
    assert.equal(firstBody.topics.length, 22);
    assert.ok(!(await listTopics(baseUrl, cookie)).some((t) => t.id === 'iran'));

    const repeat = await fetch(`${baseUrl}/api/topics/iran`, {
      method: 'DELETE',
      headers: { cookie },
    });
    assert.equal(repeat.status, 200);
    const repeatBody = (await repeat.json()) as { ok: true; removed: boolean };
    assert.equal(repeatBody.removed, false);
  } finally {
    await close();
  }
});

test('GET /api/batches/latest/claims returns empty array when no claims are accepted', async () => {
  const app = express();
  app.use(
    '/api',
    createKiteBriefRouter({
      loadBriefClaims: async () =>
        await loadBriefClaims({
          readClaims: async () => [
            {
              id: 'claim-1',
              text: 'Claim text',
              claimType: 'event_occurrence',
              status: 'reported',
              entities: [],
              createdAt: '2026-09-24T00:00:00.000Z',
              domain: 'conflict',
            },
          ] as any,
          readEvidenceLinks: async () => [],
          readArticles: async () => [],
          readMuteRules: async () => ({ rules: [], updatedAt: null }) as any,
          readClaimMembership: async () => ({ acceptedClaimIds: [], updatedAt: null }),
          readClaimEnrichments: async () => [],
        }),
    }),
  );

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/batches/latest/claims`);
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as { ok: true; claims: unknown[] };
    assert.equal(body.ok, true);
    assert.deepEqual(body.claims, []);
  } finally {
    await close();
  }
});

test('GET /api/batches/latest/claims includes accepted unmuted claims and omits muted ones', async () => {
  const app = express();
  app.use(
    '/api',
    createKiteBriefRouter({
      loadBriefClaims: async () =>
        await loadBriefClaims({
          readClaims: async () =>
            [
              {
                id: 'claim-visible',
                text: 'Visible claim',
                claimType: 'event_occurrence',
                status: 'supported_by_primary',
                entities: [],
                createdAt: '2026-09-24T00:00:00.000Z',
                domain: 'conflict',
              },
              {
                id: 'claim-muted',
                text: 'Alpha muted claim',
                claimType: 'event_occurrence',
                status: 'reported',
                entities: [],
                createdAt: '2026-09-23T00:00:00.000Z',
                domain: 'conflict',
              },
            ] as any,
          readEvidenceLinks: async () => [],
          readArticles: async () => [],
          readMuteRules: async () =>
            ({
              rules: [
                {
                  id: 'mute-1',
                  keyword: 'alpha',
                  source: null,
                  createdAt: '2026-09-24T00:00:00.000Z',
                },
              ],
              updatedAt: '2026-09-24T00:00:00.000Z',
            }) as any,
          readClaimMembership: async () => ({
            acceptedClaimIds: ['claim-visible', 'claim-muted'],
            updatedAt: '2026-09-24T00:00:00.000Z',
          }),
          readClaimEnrichments: async () => [],
        }),
    }),
  );

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/batches/latest/claims`);
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      claims: Array<{ claimId: string; status: string }>;
    };
    assert.equal(body.ok, true);
    assert.deepEqual(
      body.claims.map((claim) => claim.claimId),
      ['claim-visible'],
    );
    assert.equal(body.claims[0]!.status, 'supported_by_primary');
  } finally {
    await close();
  }
});

test('POST /api/claims/extract requires session', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    extractClaimsFromArticles: async () => ({
      ok: true,
      limit: 10,
      attempted: 0,
      proposed: 0,
      judged: 0,
      persistedClaims: 0,
      persistedEvidence: 0,
      needsReview: 0,
      failed: 0,
      articlesProcessed: 0,
      skippedMuted: 0,
      claims: [],
      evidence: [],
      reviewQueued: [],
    }),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/claims/extract`, { method: 'POST' });
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await close();
  }
});

test('POST /api/claims/enrich requires session', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    enrichAcceptedClaims: async () => ({
      attempted: 0,
      succeeded: 0,
      failed: 0,
      claimIds: [],
      skippedClaimIds: [],
    }),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/claims/enrich`, { method: 'POST' });
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await close();
  }
});

test('POST /api/claims/accept requires session', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp();

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/claims/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'claim-1' }),
    });
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await close();
  }
});

test('POST /api/claims/review/dismiss requires session', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp();

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/claims/review/dismiss`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'claim-1' }),
    });
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await close();
  }
});

test('POST /api/claims/review/dismiss-all requires session', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp();

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/claims/review/dismiss-all`, {
      method: 'POST',
    });
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await close();
  }
});

test('GET /api/claims/radar requires session', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    loadClaimsRadar: async () => ({
      claims: [],
      needsReview: [],
      hiddenMutedCount: 0,
    }),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const resp = await fetch(`${baseUrl}/api/claims/radar`);
    assert.equal(resp.status, 401);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Unauthorized');
  } finally {
    await close();
  }
});

test('GET /api/claims/radar returns empty payload when authenticated', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    loadClaimsRadar: async () => ({
      claims: [],
      needsReview: [],
      hiddenMutedCount: 0,
    }),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/radar`, { headers: { cookie } });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      claims: unknown[];
      needsReview: unknown[];
      hiddenMutedCount: number;
    };
    assert.equal(body.ok, true);
    assert.deepEqual(body.claims, []);
    assert.deepEqual(body.needsReview, []);
    assert.equal(body.hiddenMutedCount, 0);
  } finally {
    await close();
  }
});

test('POST /api/claims/extract returns ok payload when authenticated', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const injectedReadMuteRules = async () => ({ rules: [], updatedAt: null });
  let capturedOptions: { readMuteRulesFn?: unknown } | undefined;
  const app = createApp({
    readMuteRules: injectedReadMuteRules,
    extractClaimsFromArticles: async (options) => {
      capturedOptions = options;
      return {
        ok: true,
        limit: 5,
        attempted: 1,
        proposed: 2,
        judged: 2,
        persistedClaims: 1,
        persistedEvidence: 1,
        needsReview: 0,
        failed: 0,
        articlesProcessed: 1,
        skippedMuted: 2,
        claims: [],
        evidence: [],
        reviewQueued: [],
      };
    },
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/extract`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 5 }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      limit: number;
      attempted: number;
      proposed: number;
      judged: number;
      persistedClaims: number;
      persistedEvidence: number;
      needsReview: number;
      failed: number;
      articlesProcessed: number;
      skippedMuted: number;
      claims: unknown[];
      evidence: unknown[];
      reviewQueued: unknown[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.limit, 5);
    assert.equal(body.attempted, 1);
    assert.equal(body.proposed, 2);
    assert.equal(body.judged, 2);
    assert.equal(body.persistedClaims, 1);
    assert.equal(body.persistedEvidence, 1);
    assert.equal(body.articlesProcessed, 1);
    assert.equal(body.skippedMuted, 2);
    assert.deepEqual(body.claims, []);
    assert.deepEqual(body.evidence, []);
    assert.deepEqual(body.reviewQueued, []);
    assert.equal(capturedOptions?.readMuteRulesFn, injectedReadMuteRules);
  } finally {
    await close();
  }
});

test('POST /api/claims/enrich skips non-accepted claim ids', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    enrichAcceptedClaims: async (options) =>
      await enrichAcceptedClaims({
        ...options,
        readClaimsFn: async () =>
          [
            {
              id: 'claim-1',
              text: 'Accepted claim',
              claimType: 'event_occurrence',
              status: 'reported',
              entities: [],
              createdAt: '2026-09-24T00:00:00.000Z',
              domain: 'conflict',
            },
            {
              id: 'claim-2',
              text: 'Unaccepted claim',
              claimType: 'official_statement',
              status: 'reported',
              entities: [],
              createdAt: '2026-09-23T00:00:00.000Z',
              domain: 'conflict',
            },
          ] as any,
        readEvidenceLinksFn: async () => [],
        readArticlesFn: async () => [],
        readClaimMembershipFn: async () => ({
          acceptedClaimIds: ['claim-1'],
          updatedAt: '2026-09-24T00:00:00.000Z',
        }),
        getClaimEnrichmentFn: async () => null,
        upsertClaimEnrichmentFn: async (record) => record,
        enrichFn: async () => ({
          ok: true,
          enrichment: {
            short_summary: 'Summary.',
            talking_points: ['Point A'],
          },
          model: 'glm-5.3-flash',
          rawText: '{"short_summary":"Summary.","talking_points":["Point A"]}',
        }),
        nowIsoFn: () => '2026-09-24T12:00:00.000Z',
      }),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/enrich`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimIds: ['claim-1', 'claim-2'] }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      attempted: number;
      succeeded: number;
      failed: number;
      claimIds: string[];
      skippedClaimIds: string[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.attempted, 1);
    assert.equal(body.succeeded, 1);
    assert.equal(body.failed, 0);
    assert.deepEqual(body.claimIds, ['claim-1']);
    assert.deepEqual(body.skippedClaimIds, ['claim-2']);
  } finally {
    await close();
  }
});

test('POST /api/claims/accept default-tracks claimId', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const membershipPath = tempClaimMembershipPath();
  const trackedPath = tempTrackedClaimsPath();
  const reviewQueuePath = tempClaimReviewQueuePath();

  await enqueueClaimReview(
    {
      id: 'review-1',
      claimId: 'claim-1',
      evidenceLinkId: 'link-1',
      articleId: 'article-1',
      reviewReasons: ['needs_review'],
      candidateText: 'Example',
      createdAt: '2026-09-21T00:00:00.000Z',
    },
    reviewQueuePath,
  );

  const { createApp } = await import('./app.js');
  const app = createApp({
    getClaimById: async (claimId) =>
      claimId === 'claim-1'
        ? ({
            id: 'claim-1',
            text: 'Example',
            claimType: 'event_occurrence',
            status: 'reported',
            entities: [],
            createdAt: '2026-09-21T00:00:00.000Z',
            domain: 'conflict',
          } as any)
        : null,
    acceptClaim: async (claimId) => await acceptClaim(claimId, membershipPath),
    readClaimMembership: async () => await readClaimMembership(membershipPath),
    trackClaim: async (claimId) => await trackClaim(claimId, trackedPath),
    readTrackedClaims: async () => await readTrackedClaims(trackedPath),
    dismissClaimReview: async (claimId) =>
      await storeDismissClaimReview(claimId, reviewQueuePath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const acceptResp = await fetch(`${baseUrl}/api/claims/accept`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'claim-1' }),
    });
    assert.equal(acceptResp.status, 200);

    const membershipResp = await fetch(`${baseUrl}/api/claims/membership`, {
      headers: { cookie },
    });
    assert.equal(membershipResp.status, 200);
    const membership = (await membershipResp.json()) as {
      ok: true;
      acceptedClaimIds: string[];
    };
    assert.equal(membership.ok, true);
    assert.deepEqual(membership.acceptedClaimIds, ['claim-1']);

    const trackedResp = await fetch(`${baseUrl}/api/claims/tracked`, {
      headers: { cookie },
    });
    assert.equal(trackedResp.status, 200);
    const tracked = (await trackedResp.json()) as {
      ok: true;
      entries: Array<{ claimId: string; pendingUpdate: boolean; trackedAt: string }>;
    };
    assert.equal(tracked.ok, true);
    const entry = tracked.entries.find((e) => e.claimId === 'claim-1');
    assert.ok(entry);
    assert.equal(entry.pendingUpdate, false);
    assert.equal(typeof entry.trackedAt, 'string');

    const queue = await readClaimReviewQueue(reviewQueuePath);
    assert.deepEqual(queue, []);
  } finally {
    await close();
  }
});

test('POST /api/claims/review/dismiss returns 404 when claimId missing from store', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    getClaimById: async () => null,
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/review/dismiss`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'missing' }),
    });
    assert.equal(resp.status, 404);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /not found/i);
  } finally {
    await close();
  }
});

test('POST /api/claims/review/dismiss is idempotent when queue has no matching claim', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const reviewQueuePath = tempClaimReviewQueuePath();
  await writeClaimReviewQueue([], reviewQueuePath);

  const { createApp } = await import('./app.js');
  const app = createApp({
    getClaimById: async () =>
      ({
        id: 'claim-1',
        text: 'Example',
        claimType: 'event_occurrence',
        status: 'reported',
        entities: [],
        createdAt: '2026-09-21T00:00:00.000Z',
        domain: 'conflict',
      } as any),
    dismissClaimReview: async (claimId) =>
      await storeDismissClaimReview(claimId, reviewQueuePath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/review/dismiss`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'claim-1' }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      dismissedClaimIds: string[];
    };
    assert.equal(body.ok, true);
    assert.deepEqual(body.dismissedClaimIds, []);

    const queue = await readClaimReviewQueue(reviewQueuePath);
    assert.deepEqual(queue, []);
  } finally {
    await close();
  }
});

test('POST /api/claims/review/dismiss-all only clears visible needs-review claim ids', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const reviewQueuePath = tempClaimReviewQueuePath();
  await writeClaimReviewQueue(
    [
      {
        id: 'review-1',
        claimId: 'claim-visible',
        evidenceLinkId: 'link-1',
        articleId: 'article-1',
        reviewReasons: ['needs_review'],
        candidateText: 'Visible review item',
        createdAt: '2026-09-21T00:00:00.000Z',
      },
      {
        id: 'review-2',
        claimId: 'claim-hidden-muted',
        evidenceLinkId: 'link-2',
        articleId: 'article-2',
        reviewReasons: ['needs_review'],
        candidateText: 'Muted review item',
        createdAt: '2026-09-21T01:00:00.000Z',
      },
      {
        id: 'review-3',
        claimId: 'claim-other',
        evidenceLinkId: 'link-3',
        articleId: 'article-3',
        reviewReasons: ['needs_review'],
        candidateText: 'Another review item',
        createdAt: '2026-09-21T02:00:00.000Z',
      },
    ],
    reviewQueuePath,
  );

  const { createApp } = await import('./app.js');
  const app = createApp({
    loadClaimsRadar: async () => ({
      claims: [],
      needsReview: [
        {
          claimId: 'claim-visible',
          text: 'Visible claim',
          claimType: 'event_occurrence',
          status: 'reported',
          createdAt: '2026-09-21T00:00:00.000Z',
          confidence: null,
          accepted: false,
          tracked: false,
          pendingUpdate: false,
          evidence: {
            total: 0,
            supports: 0,
            contradicts: 0,
            mentions: 0,
            primary: 0,
            sensor: 0,
          },
          clusterKeys: [],
          linkedHeadlines: [],
          needsReview: true,
          reviewReasons: ['needs_review'],
        },
      ],
      hiddenMutedCount: 1,
    }),
    dismissClaimReview: async (claimId) =>
      await storeDismissClaimReview(claimId, reviewQueuePath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/review/dismiss-all`, {
      method: 'POST',
      headers: { cookie },
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      dismissedClaimIds: string[];
    };
    assert.equal(body.ok, true);
    assert.deepEqual(body.dismissedClaimIds, ['claim-visible']);

    const queue = await readClaimReviewQueue(reviewQueuePath);
    assert.deepEqual(
      queue.map((entry) => entry.claimId).sort(),
      ['claim-hidden-muted', 'claim-other'],
    );
  } finally {
    await close();
  }
});

test('POST /api/claims/unaccept removes membership but does not untrack', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const membershipPath = tempClaimMembershipPath();
  const trackedPath = tempTrackedClaimsPath();

  const { createApp } = await import('./app.js');
  const app = createApp({
    getClaimById: async () =>
      ({
        id: 'claim-1',
        text: 'Example',
        claimType: 'event_occurrence',
        status: 'reported',
        entities: [],
        createdAt: '2026-09-21T00:00:00.000Z',
        domain: 'conflict',
      } as any),
    acceptClaim: async (claimId) => await acceptClaim(claimId, membershipPath),
    unacceptClaim: async (claimId) => await unacceptClaim(claimId, membershipPath),
    readClaimMembership: async () => await readClaimMembership(membershipPath),
    trackClaim: async (claimId) => await trackClaim(claimId, trackedPath),
    readTrackedClaims: async () => await readTrackedClaims(trackedPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);

    const acceptResp = await fetch(`${baseUrl}/api/claims/accept`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'claim-1' }),
    });
    assert.equal(acceptResp.status, 200);

    const unacceptResp = await fetch(`${baseUrl}/api/claims/unaccept`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'claim-1' }),
    });
    assert.equal(unacceptResp.status, 200);

    const membershipResp = await fetch(`${baseUrl}/api/claims/membership`, {
      headers: { cookie },
    });
    const membership = (await membershipResp.json()) as {
      ok: true;
      acceptedClaimIds: string[];
    };
    assert.equal(membership.ok, true);
    assert.deepEqual(membership.acceptedClaimIds, []);

    const trackedResp = await fetch(`${baseUrl}/api/claims/tracked`, {
      headers: { cookie },
    });
    const tracked = (await trackedResp.json()) as {
      ok: true;
      entries: Array<{ claimId: string }>;
    };
    assert.equal(tracked.ok, true);
    assert.ok(tracked.entries.some((e) => e.claimId === 'claim-1'));
  } finally {
    await close();
  }
});

test('POST /api/claims/tracked/ack clears pendingUpdate for tracked claim', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const trackedPath = tempTrackedClaimsPath();

  // Seed tracked + pendingUpdate.
  await trackClaim('claim-1', trackedPath);
  await markTrackedClaimPending('claim-1', trackedPath);
  const before = await readTrackedClaims(trackedPath);
  assert.equal(before.entries.find((e) => e.claimId === 'claim-1')?.pendingUpdate, true);

  const { createApp } = await import('./app.js');
  const app = createApp({
    getClaimById: async () =>
      ({
        id: 'claim-1',
        text: 'Example',
        claimType: 'event_occurrence',
        status: 'reported',
        entities: [],
        createdAt: '2026-09-21T00:00:00.000Z',
        domain: 'conflict',
      } as any),
    ackTrackedClaimUpdate: async (claimId) => await ackTrackedClaimUpdate(claimId, trackedPath),
    readTrackedClaims: async () => await readTrackedClaims(trackedPath),
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/tracked/ack`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'claim-1' }),
    });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      entries: Array<{ claimId: string; pendingUpdate: boolean }>;
    };
    assert.equal(body.ok, true);
    const entry = body.entries.find((e) => e.claimId === 'claim-1');
    assert.ok(entry);
    assert.equal(entry.pendingUpdate, false);

    const after = await readTrackedClaims(trackedPath);
    assert.equal(after.entries.find((e) => e.claimId === 'claim-1')?.pendingUpdate, false);
  } finally {
    await close();
  }
});

test('POST /api/claims/track returns 404 when claimId missing from store', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    getClaimById: async () => null,
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/claims/track`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ claimId: 'missing' }),
    });
    assert.equal(resp.status, 404);
    const body = (await resp.json()) as { ok: false; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /not found/i);
  } finally {
    await close();
  }
});

test('GET /api/radar hides muted clusters + counts them; tracked muted still returned', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');

  const article = (overrides: Partial<Article> & Pick<Article, 'id' | 'title'>): Article =>
    ({
      sourceKind: 'cfp',
      canonicalUrl: `https://example.com/${overrides.id}`,
      citations: [{ label: 'Primary', url: `https://example.com/${overrides.id}` }],
      publisherUrl: `https://publisher.com/${overrides.id}`,
      publisherDomain: 'publisher.com',
      handle: null,
      publishedAt: '2026-09-10T12:00:00.000Z',
      snippet: 'Snippet',
      bodyText: null,
      bodyStatus: 'ok',
      publisherTitle: null,
      imageUrl: null,
      imageCaption: null,
      imageCredit: null,
      clusterId: null,
      fetchedAt: '2026-09-10T12:05:00.000Z',
      classification: null,
      classifiedAt: null,
      classifyError: null,
      ...overrides,
    }) as Article;

  const articles: Article[] = [
    article({ id: 'a1', title: 'Alpha muted story', clusterId: 'c1' }),
    article({ id: 'a2', title: 'Alpha follow-up', clusterId: 'c1' }),
    article({ id: 'b1', title: 'Beta visible story', clusterId: 'c2' }),
  ];

  const app = createApp({
    readArticles: async () => articles,
    readMeta: async () => ({ lastFetchAt: null, lastError: null }) as any,
    readBriefMembership: async () =>
      ({ acceptedClusterIds: [], updatedAt: null }) as any,
    readTrackedStories: async () =>
      ({
        entries: [
          {
            clusterId: 'c1',
            trackedAt: '2026-09-22T00:00:00.000Z',
            memberCountSnapshot: 2,
            pendingUpdate: false,
          },
        ],
        updatedAt: '2026-09-22T00:00:00.000Z',
      }) as any,
    readMuteRules: async () =>
      ({
        rules: [
          {
            id: 'mute-1',
            keyword: 'alpha',
            source: null,
            createdAt: '2026-09-22T00:00:00.000Z',
          },
        ],
        updatedAt: '2026-09-22T00:00:00.000Z',
      }) as any,
  });

  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);

    const radarResp = await fetch(`${baseUrl}/api/radar`, {
      headers: { cookie },
    });
    assert.equal(radarResp.status, 200);
    const radar = (await radarResp.json()) as {
      ok: true;
      clusters: Array<{ clusterId: string }>;
      hiddenMutedCount: number;
    };
    assert.equal(radar.ok, true);
    assert.deepEqual(
      radar.clusters.map((c) => c.clusterId).sort(),
      ['c2'],
    );
    assert.equal(radar.hiddenMutedCount, 1);

    const trackedResp = await fetch(`${baseUrl}/api/brief/tracked`, {
      headers: { cookie },
    });
    assert.equal(trackedResp.status, 200);
    const tracked = (await trackedResp.json()) as {
      ok: true;
      entries: Array<{ clusterId: string; muted?: boolean }>;
    };
    assert.equal(tracked.ok, true);
    assert.ok(tracked.entries.some((e) => e.clusterId === 'c1'));
    const mutedEntry = tracked.entries.find((e) => e.clusterId === 'c1');
    assert.ok(mutedEntry);
    assert.equal(mutedEntry.muted, true);
  } finally {
    await close();
  }
});


function triageRecordFixture(articleId: string, triagedAt: string): TriageRecord {
  return {
    articleId,
    status: 'dropped',
    reason: 'off_topic',
    stage: 'keyword',
    final: true,
    topicIds: [],
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: null,
    significance: null,
    bodyChecked: false,
    jevCalls: 0,
    triagedAt,
  };
}

async function startTriageServer(opts: {
  records: Record<string, TriageRecord>;
  articles: Article[];
  run: TriageRunMeta | null;
  topics?: Topic[];
  muteRules?: MuteRule[];
  now?: Date;
  readTriage?: CreateAppDeps['readTriage'];
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    readTriage: opts.readTriage ?? (async () => ({ records: opts.records, updatedAt: null })),
    readArticles: async () => opts.articles,
    readMeta: async () => ({ lastFetchAt: null, lastError: null, triage: opts.run }),
    readTopics: async () => ({ topics: opts.topics ?? [], updatedAt: null }),
    readMuteRules: async () => ({ rules: opts.muteRules ?? [], updatedAt: null }),
    ...(opts.now ? { now: () => opts.now! } : {}),
  });
  return await startServer(app);
}

test('GET /api/triage requires session', async () => {
  const { baseUrl, close } = await startTriageServer({ records: {}, articles: [], run: null });
  try {
    const resp = await fetch(`${baseUrl}/api/triage`);
    assert.equal(resp.status, 401);
  } finally {
    await close();
  }
});

test('GET /api/triage returns run meta and records newest first, joined with articles, capped at 500', async () => {
  const base = Date.parse('2026-09-30T00:00:00.000Z');
  const records: Record<string, TriageRecord> = {};
  for (let i = 0; i < 502; i++) {
    const id = `r${i}`;
    records[id] = triageRecordFixture(id, new Date(base + i * 1000).toISOString());
  }
  const article = {
    id: 'r501',
    title: 'Tariff ruling hits steel imports',
    canonicalUrl: 'https://news.example.com/a',
    publisherUrl: 'https://news.example.com/a',
    publisherDomain: 'news.example.com',
    publishedAt: '2026-09-30T08:00:00.000Z',
    sourceKind: 'search',
  } as Article;
  const run: TriageRunMeta = {
    at: '2026-09-30T12:00:00.000Z',
    skipped: false,
    candidates: 502,
    kept: 0,
    dropped: 502,
    byReason: { off_topic: 502 },
    jev: { budget: 300, used: 0, errors: 0 },
    summaryBudget: 60,
    errors: [],
  };

  const { baseUrl, close } = await startTriageServer({ records, articles: [article], run });
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/triage`, { headers: { cookie } });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      ok: true;
      run: TriageRunMeta | null;
      records: Array<TriageRecord & Record<string, unknown>>;
    };
    assert.equal(body.ok, true);
    assert.deepEqual(body.run, run);
    assert.equal(body.records.length, 500);
    assert.equal(body.records[0]!.articleId, 'r501');
    assert.equal(body.records[1]!.articleId, 'r500');
    assert.equal(body.records.at(-1)!.articleId, 'r2');
    assert.deepEqual(
      {
        title: body.records[0]!.title,
        canonicalUrl: body.records[0]!.canonicalUrl,
        publisherUrl: body.records[0]!.publisherUrl,
        publisherDomain: body.records[0]!.publisherDomain,
        publishedAt: body.records[0]!.publishedAt,
        sourceKind: body.records[0]!.sourceKind,
        reason: body.records[0]!.reason,
      },
      {
        title: 'Tariff ruling hits steel imports',
        canonicalUrl: 'https://news.example.com/a',
        publisherUrl: 'https://news.example.com/a',
        publisherDomain: 'news.example.com',
        publishedAt: '2026-09-30T08:00:00.000Z',
        sourceKind: 'search',
        reason: 'off_topic',
      },
    );
    assert.equal(body.records[1]!.title, null);
    assert.equal(body.records[1]!.sourceKind, null);
  } finally {
    await close();
  }
});

test('GET /api/triage returns run null when no triage has run', async () => {
  const { baseUrl, close } = await startTriageServer({ records: {}, articles: [], run: null });
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/triage`, { headers: { cookie } });
    assert.equal(resp.status, 200);
    assert.deepEqual(await resp.json(), { ok: true, run: null, records: [] });
  } finally {
    await close();
  }
});

const FILTERED_RUN: TriageRunMeta = {
  at: '2026-09-30T11:00:00.000Z',
  skipped: false,
  candidates: 3,
  kept: 1,
  dropped: 2,
  byReason: { muted: 1, off_topic: 1 },
  jev: { budget: 300, used: 0, errors: 0 },
  summaryBudget: 60,
  errors: [],
};

function filteredFixture() {
  const records: Record<string, TriageRecord> = {
    m1: { ...triageRecordFixture('m1', FILTERED_RUN.at), reason: 'muted:r1', topicIds: ['t1'] },
    o1: triageRecordFixture('o1', FILTERED_RUN.at),
    k1: { ...triageRecordFixture('k1', FILTERED_RUN.at), status: 'kept', reason: null },
    old: triageRecordFixture('old', '2026-09-29T20:00:00.000Z'),
  };
  return {
    records,
    articles: [
      { id: 'm1', title: 'Celebrity news', canonicalUrl: 'https://cfp.example/m1', publisherUrl: null, publisherDomain: null, publishedAt: '2026-09-30T09:00:00.000Z', sourceKind: 'rss' } as Article,
      { id: 'o1', title: 'Off topic', canonicalUrl: 'https://cfp.example/o1', publisherUrl: 'https://o1.example.com/x', publisherDomain: 'o1.example.com', publishedAt: '2026-09-30T08:00:00.000Z', sourceKind: 'search' } as Article,
    ],
    run: FILTERED_RUN,
    topics: [briefTopic('t1', { name: 'Iran' })],
    muteRules: [{ id: 'r1', keyword: 'celebrity', source: null, createdAt: '2026-09-01T00:00:00.000Z' }],
    now: new Date('2026-09-30T12:00:00.000Z'),
  };
}

test('GET /api/triage/filtered requires session', async () => {
  const { baseUrl, close } = await startTriageServer(filteredFixture());
  try {
    const resp = await fetch(`${baseUrl}/api/triage/filtered`);
    assert.equal(resp.status, 401);
  } finally {
    await close();
  }
});

test('GET /api/triage/filtered defaults to scope last: dropped records of the last run, joined', async () => {
  const { baseUrl, close } = await startTriageServer(filteredFixture());
  try {
    const cookie = await login(baseUrl);
    for (const query of ['', '?scope=bogus', '?scope=last']) {
      const resp = await fetch(`${baseUrl}/api/triage/filtered${query}`, { headers: { cookie } });
      assert.equal(resp.status, 200, query);
      assert.deepEqual(await resp.json(), {
        ok: true,
        scope: 'last',
        run: FILTERED_RUN,
        counts: { muted: 1, off_topic: 1 },
        items: [
          {
            articleId: 'm1',
            title: 'Celebrity news',
            url: 'https://cfp.example/m1',
            publisherDomain: null,
            publishedAt: '2026-09-30T09:00:00.000Z',
            sourceKind: 'rss',
            reason: 'muted:r1',
            group: 'muted',
            final: true,
            stage: 'keyword',
            mutedBy: { kind: 'rule', id: 'r1', label: 'celebrity' },
            topics: [{ id: 't1', name: 'Iran' }],
            duplicateOf: null,
            triagedAt: FILTERED_RUN.at,
          },
          {
            articleId: 'o1',
            title: 'Off topic',
            url: 'https://o1.example.com/x',
            publisherDomain: 'o1.example.com',
            publishedAt: '2026-09-30T08:00:00.000Z',
            sourceKind: 'search',
            reason: 'off_topic',
            group: 'off_topic',
            final: true,
            stage: 'keyword',
            mutedBy: null,
            topics: [],
            duplicateOf: null,
            triagedAt: FILTERED_RUN.at,
          },
        ],
      }, query);
    }
  } finally {
    await close();
  }
});

test('GET /api/triage/filtered?scope=window includes earlier runs within 48h', async () => {
  const { baseUrl, close } = await startTriageServer(filteredFixture());
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/triage/filtered?scope=window`, { headers: { cookie } });
    assert.equal(resp.status, 200);
    const body = (await resp.json()) as {
      scope: string;
      counts: Record<string, number>;
      items: Array<{ articleId: string; title: string | null }>;
    };
    assert.equal(body.scope, 'window');
    assert.deepEqual(body.counts, { muted: 1, off_topic: 2 });
    assert.deepEqual(body.items.map((i) => i.articleId), ['m1', 'o1', 'old']);
    assert.equal(body.items[2]!.title, null);
  } finally {
    await close();
  }
});

test('GET /api/triage/filtered: no triage run → run null, no items', async () => {
  const { baseUrl, close } = await startTriageServer({ ...filteredFixture(), run: null });
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/triage/filtered`, { headers: { cookie } });
    assert.equal(resp.status, 200);
    assert.deepEqual(await resp.json(), {
      ok: true,
      scope: 'last',
      run: null,
      counts: {},
      items: [],
    });
  } finally {
    await close();
  }
});

test('GET /api/triage/filtered: unreadable triage store → 500', async () => {
  const { baseUrl, close } = await startTriageServer({
    ...filteredFixture(),
    readTriage: async () => {
      throw new Error('corrupt triage');
    },
  });
  try {
    const cookie = await login(baseUrl);
    const resp = await fetch(`${baseUrl}/api/triage/filtered`, { headers: { cookie } });
    assert.equal(resp.status, 500);
    assert.deepEqual(await resp.json(), { ok: false, error: 'corrupt triage' });
  } finally {
    await close();
  }
});

// --- Topic Brief (NEWS-88) -------------------------------------------------

const BRIEF_NOW = new Date('2026-09-30T12:00:00.000Z');
const BRIEF_RECENT = '2026-09-30T10:00:00.000Z';

function briefArticle(id: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'rss',
    canonicalUrl: `https://cfp.example/${id}`,
    citations: [],
    publisherUrl: `https://${id}.example.com/story`,
    publisherDomain: `${id}.example.com`,
    handle: null,
    publishedAt: BRIEF_RECENT,
    snippet: '',
    bodyText: null,
    bodyStatus: 'unavailable',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: BRIEF_RECENT,
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

function briefTopic(id: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    name: id.toUpperCase(),
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: id,
    sections: [],
    notes: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function keptRecord(
  id: string,
  topicIds: string[],
  overrides: Partial<TriageRecord> = {},
): TriageRecord {
  return {
    ...triageRecordFixture(id, BRIEF_RECENT),
    status: 'kept',
    reason: null,
    stage: 'headline',
    topicIds,
    outletCount: 1,
    significance: 1,
    ...overrides,
  };
}

function triageStoreOf(records: TriageRecord[]): TriageStore {
  return { records: Object.fromEntries(records.map((r) => [r.articleId, r])), updatedAt: null };
}

type BriefFixture = {
  articles: Article[];
  records?: TriageRecord[];
  topics?: Topic[];
  meta?: StoreMeta;
  seen?: BriefSeenStore;
  acceptedClusterIds?: string[];
};

/** Store reads shared by the Kite brief router and createApp (same dep names). */
function briefReads(f: BriefFixture) {
  return {
    readArticles: async () => f.articles,
    readTriage: async () => triageStoreOf(f.records ?? []),
    readTopics: async () => ({ topics: f.topics ?? [briefTopic('t1')], updatedAt: null }),
    readMuteRules: async () => ({ rules: [], updatedAt: null }),
    readBriefSeen: async () => f.seen ?? { seen: {}, updatedAt: null },
    readBriefSummaries: async () => ({ summaries: {}, updatedAt: null }),
    readBriefFullStories: async () => ({ fullStories: {}, updatedAt: null }),
    readMeta: async (): Promise<StoreMeta> => f.meta ?? { lastFetchAt: null, lastError: null },
    readBriefMembership: async () => ({
      acceptedClusterIds: f.acceptedClusterIds ?? [],
      updatedAt: null,
    }),
    now: () => BRIEF_NOW,
  };
}

async function startBriefRouter(
  f: BriefFixture,
  extra: CreateKiteBriefRouterDeps = {},
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = express();
  app.use(
    '/api',
    createKiteBriefRouter({
      ...briefReads(f),
      readClusterEnrichments: async () => [],
      isRefreshRunning: () => false,
      env: {},
      ...extra,
    }),
  );
  return await startServer(app);
}

async function getJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  assert.equal(resp.status, 200, url);
  return (await resp.json()) as T;
}

test('GET /api/categories/metadata and /api/chaos/history: owned Brief category, no chaos history (public)', async () => {
  const { baseUrl, close } = await startBriefRouter({ articles: [] });
  try {
    const metadata = await getJson<unknown>(`${baseUrl}/api/categories/metadata`);
    assert.deepEqual(metadata, {
      categories: [
        { categoryId: 'world', categoryType: 'core', isCore: true, displayName: 'Brief' },
      ],
    });
    assert.deepEqual(await getJson<unknown>(`${baseUrl}/api/chaos/history?days=7`), []);
  } finally {
    await close();
  }
});

test('Kite brief: empty article store keeps the fixture path unchanged', async () => {
  const { baseUrl, close } = await startBriefRouter({ articles: [] });
  try {
    const categories = await getJson<KiteBatchCategoriesResponse>(
      `${baseUrl}/api/batches/latest/categories`,
    );
    assert.equal(categories.categories[0]!.categoryId, 'world');
    assert.equal(categories.categories[0]!.categoryName, 'Brief');

    const body = await getJson<KiteBatchStoriesResponse>(
      `${baseUrl}/api/batches/latest/categories/world/stories?limit=12`,
    );
    const expected = buildOwnedStoriesResponse(
      resolveOwnedBriefArticles([], [], BRIEF_NOW).articles,
      'world',
      { limit: 12, enrichments: ownedBriefFixtureEnrichments() },
    )!;
    assert.deepEqual(body.stories, expected.stories);
    assert.equal(body.stories[0]!.title, OWNED_FIXTURE_TITLE);
    assert.ok(body.stories[0]!.talking_points);
    assert.equal(body.stories[0]!.informed_article_id, undefined);

    const overview = await getJson<{ fixture: boolean; sections: unknown[]; quiet: unknown[] }>(
      `${baseUrl}/api/brief/overview`,
    );
    assert.equal(overview.fixture, true);
    assert.deepEqual(overview.sections, []);
    assert.deepEqual(overview.quiet, []);
  } finally {
    await close();
  }
});

test('Kite brief: non-empty store with no kept records → zero stories, category still world / Brief', async () => {
  const { baseUrl, close } = await startBriefRouter({
    articles: [briefArticle('a1')],
    records: [triageRecordFixture('a1', BRIEF_RECENT)],
  });
  try {
    const categories = await getJson<KiteBatchCategoriesResponse>(
      `${baseUrl}/api/batches/owned-latest/categories`,
    );
    assert.equal(categories.categories.length, 1);
    assert.equal(categories.categories[0]!.categoryId, 'world');
    assert.equal(categories.categories[0]!.categoryName, 'Brief');
    assert.equal(categories.categories[0]!.clusterCount, 0);

    const body = await getJson<KiteBatchStoriesResponse>(
      `${baseUrl}/api/batches/owned-latest/categories/world/stories`,
    );
    assert.deepEqual(body.stories, []);

    const missing = await fetch(`${baseUrl}/api/batches/latest/categories/sports/stories`);
    assert.equal(missing.status, 404);
  } finally {
    await close();
  }
});

test('Kite brief via createApp: kept stories only (accepted-but-not-kept gone), limit ignored, timestamp = last success', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const lastSuccess = {
    trigger: 'timer' as const,
    startedAt: '2026-09-30T11:00:00.000Z',
    completedAt: '2026-09-30T11:02:00.000Z',
    ok: true,
    error: null,
  };
  const { createApp } = await import('./app.js');
  const app = createApp(
    briefReads({
      articles: [briefArticle('accepted'), briefArticle('k1'), briefArticle('k2')],
      records: [
        triageRecordFixture('accepted', BRIEF_RECENT),
        keptRecord('k1', ['t1'], { significance: 2 }),
        keptRecord('k2', ['t1']),
      ],
      acceptedClusterIds: ['solo:accepted'],
      meta: { lastFetchAt: null, lastError: null, refresh: { last: lastSuccess, lastSuccess } },
    }),
  );
  const { baseUrl, close } = await startServer(app);
  try {
    const body = await getJson<KiteBatchStoriesResponse>(
      `${baseUrl}/api/batches/latest/categories/world/stories?limit=1`,
    );
    assert.deepEqual(
      body.stories.map((s) => s.id),
      ['k1', 'k2'],
    );
    assert.equal(body.stories[0]!.category, 'world');
    assert.equal(body.stories[0]!.informed_topic_id, 't1');
    assert.equal(body.timestamp, Date.parse(lastSuccess.completedAt) / 1000);

    const categories = await getJson<KiteBatchCategoriesResponse>(
      `${baseUrl}/api/batches/latest/categories`,
    );
    assert.equal(categories.categories[0]!.clusterCount, 2);

    const batch = await getJson<{ id: string; totalReadCount: number }>(
      `${baseUrl}/api/batches/latest`,
    );
    assert.equal(batch.id, 'owned-latest');
    assert.equal(batch.totalReadCount, 2);
  } finally {
    await close();
  }
});

test('Kite Brief stories hydrate cached full-story fields from the full-story store', async () => {
  const { baseUrl, close } = await startBriefRouter(
    {
      articles: [briefArticle('k1')],
      records: [keptRecord('k1', ['t1'])],
    },
    {
      readBriefFullStories: async () => ({
        fullStories: {
          k1: {
            articleId: 'k1',
            status: 'ok',
            enrichment: {
              talking_points: ['Cached talking point.'],
              timeline: [],
              suggested_qna: [],
            },
            deterministic: { perspectives: [], quote: null },
            sourceHash: 'abc',
            topicSections: [],
            model: 'm',
            error: null,
            generatedAt: BRIEF_RECENT,
            trigger: 'on_demand',
          },
        },
        updatedAt: BRIEF_RECENT,
      }),
    },
  );
  try {
    const body = await getJson<KiteBatchStoriesResponse>(
      `${baseUrl}/api/batches/latest/categories/world/stories`,
    );
    assert.deepEqual(body.stories[0]!.talking_points, ['Cached talking point.']);
    assert.equal(body.stories[0]!.informed_full_story_status, 'ok');
  } finally {
    await close();
  }
});

test('GET /api/brief/overview: sections with More split, quiet, notices, nextAt, running (public)', async () => {
  const lastSuccess = {
    trigger: 'manual' as const,
    startedAt: '2026-09-30T09:00:00.000Z',
    completedAt: '2026-09-30T09:30:00.000Z',
    ok: true,
    error: null,
  };
  const meta: StoreMeta = {
    lastFetchAt: null,
    lastError: null,
    refresh: { last: lastSuccess, lastSuccess },
    topicSearch: {
      at: BRIEF_RECENT,
      providers: {
        searxng: { state: 'ok' },
        google_news: { state: 'partial' },
      },
    } as unknown as StoreMeta['topicSearch'],
  };
  const { baseUrl, close } = await startBriefRouter(
    {
      articles: ['c1', 'c2', 'c3', 'c4', 'w1'].map((id) => briefArticle(id)),
      records: [
        keptRecord('c1', ['core'], { significance: 2 }),
        keptRecord('c2', ['core'], { significance: 1.5 }),
        keptRecord('c3', ['core', 'watch'], { significance: 1.2 }),
        keptRecord('c4', ['core'], { significance: 1 }),
        keptRecord('w1', ['watch']),
      ],
      topics: [
        briefTopic('watch', { name: 'Gas prices', level: 'watch' }),
        briefTopic('core', { name: 'Iran' }),
        briefTopic('quiet', { name: 'Palantir' }),
      ],
      meta,
    },
    { env: { REFRESH_INTERVAL_HOURS: '2' }, isRefreshRunning: () => true },
  );
  try {
    const overview = await getJson<unknown>(`${baseUrl}/api/brief/overview`);
    assert.deepEqual(overview, {
      ok: true,
      fixture: false,
      refresh: {
        last: lastSuccess,
        lastSuccess,
        nextAt: '2026-09-30T11:30:00.000Z',
        intervalHours: 2,
        running: true,
      },
      notices: ['Google News partly failed'],
      sections: [
        { topicId: 'core', name: 'Iran', level: 'core', storyIds: ['c1', 'c2', 'c3'], moreIds: ['c4'] },
        { topicId: 'watch', name: 'Gas prices', level: 'watch', storyIds: ['w1'], moreIds: [] },
      ],
      quiet: [{ id: 'quiet', name: 'Palantir', level: 'core' }],
      filteredOut: null,
    });
  } finally {
    await close();
  }
});

test('GET /api/brief/overview: filteredOut = last triage run dropped count; null when skipped or none', async () => {
  const cases: Array<[TriageRunMeta | null, number | null]> = [
    [FILTERED_RUN, 2],
    [{ ...FILTERED_RUN, dropped: 0, byReason: {} }, 0],
    [{ ...FILTERED_RUN, skipped: true, dropped: 0 }, null],
    [null, null],
  ];
  for (const [triage, expected] of cases) {
    for (const articles of [[briefArticle('k1')], []]) {
      const { baseUrl, close } = await startBriefRouter({
        articles,
        records: [keptRecord('k1', ['t1'])],
        meta: { lastFetchAt: null, lastError: null, triage },
      });
      try {
        const overview = await getJson<{ fixture: boolean; filteredOut: number | null }>(
          `${baseUrl}/api/brief/overview`,
        );
        assert.equal(overview.fixture, articles.length === 0);
        assert.equal(overview.filteredOut, expected, JSON.stringify(triage));
      } finally {
        await close();
      }
    }
  }
});

for (const [store, dep, notice] of [
  ['seen', 'readBriefSeen', 'Read history unavailable (brief-seen.json unreadable)'],
  ['summaries', 'readBriefSummaries', 'Saved summaries unavailable (brief-summaries.json unreadable)'],
  [
    'full stories',
    'readBriefFullStories',
    'Saved full stories unavailable (brief-full-stories.json unreadable)',
  ],
] as const) {
  test(`Kite brief: unreadable ${store} store degrades to empty with an overview notice`, async () => {
    const { baseUrl, close } = await startBriefRouter(
      {
        articles: ['k1', 'k2'].map((id) => briefArticle(id)),
        records: [keptRecord('k1', ['t1']), keptRecord('k2', ['t1'])],
      },
      {
        [dep]: async () => {
          throw new Error(`corrupt ${store}`);
        },
      },
    );
    try {
      const body = await getJson<KiteBatchStoriesResponse>(
        `${baseUrl}/api/batches/latest/categories/world/stories`,
      );
      assert.deepEqual(
        body.stories.map((s) => s.id).sort(),
        ['k1', 'k2'],
      );
      const overview = await getJson<{ notices: string[] }>(`${baseUrl}/api/brief/overview`);
      assert.deepEqual(overview.notices, [notice]);
    } finally {
      await close();
    }
  });
}

test('Kite brief: unreadable triage store still fails with 500', async () => {
  const { baseUrl, close } = await startBriefRouter(
    { articles: [briefArticle('k1')] },
    {
      readTriage: async () => {
        throw new Error('corrupt triage');
      },
    },
  );
  try {
    const resp = await fetch(`${baseUrl}/api/brief/overview`);
    assert.equal(resp.status, 500);
  } finally {
    await close();
  }
});

async function startSeenServer(f: BriefFixture & {
  writeBriefSeen?: (store: BriefSeenStore) => Promise<void>;
  summarizeBriefStory?: CreateAppDeps['summarizeBriefStory'];
  generateFullStory?: CreateAppDeps['generateFullStory'];
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const { createApp } = await import('./app.js');
  const app = createApp({
    ...briefReads(f),
    writeBriefSeen: f.writeBriefSeen ?? (async () => {}),
    ...(f.summarizeBriefStory ? { summarizeBriefStory: f.summarizeBriefStory } : {}),
    ...(f.generateFullStory ? { generateFullStory: f.generateFullStory } : {}),
  });
  return await startServer(app);
}

function postJson(baseUrl: string, route: string, body: unknown, cookie?: string) {
  return fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

test('POST /api/brief/seen requires session', async () => {
  let writes = 0;
  const { baseUrl, close } = await startSeenServer({
    articles: [],
    writeBriefSeen: async () => {
      writes += 1;
    },
  });
  try {
    const resp = await postJson(baseUrl, '/api/brief/seen', { articleIds: ['k1'] });
    assert.equal(resp.status, 401);
    assert.equal(writes, 0);
  } finally {
    await close();
  }
});

test('POST /api/brief/seen returns 400 on bad bodies', async () => {
  let writes = 0;
  const { baseUrl, close } = await startSeenServer({
    articles: [],
    writeBriefSeen: async () => {
      writes += 1;
    },
  });
  try {
    const cookie = await login(baseUrl);
    const bad: unknown[] = [
      {},
      { articleIds: 'k1' },
      { articleIds: [] },
      { articleIds: ['k1', 7] },
      { articleIds: ['k1', '  '] },
      { articleIds: Array.from({ length: 101 }, (_, i) => `id${i}`) },
    ];
    for (const body of bad) {
      const resp = await postJson(baseUrl, '/api/brief/seen', body, cookie);
      assert.equal(resp.status, 400, JSON.stringify(body).slice(0, 40));
      const json = (await resp.json()) as { ok: boolean };
      assert.equal(json.ok, false);
    }
    assert.equal(writes, 0);

    const max = await postJson(
      baseUrl,
      '/api/brief/seen',
      { articleIds: Array.from({ length: 100 }, (_, i) => `id${i}`) },
      cookie,
    );
    assert.equal(max.status, 200);
  } finally {
    await close();
  }
});

test('POST /api/brief/seen records kept-record snapshots, ignores unknown ids, prunes', async () => {
  const written: BriefSeenStore[] = [];
  const { baseUrl, close } = await startSeenServer({
    articles: [],
    records: [
      keptRecord('k1', ['t1'], { outletCount: 3, significance: 1.4 }),
      keptRecord('k-recent', ['t1']),
      keptRecord('k-old', ['t1']),
      triageRecordFixture('dropped', BRIEF_RECENT),
    ],
    seen: {
      seen: {
        'k-recent': { seenAt: '2026-09-25T00:00:00.000Z', outletCount: 1, significance: 1 },
        'k-old': { seenAt: '2026-09-20T00:00:00.000Z', outletCount: 1, significance: 1 },
        gone: { seenAt: '2026-09-29T00:00:00.000Z', outletCount: 1, significance: 1 },
      },
      updatedAt: null,
    },
    writeBriefSeen: async (store) => {
      written.push(store);
    },
  });
  try {
    const cookie = await login(baseUrl);
    const resp = await postJson(
      baseUrl,
      '/api/brief/seen',
      { articleIds: ['k1', 'unknown', 'dropped'] },
      cookie,
    );
    assert.equal(resp.status, 200);
    assert.deepEqual(await resp.json(), { ok: true, recorded: 1 });
    assert.equal(written.length, 1);
    assert.deepEqual(written[0], {
      seen: {
        'k-recent': { seenAt: '2026-09-25T00:00:00.000Z', outletCount: 1, significance: 1 },
        k1: { seenAt: BRIEF_NOW.toISOString(), outletCount: 3, significance: 1.4 },
      },
      updatedAt: BRIEF_NOW.toISOString(),
    });
  } finally {
    await close();
  }
});

test('POST /api/brief/seen serializes concurrent marks so none are lost', async () => {
  let disk: BriefSeenStore = { seen: {}, updatedAt: null };
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;
  const { createApp } = await import('./app.js');
  const app = createApp({
    ...briefReads({
      articles: [],
      records: ['k1', 'k2', 'k3'].map((id) => keptRecord(id, ['t1'])),
    }),
    readBriefSeen: async () => {
      const snapshot = structuredClone(disk);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return snapshot;
    },
    writeBriefSeen: async (store) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      disk = store;
    },
  });
  const { baseUrl, close } = await startServer(app);
  try {
    const cookie = await login(baseUrl);
    const responses = await Promise.all(
      ['k1', 'k2', 'k3'].map((id) => postJson(baseUrl, '/api/brief/seen', { articleIds: [id] }, cookie)),
    );
    for (const resp of responses) assert.equal(resp.status, 200);
    assert.deepEqual(Object.keys(disk.seen).sort(), ['k1', 'k2', 'k3']);
  } finally {
    await close();
  }
});

test('POST /api/brief/stories/:articleId/summary maps results to 200 / 404 / 429 / 502 and requires session', async () => {
  const calls: string[] = [];
  const results: Record<string, SummarizeBriefStoryResult> = {
    ok: {
      ok: true,
      summary: {
        articleId: 'ok',
        status: 'ok',
        text: 'Officials said talks resumed on Tuesday.',
        sourceArticleId: 'ok',
        sourceHash: 'abc',
        model: 'm',
        error: null,
        generatedAt: BRIEF_RECENT,
        trigger: 'on_demand',
      },
    },
    none: { ok: false, code: 'not_in_brief', error: 'Story is not in the current Brief' },
    busy: { ok: false, code: 'rate_limited', error: 'limit' },
    broken: { ok: false, code: 'error', error: 'Ollama not configured' },
  };
  const { baseUrl, close } = await startSeenServer({
    articles: [],
    summarizeBriefStory: async (articleId) => {
      calls.push(articleId);
      return results[articleId]!;
    },
  });
  try {
    const anonymous = await postJson(baseUrl, '/api/brief/stories/ok/summary', {});
    assert.equal(anonymous.status, 401);

    const cookie = await login(baseUrl);
    const ok = await postJson(baseUrl, '/api/brief/stories/ok/summary', {}, cookie);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), {
      ok: true,
      summary: { status: 'ok', text: 'Officials said talks resumed on Tuesday.' },
    });

    const expected: Array<[string, number, string]> = [
      ['none', 404, 'not_in_brief'],
      ['busy', 429, 'rate_limited'],
      ['broken', 502, 'error'],
    ];
    for (const [id, status, code] of expected) {
      const resp = await postJson(baseUrl, `/api/brief/stories/${id}/summary`, {}, cookie);
      assert.equal(resp.status, status, id);
      const body = (await resp.json()) as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.equal(body.error, code);
    }
    assert.deepEqual(calls, ['ok', 'none', 'busy', 'broken']);
  } finally {
    await close();
  }
});

test('POST /api/brief/stories/:articleId/full maps results to 200 / 404 / 429 / 502 and requires session', async () => {
  const calls: string[] = [];
  const record = {
    articleId: 'ok',
    status: 'ok' as const,
    enrichment: {
      talking_points: ['A talking point.'],
      timeline: [],
      suggested_qna: [],
      business_angle_text: 'Business context.',
    },
    deterministic: {
      perspectives: [{ text: 'An official view.', sources: [] }],
      quote: null,
    },
    sourceHash: 'abc',
    topicSections: [],
    model: 'm',
    error: null,
    generatedAt: BRIEF_RECENT,
    trigger: 'on_demand' as const,
    changeSummary: '1 new outlet; timeline +1',
  };
  const results: Record<string, GenerateFullStoryResult> = {
    ok: { ok: true, record },
    none: { ok: false, code: 'not_in_brief', error: 'Story is not in the current Brief' },
    busy: { ok: false, code: 'rate_limited', error: 'limit' },
    broken: { ok: false, code: 'error', error: 'Ollama not configured' },
  };
  const { baseUrl, close } = await startSeenServer({
    articles: [],
    generateFullStory: async (articleId) => {
      calls.push(articleId);
      return results[articleId]!;
    },
  });
  try {
    const anonymous = await postJson(baseUrl, '/api/brief/stories/ok/full', {});
    assert.equal(anonymous.status, 401);

    const cookie = await login(baseUrl);
    const ok = await postJson(baseUrl, '/api/brief/stories/ok/full', {}, cookie);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), {
      ok: true,
      fullStory: {
        status: 'ok',
        talking_points: ['A talking point.'],
        timeline: [],
        suggested_qna: [],
        business_angle_text: 'Business context.',
        perspectives: [{ text: 'An official view.', sources: [] }],
        changeSummary: '1 new outlet; timeline +1',
      },
    });

    const expected: Array<[string, number, string]> = [
      ['none', 404, 'not_in_brief'],
      ['busy', 429, 'rate_limited'],
      ['broken', 502, 'error'],
    ];
    for (const [id, status, code] of expected) {
      const resp = await postJson(baseUrl, `/api/brief/stories/${id}/full`, {}, cookie);
      assert.equal(resp.status, status, id);
      const body = (await resp.json()) as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.equal(body.error, code);
    }
    assert.deepEqual(calls, ['ok', 'none', 'busy', 'broken']);
  } finally {
    await close();
  }
});
