import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, test, type TestContext } from 'node:test';
import type { Pool } from 'pg';
import { createStory, ensureDashboardSchema, readStory } from './dashboardStore.js';
import { clearFollowState, listFollowStates, setFollowState } from './followStore.js';
import {
  listReadMarkers,
  markOpened,
  markRead,
  readMarker,
  type Tracker,
} from './readMarkerStore.js';
import {
  createUser,
  disableUser,
  findUserByEmail,
  listUsers,
  readUser,
  setUserPasswordHash,
} from './userStore.js';
import { ensureTestAgent, TEST_WRITER, testPool } from '../../testing/dashboardTestDb.js';

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

/** The shared test database is not wiped, so every email is unique per run. */
function email(name: string): string {
  return `${name}-${randomUUID()}@example.com`;
}

function user(pool: Pool, name = 'reader') {
  return createUser(pool, { email: email(name), displayName: name, passwordHash: 'hash' });
}

function hub(pool: Pool, ownerUserId: string | null = null) {
  return createStory(pool, TEST_WRITER, {
    role: 'hub',
    hubId: null,
    title: 'Hub',
    status: 'developing',
    ownerUserId,
  });
}

// Users

test('create a user, read it back, and find it by email in any case', async (t) => {
  const pool = store(t);
  const address = email('Phil');
  const created = await createUser(pool, {
    email: `  ${address.toUpperCase()} `,
    displayName: ' Phil ',
    passwordHash: '$2b$12$hash',
    createdAt: '2026-11-20T21:30:00-05:00',
  });
  assert.equal(created.email, address.toLowerCase());
  assert.equal(created.displayName, 'Phil');
  assert.equal(created.createdAt, '2026-11-21T02:30:00.000Z');
  assert.equal(created.disabledAt, null);
  assert.deepEqual(await readUser(pool, created.id), created);

  const found = await findUserByEmail(pool, address.toUpperCase());
  assert.deepEqual(found, { ...created, passwordHash: '$2b$12$hash' });
  assert.equal(await findUserByEmail(pool, email('nobody')), null);
  assert.equal(await findUserByEmail(pool, '   '), null);
  assert.equal(await readUser(pool, randomUUID()), null);
});

test('an email is unique regardless of case', async (t) => {
  const pool = store(t);
  const address = email('dupe');
  await createUser(pool, { email: address, displayName: 'One', passwordHash: 'hash' });
  await assert.rejects(
    createUser(pool, { email: address.toUpperCase(), displayName: 'Two', passwordHash: 'hash' }),
    { name: 'DashboardStoreError', message: /already exists/ },
  );
});

test('a user needs an email, a display name, and a password hash', async (t) => {
  const pool = store(t);
  for (const bad of ['', 'no-at-sign', 'two words@example.com', 'a@b@c']) {
    await assert.rejects(
      createUser(pool, { email: bad, displayName: 'X', passwordHash: 'hash' }),
      { name: 'DashboardStoreError' },
    );
  }
  await assert.rejects(
    createUser(pool, { email: email('x'), displayName: ' ', passwordHash: 'hash' }),
    /displayName is required/,
  );
  await assert.rejects(
    createUser(pool, { email: email('x'), displayName: 'X', passwordHash: '' }),
    /passwordHash is required/,
  );
  await assert.rejects(
    createUser(pool, {
      email: email('x'),
      displayName: 'X',
      passwordHash: 'hash',
      createdAt: '2026-11-20T21:30:00',
    }),
    /zone offset/,
  );
});

test('disable a user once, and replace a password hash', async (t) => {
  const pool = store(t);
  const created = await user(pool);
  const disabled = await disableUser(pool, created.id, '2026-11-20T10:00:00Z');
  assert.equal(disabled?.disabledAt, '2026-11-20T10:00:00.000Z');
  const again = await disableUser(pool, created.id, '2026-11-21T10:00:00Z');
  assert.equal(again?.disabledAt, '2026-11-20T10:00:00.000Z', 'the first time is kept');
  assert.equal(await disableUser(pool, randomUUID()), null);

  assert.equal(await setUserPasswordHash(pool, created.id, 'new-hash'), true);
  assert.equal((await findUserByEmail(pool, created.email))?.passwordHash, 'new-hash');
  assert.equal(await setUserPasswordHash(pool, randomUUID(), 'new-hash'), false);
  await assert.rejects(setUserPasswordHash(pool, created.id, ' '), /passwordHash is required/);
});

