import assert from 'node:assert/strict';
import { before, test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import {
  DashboardStoreError,
  createBreakingItem,
  createCfpRoundupItem,
  createMorningItem,
  createStory,
  createStoryEntry,
  ensureDashboardSchema,
  readBreakingItem,
  readCfpDayNote,
  readCfpRoundupItem,
  readMorningItem,
  readStory,
  readStoryEntry,
  setCfpDayNote,
  type EntryLabel,
  type StoryEntryInput,
  type StoryStatus,
} from './dashboardStore.js';
import { ensureTestAgent, TEST_WRITER, testPool } from '../../testing/dashboardTestDb.js';
import { createStorySource } from './storyDetailStore.js';
import { ENTRY_LABELS } from './vocabulary.js';

before(async () => {
  const pool = testPool(process.env.INFORMED_NEWS_TEST_DATABASE_URL);
  try {
    await ensureDashboardSchema(pool);
    await ensureTestAgent(pool);
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
  return createStory(pool, TEST_WRITER, { role: 'hub', hubId: null, title, status: 'developing' });
}

const ENTRY: Omit<StoryEntryInput, 'storyId'> = {
  occurredAt: '2026-11-14T15:04:00.000Z',
  precision: 'time',
  headline: 'Talks end with no breakthrough',
  label: 'reported',
  body: 'Talks ended with no breakthrough.',
  sources: [],
};

test('create and read a hub story and a branch that is part of it', async (t) => {
  const pool = store(t);

  const created = await createStory(pool, TEST_WRITER, {
    role: 'hub',
    hubId: null,
    title: 'Gulf talks',
    status: 'active',
  });
  assert.equal(created.hubId, null);
  assert.equal(created.status, 'active');
  assert.equal(created.nowSummary, null);
  assert.equal(created.nextCheckAt, null);
  assert.deepEqual(await readStory(pool, created.id), created);

  const branch = await createStory(pool, TEST_WRITER, {
    role: 'branch',
    hubId: created.id,
    title: 'Envoy travel',
    status: 'waiting',
  });
  assert.equal(branch.hubId, created.id);
  assert.deepEqual(await readStory(pool, branch.id), branch);
  assert.equal(await readStory(pool, 'missing-story'), null);
});

test('a hub cannot point at another story and a branch needs a hub', async (t) => {
  const pool = store(t);
  await assert.rejects(
    createStory(pool, TEST_WRITER, { role: 'hub', hubId: 'hub-1', title: 'Hub', status: 'developing' }),
    /a hub has no hub/,
  );
  await assert.rejects(
    createStory(pool, TEST_WRITER, { role: 'branch', hubId: null, title: 'Branch', status: 'developing' }),
    /a branch requires a hub/,
  );
});

test('a story keeps its status, Now summary, cadence, check times and notes', async (t) => {
  const pool = store(t);
  const created = await createStory(pool, TEST_WRITER, {
    role: 'hub',
    hubId: null,
    title: 'Recount',
    status: 'stalled',
    nowSummary: 'The count is paused pending a ruling.',
    nowUpdatedAt: '2026-11-14T21:00:00-05:00',
    cadence: 'twice daily, 9 AM and 9 PM',
    lastCheckedAt: '2026-11-15T02:00:00Z',
    nextCheckAt: '2026-11-15T14:00:00Z',
    unchangedNote: 'No new filings.',
    earlierSummary: 'count, certification fight',
    sourcesNote: 'One outlet is behind a paywall.',
    threadUrl: 'https://example.com/thread/1',
  });
  assert.equal(created.nowUpdatedAt, '2026-11-15T02:00:00.000Z');
  assert.deepEqual(await readStory(pool, created.id), created);
});

test('a story status outside the fixed list is refused', async (t) => {
  const pool = store(t);
  await assert.rejects(
    createStory(pool, TEST_WRITER, {
      role: 'hub',
      hubId: null,
      title: 'Hub',
      status: 'working' as StoryStatus,
    }),
    { name: 'DashboardStoreError', message: /unexpected story status working/ },
  );
});

test('create and read a story entry with its headline, label, change bullets and source', async (t) => {
  const pool = store(t);
  const story = await hub(pool, 'Timeline');
  const created = await createStoryEntry(pool, TEST_WRITER, {
    ...ENTRY,
    storyId: story.id,
    label: 'official_ruling',
    changes: ['Court set a hearing date', 'Count stays paused'],
    sources: [{ url: 'https://example.com/talks', label: 'Wire' }],
  });
  const read = await readStoryEntry(pool, created.id);
  assert.deepEqual(read, created);
  assert.equal(read?.storyId, story.id);
  assert.equal(read?.headline, 'Talks end with no breakthrough');
  assert.equal(read?.label, 'official_ruling');
  assert.equal(read?.precision, 'time');
  assert.equal(read?.occurredUntil, null);
  assert.deepEqual(read?.changes, ['Court set a hearing date', 'Count stays paused']);
  assert.equal(read?.sources[0]?.url, 'https://example.com/talks');
  assert.equal(read?.sources[0]?.label, 'Wire');
  assert.equal(read?.sources[0]?.sourceId, null);
  assert.equal(await readStoryEntry(pool, 'missing-entry'), null);
});

test('entry sources read back in the order they were given', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const labels = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  const created = await createStoryEntry(pool, TEST_WRITER, {
    ...ENTRY,
    storyId: story.id,
    sources: labels.map((label) => ({ url: `https://example.com/${label}`, label })),
  });
  const read = await readStoryEntry(pool, created.id);
  assert.deepEqual(
    read?.sources.map((source) => source.label),
    labels,
  );
  assert.deepEqual(read, created);
});

test('an entry takes each of the eight labels and refuses any other', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  for (const label of ENTRY_LABELS) {
    const created = await createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id, label });
    assert.equal((await readStoryEntry(pool, created.id))?.label, label);
  }
  for (const ruledOut of ['debunked', 'rumor', 'Official ruling', 'unconfirmed']) {
    await assert.rejects(
      createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id, label: ruledOut as EntryLabel }),
      DashboardStoreError,
    );
  }
});

