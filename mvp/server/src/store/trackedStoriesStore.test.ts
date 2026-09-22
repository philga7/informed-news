import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  ackTrackedUpdate,
  readTrackedStories,
  syncTrackedAfterFetch,
  trackCluster,
  untrackCluster,
} from './trackedStoriesStore.js';

function tempTrackedPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracked-stories-'));
  return path.join(dir, 'tracked-stories.json');
}

test('readTrackedStories returns empty when file is missing', async () => {
  const trackedPath = tempTrackedPath();
  const tracked = await readTrackedStories(trackedPath);

  assert.deepEqual(tracked, {
    entries: [],
    updatedAt: null,
  });
});

test('trackCluster adds entry with snapshot and pendingUpdate false', async () => {
  const trackedPath = tempTrackedPath();

  const result = await trackCluster('  cluster-a  ', 3, trackedPath);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.clusterId, 'cluster-a');
  assert.equal(result.entries[0]?.memberCountSnapshot, 3);
  assert.equal(result.entries[0]?.pendingUpdate, false);
  assert.equal(typeof result.entries[0]?.trackedAt, 'string');

  const stored = await readTrackedStories(trackedPath);
  assert.equal(stored.entries.length, 1);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('trackCluster is idempotent', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 3, trackedPath);
  const before = await readTrackedStories(trackedPath);
  const second = await trackCluster('cluster-a', 5, trackedPath);
  const after = await readTrackedStories(trackedPath);

  assert.deepEqual(second.entries, before.entries);
  assert.deepEqual(after, before);
  assert.equal(after.entries[0]?.memberCountSnapshot, 3);
});

test('untrackCluster removes entry and persists', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  await trackCluster('cluster-b', 1, trackedPath);

  const result = await untrackCluster('cluster-a', trackedPath);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.clusterId, 'cluster-b');

  const stored = await readTrackedStories(trackedPath);
  assert.equal(stored.entries.length, 1);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('untrackCluster is idempotent when cluster is not tracked', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  const before = await readTrackedStories(trackedPath);
  const result = await untrackCluster('cluster-missing', trackedPath);
  const after = await readTrackedStories(trackedPath);

  assert.equal(result.entries.length, 1);
  assert.deepEqual(after, before);
});

test('trackCluster supports solo keys', async () => {
  const trackedPath = tempTrackedPath();

  const result = await trackCluster('solo:article-123', 1, trackedPath);
  assert.equal(result.entries[0]?.clusterId, 'solo:article-123');
});

test('trackCluster is a no-op when clusterId is empty or whitespace', async () => {
  const trackedPath = tempTrackedPath();

  const result1 = await trackCluster('', 1, trackedPath);
  assert.deepEqual(result1.entries, []);

  const result2 = await trackCluster('   ', 1, trackedPath);
  assert.deepEqual(result2.entries, []);

  const stored = await readTrackedStories(trackedPath);
  assert.deepEqual(stored, { entries: [], updatedAt: null });
});

test('trackCluster is a no-op when memberCount is invalid', async () => {
  const trackedPath = tempTrackedPath();

  const negative = await trackCluster('cluster-a', -1, trackedPath);
  assert.deepEqual(negative.entries, []);

  const nan = await trackCluster('cluster-a', Number.NaN, trackedPath);
  assert.deepEqual(nan.entries, []);

  const float = await trackCluster('cluster-a', 1.5, trackedPath);
  assert.deepEqual(float.entries, []);

  const stored = await readTrackedStories(trackedPath);
  assert.deepEqual(stored, { entries: [], updatedAt: null });
});

test('untrackCluster is a no-op when clusterId is empty or whitespace', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  const before = await readTrackedStories(trackedPath);
  const result = await untrackCluster('   ', trackedPath);
  const after = await readTrackedStories(trackedPath);

  assert.deepEqual(result.entries, before.entries);
  assert.deepEqual(after, before);
});

