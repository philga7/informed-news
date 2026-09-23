import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getClaimById, readClaims, upsertClaim } from './claimStore.js';

function tempClaimsPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claims-'));
  return path.join(dir, 'claims.json');
}

test('readClaims returns empty when file is missing', async () => {
  const claimsPath = tempClaimsPath();
  const claims = await readClaims(claimsPath);
  assert.deepEqual(claims, []);
});

test('upsertClaim defaults status and forces domain', async () => {
  const claimsPath = tempClaimsPath();

  const claim = await upsertClaim(
    {
      id: 'c1',
      text: 'Claim text',
      claimType: 'event_occurrence',
      entities: ['  Ukraine  ', '', 'Ukraine'],
    },
    claimsPath,
  );

  assert.equal(claim.id, 'c1');
  assert.equal(claim.status, 'insufficient_evidence');
  assert.equal(claim.domain, 'conflict');
  assert.equal(typeof claim.createdAt, 'string');
  assert.deepEqual(claim.entities, ['Ukraine', 'Ukraine']);

  const stored = await getClaimById('c1', claimsPath);
  assert.ok(stored);
  assert.equal(stored.domain, 'conflict');
  assert.equal(stored.status, 'insufficient_evidence');
});

