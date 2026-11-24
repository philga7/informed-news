import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { createStory, createStoryEntry, ensureDashboardSchema } from './dashboardStore.js';
import { DashboardStoreError } from './storeSupport.js';
import { testPool } from '../../testing/dashboardTestDb.js';
import {
  addEntryTag,
  addStoryCategory,
  createCategory,
  createStoryDate,
  createStoryLink,
  createStoryPanel,
  createStorySource,
  createStoryTag,
  listEntryTags,
  listStoryCategories,
  readCategory,
  readStoryDate,
  readStoryLink,
  readStoryPanel,
  readStorySource,
  readStoryTag,
} from './storyDetailStore.js';

const UNIQUE_VIOLATION = '23505';

before(async () => {
  const pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  try {
    await ensureDashboardSchema(pool);
  } finally {
    await pool.end();
  }
});

function store(t: TestContext): Pool {
  const pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  t.after(() => pool.end());
  return pool;
}

function hub(pool: Pool, title = 'Hub') {
  return createStory(pool, { role: 'hub', hubId: null, title, status: 'developing' });
}

function entry(pool: Pool, storyId: string) {
  return createStoryEntry(pool, {
    storyId,
    occurredAt: '2026-11-14T15:04:00Z',
    precision: 'time',
    headline: 'Headline',
    label: 'reported',
    body: 'Body',
    sources: [],
  });
}

/** Category names are unique across the table, and the test database is shared. */
function unique(name: string): string {
  return `${name} ${randomUUID()}`;
}

test('create and read a category, and put a story in several', async (t) => {
  const pool = store(t);
  const politics = await createCategory(pool, { name: unique('Politics'), sort: 2 });
  const courts = await createCategory(pool, { name: unique('Courts'), sort: 1 });
  assert.deepEqual(await readCategory(pool, politics.id), politics);
  assert.equal((await createCategory(pool, { name: unique('Unsorted') })).sort, 0);
  assert.equal(await readCategory(pool, 'missing-category'), null);

  const story = await hub(pool);
  assert.deepEqual(await listStoryCategories(pool, story.id), []);
  await addStoryCategory(pool, { storyId: story.id, categoryId: politics.id });
  await addStoryCategory(pool, { storyId: story.id, categoryId: courts.id });
  await addStoryCategory(pool, { storyId: story.id, categoryId: courts.id });
  assert.deepEqual(await listStoryCategories(pool, story.id), [courts, politics]);
});

test('a category name is used once, and its sort is a whole number', async (t) => {
  const pool = store(t);
  const name = unique('World');
  await createCategory(pool, { name });
  await assert.rejects(createCategory(pool, { name }), { code: UNIQUE_VIOLATION });
  await assert.rejects(createCategory(pool, { name: unique('Half'), sort: 1.5 }), /sort must be a whole number/);
});

test('create and read a story tag, and tag an entry with it', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const count = await createStoryTag(pool, { storyId: story.id, slug: 'count', name: 'Count' });
  const court = await createStoryTag(pool, { storyId: story.id, slug: 'court', name: 'Court' });
  assert.deepEqual(await readStoryTag(pool, count.id), count);
  assert.equal(await readStoryTag(pool, 'missing-tag'), null);

  const tagged = await entry(pool, story.id);
  assert.deepEqual(await listEntryTags(pool, tagged.id), []);
  await addEntryTag(pool, { entryId: tagged.id, tagId: court.id });
  await addEntryTag(pool, { entryId: tagged.id, tagId: count.id });
  await addEntryTag(pool, { entryId: tagged.id, tagId: count.id });
  assert.deepEqual(await listEntryTags(pool, tagged.id), [count, court]);
});

test('a tag slug is unique within its story and free in another', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const other = await hub(pool, 'Other');
  await createStoryTag(pool, { storyId: story.id, slug: 'count', name: 'Count' });
  await assert.rejects(
    createStoryTag(pool, { storyId: story.id, slug: 'count', name: 'Count again' }),
    { code: UNIQUE_VIOLATION },
  );
  await createStoryTag(pool, { storyId: other.id, slug: 'count', name: 'Count' });
  for (const slug of ['Count', 'two words', '#count', 'count-']) {
    await assert.rejects(
      createStoryTag(pool, { storyId: story.id, slug, name: 'Count' }),
      /slug must be lowercase letters, digits and single hyphens/,
    );
  }
});

test('an entry cannot carry a tag from another story', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const other = await hub(pool, 'Other');
  const foreign = await createStoryTag(pool, { storyId: other.id, slug: 'count', name: 'Count' });
  const tagged = await entry(pool, story.id);
  for (const tagId of [foreign.id, 'missing-tag']) {
    await assert.rejects(
      addEntryTag(pool, { entryId: tagged.id, tagId }),
      /an entry can only carry a tag from its own story/,
    );
  }
  assert.deepEqual(await listEntryTags(pool, tagged.id), []);
});

