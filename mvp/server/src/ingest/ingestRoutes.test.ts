import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test, type TestContext } from 'node:test';
import express from 'express';
import type { Pool } from 'pg';
import { createApp } from '../app.js';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { createUser } from '../store/postgres/userStore.js';
import { testPool } from '../testing/dashboardTestDb.js';
import { createIngestRouter } from './ingestRoutes.js';
import { openIngest, type IngestConfig } from './openIngest.js';

const TOKEN = 'test-ingest-token-0123456789abcdefghij';
const saved = { SESSION_SECRET: process.env.SESSION_SECRET, MVP_PASSWORD: process.env.MVP_PASSWORD };
let pool: Pool;

before(async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  await ensureDashboardSchema(pool);
});

after(async () => {
  await pool.end();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function config(over: Partial<IngestConfig> = {}): IngestConfig {
  return { token: TOKEN, pool, ready: () => Promise.resolve(), ...over };
}

async function serve(
  t: TestContext,
  ingest: IngestConfig | undefined,
  options: { whole?: boolean; warnings?: string[] } = {},
): Promise<(path: string, init?: RequestInit & { json?: unknown; token?: string | null }) => Promise<Response>> {
  const warn = (message: string) => options.warnings?.push(message);
  const app = options.whole ? createApp({ ingest }) : express().use('/api/ingest', createIngestRouter(ingest, { warn }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (path, init = {}) => {
    const { json, token = TOKEN, ...rest } = init;
    const headers: Record<string, string> = {};
    if (token !== null) headers.authorization = `Bearer ${token}`;
    if (json !== undefined) headers['content-type'] = 'application/json';
    return fetch(`${base}${path}`, {
      method: json === undefined ? 'GET' : 'POST',
      ...rest,
      headers: { ...headers, ...(rest.headers as Record<string, string> | undefined) },
      body: json === undefined ? (rest.body ?? null) : typeof json === 'string' ? json : JSON.stringify(json),
    });
  };
}

const uid = (prefix: string) => `${prefix}:${randomUUID()}`;
const story = (id = uid('story'), over: object = {}) => ({
  kind: 'story',
  id,
  role: 'hub',
  title: 'Democratic proposals to curb Musk and SpaceX',
  status: 'developing',
  ...over,
});

test('no token configured answers 503; a missing or wrong token answers 401 and reads no body', async (t) => {
  const off = await serve(t, config({ token: null }));
  assert.equal((await off('/api/ingest', { json: story() })).status, 503);
  const none = await serve(t, undefined);
  assert.equal((await none('/api/ingest', { json: story() })).status, 503);

  const on = await serve(t, config());
  for (const token of [null, 'wrong', `${TOKEN}x`, TOKEN.slice(1)]) {
    const res = await on('/api/ingest', { json: story(), token });
    assert.equal(res.status, 401, String(token));
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
  }
  const scheme = await on('/api/ingest', { json: story(), token: null, headers: { authorization: `Token ${TOKEN}` } });
  assert.equal(scheme.status, 401);
  // A wrong token with a broken body is still 401: the body is not read before the token check.
  assert.equal((await on('/api/ingest', { json: '{', token: 'wrong' })).status, 401);
  assert.equal((await on('/api/ingest/story/x', { token: null })).status, 401);
});

test('no database answers 503 after a good token, and a schema that cannot be applied answers 503', async (t) => {
  const warnings: string[] = [];
  const noDb = await serve(t, config({ pool: null }));
  assert.equal((await noDb('/api/ingest', { json: story() })).status, 503);
  const down = await serve(t, config({ ready: () => Promise.reject(Object.assign(new Error('x'), { code: '08006' })) }), { warnings });
  const res = await down('/api/ingest', { json: story() });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'the database cannot be reached; retry later', reason: 'unavailable' });
  assert.deepEqual(warnings, ['Ingest: the dashboard schema is not ready (08006)']);
});

test('one item: created 201, then unchanged 200; a story re-post is updated 200', async (t) => {
  const post = await serve(t, config());
  const item = story();
  const first = await post('/api/ingest', { json: item });
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { kind: 'story', id: item.id, outcome: 'created' });
  assert.deepEqual(await (await post('/api/ingest', { json: item })).json(), { kind: 'story', id: item.id, outcome: 'unchanged' });
  const update = await post('/api/ingest', { json: { ...item, status: 'stalled' } });
  assert.equal(update.status, 200);
  assert.equal(((await update.json()) as { outcome: string }).outcome, 'updated');

  const read = await post(`/api/ingest/story/${encodeURIComponent(item.id)}`);
  assert.equal(read.status, 200);
  const body = (await read.json()) as { kind: string; item: { status: string; sources: unknown[] } };
  assert.equal(body.kind, 'story');
  assert.equal(body.item.status, 'stalled');
  assert.deepEqual(body.item.sources, []);
  assert.equal((await post('/api/ingest/story/no-such-story')).status, 404);
  assert.equal((await post('/api/ingest/widget/x')).status, 404);
});

test('a Morning item reads back with its card as `card`, not `kind` (NEWS-272)', async (t) => {
  const post = await serve(t, config());
  for (const card of ['bluf', 'weather', 'market', 'osint']) {
    const data =
      card === 'weather'
        ? { unit: 'F', issuedAt: '2026-11-20T06:32:00-05:00', days: ['2026-11-20'], locations: [{ name: 'Dahlonega', days: [{ high: 57, low: 51 }] }] }
        : card === 'market' ? { quotes: [{ label: 'S&P', value: 7520.93 }] } : undefined;
    const item = { kind: 'morning', id: uid('m'), card, body: `The ${card} card.`, postedAt: '2026-11-23T11:32:00Z', ...(data ? { data } : {}) };
    assert.equal((await post('/api/ingest', { json: item })).status, 201, card);
    const read = (await (await post(`/api/ingest/morning/${encodeURIComponent(item.id)}`)).json()) as {
      kind: string;
      item: Record<string, unknown>;
    };
    assert.equal(read.kind, 'morning');
    assert.equal(read.item.card, card);
    assert.equal('kind' in read.item, false, 'the card name is not under kind');
    assert.equal(read.item.body, item.body);
  }
});

test('a missing reference answers 422 missing and names the field and id, never a constraint (NEWS-273)', async (t) => {
  const post = await serve(t, config());
  const hub = story();
  assert.equal((await post('/api/ingest', { json: hub })).status, 201);
  const entry = { kind: 'entry', id: uid('entry'), storyId: hub.id, occurredAt: '2026-11-23T18:45:00Z', precision: 'time', headline: 'H', label: 'working' };
  assert.equal((await post('/api/ingest', { json: entry })).status, 201);
  const breaking = { kind: 'breaking', occurredAt: '2026-11-23T21:00:00Z', headline: 'Ping', label: 'single_outlet' };

  const cases: Array<[string, string, unknown]> = [
    ['storyId', 'qa:none', { ...breaking, id: uid('b'), storyId: 'qa:none' }],
    ['entryId', 'qa:no-entry', { ...breaking, id: uid('b'), storyId: hub.id, entryId: 'qa:no-entry' }],
    ['storyId', 'qa:none', { ...entry, id: uid('entry'), storyId: 'qa:none' }],
    ['sourceId', 'qa:no-source', { ...entry, id: uid('entry'), sources: [{ sourceId: 'qa:no-source' }] }],
    ['hubId', 'qa:no-hub', story(undefined, { role: 'branch', hubId: 'qa:no-hub' })],
  ];
  for (const [field, id, json] of cases) {
    const res = await post('/api/ingest', { json });
    const body = (await res.json()) as { error: string; reason: string };
    assert.equal(res.status, 422, body.error);
    assert.equal(body.reason, 'missing');
    assert.equal(body.error, `${field} ${id} does not exist`);
    assert.doesNotMatch(body.error, /_fkey|_id\b|breaking_items|story_entries|stories/);
  }
});

test('a refused item answers 409 or 422 with a reason and no SQL text', async (t) => {
  const post = await serve(t, config());
  const item = story();
  await post('/api/ingest', { json: item });
  const entry = {
    kind: 'entry',
    id: uid('entry'),
    storyId: item.id,
    occurredAt: '2026-11-23T18:45:00-0500',
    precision: 'time',
    headline: 'Democrats vow probes of Musk businesses',
    label: 'reported',
    changes: ['Probes vowed'],
    tags: [{ slug: 'probes', name: '#probes' }],
    sources: [{ url: 'https://example.com/axios', label: 'Axios' }],
  };
  assert.equal((await post('/api/ingest', { json: entry })).status, 201);
  const cases: Array<[unknown, number, RegExp]> = [
    [{ ...entry, headline: 'Other' }, 409, /already stored with different content/],
    [{ ...entry, id: uid('entry'), label: 'debunked' }, 422, /unexpected label debunked/],
    [{ ...entry, id: uid('entry'), occurredAt: '2026-11-23T18:45:00' }, 422, /zone offset/],
    [{ ...entry, id: uid('entry'), storyId: 'no-such-story' }, 422, /does not exist/],
    [{ ...entry, id: uid('entry'), headline: 'x'.repeat(201) }, 422, /headline is longer than 200/],
    [{ ...entry, id: uid('entry'), changes: Array(11).fill('c') }, 422, /changes holds more than 10/],
    [{ ...entry, id: uid('entry'), changes: ['x'.repeat(281)] }, 422, /changes\[0\] is longer than 280/],
    [{ ...entry, id: uid('entry'), tags: Array.from({ length: 21 }, (_, i) => ({ slug: `t${i}`, name: 'T' })) }, 422, /tags holds more than 20/],
    [{ ...entry, id: uid('entry'), headlin: 'typo' }, 422, /unknown field headlin/],
    [{ ...entry, id: 'has space' }, 422, /id must be 1 to 200/],
    [{ ...entry, kind: 'update' }, 422, /kind must be one of/],
    [{ kind: 'morning', id: uid('m'), card: 'weather', body: 'Rain', postedAt: '2026-11-23T11:32:00Z', data: { unit: 'K' } }, 422, /data.unit must be F or C/],
    [story(undefined, { ownerUserId: 'no-such-user' }), 422, /does not exist/],
    [[1, 2], 422, /an item must be an object/],
  ];
  for (const [json, status, message] of cases) {
    const res = await post('/api/ingest', { json });
    const body = (await res.json()) as { error: string; reason: string };
    assert.equal(res.status, status, `${JSON.stringify(json).slice(0, 80)} → ${body.error}`);
    assert.match(body.error, message);
    assert.doesNotMatch(body.error, /INSERT|SELECT|violates/);
  }
  assert.equal((await post('/api/ingest', { json: '{' })).status, 400);
});

test('a batch runs in order with a result per item, and one bad item does not stop the others', async (t) => {
  const post = await serve(t, config());
  const reader = await createUser(pool, { email: `${randomUUID()}@example.com`, passwordHash: 'h', displayName: 'R' });
  const hub = story(uid('story'), { ownerUserId: reader.id });
  const items = [
    hub,
    { kind: 'entry', id: uid('entry'), storyId: hub.id, occurredAt: '2026-11-03', precision: 'day', headline: 'H', label: 'working' },
    { kind: 'entry', id: uid('entry'), storyId: hub.id, occurredAt: 'yesterday', precision: 'time', headline: 'H', label: 'working' },
    { kind: 'breaking', id: uid('b'), occurredAt: '2026-11-23T21:00:00Z', headline: 'Private story ping', label: 'single_outlet', storyId: hub.id },
    { kind: 'cfp_item', id: uid('cfp'), roundupAt: '2026-11-23T21:00:00Z', title: 'Iran blockade', sourceName: '@Osint613', status: 'unconfirmed' },
    { kind: 'cfp_day_note', day: '2026-11-23', stillWorking: 'Iran blockade', dropped: null },
    { kind: 'morning', id: uid('m'), card: 'osint', body: 'Washington is pairing diplomacy with force protection.', postedAt: '2026-11-23T11:32:00Z', data: { watch: 'Whether US aircraft return to UK bases.' } },
  ];
  const res = await post('/api/ingest', { json: { items } });
  assert.equal(res.status, 200);
  const { results } = (await res.json()) as { results: Array<{ index: number; kind: string; status: number; outcome?: string; error?: string }> };
  assert.deepEqual(
    results.map((r) => [r.index, r.kind, r.status]),
    [
      [0, 'story', 201],
      [1, 'entry', 201],
      [2, 'entry', 422],
      [3, 'breaking', 201],
      [4, 'cfp_item', 201],
      [5, 'cfp_day_note', results[5]?.status === 201 ? 201 : 200],
      [6, 'morning', 201],
    ],
  );
  assert.match(results[2]?.error ?? '', /occurredAt must be a timestamp/);

  for (const bad of [{ items: [] }, { items: 'x' }, { items: Array(101).fill(hub) }, { items: [hub], kind: 'story' }]) {
    assert.equal((await post('/api/ingest', { json: bad })).status, 422);
  }
});

test('mounted in the app: no session needed, ahead of the 100 KB /api parser, up to 1 MB', async (t) => {
  const post = await serve(t, config(), { whole: true });
  // Without the token the app's own session guard is not what answers.
  const unauth = await post('/api/ingest', { json: story(), token: null });
  assert.equal(unauth.status, 401);
  assert.deepEqual(await unauth.json(), { error: 'a valid ingest token is required' });

  const big = story(uid('story'), {
    sources: Array.from({ length: 200 }, (_, i) => ({ id: uid(`s${i}`), outlet: 'Outlet', note: 'n'.repeat(800) })),
  });
  assert.ok(JSON.stringify(big).length > 150_000);
  assert.equal((await post('/api/ingest', { json: big })).status, 201);

  const huge = { items: [story(uid('story'), { nowSummary: 'x'.repeat(1_100_000) })] };
  assert.equal((await post('/api/ingest', { json: huge })).status, 413);
});

test('openIngest: off without a token or with a short one; on with a token and Postgres settings', () => {
  const logs: string[] = [];
  const opts = { log: (m: string) => logs.push(m), warn: (m: string) => logs.push(m) };
  assert.equal(openIngest({}, opts).token, null);
  assert.equal(openIngest({ INGEST_TOKEN: 'short' }, opts).token, null);
  const noDb = openIngest({ INGEST_TOKEN: TOKEN }, opts);
  assert.equal(noDb.token, TOKEN);
  assert.equal(noDb.pool, null);
  assert.ok(logs.some((m) => m.startsWith('Ingest off: INGEST_TOKEN is not set')));
  assert.ok(logs.some((m) => m.includes('at least 32 characters')));
  assert.ok(logs.every((m) => !m.includes(TOKEN)), 'the token is never logged');
});

test('review fixes: bearer in any case, null sort, names on a parse failure, the request row cap, other body errors', async (t) => {
  const post = await serve(t, config());
  const lower = await post('/api/ingest', { json: story(), token: null, headers: { authorization: `bearer ${TOKEN}` } });
  assert.equal(lower.status, 201);

  const withPanel = story(uid('story'), {
    panels: [{ id: uid('p'), kind: 'polls', title: 'Polls', payload: { a: 1 }, sort: null }],
  });
  assert.equal((await post('/api/ingest', { json: withPanel })).status, 201);

  const res = await post('/api/ingest', {
    json: { items: [{ kind: 'entry', id: 'e-1', headlin: 'typo' }, { kind: 'cfp_day_note', day: 'Monday' }, { kind: 7 }] },
  });
  const { results } = (await res.json()) as { results: Array<{ kind?: string; id?: string; status: number }> };
  assert.deepEqual(results.map(({ kind, id, status }) => ({ kind, id, status })), [
    { kind: 'entry', id: 'e-1', status: 422 },
    { kind: 'cfp_day_note', id: 'Monday', status: 422 },
    { kind: undefined, id: undefined, status: 422 },
  ]);

  const wide = (n: number) =>
    story(uid('story'), { sources: Array.from({ length: n }, (_, i) => ({ id: uid(`s${i}`), outlet: 'O' })) });
  const tooMany = await post('/api/ingest', { json: { items: Array.from({ length: 11 }, () => wide(199)) } });
  assert.equal(tooMany.status, 422);
  assert.match(((await tooMany.json()) as { error: string }).error, /up to 2000 rows/);
  assert.equal((await post('/api/ingest', { json: wide(201) })).status, 422, 'a nested list holds up to 200');

  const charset = await post('/api/ingest', {
    method: 'POST',
    body: JSON.stringify(story()),
    headers: { 'content-type': 'application/json; charset=latin-9' },
  });
  assert.equal(charset.status, 415);
  assert.deepEqual(await charset.json(), { error: 'the body could not be read', reason: 'invalid' });
});

test('a database that fails during a put answers 503; an unexpected error answers 500 and logs no content', async (t) => {
  const lost = { connect: async () => { throw Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), { code: 'ECONNREFUSED' }); } };
  const warnings: string[] = [];
  const down = await serve(t, config({ pool: lost as unknown as Pool }), { warnings });
  const res = await down('/api/ingest', { json: story() });
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { reason: string }).reason, 'unavailable');

  const odd = { connect: async () => { throw new TypeError('secret-content from the post'); } };
  const broken = await serve(t, config({ pool: odd as unknown as Pool }), { warnings });
  const item = story();
  const failed = await broken('/api/ingest', { json: item });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { kind: 'story', id: item.id, error: 'the item could not be stored', reason: 'error' });
  assert.ok(warnings.some((w) => w === 'Ingest: database unreachable during story put'));
  assert.ok(warnings.some((w) => w.startsWith('Ingest: unexpected TypeError (no code) during story put')));
  assert.ok(warnings.every((w) => !w.includes('secret-content') && !w.includes(TOKEN)));
});
