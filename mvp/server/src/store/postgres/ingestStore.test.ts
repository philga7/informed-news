import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { testPool } from '../../testing/dashboardTestDb.js';
import { ensureDashboardSchema, readStory } from './dashboardStore.js';
import {
  putBreakingItem,
  putCfpDayNote,
  putCfpItem,
  putEntry,
  putMorningItem,
  putStory,
  readIngested,
  type IngestedStory,
  type StoryPost,
} from './ingestStore.js';
import { DashboardStoreError, type StoreErrorReason } from './storeSupport.js';
import { createCategory } from './storyDetailStore.js';
import { createUser } from './userStore.js';

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

const uid = (prefix: string) => `${prefix}:${randomUUID()}`;

async function refused(run: Promise<unknown>, reason: StoreErrorReason, message?: RegExp): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof DashboardStoreError, String(error));
    assert.equal(error.reason, reason, error.message);
    if (message) assert.match(error.message, message);
    return true;
  });
}

async function user(pool: Pool) {
  return createUser(pool, {
    email: `${randomUUID()}@example.com`,
    passwordHash: 'hash',
    displayName: 'Reader',
  });
}

function storyPost(over: Partial<StoryPost> = {}): StoryPost {
  return { id: uid('story'), role: 'hub', title: 'Hub', status: 'developing', ...over };
}

test('a story post creates the story and its nested rows; the same post again changes nothing', async (t) => {
  const pool = store(t);
  const category = await createCategory(pool, { name: `Cat ${randomUUID()}` });
  const other = await putStory(pool, storyPost());
  const post = storyPost({
    nowSummary: 'Talks resume',
    nowUpdatedAt: '2026-11-23 18:00-0500',
    sources: [{ id: uid('src'), outlet: 'Axios', url: 'https://example.com/a', groupLabel: 'US outlets' }],
    tags: [{ slug: 'ceasefire', name: '#ceasefire' }],
    categoryIds: [category.id],
    dates: [{ id: uid('date'), startsOn: '2026-11-27', endsOn: '2026-11-28', label: 'Vote' }],
    panels: [
      { id: uid('panel'), kind: 'seats', title: 'Seats', payload: { segments: [{ name: 'A', value: 61 }] } },
    ],
    links: [{ toStoryId: other.id, note: 'Same coalition' }],
  });

  assert.deepEqual(await putStory(pool, post), { id: post.id, outcome: 'created' });
  assert.deepEqual(await putStory(pool, post), { id: post.id, outcome: 'unchanged' });

  const read = (await readIngested(pool, 'story', post.id)) as IngestedStory;
  assert.equal(read.nowUpdatedAt, '2026-11-23T23:00:00.000Z');
  assert.equal(read.sources[0]?.groupLabel, 'US outlets');
  assert.deepEqual(read.tags, [{ slug: 'ceasefire', name: '#ceasefire' }]);
  assert.deepEqual(read.categoryIds, [category.id]);
  assert.equal(read.dates[0]?.endsOn, '2026-11-28');
  assert.deepEqual(read.panels[0]?.payload, { segments: [{ name: 'A', value: 61 }] });
  assert.deepEqual(read.links, [{ fromStoryId: post.id, toStoryId: other.id, note: 'Same coalition' }]);
});

