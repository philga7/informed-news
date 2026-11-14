import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import {
  createCfpRoundupItem,
  createMorningItem,
  createStory,
  createStoryEntry,
  ensureDashboardSchema,
  readCfpRoundupItem,
  readMorningItem,
  readStory,
  readStoryEntry,
} from './dashboardStore.js';

function testPool(): Pool {
  const connectionString = process.env.INFORMED_NEWS_TEST_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('INFORMED_NEWS_TEST_DATABASE_URL is required');
  }
  return new Pool({ connectionString });
}

test('create and read a hub story and a branch that is part of it', async (t) => {
  const pool = testPool();
  t.after(() => pool.end());
  await ensureDashboardSchema(pool);

  const hub = await createStory(pool, { role: 'hub', hubId: null, title: 'Gulf talks' });
  assert.equal(hub.hubId, null);
  assert.deepEqual(await readStory(pool, hub.id), hub);

  const branch = await createStory(pool, {
    role: 'branch',
    hubId: hub.id,
    title: 'Envoy travel',
  });
  assert.equal(branch.hubId, hub.id);
  assert.deepEqual(await readStory(pool, branch.id), branch);
  assert.equal(await readStory(pool, 'missing-story'), null);
});

test('a hub cannot point at another story and a branch needs a hub', async (t) => {
  const pool = testPool();
  t.after(() => pool.end());
  await ensureDashboardSchema(pool);
  await assert.rejects(
    createStory(pool, { role: 'hub', hubId: 'hub-1', title: 'Hub' }),
    /a hub has no hub/,
  );
  await assert.rejects(
    createStory(pool, { role: 'branch', hubId: null, title: 'Branch' }),
    /a branch requires a hub/,
  );
});

test('create and read a story entry with its source', async (t) => {
  const pool = testPool();
  t.after(() => pool.end());
  await ensureDashboardSchema(pool);
  const hub = await createStory(pool, { role: 'hub', hubId: null, title: 'Timeline' });
  const created = await createStoryEntry(pool, {
    storyId: hub.id,
    occurredAt: '2026-11-14T15:04:00.000Z',
    body: 'Talks ended with no breakthrough.',
    sources: [{ url: 'https://example.com/talks', label: 'Wire' }],
  });
  const read = await readStoryEntry(pool, created.id);
  assert.ok(read);
  assert.equal(read.storyId, hub.id);
  assert.equal(read.body, 'Talks ended with no breakthrough.');
  assert.equal(Date.parse(read.occurredAt), Date.parse('2026-11-14T15:04:00.000Z'));
  assert.equal(read.sources.length, 1);
  assert.equal(read.sources[0]?.url, 'https://example.com/talks');
  assert.equal(read.sources[0]?.label, 'Wire');
  assert.equal(read.sources[0]?.id, created.sources[0]?.id);
  assert.equal(await readStoryEntry(pool, 'missing-entry'), null);
});

test('create and read a Morning item', async (t) => {
  const pool = testPool();
  t.after(() => pool.end());
  await ensureDashboardSchema(pool);
  const created = await createMorningItem(pool, {
    kind: 'bluf',
    body: 'One line for the morning.',
    link: 'https://example.com/morning',
    postedAt: '2026-11-14T11:00:00.000Z',
  });
  const read = await readMorningItem(pool, created.id);
  assert.deepEqual(read, {
    ...created,
    postedAt: new Date(created.postedAt).toISOString(),
  });
  assert.equal(await readMorningItem(pool, 'missing-morning'), null);
});

test('create and read a CFP roundup item', async (t) => {
  const pool = testPool();
  t.after(() => pool.end());
  await ensureDashboardSchema(pool);
  const created = await createCfpRoundupItem(pool, {
    roundupAt: '2026-11-14T21:02:00.000Z',
    title: 'Evening roundup',
    url: 'https://example.com/cfp',
  });
  const read = await readCfpRoundupItem(pool, created.id);
  assert.ok(read);
  assert.equal(read.title, 'Evening roundup');
  assert.equal(read.url, 'https://example.com/cfp');
  assert.equal(Date.parse(read.roundupAt), Date.parse('2026-11-14T21:02:00.000Z'));
  assert.equal(await readCfpRoundupItem(pool, 'missing-cfp'), null);
});