test('an entry needs a headline', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  await assert.rejects(
    createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id, headline: '  ' }),
    /headline is required/,
  );
});

test('a time given with a zone offset is stored and read back in UTC', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const created = await createStoryEntry(pool, TEST_WRITER, {
    ...ENTRY,
    storyId: story.id,
    occurredAt: '2026-11-14T10:04:00-05:00',
    occurredUntil: '2026-11-14T18:30:00+02:00',
  });
  assert.equal(created.occurredAt, '2026-11-14T15:04:00.000Z');
  assert.equal(created.occurredUntil, '2026-11-14T16:30:00.000Z');
  assert.deepEqual(await readStoryEntry(pool, created.id), created);
  const stored = await pool.query<{ at: string }>(
    `SELECT to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS at
     FROM story_entries WHERE id = $1`,
    [created.id],
  );
  assert.equal(stored.rows[0]?.at, '2026-11-14T15:04');
});

test('a time with no zone is refused, because it would depend on the server clock', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  await assert.rejects(
    createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id, occurredAt: '2026-02-30T10:00:00Z' }),
    /occurredAt must be a timestamp/,
  );
  for (const zoneless of ['2026-11-14T15:04:00', '2026-11-14 15:04', 'Nov 14, 2026', '2026-11-14']) {
    await assert.rejects(
      createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id, occurredAt: zoneless }),
      /occurredAt must be a timestamp with a zone offset/,
    );
  }
  await assert.rejects(
    createMorningItem(pool, TEST_WRITER, { kind: 'bluf', body: 'Body', link: null, postedAt: '2026-11-14T11:00' }),
    /postedAt must be a timestamp with a zone offset/,
  );
});

test('a day entry and a day range keep their calendar days', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const day = await createStoryEntry(pool, TEST_WRITER, {
    ...ENTRY,
    storyId: story.id,
    precision: 'day',
    occurredAt: '2026-11-05',
  });
  assert.equal(day.occurredAt, '2026-11-05T00:00:00.000Z');
  assert.equal(day.occurredUntil, null);
  assert.deepEqual(await readStoryEntry(pool, day.id), day);

  const range = await createStoryEntry(pool, TEST_WRITER, {
    ...ENTRY,
    storyId: story.id,
    precision: 'day',
    occurredAt: '2026-11-03',
    occurredUntil: '2026-11-04',
  });
  assert.equal(range.precision, 'day');
  assert.equal(range.occurredAt, '2026-11-03T00:00:00.000Z');
  assert.equal(range.occurredUntil, '2026-11-04T00:00:00.000Z');
  assert.deepEqual(await readStoryEntry(pool, range.id), range);

  await assert.rejects(
    createStoryEntry(pool, TEST_WRITER, {
      ...ENTRY,
      storyId: story.id,
      precision: 'day',
      occurredAt: '2026-11-05T09:00:00Z',
    }),
    /occurredAt must be a date \(YYYY-MM-DD\)/,
  );
  await assert.rejects(
    createStoryEntry(pool, TEST_WRITER, {
      ...ENTRY,
      storyId: story.id,
      precision: 'day',
      occurredAt: '2026-02-30',
    }),
    /occurredAt must be a date/,
  );
  await assert.rejects(
    createStoryEntry(pool, TEST_WRITER, {
      ...ENTRY,
      storyId: story.id,
      precision: 'day',
      occurredAt: '2026-11-04',
      occurredUntil: '2026-11-03',
    }),
    /occurredUntil is before occurredAt/,
  );
});