test('a story re-post replaces its fields, updates nested rows by id, and deletes nothing it leaves out', async (t) => {
  const pool = store(t);
  const sourceId = uid('src');
  const keptSource = uid('src');
  const post = storyPost({
    status: 'developing',
    sources: [
      { id: sourceId, outlet: 'Axios' },
      { id: keptSource, outlet: 'Reuters' },
    ],
    tags: [{ slug: 'talks', name: 'Talks' }],
  });
  await putStory(pool, post);

  const update = {
    ...post,
    status: 'stalled' as const,
    nowSummary: 'No change',
    sources: [{ id: sourceId, outlet: 'Axios', title: 'Probes vowed' }],
    tags: [{ slug: 'talks', name: '#talks' }],
  };
  assert.equal((await putStory(pool, update)).outcome, 'updated');
  const read = (await readIngested(pool, 'story', post.id)) as IngestedStory;
  assert.equal(read.status, 'stalled');
  assert.equal(read.nowSummary, 'No change');
  assert.deepEqual(
    read.sources.map((source) => [source.id, source.title]).sort(),
    [
      [keptSource, null],
      [sourceId, 'Probes vowed'],
    ].sort(),
  );
  assert.deepEqual(read.tags, [{ slug: 'talks', name: '#talks' }]);

  // A nested change alone still counts as an update.
  assert.equal(
    (await putStory(pool, { ...update, sources: [{ id: sourceId, outlet: 'Axios', title: 'Changed' }] })).outcome,
    'updated',
  );

  await refused(
    putStory(pool, { ...update, role: 'branch', hubId: (await putStory(pool, storyPost())).id }),
    'conflict',
    /role and hub cannot change/,
  );
});

test('a nested id that belongs to another story, a repeated id, or a missing category is refused', async (t) => {
  const pool = store(t);
  const first = storyPost({ sources: [{ id: uid('src'), outlet: 'Axios' }] });
  await putStory(pool, first);
  const taken = first.sources?.[0]?.id ?? '';
  const second = storyPost({ sources: [{ id: taken, outlet: 'Axios' }] });
  await refused(putStory(pool, second), 'conflict', /belongs to another story/);
  assert.equal(await readStory(pool, second.id), null, 'nothing of a refused post is kept');

  await refused(
    putStory(pool, storyPost({ dates: [
      { id: 'd1', startsOn: '2026-11-27', label: 'A' },
      { id: 'd1', startsOn: '2026-11-28', label: 'B' },
    ] })),
    'invalid',
    /listed twice/,
  );
  await refused(putStory(pool, storyPost({ categoryIds: ['no-such-category'] })), 'missing');
  await refused(
    putStory(pool, storyPost({ panels: [{ id: uid('p'), kind: 'seats', title: 'Seats', payload: { segments: [] } }] })),
    'invalid',
    /segments must hold/,
  );
  await refused(putStory(pool, storyPost({ id: 'bad id' })), 'invalid', /id must be/);
});

test('private stories: the owner is a user id, may change or clear, and the branch rules hold', async (t) => {
  const pool = store(t);
  const reader = await user(pool);
  const other = await user(pool);
  const post = storyPost({ ownerUserId: reader.id });
  assert.equal((await putStory(pool, post)).outcome, 'created');
  assert.equal((await readStory(pool, post.id))?.ownerUserId, reader.id);

  assert.equal((await putStory(pool, { ...post, ownerUserId: other.id })).outcome, 'updated');
  assert.equal((await readStory(pool, post.id))?.ownerUserId, other.id);
  assert.equal((await putStory(pool, { ...post, ownerUserId: null })).outcome, 'updated');
  assert.equal((await readStory(pool, post.id))?.ownerUserId, null, 'made shared');

  await refused(putStory(pool, storyPost({ ownerUserId: 'no-such-user' })), 'missing');

  // A disabled account still has an id, and is accepted as an owner.
  await pool.query('UPDATE users SET disabled_at = now() WHERE id = $1', [other.id]);
  assert.equal((await putStory(pool, storyPost({ ownerUserId: other.id }))).outcome, 'created');

  const sharedHub = storyPost();
  await putStory(pool, sharedHub);
  await putStory(pool, storyPost({ role: 'branch', hubId: sharedHub.id }));
  await refused(
    putStory(pool, { ...sharedHub, ownerUserId: reader.id }),
    'invalid',
    /a hub that has branches cannot be private/,
  );
  await refused(
    putStory(pool, storyPost({ role: 'branch', hubId: sharedHub.id, ownerUserId: reader.id })),
    'invalid',
    /a branch cannot be private/,
  );
  const privateHub = storyPost({ ownerUserId: reader.id });
  await putStory(pool, privateHub);
  await refused(
    putStory(pool, storyPost({ role: 'branch', hubId: privateHub.id })),
    'invalid',
    /cannot sit under a private hub/,
  );
});

