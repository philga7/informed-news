import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  dismissClaimReview,
  enqueueClaimReview,
  readClaimReviewQueue,
  writeClaimReviewQueue,
  type ClaimReviewQueueEntry,
} from './claimReviewQueueStore.js';

function tempQueuePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-review-queue-'));
  return path.join(dir, 'claim-review-queue.json');
}

function sampleEntry(overrides: Partial<ClaimReviewQueueEntry> = {}): ClaimReviewQueueEntry {
  return {
    id: 'entry-1',
    claimId: 'claim-1',
    evidenceLinkId: 'link-1',
    articleId: 'article-1',
    reviewReasons: ['needs_review'],
    candidateText: 'Example candidate text',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('readClaimReviewQueue returns empty array when file is missing', async () => {
  const queuePath = tempQueuePath();
  const queue = await readClaimReviewQueue(queuePath);
  assert.deepEqual(queue, []);
});

test('writeClaimReviewQueue persists entries', async () => {
  const queuePath = tempQueuePath();
  const entry = sampleEntry();

  await writeClaimReviewQueue([entry], queuePath);
  const stored = await readClaimReviewQueue(queuePath);

  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], entry);
});

test('enqueueClaimReview appends entry and persists', async () => {
  const queuePath = tempQueuePath();
  const entry = sampleEntry();

  const result = await enqueueClaimReview(entry, queuePath);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0], entry);

  const stored = await readClaimReviewQueue(queuePath);
  assert.deepEqual(stored, [entry]);
});

test('enqueueClaimReview is idempotent on articleId+claimId+evidenceLinkId', async () => {
  const queuePath = tempQueuePath();
  const entry = sampleEntry();

  await enqueueClaimReview(entry, queuePath);
  const before = await readClaimReviewQueue(queuePath);

  const duplicate = sampleEntry({
    id: 'entry-2',
    candidateText: 'Different text',
    createdAt: '2026-02-01T00:00:00.000Z',
  });
  const second = await enqueueClaimReview(duplicate, queuePath);
  const after = await readClaimReviewQueue(queuePath);

  assert.deepEqual(second.entries, before);
  assert.deepEqual(after, before);
});

test('enqueueClaimReview allows different triples', async () => {
  const queuePath = tempQueuePath();

  await enqueueClaimReview(sampleEntry(), queuePath);
  await enqueueClaimReview(
    sampleEntry({
      id: 'entry-2',
      evidenceLinkId: 'link-2',
    }),
    queuePath,
  );

  const stored = await readClaimReviewQueue(queuePath);
  assert.equal(stored.length, 2);
});

test('dismissClaimReview removes all queue entries for a claim id', async () => {
  const queuePath = tempQueuePath();

  await writeClaimReviewQueue(
    [
      sampleEntry(),
      sampleEntry({
        id: 'entry-2',
        claimId: 'claim-1',
        evidenceLinkId: 'link-2',
        articleId: 'article-2',
      }),
      sampleEntry({
        id: 'entry-3',
        claimId: 'claim-2',
        evidenceLinkId: 'link-3',
        articleId: 'article-3',
      }),
    ],
    queuePath,
  );

  const result = await dismissClaimReview('claim-1', queuePath);
  assert.deepEqual(result.dismissedClaimIds, ['claim-1']);

  const stored = await readClaimReviewQueue(queuePath);
  assert.deepEqual(stored.map((entry) => entry.claimId), ['claim-2']);
});

test('dismissClaimReview is idempotent when queue has no matching claim', async () => {
  const queuePath = tempQueuePath();
  await writeClaimReviewQueue([sampleEntry()], queuePath);

  const result = await dismissClaimReview('missing', queuePath);
  assert.deepEqual(result.dismissedClaimIds, []);

  const stored = await readClaimReviewQueue(queuePath);
  assert.deepEqual(stored.map((entry) => entry.claimId), ['claim-1']);
});