test('create and read a story source', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const full = await createStorySource(pool, {
    storyId: story.id,
    outlet: 'New York Times',
    title: 'Count paused in two counties',
    url: 'https://example.com/nyt',
    publishedOn: '2026-11-05',
    via: 'DNYUZ',
    groupLabel: 'Mainstream',
    note: 'Unnamed sources',
  });
  assert.deepEqual(await readStorySource(pool, full.id), full);
  assert.equal(full.publishedOn, '2026-11-05');

  const bare = await createStorySource(pool, { storyId: story.id, outlet: 'County clerk' });
  assert.deepEqual(await readStorySource(pool, bare.id), {
    id: bare.id,
    storyId: story.id,
    outlet: 'County clerk',
    title: null,
    url: null,
    publishedOn: null,
    via: null,
    groupLabel: null,
    note: null,
  });
  assert.equal(await readStorySource(pool, 'missing-source'), null);
  await assert.rejects(
    createStorySource(pool, { storyId: story.id, outlet: 'Wire', publishedOn: '11/05/2026' }),
    /publishedOn must be a date \(YYYY-MM-DD\)/,
  );
});

test('create and read a next date, a single day or a range', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const single = await createStoryDate(pool, {
    storyId: story.id,
    startsOn: '2026-12-01',
    label: 'Certification deadline',
  });
  assert.equal(single.endsOn, null);
  assert.deepEqual(await readStoryDate(pool, single.id), single);

  const range = await createStoryDate(pool, {
    storyId: story.id,
    startsOn: '2026-11-17',
    endsOn: '2026-11-18',
    label: 'Hearing',
  });
  assert.deepEqual(await readStoryDate(pool, range.id), range);
  assert.equal(await readStoryDate(pool, 'missing-date'), null);
  await assert.rejects(
    createStoryDate(pool, {
      storyId: story.id,
      startsOn: '2026-11-18',
      endsOn: '2026-11-17',
      label: 'Hearing',
    }),
    /endsOn is before startsOn/,
  );
});

test('create and read a story panel such as Seats', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const payload = {
    segments: [
      { name: 'Bloc A', value: 58 },
      { name: 'Bloc B', value: 52 },
    ],
    threshold: 61,
    note: 'Ten seats undecided',
  };
  const created = await createStoryPanel(pool, {
    storyId: story.id,
    kind: 'seats',
    title: 'Seats',
    payload,
    sort: 1,
  });
  assert.deepEqual(await readStoryPanel(pool, created.id), created);
  assert.deepEqual((await readStoryPanel(pool, created.id))?.payload, payload);
  assert.equal(await readStoryPanel(pool, 'missing-panel'), null);
  await assert.rejects(
    createStoryPanel(pool, { storyId: story.id, kind: 'seats', title: 'Seats', payload: [] as never }),
    /payload must be a JSON object/,
  );
});

test('create and read a link between two stories, with its reason', async (t) => {
  const pool = store(t);
  const from = await hub(pool, 'From');
  const to = await hub(pool, 'To');
  const created = await createStoryLink(pool, {
    fromStoryId: from.id,
    toStoryId: to.id,
    note: 'Same court, same judge',
  });
  assert.deepEqual(await readStoryLink(pool, from.id, to.id), created);
  assert.equal(await readStoryLink(pool, to.id, from.id), null);
  await assert.rejects(
    createStoryLink(pool, { fromStoryId: from.id, toStoryId: from.id, note: 'Self' }),
    /a story cannot link to itself/,
  );
  await assert.rejects(
    createStoryLink(pool, { fromStoryId: from.id, toStoryId: to.id, note: ' ' }),
    /note is required/,
  );
});

test('NEWS-228: a story source, date or panel created twice with one id is a conflict, not a raw error', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const id = `dup:${Math.random().toString(36).slice(2)}`;
  await createStorySource(pool, { id, storyId: story.id, outlet: 'Wire' });
  await assert.rejects(createStorySource(pool, { id, storyId: story.id, outlet: 'Wire' }), (error: unknown) => {
    assert.ok(error instanceof DashboardStoreError);
    assert.equal(error.reason, 'conflict');
    return true;
  });
  await assert.rejects(createStoryDate(pool, { storyId: 'no-such-story', startsOn: '2026-11-27', label: 'Vote' }), (error: unknown) => {
    assert.ok(error instanceof DashboardStoreError);
    assert.equal(error.reason, 'missing');
    return true;
  });
});