test('list users includes every account', async (t) => {
  const pool = store(t);
  const one = await user(pool, 'one');
  const two = await user(pool, 'two');
  const ids = (await listUsers(pool)).map((row) => row.id);
  assert.ok(ids.includes(one.id) && ids.includes(two.id));
});

// Story owner

test('a hub can be private to a user, and a story with no owner is shared', async (t) => {
  const pool = store(t);
  const owner = await user(pool);
  const mine = await hub(pool, owner.id);
  assert.equal(mine.ownerUserId, owner.id);
  assert.deepEqual(await readStory(pool, mine.id), mine);
  const shared = await createStory(pool, TEST_WRITER, {
    role: 'hub',
    hubId: null,
    title: 'Shared',
    status: 'active',
  });
  assert.equal(shared.ownerUserId, null);
  assert.equal((await readStory(pool, shared.id))?.ownerUserId, null);
});

test('a private branch and a branch under a private hub are refused for now', async (t) => {
  const pool = store(t);
  const owner = await user(pool);
  const sharedHub = await hub(pool);
  const privateHub = await hub(pool, owner.id);
  await assert.rejects(
    createStory(pool, TEST_WRITER, {
      role: 'branch',
      hubId: sharedHub.id,
      title: 'Branch',
      status: 'developing',
      ownerUserId: owner.id,
    }),
    /a branch cannot be private yet/,
  );
  await assert.rejects(
    createStory(pool, TEST_WRITER, {
      role: 'branch',
      hubId: privateHub.id,
      title: 'Branch',
      status: 'developing',
    }),
    /a branch cannot sit under a private hub yet/,
  );
  const branch = await createStory(pool, TEST_WRITER, {
    role: 'branch',
    hubId: sharedHub.id,
    title: 'Branch',
    status: 'developing',
  });
  assert.equal(branch.ownerUserId, null);
});

test('a story owner must be a user', async (t) => {
  const pool = store(t);
  await assert.rejects(hub(pool, randomUUID()), {
    name: 'DashboardStoreError',
    message: /missing hub or owner/,
  });
});

// Read markers

test('read_up_to only moves forward, and last opened is kept on its own', async (t) => {
  const pool = store(t);
  const reader = await user(pool);
  const story = await hub(pool);
  const tracker: Tracker = { kind: 'story', storyId: story.id };

  const first = await markRead(pool, reader.id, tracker, '2026-11-20T12:00:00-05:00');
  assert.deepEqual(first, {
    userId: reader.id,
    tracker,
    readUpTo: '2026-11-20T17:00:00.000Z',
    lastOpenedAt: null,
  });
  const older = await markRead(pool, reader.id, tracker, '2026-11-20T16:00:00Z');
  assert.equal(older.readUpTo, '2026-11-20T17:00:00.000Z', 'an earlier time changes nothing');
  const newer = await markRead(pool, reader.id, tracker, '2026-11-20T18:00:00Z');
  assert.equal(newer.readUpTo, '2026-11-20T18:00:00.000Z');

  const opened = await markOpened(pool, reader.id, tracker, '2026-11-20T19:00:00Z');
  assert.equal(opened.readUpTo, '2026-11-20T18:00:00.000Z');
  assert.equal(opened.lastOpenedAt, '2026-11-20T19:00:00.000Z');
  await markOpened(pool, reader.id, tracker, '2026-11-20T09:00:00Z');
  assert.deepEqual(await readMarker(pool, reader.id, tracker), {
    userId: reader.id,
    tracker,
    readUpTo: '2026-11-20T18:00:00.000Z',
    lastOpenedAt: '2026-11-20T19:00:00.000Z',
  });
});

test('CFP and Weather are one tracker each per user, and markers are per user', async (t) => {
  const pool = store(t);
  const one = await user(pool, 'one');
  const two = await user(pool, 'two');
  const story = await hub(pool);

  await markRead(pool, one.id, { kind: 'cfp' }, '2026-11-20T10:00:00Z');
  await markRead(pool, one.id, { kind: 'cfp' }, '2026-11-20T11:00:00Z');
  await markOpened(pool, one.id, { kind: 'weather' }, '2026-11-20T07:00:00Z');
  await markRead(pool, one.id, { kind: 'story', storyId: story.id }, '2026-11-20T08:00:00Z');
  await markRead(pool, two.id, { kind: 'cfp' }, '2026-11-19T10:00:00Z');

  assert.deepEqual(await listReadMarkers(pool, one.id), [
    {
      userId: one.id,
      tracker: { kind: 'story', storyId: story.id },
      readUpTo: '2026-11-20T08:00:00.000Z',
      lastOpenedAt: null,
    },
    { userId: one.id, tracker: { kind: 'cfp' }, readUpTo: '2026-11-20T11:00:00.000Z', lastOpenedAt: null },
    {
      userId: one.id,
      tracker: { kind: 'weather' },
      readUpTo: null,
      lastOpenedAt: '2026-11-20T07:00:00.000Z',
    },
  ]);
  assert.equal(
    (await readMarker(pool, two.id, { kind: 'cfp' }))?.readUpTo,
    '2026-11-19T10:00:00.000Z',
  );
  assert.equal(await readMarker(pool, two.id, { kind: 'weather' }), null);
});

