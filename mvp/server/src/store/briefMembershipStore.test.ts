import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  acceptCluster,
  readBriefMembership,
  unacceptCluster,
} from './briefMembershipStore.js';

function tempMembershipPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'brief-membership-'));
  return path.join(dir, 'brief-membership.json');
}

test('readBriefMembership returns empty when file is missing', async () => {
  const membershipPath = tempMembershipPath();
  const membership = await readBriefMembership(membershipPath);

  assert.deepEqual(membership, {
    acceptedClusterIds: [],
    updatedAt: null,
  });
});

test('acceptCluster adds cluster id and persists', async () => {
  const membershipPath = tempMembershipPath();

  const first = await acceptCluster('cluster-a', membershipPath);
  assert.deepEqual(first.acceptedClusterIds, ['cluster-a']);

  const stored = await readBriefMembership(membershipPath);
  assert.deepEqual(stored.acceptedClusterIds, ['cluster-a']);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('acceptCluster is idempotent', async () => {
  const membershipPath = tempMembershipPath();

  await acceptCluster('cluster-a', membershipPath);
  const before = await readBriefMembership(membershipPath);
  const second = await acceptCluster('cluster-a', membershipPath);
  const after = await readBriefMembership(membershipPath);

  assert.deepEqual(second.acceptedClusterIds, ['cluster-a']);
  assert.deepEqual(after, before);
});

test('unacceptCluster removes cluster id and persists', async () => {
  const membershipPath = tempMembershipPath();

  await acceptCluster('cluster-a', membershipPath);
  await acceptCluster('cluster-b', membershipPath);

  const result = await unacceptCluster('cluster-a', membershipPath);
  assert.deepEqual(result.acceptedClusterIds, ['cluster-b']);

  const stored = await readBriefMembership(membershipPath);
  assert.deepEqual(stored.acceptedClusterIds, ['cluster-b']);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('unacceptCluster is idempotent when cluster is not accepted', async () => {
  const membershipPath = tempMembershipPath();

  await acceptCluster('cluster-a', membershipPath);
  const before = await readBriefMembership(membershipPath);
  const result = await unacceptCluster('cluster-missing', membershipPath);
  const after = await readBriefMembership(membershipPath);

  assert.deepEqual(result.acceptedClusterIds, ['cluster-a']);
  assert.deepEqual(after, before);
});

test('acceptCluster supports solo keys', async () => {
  const membershipPath = tempMembershipPath();

  const result = await acceptCluster('solo:article-123', membershipPath);
  assert.deepEqual(result.acceptedClusterIds, ['solo:article-123']);
});