test('an entry is fixed: the same post is unchanged, a different one is a conflict', async (t) => {
  const pool = store(t);
  const story = storyPost({ sources: [{ id: uid('src'), outlet: 'Axios', url: 'https://example.com/a' }] });
  await putStory(pool, story);
  const sourceId = story.sources?.[0]?.id ?? '';
  const entry = {
    id: uid('entry'),
    storyId: story.id,
    occurredAt: '2026-11-03',
    occurredUntil: '2026-11-04',
    precision: 'day' as const,
    headline: 'Democrats vow probes',
    label: 'reported' as const,
    changes: ['Probes vowed', 'No backing for nationalizing'],
    sources: [{ sourceId }, { url: 'https://example.com/w', label: 'Wire' }],
    tags: [
      { slug: 'probes', name: '#probes' },
      { slug: 'spacex', name: '#spacex' },
    ],
  };
  assert.equal((await putEntry(pool, entry)).outcome, 'created');
  assert.equal((await putEntry(pool, entry)).outcome, 'unchanged');
  assert.equal(
    (await putEntry(pool, { ...entry, tags: [...entry.tags].reverse() })).outcome,
    'unchanged',
    'tag order does not matter',
  );

  const read = (await readIngested(pool, 'entry', entry.id)) as { body: unknown; tags: string[]; sources: Array<{ url: string; label: string }> };
  assert.equal(read.body, null);
  assert.deepEqual(read.tags, ['probes', 'spacex']);
  assert.deepEqual(read.sources.map((s) => s.label), ['Axios', 'Wire']);
  const story2 = (await readIngested(pool, 'story', story.id)) as IngestedStory;
  assert.deepEqual(story2.tags.map((tag) => tag.slug), ['probes', 'spacex'], 'tags were created on the story');

  for (const change of [
    { headline: 'Other' },
    { label: 'official' as const },
    { changes: ['Probes vowed'] },
    { tags: [{ slug: 'probes', name: '#probes' }] },
    { sources: [{ sourceId }] },
  ]) {
    await refused(putEntry(pool, { ...entry, ...change }), 'conflict', /already stored with different content/);
  }
  await refused(putEntry(pool, { ...entry, id: uid('entry'), storyId: 'no-such-story' }), 'missing');
});

test('Breaking, CFP and Morning items are fixed; the CFP footer is replaced by day', async (t) => {
  const pool = store(t);
  const reader = await user(pool);
  const privateStory = storyPost({ ownerUserId: reader.id });
  await putStory(pool, privateStory);

  const breaking = {
    id: uid('breaking'),
    occurredAt: '2026-11-23T21:00:00Z',
    headline: 'Ruling on the probe',
    label: 'official_ruling' as const,
    storyId: privateStory.id,
  };
  assert.equal((await putBreakingItem(pool, breaking)).outcome, 'created', 'a private story is accepted');
  assert.equal((await putBreakingItem(pool, breaking)).outcome, 'unchanged');
  await refused(putBreakingItem(pool, { ...breaking, headline: 'Other' }), 'conflict');

  const cfp = { id: uid('cfp'), roundupAt: '2026-11-23T21:00:00Z', title: 'Iran strikes', url: null, status: 'working' as const };
  assert.equal((await putCfpItem(pool, cfp)).outcome, 'created');
  assert.equal((await putCfpItem(pool, cfp)).outcome, 'unchanged');
  await refused(putCfpItem(pool, { ...cfp, status: 'unconfirmed' }), 'conflict');

  const morning = {
    id: uid('morning'),
    kind: 'market' as const,
    body: 'Indices slipped; chips jumped premarket.',
    link: null,
    postedAt: '2026-11-23T11:32:00Z',
    data: { quotes: [{ label: 'S&P', value: 7520.93, changePct: -0.38 }] },
  };
  assert.equal((await putMorningItem(pool, morning)).outcome, 'created');
  assert.equal(
    (await putMorningItem(pool, { ...morning, data: { quotes: [{ changePct: -0.38, value: 7520.93, label: 'S&P' }] } }))
      .outcome,
    'unchanged',
    'key order in data does not matter',
  );
  await refused(putMorningItem(pool, { ...morning, body: 'Other' }), 'conflict');
  await refused(putMorningItem(pool, { ...morning, id: uid('m'), data: { quotes: [] } }), 'invalid');

  const day = `20${String(Math.floor(Math.random() * 70) + 30)}-01-0${1 + Math.floor(Math.random() * 9)}`;
  await pool.query('DELETE FROM cfp_day_notes WHERE day = $1', [day]);
  const note = { day, stillWorking: 'Iran blockade', dropped: null };
  assert.deepEqual(await putCfpDayNote(pool, note), { id: day, outcome: 'created' });
  assert.equal((await putCfpDayNote(pool, note)).outcome, 'unchanged');
  assert.equal((await putCfpDayNote(pool, { ...note, dropped: 'Cabinet rumor' })).outcome, 'updated');
  assert.deepEqual(await readIngested(pool, 'cfp_day_note', day), { ...note, dropped: 'Cabinet rumor' });
  assert.equal(await readIngested(pool, 'cfp_day_note', 'not-a-day'), null);
});