test('a marker is refused for a bad tracker, a zoneless time, or a missing user or story', async (t) => {
  const pool = store(t);
  const reader = await user(pool);
  await assert.rejects(
    markRead(pool, reader.id, { kind: 'story', storyId: ' ' }, '2026-11-20T10:00:00Z'),
    /storyId is required/,
  );
  await assert.rejects(
    markRead(pool, reader.id, { kind: 'cfp', storyId: 'x' } as unknown as Tracker, '2026-11-20T10:00:00Z'),
    /a cfp tracker has no story id/,
  );
  await assert.rejects(
    markRead(pool, reader.id, { kind: 'tides' } as unknown as Tracker, '2026-11-20T10:00:00Z'),
    /unexpected tracker kind tides/,
  );
  await assert.rejects(markRead(pool, reader.id, { kind: 'cfp' }, '2026-11-20T10:00:00'), /zone offset/);
  await assert.rejects(
    markRead(pool, reader.id, { kind: 'story', storyId: randomUUID() }, '2026-11-20T10:00:00Z'),
    { name: 'DashboardStoreError', message: /missing user or story/ },
  );
  await assert.rejects(markRead(pool, randomUUID(), { kind: 'cfp' }, '2026-11-20T10:00:00Z'), {
    name: 'DashboardStoreError',
    message: /missing user or story/,
  });
});

// Follow and hide

test('follow, change to hide, and clear, per user, for stories and topics', async (t) => {
  const pool = store(t);
  const one = await user(pool, 'one');
  const two = await user(pool, 'two');
  const story = await hub(pool);
  const storySubject = { kind: 'story', storyId: story.id } as const;
  const topicSubject = { kind: 'topic', topicId: 'iran' } as const;

  await setFollowState(pool, one.id, storySubject, 'follow', '2026-11-20T10:00:00Z');
  const hidden = await setFollowState(pool, one.id, storySubject, 'hide', '2026-11-20T11:00:00Z');
  assert.deepEqual(hidden, {
    userId: one.id,
    subject: storySubject,
    state: 'hide',
    updatedAt: '2026-11-20T11:00:00.000Z',
  });
  await setFollowState(pool, one.id, topicSubject, 'follow', '2026-11-20T12:00:00Z');
  await setFollowState(pool, two.id, storySubject, 'follow', '2026-11-20T12:00:00Z');

  assert.deepEqual(
    (await listFollowStates(pool, one.id)).map((row) => [row.subject, row.state]),
    [
      [storySubject, 'hide'],
      [topicSubject, 'follow'],
    ],
  );
  assert.deepEqual(
    (await listFollowStates(pool, two.id)).map((row) => row.state),
    ['follow'],
    "one user's hide does not change another's",
  );

  assert.equal(await clearFollowState(pool, one.id, storySubject), true);
  assert.equal(await clearFollowState(pool, one.id, storySubject), false);
  assert.deepEqual(
    (await listFollowStates(pool, one.id)).map((row) => row.subject),
    [topicSubject],
  );
});

test('a follow state is refused for a bad state, an empty subject, or a missing story', async (t) => {
  const pool = store(t);
  const reader = await user(pool);
  await assert.rejects(
    setFollowState(pool, reader.id, { kind: 'topic', topicId: 'iran' }, 'mute'),
    /unexpected follow state mute/,
  );
  await assert.rejects(
    setFollowState(pool, reader.id, { kind: 'topic', topicId: ' ' }, 'follow'),
    /topicId is required/,
  );
  await assert.rejects(
    setFollowState(pool, reader.id, { kind: 'story', storyId: randomUUID() }, 'follow'),
    { name: 'DashboardStoreError', message: /missing user or story/ },
  );
});
