import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { createAccounts, hashPassword } from '../auth/accounts.js';
import { createApp, type CreateAppDeps } from '../app.js';
import type { IngestConfig } from '../ingest/openIngest.js';
import {
  createMorningItem,
  createStory,
  createStoryEntry,
  ensureDashboardSchema,
  type StoryRecord,
} from '../store/postgres/dashboardStore.js';
import { listFollowStates, setFollowState } from '../store/postgres/followStore.js';
import { markOpened, markRead } from '../store/postgres/readMarkerStore.js';
import { addStoryCategory, createCategory } from '../store/postgres/storyDetailStore.js';
import type { JsonObject } from '../store/postgres/storeSupport.js';
import { createUser, type UserRecord } from '../store/postgres/userStore.js';
import { ensureTestAgent, scratchSchemaPool, TEST_WRITER, testPool } from '../testing/dashboardTestDb.js';

const saved = {
  SESSION_SECRET: process.env.SESSION_SECRET,
  MVP_PASSWORD: process.env.MVP_PASSWORD,
  MVP_PASSWORD_HASH: process.env.MVP_PASSWORD_HASH,
};

let passwordHash: string;

before(async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;
  // Require the database, as the other store tests do. Do not skip the file.
  const pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  await pool.end();
  passwordHash = await hashPassword('secret');
});

