import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getClaimById, upsertClaim } from './claimStore.js';
import {
  readEvidenceLinks,
  removeEvidenceLink,
  upsertEvidenceLink,
} from './evidenceLinkStore.js';

function tempStorePaths(): { claimsPath: string; evidencePath: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-evidence-'));
  return {
    claimsPath: path.join(dir, 'claims.json'),
    evidencePath: path.join(dir, 'evidence-links.json'),
  };
}

test('upsertEvidenceLink refreshes claim status on add/remove', async () => {
  const { claimsPath, evidencePath } = tempStorePaths();

  await upsertClaim(
    {
      id: 'c1',
      text: 'Bridge was destroyed in overnight strike',
      claimType: 'event_occurrence',
      entities: [],
    },
    claimsPath,
  );

  const primarySupport = await upsertEvidenceLink(
    {
      id: 'e1',
      claimId: 'c1',
      articleId: 'a1',
      url: null,
      stance: 'supports',
      sourceTier: 'primary',
      confidence: 0.9,
      scores: null,
    },
    evidencePath,
    claimsPath,
  );
  assert.ok(primarySupport);

  const afterSupport = await getClaimById('c1', claimsPath);
  assert.equal(afterSupport?.status, 'supported_by_primary');

  const contradict = await upsertEvidenceLink(
    {
      id: 'e2',
      claimId: 'c1',
      articleId: null,
      url: 'https://example.com/post/123',
      stance: 'contradicts',
      sourceTier: 'sensor',
      confidence: 0.9,
      scores: null,
    },
    evidencePath,
    claimsPath,
  );
  assert.ok(contradict);

  const afterContradict = await getClaimById('c1', claimsPath);
  assert.equal(afterContradict?.status, 'contested');

  const removed = await removeEvidenceLink('e2', evidencePath, claimsPath);
  assert.equal(removed.removed, true);

  const afterRemove = await getClaimById('c1', claimsPath);
  assert.equal(afterRemove?.status, 'supported_by_primary');
});

test('upsertEvidenceLink refreshes claim status on stance change', async () => {
  const { claimsPath, evidencePath } = tempStorePaths();

  await upsertClaim(
    {
      id: 'c1',
      text: 'Officials say the convoy crossed the border',
      claimType: 'official_statement',
      entities: [],
    },
    claimsPath,
  );

  await upsertEvidenceLink(
    {
      id: 'e1',
      claimId: 'c1',
      articleId: 'a1',
      url: null,
      stance: 'supports',
      sourceTier: 'primary',
      confidence: 0.8,
      scores: null,
    },
    evidencePath,
    claimsPath,
  );

  await upsertEvidenceLink(
    {
      id: 'e2',
      claimId: 'c1',
      articleId: null,
      url: 'https://example.com/analysis',
      stance: 'mentions',
      sourceTier: 'sensor',
      confidence: 0.9,
      scores: null,
    },
    evidencePath,
    claimsPath,
  );

  const before = await getClaimById('c1', claimsPath);
  assert.equal(before?.status, 'supported_by_primary');

  await upsertEvidenceLink(
    {
      id: 'e2',
      claimId: 'c1',
      articleId: null,
      url: 'https://example.com/analysis',
      stance: 'contradicts',
      sourceTier: 'sensor',
      confidence: 0.9,
      scores: null,
    },
    evidencePath,
    claimsPath,
  );

  const after = await getClaimById('c1', claimsPath);
  assert.equal(after?.status, 'contested');
});

test('upsertEvidenceLink is a no-op when both articleId and url are missing', async () => {
  const { claimsPath, evidencePath } = tempStorePaths();

  await upsertClaim(
    {
      id: 'c1',
      text: 'Claim',
      claimType: 'event_occurrence',
      entities: [],
    },
    claimsPath,
  );

  const result = await upsertEvidenceLink(
    {
      id: 'e1',
      claimId: 'c1',
      articleId: null,
      url: null,
      stance: 'supports',
      sourceTier: 'primary',
      confidence: 1,
      scores: null,
    },
    evidencePath,
    claimsPath,
  );
  assert.equal(result, null);

  const links = await readEvidenceLinks(evidencePath);
  assert.deepEqual(links, []);

  const claim = await getClaimById('c1', claimsPath);
  assert.equal(claim?.status, 'insufficient_evidence');
});

