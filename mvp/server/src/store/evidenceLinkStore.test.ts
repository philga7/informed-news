import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { getClaimById, upsertClaim } from './claimStore.js';
import {
  readEvidenceLinks,
  removeEvidenceLink,
  upsertEvidenceLink,
} from './evidenceLinkStore.js';
import { ackTrackedClaimUpdate, readTrackedClaims, trackClaim } from './trackedClaimsStore.js';

function tempStorePaths(): { claimsPath: string; evidencePath: string; trackedClaimsPath: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-evidence-'));
  return {
    claimsPath: path.join(dir, 'claims.json'),
    evidencePath: path.join(dir, 'evidence-links.json'),
    trackedClaimsPath: path.join(dir, 'tracked-claims.json'),
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

test('upsertEvidenceLink marks tracked claim pending only on add or stance change', async () => {
  const { claimsPath, evidencePath, trackedClaimsPath } = tempStorePaths();

  await upsertClaim(
    {
      id: 'c1',
      text: 'Claim',
      claimType: 'event_occurrence',
      entities: [],
    },
    claimsPath,
  );

  await trackClaim('c1', trackedClaimsPath);
  const initial = await readTrackedClaims(trackedClaimsPath);
  assert.equal(initial.entries[0]?.pendingUpdate, false);

  // add evidence → pendingUpdate true
  await upsertEvidenceLink(
    {
      id: 'e1',
      claimId: 'c1',
      articleId: 'a1',
      url: null,
      stance: 'supports',
      sourceTier: 'sensor',
      confidence: 0.9,
      scores: null,
    },
    evidencePath,
    claimsPath,
    trackedClaimsPath,
  );

  const afterAdd = await readTrackedClaims(trackedClaimsPath);
  assert.equal(afterAdd.entries[0]?.pendingUpdate, true);

  // ack clears
  await ackTrackedClaimUpdate('c1', trackedClaimsPath);
  const afterAck = await readTrackedClaims(trackedClaimsPath);
  assert.equal(afterAck.entries[0]?.pendingUpdate, false);

  // update same stance (confidence change) → no pending
  await upsertEvidenceLink(
    {
      id: 'e1',
      claimId: 'c1',
      articleId: 'a1',
      url: null,
      stance: 'supports',
      sourceTier: 'sensor',
      confidence: 0.8,
      scores: null,
    },
    evidencePath,
    claimsPath,
    trackedClaimsPath,
  );
  const afterSameStance = await readTrackedClaims(trackedClaimsPath);
  assert.equal(afterSameStance.entries[0]?.pendingUpdate, false);

  // stance change → pendingUpdate true
  await upsertEvidenceLink(
    {
      id: 'e1',
      claimId: 'c1',
      articleId: 'a1',
      url: null,
      stance: 'contradicts',
      sourceTier: 'sensor',
      confidence: 0.8,
      scores: null,
    },
    evidencePath,
    claimsPath,
    trackedClaimsPath,
  );
  const afterStanceChange = await readTrackedClaims(trackedClaimsPath);
  assert.equal(afterStanceChange.entries[0]?.pendingUpdate, true);

  // removal does not set pending
  await ackTrackedClaimUpdate('c1', trackedClaimsPath);
  await removeEvidenceLink('e1', evidencePath, claimsPath);
  const afterRemove = await readTrackedClaims(trackedClaimsPath);
  assert.equal(afterRemove.entries[0]?.pendingUpdate, false);
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

test('readEvidenceLinks trims articleId/url, converts empty to null, and skips invalid rows', async () => {
  const { evidencePath } = tempStorePaths();

  await writeFile(
    evidencePath,
    `${JSON.stringify(
      [
        {
          id: 'e1',
          claimId: 'c1',
          articleId: '',
          url: '   ',
          stance: 'supports',
          sourceTier: 'sensor',
          confidence: 1,
          scores: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'e2',
          claimId: 'c1',
          articleId: '  a1  ',
          url: '',
          stance: 'mentions',
          sourceTier: 'sensor',
          confidence: 0.9,
          scores: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'e3',
          claimId: 'c1',
          articleId: null,
          url: '  https://example.com/post  ',
          stance: 'contradicts',
          sourceTier: 'primary',
          confidence: 0.8,
          scores: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      null,
      2,
    )}\n`,
    'utf8',
  );

  const links = await readEvidenceLinks(evidencePath);
  assert.equal(links.length, 2);

  const e2 = links.find((l) => l.id === 'e2');
  assert.ok(e2);
  assert.equal(e2.articleId, 'a1');
  assert.equal(e2.url, null);

  const e3 = links.find((l) => l.id === 'e3');
  assert.ok(e3);
  assert.equal(e3.articleId, null);
  assert.equal(e3.url, 'https://example.com/post');
});

