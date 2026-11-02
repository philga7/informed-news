import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  FeedbackValidationError,
  createFeedback,
  feedbackTopicNames,
  readFeedback,
  removeFeedback,
  updateFeedback,
  type FeedbackSnapshot,
} from './feedbackStore.js';

function tempFeedbackPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'feedback-'));
  return path.join(dir, 'feedback.json');
}

const snapshot: FeedbackSnapshot = {
  headline: 'Senate advances the bill',
  source: 'reuters.com',
  url: 'https://reuters.com/senate-bill',
  topics: [{ id: 'congress', name: 'Congress' }],
};

test('createFeedback persists one entry and a fresh read returns it newest first', async () => {
  const feedbackPath = tempFeedbackPath();

  const created = await createFeedback(
    {
      itemId: 'article-1',
      signal: 'like',
      comment: 'Worth keeping',
      snapshot,
    },
    feedbackPath,
  );

  assert.equal(created.replaced, false);
  assert.equal(created.entry.itemId, 'article-1');
  assert.equal(created.entry.signal, 'like');
  assert.equal(created.entry.comment, 'Worth keeping');
  assert.match(created.entry.id, /^[0-9a-f-]{36}$/);
  assert.match(created.entry.ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(created.entry.snapshot, snapshot);
  assert.deepEqual(created.entries, [created.entry]);

  const stored = await readFeedback(feedbackPath);
  assert.deepEqual(stored.entries, [created.entry]);
  assert.equal(stored.updatedAt, created.entry.ts);

  const onDisk = JSON.parse(readFileSync(feedbackPath, 'utf8')) as unknown;
  assert.deepEqual(onDisk, stored);
});

test('a second create for the same itemId replaces the earlier entry', async () => {
  const feedbackPath = tempFeedbackPath();
  const first = await createFeedback(
    { itemId: 'article-1', signal: 'like', comment: 'first', snapshot },
    feedbackPath,
  );
  const second = await createFeedback(
    {
      itemId: 'article-1',
      signal: 'not_relevant',
      comment: 'changed my mind',
      snapshot: { ...snapshot, headline: 'Updated headline' },
    },
    feedbackPath,
  );

  assert.equal(second.replaced, true);
  assert.notEqual(second.entry.id, first.entry.id);
  assert.equal(second.entry.signal, 'not_relevant');
  assert.equal(second.entry.snapshot.headline, 'Updated headline');
  assert.equal(second.entries.length, 1);
  assert.deepEqual((await readFeedback(feedbackPath)).entries, [second.entry]);
});

test('createFeedback rejects a bad signal and a comment over 500 characters', async () => {
  const feedbackPath = tempFeedbackPath();
  await createFeedback(
    { itemId: 'article-1', signal: 'like', comment: 'keep', snapshot },
    feedbackPath,
  );
  const before = readFileSync(feedbackPath, 'utf8');

  await assert.rejects(
    createFeedback({ itemId: 'article-2', signal: 'mute', comment: 'no', snapshot }, feedbackPath),
    (err: unknown) => err instanceof FeedbackValidationError && /signal/.test(err.message),
  );
  await assert.rejects(
    createFeedback(
      { itemId: 'article-2', signal: 'like', comment: 'x'.repeat(501), snapshot },
      feedbackPath,
    ),
    (err: unknown) => err instanceof FeedbackValidationError && /500/.test(err.message),
  );
  await assert.rejects(
    createFeedback({ itemId: '  ', signal: 'like', snapshot }, feedbackPath),
    FeedbackValidationError,
  );

  const accepted = await createFeedback(
    { itemId: 'article-2', signal: 'like', comment: 'y'.repeat(500), snapshot },
    feedbackPath,
  );
  assert.equal(accepted.entry.comment.length, 500);
  assert.equal(readFileSync(feedbackPath, 'utf8').includes('article-2'), true);
  const kept = await readFeedback(feedbackPath);
  assert.equal(kept.entries.some((entry) => entry.itemId === 'article-1'), true);
  assert.ok(readFileSync(feedbackPath, 'utf8') !== before);
});

test('updateFeedback changes signal and comment only and returns null for an unknown id', async () => {
  const feedbackPath = tempFeedbackPath();
  const created = await createFeedback(
    { itemId: 'article-1', signal: 'like', comment: 'keep', snapshot },
    feedbackPath,
  );

  const updated = await updateFeedback(
    created.entry.id,
    { signal: 'not_relevant', comment: 'soft no' },
    feedbackPath,
  );
  assert.ok(updated);
  assert.equal(updated.entry.id, created.entry.id);
  assert.equal(updated.entry.itemId, 'article-1');
  assert.equal(updated.entry.ts, created.entry.ts);
  assert.equal(updated.entry.signal, 'not_relevant');
  assert.equal(updated.entry.comment, 'soft no');
  assert.deepEqual(updated.entry.snapshot, snapshot);

  assert.equal(await updateFeedback('missing', { comment: 'nope' }, feedbackPath), null);
  const stored = await readFeedback(feedbackPath);
  assert.deepEqual(stored.entries, [updated.entry]);
});

test('removeFeedback deletes the entry and returns null for an unknown id', async () => {
  const feedbackPath = tempFeedbackPath();
  const created = await createFeedback(
    { itemId: 'article-1', signal: 'like', snapshot },
    feedbackPath,
  );

  const removed = await removeFeedback(created.entry.id, feedbackPath);
  assert.ok(removed);
  assert.equal(removed.removed, true);
  assert.deepEqual(removed.entries, []);
  assert.deepEqual((await readFeedback(feedbackPath)).entries, []);

  assert.equal(await removeFeedback(created.entry.id, feedbackPath), null);
});

test('feedback written to disk is still there on a later read', async () => {
  const feedbackPath = tempFeedbackPath();
  const created = await createFeedback(
    { itemId: 'article-1', signal: 'like', comment: 'keep', snapshot },
    feedbackPath,
  );

  const fromDisk = JSON.parse(readFileSync(feedbackPath, 'utf8')) as {
    entries: Array<{ id: string; comment: string }>;
  };
  assert.equal(fromDisk.entries[0]?.id, created.entry.id);
  assert.equal(fromDisk.entries[0]?.comment, 'keep');
  assert.deepEqual(await readFeedback(feedbackPath), {
    entries: [created.entry],
    updatedAt: created.entry.ts,
  });
});

test('concurrent creates for different items both survive in one valid file', async () => {
  const feedbackPath = tempFeedbackPath();

  await Promise.all(
    ['a', 'b', 'c', 'd'].map((itemId) =>
      createFeedback(
        {
          itemId,
          signal: itemId === 'b' ? 'not_relevant' : 'like',
          comment: itemId,
          snapshot: { ...snapshot, headline: `Headline ${itemId}` },
        },
        feedbackPath,
      ),
    ),
  );

  const stored = await readFeedback(feedbackPath);
  assert.deepEqual(
    stored.entries.map((entry) => entry.itemId).sort(),
    ['a', 'b', 'c', 'd'],
  );
  assert.equal(stored.entries.find((entry) => entry.itemId === 'b')?.signal, 'not_relevant');
  const parsed = JSON.parse(readFileSync(feedbackPath, 'utf8')) as { entries: unknown[] };
  assert.equal(parsed.entries.length, 4);
});

test('feedbackTopicNames reads stored names and does not create a missing topics file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'feedback-topics-'));
  const topicsPath = path.join(dir, 'topics.json');

  assert.deepEqual([...(await feedbackTopicNames(['congress'], topicsPath)).entries()], []);
  assert.equal(existsSync(topicsPath), false);

  writeFileSync(
    topicsPath,
    `${JSON.stringify({
      topics: [
        { id: 'congress', name: 'Congress' },
        { id: 'other', name: 'Other' },
      ],
      updatedAt: null,
    })}\n`,
  );
  const names = await feedbackTopicNames(['congress', 'missing'], topicsPath);
  assert.equal(names.get('congress'), 'Congress');
  assert.equal(names.has('missing'), false);
  assert.equal(names.has('other'), false);
});
