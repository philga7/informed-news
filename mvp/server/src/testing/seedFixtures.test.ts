import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test, type TestContext } from 'node:test';
import express from 'express';
import type { Pool } from 'pg';
import { createIngestRouter } from '../ingest/ingestRoutes.js';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { ensureTestAgent, scratchSchemaPool, TEST_AGENT_TOKEN } from './dashboardTestDb.js';
import { seedCategory, seedFixture } from './seedFixtures.js';

const TOKEN = TEST_AGENT_TOKEN;
let pool: Pool;
let drop: () => Promise<void>;

before(async () => {
  ({ pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL));
  await ensureDashboardSchema(pool);
  await ensureTestAgent(pool);
  await seedCategory(pool);
});

after(async () => {
  await drop();
});

type Fixture = typeof seedFixture;
type Item = Fixture['items'][number];
type StoryItem = Extract<Item, { kind: 'story' }>;
type EntryItem = Extract<Item, { kind: 'entry' }>;

async function serve(t: TestContext) {
  const app = express().use(
    '/api/ingest',
    createIngestRouter({ pool, ready: () => Promise.resolve() }),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
  return {
    post: (body: unknown) => fetch(`${base}/api/ingest`, { method: 'POST', headers, body: JSON.stringify(body) }),
    get: async (kind: string, id: string) => {
      const res = await fetch(`${base}/api/ingest/${kind}/${encodeURIComponent(id)}`, { headers });
      assert.equal(res.status, 200, id);
      return ((await res.json()) as { item: Record<string, any> }).item;
    },
  };
}

const stories = () => seedFixture.items.filter((i): i is StoryItem => i.kind === 'story');
const entries = () => seedFixture.items.filter((i): i is EntryItem => i.kind === 'entry');

test('the batch is created in order, read back, and unchanged on a second post', async (t) => {
  const api = await serve(t);
  const first = await api.post({ items: seedFixture.items });
  assert.equal(first.status, 200);
  const { results } = (await first.json()) as { results: { status: number; id: string; outcome: string }[] };
  assert.equal(results.length, 7);
  results.forEach((r, i) => {
    assert.equal(r.status, 201, r.id);
    assert.equal(r.outcome, 'created');
    assert.equal(r.id, seedFixture.items[i]?.id);
  });

  for (const posted of stories()) {
    const read = await api.get('story', posted.id);
    assert.equal(read.title, posted.title);
    assert.equal(read.role, posted.role);
    assert.equal(read.status, posted.status);
    assert.deepEqual(read.categoryIds, ['iran']);
    assert.equal(read.sources.length, posted.sources.length);
    if (posted.role === 'branch') {
      assert.equal(read.hubId, 'fixture:story:iran-war');
      assert.deepEqual(
        read.links.map((l: { toStoryId: string; note: string }) => [l.toStoryId, l.note]),
        [['fixture:story:iran-war', 'Hub: Iran-US-Israel war and hostilities']],
      );
    }
  }
  assert.equal(stories().filter((s) => s.role === 'hub').length, 1);

  for (const posted of entries()) {
    const read = await api.get('entry', posted.id);
    assert.equal(read.headline, posted.headline);
    assert.equal(read.label, posted.label);
    assert.equal(read.precision, posted.precision);
    assert.equal(read.changes.length, posted.changes.length);
    const story = stories().find((s) => s.id === posted.storyId);
    assert.deepEqual(
      read.sources.map((s: { url: string; label: string; sourceId: string }) => [s.url, s.label, s.sourceId]),
      posted.sources.map((ref) => {
        const src = story?.sources.find((s) => s.id === ref.sourceId);
        return [src?.url, src?.outlet, ref.sourceId];
      }),
    );
  }

  const again = await api.post({ items: seedFixture.items });
  assert.equal(again.status, 200);
  const second = (await again.json()) as { results: { status: number; outcome: string }[] };
  assert.equal(second.results.length, 7);
  for (const r of second.results) {
    assert.equal(r.status, 200);
    assert.equal(r.outcome, 'unchanged');
  }
});