test('an entry source can point at a source of the same story, and only that story', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const other = await hub(pool, 'Other');
  const cited = await createStorySource(pool, TEST_WRITER, { storyId: story.id, outlet: 'Wire' });
  const foreign = await createStorySource(pool, TEST_WRITER, { storyId: other.id, outlet: 'Wire' });

  const created = await createStoryEntry(pool, TEST_WRITER, {
    ...ENTRY,
    storyId: story.id,
    sources: [{ url: 'https://example.com/a', label: 'Wire', sourceId: cited.id }],
  });
  assert.equal((await readStoryEntry(pool, created.id))?.sources[0]?.sourceId, cited.id);

  const entries = () =>
    pool.query('SELECT 1 FROM story_entries WHERE story_id = $1', [story.id]);
  const before = (await entries()).rowCount;
  for (const sourceId of [foreign.id, 'missing-source']) {
    await assert.rejects(
      createStoryEntry(pool, TEST_WRITER, {
        ...ENTRY,
        storyId: story.id,
        sources: [{ url: 'https://example.com/b', label: 'Wire', sourceId }],
      }),
      sourceId === 'missing-source'
        ? /sourceId missing-source does not exist/
        : /an entry can only cite a source from its own story/,
    );
  }
  assert.equal((await entries()).rowCount, before, 'a refused entry leaves nothing behind');
});

test('create and read a Morning item', async (t) => {
  const pool = store(t);
  const created = await createMorningItem(pool, TEST_WRITER, {
    kind: 'bluf',
    body: 'One line for the morning.',
    link: 'https://example.com/morning',
    postedAt: '2026-11-14T11:00:00.000Z',
  });
  assert.equal(created.data, null);
  assert.deepEqual(await readMorningItem(pool, created.id), created);
  assert.equal(await readMorningItem(pool, 'missing-morning'), null);
});

test('a Morning item can carry structured data', async (t) => {
  const pool = store(t);
  const data = {
    unit: 'F',
    issuedAt: '2026-11-16T11:32:00.000Z',
    days: ['2026-11-16', '2026-11-17'],
    locations: [
      {
        name: 'Jefferson',
        now: { temp: 52, conditions: 'clear', rainChancePct: 7 },
        days: [
          { high: 54, low: 41 },
          { high: 49, low: 37 },
        ],
      },
    ],
  };
  const created = await createMorningItem(pool, TEST_WRITER, {
    kind: 'weather',
    body: 'Rain today, colder tomorrow.',
    link: null,
    postedAt: '2026-11-16T11:00:00Z',
    data,
  });
  assert.deepEqual((await readMorningItem(pool, created.id))?.data, data);
  await assert.rejects(
    createMorningItem(pool, TEST_WRITER, {
      kind: 'market',
      body: 'Body',
      link: null,
      postedAt: '2026-11-16T11:00:00Z',
      data: ['not', 'an', 'object'] as never,
    }),
    /data must be a JSON object/,
  );
});

test('create and read a CFP roundup item', async (t) => {
  const pool = store(t);
  const created = await createCfpRoundupItem(pool, TEST_WRITER, {
    roundupAt: '2026-11-14T21:02:00.000Z',
    title: 'Evening roundup',
    url: 'https://example.com/cfp',
  });
  assert.equal(created.topic, null);
  assert.equal(created.sourceName, null);
  assert.equal(created.status, null);
  assert.deepEqual(await readCfpRoundupItem(pool, created.id), created);
  assert.equal(await readCfpRoundupItem(pool, 'missing-cfp'), null);
});

test('a CFP item can carry a topic, a source and a status, and can have no link', async (t) => {
  const pool = store(t);
  const created = await createCfpRoundupItem(pool, TEST_WRITER, {
    roundupAt: '2026-11-14T21:02:00Z',
    title: 'Port closure claim',
    url: null,
    topic: 'Shipping',
    sourceName: '@harbor_watch',
    status: 'unconfirmed',
  });
  assert.equal(created.url, null);
  assert.deepEqual(await readCfpRoundupItem(pool, created.id), created);
  const working = await createCfpRoundupItem(pool, TEST_WRITER, {
    roundupAt: '2026-11-14T21:02:00Z',
    title: 'Second item',
    url: null,
    status: 'working',
  });
  assert.equal((await readCfpRoundupItem(pool, working.id))?.status, 'working');
  await assert.rejects(
    createCfpRoundupItem(pool, TEST_WRITER, {
      roundupAt: '2026-11-14T21:02:00Z',
      title: 'Third item',
      url: null,
      status: 'reported' as 'working',
    }),
    /unexpected CFP status reported/,
  );
});