after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function scratch(t: TestContext): Promise<Pool> {
  const { pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(drop);
  await ensureDashboardSchema(pool);
  await ensureTestAgent(pool);
  return pool;
}

async function serve(t: TestContext, deps: CreateAppDeps): Promise<string> {
  const app = createApp(deps);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

function ingest(pool: Pool | null, ready: () => Promise<void> = async () => undefined): IngestConfig {
  return { pool, ready };
}

async function login(base: string, body: { password: string; email?: string }): Promise<string> {
  const resp = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  assert.equal(resp.status, 200, text);
  return resp.headers.getSetCookie().map((part) => part.split(';')[0] ?? '').join('; ');
}

async function followState(
  base: string,
  method: 'PUT' | 'DELETE',
  storyId: string,
  cookie = '',
  body?: unknown,
): Promise<{ status: number; body: unknown; text: string }> {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const resp = await fetch(`${base}/api/stories/${encodeURIComponent(storyId)}/follow-state`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let parsed: unknown = text;
  if (text !== '') {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }
  return { status: resp.status, body: parsed, text };
}

async function followRowCount(pool: Pool): Promise<number> {
  const result = await pool.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM user_follows');
  return Number(result.rows[0]?.n ?? 0);
}

async function getDashboard(base: string, cookie = ''): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${base}/api/dashboard`, { headers: cookie ? { cookie } : {} });
  const text = await resp.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return { status: resp.status, body };
}

const EMPTY = {
  ok: true,
  developing: [],
  quiet: [],
  hidden: [],
  categories: [],
  trackers: { stories: [], weather: null },
  morning: { bluf: null, weather: null, market: null, osint: null },
};

function user(pool: Pool, name: string): Promise<UserRecord> {
  return createUser(pool, {
    email: `${name}-${randomUUID()}@example.com`,
    displayName: name,
    passwordHash,
  });
}

function hub(
  pool: Pool,
  title: string,
  extras: { ownerUserId?: string | null; status?: StoryRecord['status']; nowSummary?: string | null } = {},
): Promise<StoryRecord> {
  return createStory(pool, TEST_WRITER, {
    role: 'hub',
    hubId: null,
    title,
    status: extras.status ?? 'developing',
    ownerUserId: extras.ownerUserId ?? null,
    nowSummary: extras.nowSummary ?? null,
  });
}

function entry(
  pool: Pool,
  storyId: string,
  occurredAt: string,
  precision: 'time' | 'day' = 'time',
  id?: string,
) {
  return createStoryEntry(pool, TEST_WRITER, {
    id,
    storyId,
    occurredAt,
    precision,
    headline: 'Headline',
    label: 'reported',
    sources: [],
  });
}

/** The row a story with no entries and no marker produces. */
function bare(story: StoryRecord, over: Record<string, unknown> = {}) {
  return {
    id: story.id,
    title: story.title,
    role: story.role,
    status: story.status,
    nowSummary: story.nowSummary,
    latestEntryAt: null,
    latestEntryPrecision: null,
    newCount: 0,
    readUpTo: null,
    categories: [],
    followState: null,
    hubTitle: null,
    private: story.ownerUserId !== null,
    ...over,
  };
}

test('signed out: dashboard read is 401', async (t) => {
  const base = await serve(t, {});
  const { status } = await getDashboard(base);
  assert.equal(status, 401);
});

test('no pool: dashboard read is 503 data unavailable', async (t) => {
  const missing = await serve(t, {});
  const missingCookie = await login(missing, { password: 'pw' });
  const withoutIngest = await getDashboard(missing, missingCookie);
  assert.equal(withoutIngest.status, 503);
  assert.deepEqual(withoutIngest.body, { ok: false, error: 'data unavailable' });

  const closed = await serve(t, { ingest: ingest(null) });
  const closedCookie = await login(closed, { password: 'pw' });
  const nullPool = await getDashboard(closed, closedCookie);
  assert.equal(nullPool.status, 503);
  assert.deepEqual(nullPool.body, { ok: false, error: 'data unavailable' });
});

test('ready() rejects, or the query throws: 503 data unavailable and no SQL', async (t) => {
  let queried = false;
  const blocking = {
    query() {
      queried = true;
      return Promise.reject(new Error('SELECT should not run'));
    },
  } as unknown as Pool;
  const notReady = await serve(t, {
    ingest: ingest(blocking, () => Promise.reject(new Error('schema-broke-secret'))),
  });
  const cookie = await login(notReady, { password: 'pw' });
  const refused = await getDashboard(notReady, cookie);
  assert.equal(refused.status, 503);
  assert.deepEqual(refused.body, { ok: false, error: 'data unavailable' });
  assert.equal(JSON.stringify(refused.body).includes('schema-broke-secret'), false);
  assert.equal(queried, false, 'ready() runs before the query');

  const exploding = {
    query() {
      return Promise.reject(new Error('syntax error near query-secret-sql'));
    },
  } as unknown as Pool;
  const broken = await serve(t, { ingest: ingest(exploding) });
  const brokenCookie = await login(broken, { password: 'pw' });
  const failed = await getDashboard(broken, brokenCookie);
  assert.equal(failed.status, 503);
  assert.deepEqual(failed.body, { ok: false, error: 'data unavailable' });
  assert.equal(JSON.stringify(failed.body).includes('query-secret-sql'), false);
});

test('empty database, signed in: 200 and the empty shape', async (t) => {
  const pool = await scratch(t);
  const base = await serve(t, { ingest: ingest(pool) });
  const cookie = await login(base, { password: 'pw' });
  const { status, body } = await getDashboard(base, cookie);
  assert.equal(status, 200);
  assert.deepEqual(body, EMPTY);
});

test('shared stories, the owner, the admin, and a session with no user id', async (t) => {
  const pool = await scratch(t);
  const owner = await user(pool, 'owner');
  const other = await user(pool, 'other');
  const admin = await user(pool, 'admin');
  const shared = await hub(pool, 'Shared story', { status: 'active', nowSummary: 'Still counting' });
  const mine = await hub(pool, 'Owner private', { ownerUserId: owner.id, status: 'waiting' });
  const theirs = await hub(pool, 'Other private', { ownerUserId: other.id, status: 'stalled' });
  const base = await serve(t, {
    ingest: ingest(pool),
    accounts: createAccounts(pool, {}),
    operatorEmail: admin.email.toUpperCase(),
  });

  const ownerCookie = await login(base, { email: owner.email, password: 'secret' });
  const asOwner = await getDashboard(base, ownerCookie);
  assert.equal(asOwner.status, 200);
  assert.deepEqual(asOwner.body, {
    ...EMPTY,
    developing: [bare(mine), bare(shared)],
  });

  const adminCookie = await login(base, { email: admin.email, password: 'secret' });
  const asAdmin = await getDashboard(base, adminCookie);
  assert.equal(asAdmin.status, 200);
  assert.deepEqual(asAdmin.body, {
    ...EMPTY,
    developing: [bare(theirs), bare(mine), bare(shared)],
  });

  const anonCookie = await login(base, { password: 'pw' });
  const asAnon = await getDashboard(base, anonCookie);
  assert.equal(asAnon.status, 200);
  assert.deepEqual(asAnon.body, { ...EMPTY, developing: [bare(shared)] });
});

test('hide removes a story, follow keeps it, and hiding a hub leaves its branch', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const someone = await user(pool, 'someone');
  const followed = await hub(pool, 'Alpha');
  const middle = await hub(pool, 'Middle');
  const zulu = await hub(pool, 'Zulu');
  const parent = await hub(pool, 'Hub');
  const child = await createStory(pool, TEST_WRITER, {
    role: 'branch',
    hubId: parent.id,
    title: 'Branch',
    status: 'developing',
  });
  await setFollowState(pool, reader.id, { kind: 'story', storyId: followed.id }, 'follow');
  await setFollowState(pool, reader.id, { kind: 'story', storyId: middle.id }, 'hide');
  await setFollowState(pool, reader.id, { kind: 'story', storyId: zulu.id }, 'hide');
  await setFollowState(pool, reader.id, { kind: 'story', storyId: parent.id }, 'hide');
  await setFollowState(pool, someone.id, { kind: 'story', storyId: followed.id }, 'hide');
  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });
  const { status, body } = await getDashboard(base, cookie);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ...EMPTY,
    developing: [
      bare(followed, { followState: 'follow' }),
      bare(child, { hubTitle: 'Hub' }),
    ],
    hidden: [
      { id: parent.id, title: 'Hub' },
      { id: middle.id, title: 'Middle' },
      { id: zulu.id, title: 'Zulu' },
    ],
  });
});

test('newCount, readUpTo, and quiet follow the viewer marker', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const someone = await user(pool, 'someone');
  const unread = await hub(pool, 'Unread');
  await entry(pool, unread.id, '2026-11-02T10:00:00Z');
  await entry(pool, unread.id, '2026-11-04T10:00:00Z');
  await markRead(pool, someone.id, { kind: 'story', storyId: unread.id }, '2026-11-04T10:00:00Z');
  const empty = await hub(pool, 'Empty');
  await markRead(pool, someone.id, { kind: 'story', storyId: empty.id }, '2026-11-04T10:00:00Z');
  const quiet = await hub(pool, 'Quiet');
  await entry(pool, quiet.id, '2026-11-03T10:00:00Z');
  await entry(pool, quiet.id, '2026-11-06T10:00:00Z');
  await markRead(pool, reader.id, { kind: 'story', storyId: quiet.id }, '2026-11-06T10:00:00Z');
  const fresh = await hub(pool, 'Fresh');
  await entry(pool, fresh.id, '2026-11-01T10:00:00Z');
  await entry(pool, fresh.id, '2026-11-10T10:00:00Z');
  await markRead(pool, reader.id, { kind: 'story', storyId: fresh.id }, '2026-11-01T10:00:00Z');

  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });
  const { status, body } = await getDashboard(base, cookie);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ...EMPTY,
    developing: [
      bare(fresh, {
        latestEntryAt: '2026-11-10T10:00:00.000Z',
        latestEntryPrecision: 'time',
        newCount: 1,
        readUpTo: '2026-11-01T10:00:00.000Z',
      }),
      bare(unread, {
        latestEntryAt: '2026-11-04T10:00:00.000Z',
        latestEntryPrecision: 'time',
        newCount: 2,
      }),
      bare(empty),
    ],
    quiet: [
      bare(quiet, {
        latestEntryAt: '2026-11-06T10:00:00.000Z',
        latestEntryPrecision: 'time',
        readUpTo: '2026-11-06T10:00:00.000Z',
      }),
    ],
    trackers: {
      stories: [
        { id: fresh.id, title: 'Fresh', newCount: 1 },
        { id: unread.id, title: 'Unread', newCount: 2 },
      ],
      weather: null,
    },
  });
});

test('an opened marker with no read time is not read', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const opened = await hub(pool, 'Opened');
  await entry(pool, opened.id, '2026-11-02T10:00:00Z');
  await entry(pool, opened.id, '2026-11-04T10:00:00Z');
  await markOpened(pool, reader.id, { kind: 'story', storyId: opened.id }, '2026-11-05T10:00:00Z');
  const weatherData: JsonObject = {
    unit: 'F',
    issuedAt: '2026-11-20T11:32:00Z',
    days: ['2026-11-20'],
    locations: [{ name: 'Jefferson', days: [{ high: 64, low: 54 }] }],
  };
  await createMorningItem(pool, TEST_WRITER, {
    id: 'weather-opened',
    kind: 'weather',
    body: 'Opened weather',
    link: null,
    postedAt: '2026-11-20T11:32:00Z',
    data: weatherData,
  });
  await markOpened(pool, reader.id, { kind: 'weather' }, '2026-11-20T12:00:00Z');

  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });
  const { status, body } = await getDashboard(base, cookie);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ...EMPTY,
    developing: [
      bare(opened, {
        latestEntryAt: '2026-11-04T10:00:00.000Z',
        latestEntryPrecision: 'time',
        newCount: 2,
        readUpTo: null,
      }),
    ],
    trackers: {
      stories: [{ id: opened.id, title: 'Opened', newCount: 2 }],
      weather: { newCount: 1 },
    },
    morning: {
      bluf: null,
      weather: {
        id: 'weather-opened',
        postedAt: '2026-11-20T11:32:00.000Z',
        body: 'Opened weather',
        link: null,
        data: weatherData,
      },
      market: null,
      osint: null,
    },
  });
});

test('a branch row has hubTitle and the latest entry precision', async (t) => {
  const pool = await scratch(t);
  const parent = await hub(pool, 'Election');
  const child = await createStory(pool, TEST_WRITER, {
    role: 'branch',
    hubId: parent.id,
    title: 'Recount',
    status: 'active',
  });
  // Same instant: the greater id decides which precision the row reports.
  await entry(pool, child.id, '2026-11-12', 'day', 'a-day');
  await entry(pool, child.id, '2026-11-12T00:00:00Z', 'time', 'm-time');
  const base = await serve(t, { ingest: ingest(pool) });
  const cookie = await login(base, { password: 'pw' });
  const { status, body } = await getDashboard(base, cookie);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ...EMPTY,
    developing: [
      bare(child, {
        latestEntryAt: '2026-11-12T00:00:00.000Z',
        latestEntryPrecision: 'time',
        newCount: 2,
        hubTitle: 'Election',
      }),
      bare(parent),
    ],
    trackers: {
      stories: [{ id: child.id, title: 'Recount', newCount: 2 }],
      weather: null,
    },
  });
});

test('category counts include zero and count a story in each of its categories', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const courts = await createCategory(pool, { name: 'Courts', sort: 0 });
  const elections = await createCategory(pool, { name: 'Elections', sort: 0 });
  const empty = await createCategory(pool, { name: 'Empty', sort: 5 });
  const both = await hub(pool, 'Both');
  const electionOnly = await hub(pool, 'Election only');
  const hidden = await hub(pool, 'Hidden courts');
  await addStoryCategory(pool, TEST_WRITER, { storyId: both.id, categoryId: elections.id });
  await addStoryCategory(pool, TEST_WRITER, { storyId: both.id, categoryId: courts.id });
  await addStoryCategory(pool, TEST_WRITER, { storyId: electionOnly.id, categoryId: elections.id });
  await addStoryCategory(pool, TEST_WRITER, { storyId: hidden.id, categoryId: courts.id });
  await setFollowState(pool, reader.id, { kind: 'story', storyId: hidden.id }, 'hide');
  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });
  const { status, body } = await getDashboard(base, cookie);
  assert.equal(status, 200);
  assert.deepEqual(body, {
    ...EMPTY,
    developing: [
      bare(both, {
        categories: [
          { id: courts.id, name: 'Courts' },
          { id: elections.id, name: 'Elections' },
        ],
      }),
      bare(electionOnly, { categories: [{ id: elections.id, name: 'Elections' }] }),
    ],
    hidden: [{ id: hidden.id, title: 'Hidden courts' }],
    categories: [
      { id: courts.id, name: 'Courts', count: 1 },
      { id: elections.id, name: 'Elections', count: 2 },
      { id: empty.id, name: 'Empty', count: 0 },
    ],
  });
});

test('morning returns the latest item of each card, and the weather tracker follows the marker', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const weatherData: JsonObject = {
    unit: 'F',
    issuedAt: '2026-11-20T11:32:00Z',
    days: ['2026-11-20'],
    locations: [{ name: 'Jefferson', days: [{ high: 64, low: 54 }] }],
  };
  const marketData: JsonObject = {
    quotes: [
      { label: 'S&P', value: 7520, changePct: -0.5 },
      { label: 'Nasdaq', value: 23110, changePct: -0.25 },
      { label: 'VIX', value: 18 },
      { label: 'Oil', value: 71, changePct: 1 },
    ],
    notes: ['Needs attention: SPG, RSI 79.6, trim candidate.'],
  };
  await createMorningItem(pool, TEST_WRITER, {
    id: 'bluf-z',
    kind: 'bluf',
    body: 'Yesterday',
    link: null,
    postedAt: '2026-11-19T08:00:00Z',
  });
  await createMorningItem(pool, TEST_WRITER, {
    id: 'bluf-a',
    kind: 'bluf',
    body: 'Today',
    link: 'https://example.com/bluf',
    postedAt: '2026-11-20T08:00:00Z',
  });
  await createMorningItem(pool, TEST_WRITER, {
    id: 'weather-a',
    kind: 'weather',
    body: 'Earlier id',
    link: null,
    postedAt: '2026-11-20T11:32:00Z',
    data: weatherData,
  });
  await createMorningItem(pool, TEST_WRITER, {
    id: 'weather-m',
    kind: 'weather',
    body: 'Later id',
    link: null,
    postedAt: '2026-11-20T11:32:00Z',
    data: weatherData,
  });
  await createMorningItem(pool, TEST_WRITER, {
    id: 'market-1',
    kind: 'market',
    body: 'Markets mixed',
    link: null,
    postedAt: '2026-11-20T09:00:00Z',
    data: marketData,
  });
  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });
  const first = await getDashboard(base, cookie);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, {
    ...EMPTY,
    trackers: { stories: [], weather: { newCount: 1 } },
    morning: {
      bluf: {
        id: 'bluf-a',
        postedAt: '2026-11-20T08:00:00.000Z',
        body: 'Today',
        link: 'https://example.com/bluf',
        data: null,
      },
      weather: {
        id: 'weather-m',
        postedAt: '2026-11-20T11:32:00.000Z',
        body: 'Later id',
        link: null,
        data: weatherData,
      },
      market: {
        id: 'market-1',
        postedAt: '2026-11-20T09:00:00.000Z',
        body: 'Markets mixed',
        link: null,
        data: marketData,
      },
      osint: null,
    },
  });

  await markRead(pool, reader.id, { kind: 'weather' }, '2026-11-20T11:32:00Z');
  const second = await getDashboard(base, cookie);
  assert.equal(second.status, 200);
  const again = second.body as { trackers: { weather: unknown }; morning: { weather: { id: string } | null } };
  assert.deepEqual(again.trackers.weather, null);
  assert.equal(again.morning.weather?.id, 'weather-m');
});

test('stories are ordered by latest entry, nulls last, then title, then id', async (t) => {
  const pool = await scratch(t);
  const apple = await hub(pool, 'Apple');
  const mango = await hub(pool, 'Mango');
  const tiedA = await hub(pool, 'Tied');
  const tiedB = await hub(pool, 'Tied');
  const middle = await hub(pool, 'Middle');
  const zebra = await hub(pool, 'Zebra');
  await entry(pool, apple.id, '2026-11-21T12:00:00Z');
  await entry(pool, mango.id, '2026-11-21T12:00:00Z');
  await entry(pool, tiedA.id, '2026-11-20T12:00:00Z');
  await entry(pool, tiedB.id, '2026-11-20T12:00:00Z');
  await entry(pool, middle.id, '2026-11-19T12:00:00Z');
  const [firstTied, secondTied] = [tiedA, tiedB].sort((a, b) => (a.id < b.id ? -1 : 1));
  const base = await serve(t, { ingest: ingest(pool) });
  const cookie = await login(base, { password: 'pw' });
  const { status, body } = await getDashboard(base, cookie);
  assert.equal(status, 200);
  const developing = [
    bare(apple, { latestEntryAt: '2026-11-21T12:00:00.000Z', latestEntryPrecision: 'time', newCount: 1 }),
    bare(mango, { latestEntryAt: '2026-11-21T12:00:00.000Z', latestEntryPrecision: 'time', newCount: 1 }),
    bare(firstTied, { latestEntryAt: '2026-11-20T12:00:00.000Z', latestEntryPrecision: 'time', newCount: 1 }),
    bare(secondTied, { latestEntryAt: '2026-11-20T12:00:00.000Z', latestEntryPrecision: 'time', newCount: 1 }),
    bare(middle, { latestEntryAt: '2026-11-19T12:00:00.000Z', latestEntryPrecision: 'time', newCount: 1 }),
    bare(zebra),
  ];
  assert.deepEqual(body, {
    ...EMPTY,
    developing,
    trackers: {
      stories: developing.slice(0, 5).map((row) => ({ id: row.id, title: row.title, newCount: 1 })),
      weather: null,
    },
  });
});

test('no pool, or ready() rejects: follow-state is 503, not 403', async (t) => {
  const missing = await serve(t, {});
  const missingCookie = await login(missing, { password: 'pw' });
  const missingPut = await followState(missing, 'PUT', 'any-id', missingCookie, { state: 'follow' });
  assert.equal(missingPut.status, 503);
  assert.deepEqual(missingPut.body, { ok: false, error: 'data unavailable' });
  const missingDelete = await followState(missing, 'DELETE', 'any-id', missingCookie);
  assert.equal(missingDelete.status, 503);
  assert.deepEqual(missingDelete.body, { ok: false, error: 'data unavailable' });

  const closed = await serve(t, { ingest: ingest(null) });
  const closedCookie = await login(closed, { password: 'pw' });
  const nullPool = await followState(closed, 'PUT', 'any-id', closedCookie, { state: 'follow' });
  assert.equal(nullPool.status, 503);
  assert.deepEqual(nullPool.body, { ok: false, error: 'data unavailable' });
  const nullDelete = await followState(closed, 'DELETE', 'any-id', closedCookie);
  assert.equal(nullDelete.status, 503);
  assert.deepEqual(nullDelete.body, { ok: false, error: 'data unavailable' });

  let queried = false;
  const blocking = {
    query() {
      queried = true;
      return Promise.reject(new Error('SELECT should not run'));
    },
  } as unknown as Pool;
  const notReady = await serve(t, {
    ingest: ingest(blocking, () => Promise.reject(new Error('schema-broke-secret'))),
  });
  const cookie = await login(notReady, { password: 'pw' });
  const refused = await followState(notReady, 'PUT', 'any-id', cookie, { state: 'hide' });
  assert.equal(refused.status, 503);
  assert.deepEqual(refused.body, { ok: false, error: 'data unavailable' });
  assert.equal(JSON.stringify(refused.body).includes('schema-broke-secret'), false);
  assert.equal(queried, false, 'ready() runs before the query');
  const refusedDelete = await followState(notReady, 'DELETE', 'any-id', cookie);
  assert.equal(refusedDelete.status, 503);
  assert.deepEqual(refusedDelete.body, { ok: false, error: 'data unavailable' });
});

test('signed in, no user id: follow-state is 403 and writes nothing', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const story = await hub(pool, 'Shared');
  const base = await serve(t, { ingest: ingest(pool) });
  const cookie = await login(base, { password: 'pw' });

  // An unknown id would be 404 if the story check ran before the account check.
  const missing = await followState(base, 'PUT', 'missing-story', cookie, { state: 'follow' });
  assert.equal(missing.status, 403);
  assert.deepEqual(missing.body, { ok: false, error: 'needs an account' });

  const put = await followState(base, 'PUT', story.id, cookie, { state: 'follow' });
  assert.equal(put.status, 403);
  assert.deepEqual(put.body, { ok: false, error: 'needs an account' });
  const removed = await followState(base, 'DELETE', story.id, cookie);
  assert.equal(removed.status, 403);
  assert.deepEqual(removed.body, { ok: false, error: 'needs an account' });
  assert.equal(await followRowCount(pool), 0);
  assert.deepEqual(await listFollowStates(pool, reader.id), []);
});

test('signed out: follow-state is 401', async (t) => {
  const base = await serve(t, {});
  const put = await followState(base, 'PUT', 'any-id', '', { state: 'follow' });
  assert.equal(put.status, 401);
  const removed = await followState(base, 'DELETE', 'any-id');
  assert.equal(removed.status, 401);
});

test('PUT follow, then hide: one row, state hide, and the story leaves developing', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const story = await hub(pool, 'Shared');
  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });

  const followed = await followState(base, 'PUT', story.id, cookie, { state: 'follow' });
  assert.equal(followed.status, 200);
  const followedRows = await listFollowStates(pool, reader.id);
  assert.equal(followedRows.length, 1);
  assert.deepEqual(followed.body, { ok: true, state: 'follow', updatedAt: followedRows[0]?.updatedAt });

  const hidden = await followState(base, 'PUT', story.id, cookie, { state: 'hide' });
  assert.equal(hidden.status, 200);
  const hiddenRows = await listFollowStates(pool, reader.id);
  assert.deepEqual(hiddenRows, [
    {
      userId: reader.id,
      subject: { kind: 'story', storyId: story.id },
      state: 'hide',
      updatedAt: hiddenRows[0]?.updatedAt,
    },
  ]);
  assert.deepEqual(hidden.body, { ok: true, state: 'hide', updatedAt: hiddenRows[0]?.updatedAt });
  assert.match(hiddenRows[0]?.updatedAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const dash = await getDashboard(base, cookie);
  assert.equal(dash.status, 200);
  assert.deepEqual(dash.body, {
    ...EMPTY,
    hidden: [{ id: story.id, title: 'Shared' }],
  });
});

test('DELETE clears a hidden story with an empty 204, and a second DELETE is also 204', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const story = await hub(pool, 'Shared');
  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });

  const hidden = await followState(base, 'PUT', story.id, cookie, { state: 'hide' });
  assert.equal(hidden.status, 200);
  const before = await getDashboard(base, cookie);
  assert.deepEqual(before.body, { ...EMPTY, hidden: [{ id: story.id, title: 'Shared' }] });

  const cleared = await followState(base, 'DELETE', story.id, cookie);
  assert.equal(cleared.status, 204);
  assert.equal(cleared.text, '');
  const after = await getDashboard(base, cookie);
  assert.equal(after.status, 200);
  assert.deepEqual(after.body, { ...EMPTY, developing: [bare(story)] });
  assert.deepEqual(await listFollowStates(pool, reader.id), []);

  const again = await followState(base, 'DELETE', story.id, cookie);
  assert.equal(again.status, 204);
  assert.equal(again.text, '');
  const still = await getDashboard(base, cookie);
  assert.deepEqual(still.body, { ...EMPTY, developing: [bare(story)] });
});

test("another user's private story and an unknown id are 404; the admin can hide and clear", async (t) => {
  const pool = await scratch(t);
  const owner = await user(pool, 'owner');
  const other = await user(pool, 'other');
  const admin = await user(pool, 'admin');
  const story = await hub(pool, 'Private', { ownerUserId: owner.id });
  const base = await serve(t, {
    ingest: ingest(pool),
    accounts: createAccounts(pool, {}),
    operatorEmail: admin.email.toUpperCase(),
  });
  const otherCookie = await login(base, { email: other.email, password: 'secret' });
  const ownerCookie = await login(base, { email: owner.email, password: 'secret' });
  const adminCookie = await login(base, { email: admin.email, password: 'secret' });

  const denied = await followState(base, 'PUT', story.id, otherCookie, { state: 'hide' });
  assert.equal(denied.status, 404);
  assert.deepEqual(denied.body, { ok: false, error: 'Story not found' });
  const deniedDelete = await followState(base, 'DELETE', story.id, otherCookie);
  assert.equal(deniedDelete.status, 404);
  assert.deepEqual(deniedDelete.body, { ok: false, error: 'Story not found' });

  const missingPut = await followState(base, 'PUT', 'missing-story', otherCookie, { state: 'follow' });
  assert.equal(missingPut.status, 404);
  assert.deepEqual(missingPut.body, { ok: false, error: 'Story not found' });
  const missingDelete = await followState(base, 'DELETE', 'missing-story', otherCookie);
  assert.equal(missingDelete.status, 404);
  assert.deepEqual(missingDelete.body, { ok: false, error: 'Story not found' });
  assert.deepEqual(await listFollowStates(pool, other.id), []);

  const owned = await followState(base, 'PUT', story.id, ownerCookie, { state: 'hide' });
  assert.equal(owned.status, 200);
  const ownerHidden = await getDashboard(base, ownerCookie);
  assert.deepEqual(ownerHidden.body, { ...EMPTY, hidden: [{ id: story.id, title: 'Private' }] });
  const ownerClear = await followState(base, 'DELETE', story.id, ownerCookie);
  assert.equal(ownerClear.status, 204);
  assert.equal(ownerClear.text, '');
  const ownerAfter = await getDashboard(base, ownerCookie);
  assert.deepEqual(ownerAfter.body, { ...EMPTY, developing: [bare(story)] });

  const adminHide = await followState(base, 'PUT', story.id, adminCookie, { state: 'hide' });
  assert.equal(adminHide.status, 200);
  const adminRows = await listFollowStates(pool, admin.id);
  assert.equal(adminRows.length, 1);
  assert.equal(adminRows[0]?.state, 'hide');
  assert.deepEqual(adminHide.body, { ok: true, state: 'hide', updatedAt: adminRows[0]?.updatedAt });
  const asAdmin = await getDashboard(base, adminCookie);
  assert.deepEqual(asAdmin.body, { ...EMPTY, hidden: [{ id: story.id, title: 'Private' }] });

  const adminClear = await followState(base, 'DELETE', story.id, adminCookie);
  assert.equal(adminClear.status, 204);
  assert.equal(adminClear.text, '');
  const adminAfter = await getDashboard(base, adminCookie);
  assert.deepEqual(adminAfter.body, { ...EMPTY, developing: [bare(story)] });
  assert.deepEqual(await listFollowStates(pool, admin.id), []);
});

test('a missing state or mute is 400 and writes nothing', async (t) => {
  const pool = await scratch(t);
  const reader = await user(pool, 'reader');
  const story = await hub(pool, 'Shared');
  const base = await serve(t, { ingest: ingest(pool), accounts: createAccounts(pool, {}) });
  const cookie = await login(base, { email: reader.email, password: 'secret' });

  const missing = await followState(base, 'PUT', story.id, cookie, {});
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body, { ok: false, error: 'state must be follow or hide' });
  assert.deepEqual(await listFollowStates(pool, reader.id), []);

  const mute = await followState(base, 'PUT', story.id, cookie, { state: 'mute' });
  assert.equal(mute.status, 400);
  assert.deepEqual(mute.body, { ok: false, error: 'state must be follow or hide' });
  assert.equal(await followRowCount(pool), 0);
  assert.deepEqual(await listFollowStates(pool, reader.id), []);

  const dash = await getDashboard(base, cookie);
  assert.equal(dash.status, 200);
  assert.deepEqual(dash.body, { ...EMPTY, developing: [bare(story)] });
});