test('syncTrackedAfterFetch sets pendingUpdate when count grows', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  await trackCluster('cluster-b', 5, trackedPath);

  const result = await syncTrackedAfterFetch(
    { 'cluster-a': 4, 'cluster-b': 5 },
    trackedPath,
  );

  const clusterA = result.entries.find((entry) => entry.clusterId === 'cluster-a');
  const clusterB = result.entries.find((entry) => entry.clusterId === 'cluster-b');

  assert.equal(clusterA?.pendingUpdate, true);
  assert.equal(clusterA?.memberCountSnapshot, 2);
  assert.equal(clusterB?.pendingUpdate, false);
  assert.equal(clusterB?.memberCountSnapshot, 5);

  const stored = await readTrackedStories(trackedPath);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('syncTrackedAfterFetch is idempotent when pendingUpdate already true', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  await syncTrackedAfterFetch({ 'cluster-a': 4 }, trackedPath);
  const before = await readTrackedStories(trackedPath);
  const second = await syncTrackedAfterFetch({ 'cluster-a': 6 }, trackedPath);
  const after = await readTrackedStories(trackedPath);

  assert.equal(before.entries[0]?.pendingUpdate, true);
  assert.deepEqual(second.entries, before.entries);
  assert.deepEqual(after, before);
  assert.equal(after.entries[0]?.memberCountSnapshot, 2);
});

test('syncTrackedAfterFetch does not change entries when count is unchanged or lower', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 4, trackedPath);
  const before = await readTrackedStories(trackedPath);
  const result = await syncTrackedAfterFetch({ 'cluster-a': 3 }, trackedPath);
  const after = await readTrackedStories(trackedPath);

  assert.deepEqual(result.entries, before.entries);
  assert.deepEqual(after, before);
});

test('syncTrackedAfterFetch ignores invalid member counts in map', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  const before = await readTrackedStories(trackedPath);
  const result = await syncTrackedAfterFetch(
    { 'cluster-a': Number.NaN },
    trackedPath,
  );
  const after = await readTrackedStories(trackedPath);

  assert.deepEqual(result.entries, before.entries);
  assert.deepEqual(after, before);
});

test('ackTrackedUpdate clears pendingUpdate and bumps snapshot', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  await syncTrackedAfterFetch({ 'cluster-a': 4 }, trackedPath);
  const before = await readTrackedStories(trackedPath);
  assert.equal(before.entries[0]?.pendingUpdate, true);
  assert.equal(before.entries[0]?.memberCountSnapshot, 2);

  const result = await ackTrackedUpdate('cluster-a', 4, trackedPath);
  const entry = result.entries.find((e) => e.clusterId === 'cluster-a');
  assert.ok(entry);
  assert.equal(entry.pendingUpdate, false);
  assert.equal(entry.memberCountSnapshot, 4);

  const stored = await readTrackedStories(trackedPath);
  const storedEntry = stored.entries.find((e) => e.clusterId === 'cluster-a');
  assert.ok(storedEntry);
  assert.equal(storedEntry.pendingUpdate, false);
  assert.equal(storedEntry.memberCountSnapshot, 4);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('ackTrackedUpdate is idempotent when already clear', async () => {
  const trackedPath = tempTrackedPath();

  await trackCluster('cluster-a', 2, trackedPath);
  await syncTrackedAfterFetch({ 'cluster-a': 4 }, trackedPath);
  await ackTrackedUpdate('cluster-a', 4, trackedPath);
  const before = await readTrackedStories(trackedPath);

  const result = await ackTrackedUpdate('cluster-a', 6, trackedPath);
  const after = await readTrackedStories(trackedPath);

  assert.deepEqual(result.entries, before.entries);
  assert.deepEqual(after, before);
  assert.equal(after.entries[0]?.pendingUpdate, false);
  assert.equal(after.entries[0]?.memberCountSnapshot, 4);
});