test('create and read a Breaking item, alone and pointing at a story entry', async (t) => {
  const pool = store(t);
  const alone = await createBreakingItem(pool, TEST_WRITER, {
    occurredAt: '2026-11-16T20:15:00-05:00',
    headline: 'Court blocks the order',
    label: 'official_ruling',
    sourceName: 'Reuters',
    via: 'CFP',
    url: 'https://example.com/ruling',
  });
  assert.equal(alone.occurredAt, '2026-11-17T01:15:00.000Z');
  assert.equal(alone.storyId, null);
  assert.deepEqual(await readBreakingItem(pool, alone.id), alone);
  assert.equal(await readBreakingItem(pool, 'missing-breaking'), null);

  const story = await hub(pool);
  const entry = await createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id });
  const linked = await createBreakingItem(pool, TEST_WRITER, {
    occurredAt: '2026-11-16T20:20:00Z',
    headline: 'Hearing set',
    label: 'single_outlet',
    storyId: story.id,
    entryId: entry.id,
  });
  assert.deepEqual(await readBreakingItem(pool, linked.id), linked);
  assert.equal(linked.entryId, entry.id);

  const storyOnly = await createBreakingItem(pool, TEST_WRITER, {
    occurredAt: '2026-11-16T20:25:00Z',
    headline: 'More to come',
    label: 'working',
    storyId: story.id,
  });
  assert.equal((await readBreakingItem(pool, storyOnly.id))?.entryId, null);
});

test('a Breaking item refuses a label off the list and an entry from another story', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const other = await hub(pool, 'Other');
  const entry = await createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id });
  const item = { occurredAt: '2026-11-16T20:20:00Z', headline: 'Headline', label: 'reported' } as const;

  await assert.rejects(
    createBreakingItem(pool, TEST_WRITER, { ...item, label: 'unconfirmed' as EntryLabel }),
    /unexpected label unconfirmed/,
  );
  await assert.rejects(
    createBreakingItem(pool, TEST_WRITER, { ...item, entryId: entry.id }),
    /a Breaking item with an entry must name its story/,
  );
  await assert.rejects(
    createBreakingItem(pool, TEST_WRITER, { ...item, storyId: other.id, entryId: entry.id }),
    /a Breaking item can only point at an entry of its own story/,
  );
});

test('set, replace and read the CFP footer for a day', async (t) => {
  const pool = store(t);
  // The day is the key and the test database is shared, so take a day no other run has used.
  let day = '';
  do {
    const offset = Math.floor(Math.random() * 2_000_000);
    day = new Date(Date.UTC(3000, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);
  } while ((await readCfpDayNote(pool, day)) !== null);

  const first = await setCfpDayNote(pool, TEST_WRITER, {
    day,
    stillWorking: 'Port closure, two sources pending',
    dropped: null,
  });
  assert.deepEqual(first, { day, stillWorking: 'Port closure, two sources pending', dropped: null });
  assert.deepEqual(await readCfpDayNote(pool, day), first);

  const second = await setCfpDayNote(pool, TEST_WRITER, {
    day,
    stillWorking: null,
    dropped: 'Port closure: could not confirm',
  });
  assert.deepEqual(await readCfpDayNote(pool, day), second);
  assert.equal(second.stillWorking, null);

  await assert.rejects(
    setCfpDayNote(pool, TEST_WRITER, { day: `${day}T00:00:00Z`, stillWorking: null, dropped: null }),
    /day must be a date \(YYYY-MM-DD\)/,
  );
});

test('NEWS-228: an entry may have no body; a cited source fills in its URL and outlet', async (t) => {
  const pool = store(t);
  const story = await hub(pool);
  const withUrl = await createStorySource(pool, TEST_WRITER, {
    storyId: story.id,
    outlet: 'Axios',
    url: 'https://example.com/axios',
  });
  const noUrl = await createStorySource(pool, TEST_WRITER, { storyId: story.id, outlet: 'Pool report' });

  const created = await createStoryEntry(pool, TEST_WRITER, {
    ...ENTRY,
    body: undefined,
    storyId: story.id,
    sources: [
      { sourceId: withUrl.id },
      { sourceId: noUrl.id },
      { sourceId: withUrl.id, url: 'https://example.com/other', label: 'Axios PM' },
      { url: 'https://example.com/wire', label: 'Wire' },
    ],
  });
  const read = await readStoryEntry(pool, created.id);
  assert.equal(read?.body, null);
  assert.deepEqual(
    read?.sources.map(({ url, label, sourceId }) => ({ url, label, sourceId })),
    [
      { url: 'https://example.com/axios', label: 'Axios', sourceId: withUrl.id },
      { url: null, label: 'Pool report', sourceId: noUrl.id },
      { url: 'https://example.com/other', label: 'Axios PM', sourceId: withUrl.id },
      { url: 'https://example.com/wire', label: 'Wire', sourceId: null },
    ],
  );
  assert.deepEqual(read, created);

  const blank = await createStoryEntry(pool, TEST_WRITER, { ...ENTRY, body: '  ', storyId: story.id });
  assert.equal(blank.body, null);

  for (const source of [{ label: 'Wire' }, { url: 'https://example.com/x' }]) {
    await assert.rejects(
      createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: story.id, sources: [source] }),
      /source (url|label) is required/,
    );
  }
});

