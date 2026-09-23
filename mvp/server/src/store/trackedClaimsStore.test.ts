import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  ackTrackedClaimUpdate,
  markTrackedClaimPending,
  readTrackedClaims,
  trackClaim,
  untrackClaim,
} from './trackedClaimsStore.js';

function tempTrackedPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracked-claims-'));
  return path.join(dir, 'tracked-claims.json');
}

test('readTrackedClaims returns empty when file is missing', async () => {
  const trackedPath = tempTrackedPath();
  const tracked = await readTrackedClaims(trackedPath);

  assert.deepEqual(tracked, {
    entries: [],
    updatedAt: null,
  });
});

test('trackClaim adds entry with pendingUpdate false', async () => {
  const trackedPath = tempTrackedPath();

  const result = await trackClaim('  c1  ', trackedPath);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.claimId, 'c1');
  assert.equal(result.entries[0]?.pendingUpdate, false);
  assert.equal(typeof result.entries[0]?.trackedAt, 'string');

  const stored = await readTrackedClaims(trackedPath);
  assert.equal(stored.entries.length, 1);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('trackClaim is idempotent', async () => {
  const trackedPath = tempTrackedPath();

  await trackClaim('c1', trackedPath);
  const before = await readTrackedClaims(trackedPath);
  const second = await trackClaim('c1', trackedPath);
  const after = await readTrackedClaims(trackedPath);

  assert.deepEqual(second.entries, before.entries);
  assert.deepEqual(after, before);
});

test('markTrackedClaimPending sets pendingUpdate only when tracked', async () => {
  const trackedPath = tempTrackedPath();

  // not tracked → no-op
  await markTrackedClaimPending('c1', trackedPath);
  const empty = await readTrackedClaims(trackedPath);
  assert.deepEqual(empty, { entries: [], updatedAt: null });

  await trackClaim('c1', trackedPath);
  const before = await readTrackedClaims(trackedPath);
  assert.equal(before.entries[0]?.pendingUpdate, false);

  const result = await markTrackedClaimPending('c1', trackedPath);
  const entry = result.entries.find((e) => e.claimId === 'c1');
  assert.ok(entry);
  assert.equal(entry.pendingUpdate, true);

  const stored = await readTrackedClaims(trackedPath);
  const storedEntry = stored.entries.find((e) => e.claimId === 'c1');
  assert.ok(storedEntry);
  assert.equal(storedEntry.pendingUpdate, true);
});

test('ackTrackedClaimUpdate clears pendingUpdate (idempotent)', async () => {
  const trackedPath = tempTrackedPath();

  await trackClaim('c1', trackedPath);
  await markTrackedClaimPending('c1', trackedPath);

  const before = await readTrackedClaims(trackedPath);
  assert.equal(before.entries[0]?.pendingUpdate, true);

  const result = await ackTrackedClaimUpdate('c1', trackedPath);
  const entry = result.entries.find((e) => e.claimId === 'c1');
  assert.ok(entry);
  assert.equal(entry.pendingUpdate, false);

  const after = await readTrackedClaims(trackedPath);
  assert.equal(after.entries[0]?.pendingUpdate, false);

  const second = await ackTrackedClaimUpdate('c1', trackedPath);
  const afterSecond = await readTrackedClaims(trackedPath);
  assert.deepEqual(second.entries, after.entries);
  assert.deepEqual(afterSecond, after);
});

test('untrackClaim removes entry and persists', async () => {
  const trackedPath = tempTrackedPath();

  await trackClaim('c1', trackedPath);
  await trackClaim('c2', trackedPath);

  const result = await untrackClaim('c1', trackedPath);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.claimId, 'c2');

  const stored = await readTrackedClaims(trackedPath);
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0]?.claimId, 'c2');
  assert.equal(typeof stored.updatedAt, 'string');
});

