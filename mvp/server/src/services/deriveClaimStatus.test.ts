import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EvidenceLink } from '../types/claim.js';
import {
  CONFIDENCE_FLOOR,
  PRIMARY_SUPPORT_FLOOR,
  deriveClaimStatus,
} from './deriveClaimStatus.js';

function link(overrides: Partial<EvidenceLink>): EvidenceLink {
  return {
    id: 'l1',
    claimId: 'c1',
    articleId: null,
    url: 'https://example.com',
    stance: 'mentions',
    sourceTier: 'sensor',
    confidence: 1,
    scores: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('deriveClaimStatus: no links → insufficient_evidence', async () => {
  assert.equal(deriveClaimStatus([]), 'insufficient_evidence');
});

test('deriveClaimStatus: only mentions (high confidence) → insufficient_evidence', async () => {
  assert.equal(
    deriveClaimStatus([
      link({ stance: 'mentions', confidence: 0.99 }),
      link({ id: 'l2', stance: 'mentions', confidence: 1 }),
    ]),
    'insufficient_evidence',
  );
});

test('deriveClaimStatus: sensor supports only (conf ≥ floor) → reported', async () => {
  assert.equal(
    deriveClaimStatus([
      link({
        stance: 'supports',
        sourceTier: 'sensor',
        confidence: CONFIDENCE_FLOOR,
      }),
    ]),
    'reported',
  );
});

test('deriveClaimStatus: primary support conf ≥ PRIMARY_SUPPORT_FLOOR → supported_by_primary', async () => {
  assert.equal(
    deriveClaimStatus([
      link({
        stance: 'supports',
        sourceTier: 'primary',
        confidence: PRIMARY_SUPPORT_FLOOR,
      }),
    ]),
    'supported_by_primary',
  );
});

test('deriveClaimStatus: primary support but conf between floors → reported', async () => {
  const confidence = (CONFIDENCE_FLOOR + PRIMARY_SUPPORT_FLOOR) / 2;
  assert.ok(confidence >= CONFIDENCE_FLOOR);
  assert.ok(confidence < PRIMARY_SUPPORT_FLOOR);

  assert.equal(
    deriveClaimStatus([
      link({
        stance: 'supports',
        sourceTier: 'primary',
        confidence,
      }),
    ]),
    'reported',
  );
});

test('deriveClaimStatus: supports + contradicts (both qualifying) → contested (wins over primary support)', async () => {
  assert.equal(
    deriveClaimStatus([
      link({
        stance: 'supports',
        sourceTier: 'primary',
        confidence: 1,
      }),
      link({
        id: 'l2',
        stance: 'contradicts',
        sourceTier: 'sensor',
        confidence: 1,
      }),
    ]),
    'contested',
  );
});

test('deriveClaimStatus: many sensor supports do not become supported_by_primary', async () => {
  const links = Array.from({ length: 10 }, (_, i) =>
    link({
      id: `l${i + 1}`,
      stance: 'supports',
      sourceTier: 'sensor',
      confidence: 1,
    }),
  );

  assert.equal(deriveClaimStatus(links), 'reported');
});

test('deriveClaimStatus: links below CONFIDENCE_FLOOR ignored', async () => {
  assert.equal(
    deriveClaimStatus([
      link({
        stance: 'supports',
        sourceTier: 'primary',
        confidence: CONFIDENCE_FLOOR - 0.0001,
      }),
      link({
        id: 'l2',
        stance: 'mentions',
        confidence: 1,
      }),
    ]),
    'insufficient_evidence',
  );
});