test('NEWS-228: creates take a caller id, and a second create with that id is a conflict', async (t) => {
  const pool = store(t);
  const suffix = Math.random().toString(36).slice(2);
  const story = await createStory(pool, TEST_WRITER, {
    id: `grok:story:${suffix}`,
    role: 'hub',
    hubId: null,
    title: 'Hub',
    status: 'active',
  });
  assert.equal(story.id, `grok:story:${suffix}`);
  assert.equal((await readStory(pool, story.id))?.title, 'Hub');

  const entry = await createStoryEntry(pool, TEST_WRITER, { ...ENTRY, id: `grok:entry:${suffix}`, storyId: story.id });
  const morning = await createMorningItem(pool, TEST_WRITER, {
    id: `grok:morning:${suffix}`,
    kind: 'bluf',
    body: 'One line.',
    link: null,
    postedAt: '2026-11-23T11:00:00Z',
  });
  const cfp = await createCfpRoundupItem(pool, TEST_WRITER, {
    id: `grok:cfp:${suffix}`,
    roundupAt: '2026-11-23T21:00:00Z',
    title: 'Iran strikes',
    url: null,
  });
  const breaking = await createBreakingItem(pool, TEST_WRITER, {
    id: `grok:breaking:${suffix}`,
    occurredAt: '2026-11-23T21:00:00Z',
    headline: 'Ruling',
    label: 'official_ruling',
  });

  const again: Array<() => Promise<unknown>> = [
    () => createStory(pool, TEST_WRITER, { id: story.id, role: 'hub', hubId: null, title: 'Hub', status: 'active' }),
    () => createStoryEntry(pool, TEST_WRITER, { ...ENTRY, id: entry.id, storyId: story.id }),
    () => createMorningItem(pool, TEST_WRITER, { id: morning.id, kind: 'bluf', body: 'x', link: null, postedAt: '2026-11-23T11:00:00Z' }),
    () => createCfpRoundupItem(pool, TEST_WRITER, { id: cfp.id, roundupAt: '2026-11-23T21:00:00Z', title: 'x', url: null }),
    () => createBreakingItem(pool, TEST_WRITER, { id: breaking.id, occurredAt: '2026-11-23T21:00:00Z', headline: 'x', label: 'official' }),
  ];
  for (const create of again) {
    await assert.rejects(create(), (error: unknown) => {
      assert.ok(error instanceof DashboardStoreError);
      assert.equal(error.reason, 'conflict');
      return true;
    });
  }
  await assert.rejects(
    createStory(pool, TEST_WRITER, { id: 'has space', role: 'hub', hubId: null, title: 'x', status: 'active' }),
    /id must be 1 to 200/,
  );
});

test('NEWS-228: a missing story is a store error with reason missing, not a raw foreign-key error', async (t) => {
  const pool = store(t);
  for (const create of [
    () => createStoryEntry(pool, TEST_WRITER, { ...ENTRY, storyId: 'no-such-story' }),
    () => createStory(pool, TEST_WRITER, { role: 'branch', hubId: 'no-such-hub', title: 'B', status: 'active' }),
    () =>
      createBreakingItem(pool, TEST_WRITER, {
        occurredAt: '2026-11-23T21:00:00Z',
        headline: 'x',
        label: 'official',
        storyId: 'no-such-story',
      }),
  ]) {
    await assert.rejects(create(), (error: unknown) => {
      assert.ok(error instanceof DashboardStoreError);
      assert.equal(error.reason, 'missing');
      return true;
    });
  }
});
