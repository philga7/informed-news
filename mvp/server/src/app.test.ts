import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Server } from 'node:http';

import type { Article } from './types/article.js';
import { acceptCluster, readBriefMembership } from './store/briefMembershipStore.js';
import { readTrackedStories, trackCluster } from './store/trackedStoriesStore.js';
import {
  addMuteRule,
  readMuteRules,
  removeMuteRule,
} from './store/muteRulesStore.js';
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
        // NOTE: syncTrackedAfterFetch must be based on the full rewritten store, not only
        // the upserted article set returned from the fetch result.
        articles: [{ id: 'a2', clusterId: 'c1' } as Article],
      }) as any,
    readArticles: async () => fullStoreArticles,
    syncTrackedAfterFetch: async (countByClusterId) => {
      seenMap = countByClusterId;
      return { entries: [] };
    },
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
    const json = (await resp.json()) as { ok: boolean };
    assert.equal(json.ok, true);
    assert.deepEqual(seenMap, { c1: 3, 'solo:solo-1': 1 });
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
        articles: [],
      }) as any,
    syncTrackedAfterFetch: async () => {
      throw new Error('boom');
    },
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
      entries: Array<{ clusterId: string }>;
    };
    assert.equal(tracked.ok, true);
    assert.ok(tracked.entries.some((e) => e.clusterId === 'c1'));
  } finally {
    await close();
  }
});

