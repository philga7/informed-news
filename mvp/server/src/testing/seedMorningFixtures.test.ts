import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test, type TestContext } from 'node:test';
import express from 'express';
import type { Pool } from 'pg';
import { createIngestRouter } from '../ingest/ingestRoutes.js';
import { ensureDashboardSchema } from '../store/postgres/dashboardStore.js';
import { scratchSchemaPool } from './dashboardTestDb.js';
import { seedCategory, seedFixture, seedMorningFixture } from './seedFixtures.js';

const TOKEN = 'test-ingest-token-0123456789abcdefghij';
let pool: Pool;
let drop: () => Promise<void>;

before(async () => {
  ({ pool, drop } = await scratchSchemaPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL));
  await ensureDashboardSchema(pool);
  await seedCategory(pool);
});

after(async () => {
  await drop();
});

type Item = (typeof seedMorningFixture)['items'][number];
type Of<K extends Item['kind']> = Extract<Item, { kind: K }>;

async function serve(t: TestContext) {
  const app = express().use(
    '/api/ingest',
    createIngestRouter({ token: TOKEN, pool, ready: () => Promise.resolve() }),
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

const items = seedMorningFixture.items;
const ofKind = <K extends Item['kind']>(kind: K) => items.filter((i): i is Of<K> => i.kind === kind);

test('the batch is created, read back, and unchanged on a second post', async (t) => {
  const api = await serve(t);
  const stories = await api.post({ items: seedFixture.items });
  assert.equal(stories.status, 200);

  assert.equal(items.length, 29);
  assert.equal(ofKind('breaking').length, 5);
  assert.equal(ofKind('cfp_item').length, 19);
  assert.equal(ofKind('cfp_day_note').length, 1);
  assert.equal(ofKind('morning').length, 4);

  const first = await api.post({ items });
  assert.equal(first.status, 200);
  const { results } = (await first.json()) as { results: { status: number; id: string; outcome: string }[] };
  assert.equal(results.length, 29);
  for (const r of results) {
    assert.equal(r.status, 201, r.id);
    assert.equal(r.outcome, 'created');
  }

  for (const posted of ofKind('breaking')) {
    const read = await api.get('breaking', posted.id);
    assert.equal(read.headline, posted.headline);
    assert.equal(read.label, posted.label);
    assert.equal(read.sourceName, posted.sourceName);
    assert.equal(read.via, posted.via ?? null);
    assert.equal(read.storyId, posted.storyId ?? null);
  }
  const links = Object.fromEntries(ofKind('breaking').map((b) => [b.id.split(':')[2], b.storyId]));
  assert.deepEqual(links, {
    '202611122100-cec-likud-materials': undefined,
    '202611121700-sirik-strike': 'fixture:story:iran-war',
    '202611121200-huang-resigns': undefined,
    '202611120900-security-cabinet-readiness': 'fixture:story:iran-war',
    '202611120900-trump-no-deal': 'fixture:story:iran-strike-decision',
  });

  for (const posted of ofKind('cfp_item')) {
    const read = await api.get('cfp_item', posted.id);
    assert.equal(read.title, posted.title);
    assert.equal(read.topic, posted.topic);
    assert.equal(read.status, posted.status ?? null, posted.id);
  }

  const note = await api.get('cfp_day_note', '2026-11-12');
  assert.equal(note.stillWorking, 'US role in the Sirik strike');
  assert.equal(note.dropped, 'Trump–Netanyahu “shouting match”; Baghdad Green Zone clashes');

  for (const posted of ofKind('morning')) {
    const read = await api.get('morning', posted.id);
    assert.equal(read.card, posted.card);
    assert.equal(read.body, posted.body);
  }

  const weather = (await api.get('morning', 'grok:morning:weather:2026-11-12')).data;
  assert.equal(weather.locations.length, 3);
  assert.equal(weather.days.length, 4);
  for (const loc of weather.locations) assert.equal(loc.days.length, 4, loc.name);
  const byName = Object.fromEntries(weather.locations.map((l: { name: string }) => [l.name, l]));
  assert.equal(byName.Dahlonega.alert, 'Freeze Watch: lows to 29, 2–8 AM Sat');
  assert.equal(byName.Jefferson.note, 'Fri night 35, patchy frost (NWS)');
  assert.equal(byName.Statesboro.alert, undefined);

  const market = (await api.get('morning', 'grok:morning:market:2026-11-11')).data;
  assert.deepEqual(
    market.quotes.map((q: { label: string; value: number; changePct?: number }) => [q.label, q.value, q.changePct]),
    [
      ['S&P', 7520.93, -0.38],
      ['Nasdaq', 25065.88, -0.74],
      ['VIX', 18.65, undefined],
    ],
  );

  const again = await api.post({ items });
  assert.equal(again.status, 200);
  const second = (await again.json()) as { results: { status: number; outcome: string }[] };
  assert.equal(second.results.length, 29);
  for (const r of second.results) {
    assert.equal(r.status, 200);
    assert.equal(r.outcome, 'unchanged');
  }
});
