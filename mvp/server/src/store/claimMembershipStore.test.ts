import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  acceptClaim,
  readClaimMembership,
  unacceptClaim,
} from './claimMembershipStore.js';

function tempMembershipPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-membership-'));
  return path.join(dir, 'claim-membership.json');
}

test('readClaimMembership returns empty when file is missing', async () => {
  const membershipPath = tempMembershipPath();
  const membership = await readClaimMembership(membershipPath);

  assert.deepEqual(membership, {
    acceptedClaimIds: [],
    updatedAt: null,
  });
});

test('acceptClaim adds claim id and persists', async () => {
  const membershipPath = tempMembershipPath();

  const first = await acceptClaim('c1', membershipPath);
  assert.deepEqual(first.acceptedClaimIds, ['c1']);

  const stored = await readClaimMembership(membershipPath);
  assert.deepEqual(stored.acceptedClaimIds, ['c1']);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('acceptClaim is idempotent', async () => {
  const membershipPath = tempMembershipPath();

  await acceptClaim('c1', membershipPath);
  const before = await readClaimMembership(membershipPath);
  const second = await acceptClaim('c1', membershipPath);
  const after = await readClaimMembership(membershipPath);

  assert.deepEqual(second.acceptedClaimIds, ['c1']);
  assert.deepEqual(after, before);
});

test('unacceptClaim removes claim id and persists', async () => {
  const membershipPath = tempMembershipPath();

  await acceptClaim('c1', membershipPath);
  await acceptClaim('c2', membershipPath);

  const result = await unacceptClaim('c1', membershipPath);
  assert.deepEqual(result.acceptedClaimIds, ['c2']);

  const stored = await readClaimMembership(membershipPath);
  assert.deepEqual(stored.acceptedClaimIds, ['c2']);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('unacceptClaim is idempotent when claim is not accepted', async () => {
  const membershipPath = tempMembershipPath();

  await acceptClaim('c1', membershipPath);
  const before = await readClaimMembership(membershipPath);
  const result = await unacceptClaim('missing', membershipPath);
  const after = await readClaimMembership(membershipPath);

  assert.deepEqual(result.acceptedClaimIds, ['c1']);
  assert.deepEqual(after, before);
});