test('two posts racing on one new id: one is created, the other is unchanged or a conflict', async (t) => {
  const pool = store(t);
  const item = { id: uid('cfp'), roundupAt: '2026-11-23T21:00:00Z', title: 'Same', url: null };
  const results = await Promise.all([putCfpItem(pool, item), putCfpItem(pool, item), putCfpItem(pool, item)]);
  assert.deepEqual(results.map((r) => r.outcome).sort(), ['created', 'unchanged', 'unchanged']);

  const other = { id: uid('cfp'), roundupAt: '2026-11-23T21:00:00Z', title: 'A', url: null };
  const settled = await Promise.allSettled([putCfpItem(pool, other), putCfpItem(pool, { ...other, title: 'B' })]);
  assert.deepEqual(settled.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  const loser = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal((loser.reason as DashboardStoreError).reason, 'conflict');
});

test('review fixes: a citation copied from a source with no URL retries as unchanged; tagged entries race safely', async (t) => {
  const pool = store(t);
  const story = storyPost({ sources: [{ id: uid('src'), outlet: 'Pool report' }] });
  await putStory(pool, story);
  const sourceId = story.sources?.[0]?.id ?? '';
  const entry = {
    id: uid('entry'),
    storyId: story.id,
    occurredAt: '2026-11-23T18:00:00Z',
    precision: 'time' as const,
    headline: 'Pool report',
    label: 'on_record' as const,
    sources: [{ sourceId }],
    tags: [{ slug: 'pool', name: '#pool' }],
  };
  const raced = await Promise.all([putEntry(pool, entry), putEntry(pool, entry), putEntry(pool, entry)]);
  assert.deepEqual(raced.map((r) => r.outcome).sort(), ['created', 'unchanged', 'unchanged']);
  const read = (await readIngested(pool, 'entry', entry.id)) as { sources: Array<{ url: string | null; label: string }>; tags: string[] };
  assert.deepEqual(read.sources.map(({ url, label }) => ({ url, label })), [{ url: null, label: 'Pool report' }]);
  assert.deepEqual(read.tags, ['pool']);
  assert.equal((await putEntry(pool, entry)).outcome, 'unchanged');
});

test('review fixes: two first posts of one story id with different roles: one wins, the other is a conflict', async (t) => {
  const pool = store(t);
  const hub = storyPost();
  await putStory(pool, hub);
  const id = uid('story');
  const settled = await Promise.allSettled([
    putStory(pool, storyPost({ id })),
    putStory(pool, storyPost({ id, role: 'branch', hubId: hub.id })),
  ]);
  assert.deepEqual(settled.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  const loser = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal((loser.reason as DashboardStoreError).reason, 'conflict');
});
