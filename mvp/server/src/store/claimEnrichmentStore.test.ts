import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  getClaimEnrichment,
  readClaimEnrichments,
  upsertClaimEnrichment,
} from './claimEnrichmentStore.js';

function tempStorePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-enrichments-'));
  return path.join(dir, 'claim-enrichments.json');
}

test('readClaimEnrichments returns empty when file is missing', async () => {
  const storePath = tempStorePath();
  const records = await readClaimEnrichments(storePath);
  assert.deepEqual(records, []);
});

test('upsertClaimEnrichment persists and getClaimEnrichment reads it back', async () => {
  const storePath = tempStorePath();

  await upsertClaimEnrichment(
    {
      claimId: 'claim-1',
      enrichment: {
        short_summary: 'A careful summary.',
        talking_points: ['Point A', 'Point B'],
      },
      enrichedAt: '2026-09-24T00:00:00.000Z',
      enrichError: null,
      model: 'glm-5.3-flash',
    },
    storePath,
  );

  const record = await getClaimEnrichment('claim-1', storePath);
  assert.ok(record);
  assert.equal(record.claimId, 'claim-1');
  assert.equal(record.enrichment?.short_summary, 'A careful summary.');
  assert.deepEqual(record.enrichment?.talking_points, ['Point A', 'Point B']);
  assert.equal(record.enrichError, null);
});

test('readClaimEnrichments normalizes invalid rows and trims values', async () => {
  const storePath = tempStorePath();
  writeFileSync(
    storePath,
    JSON.stringify([
      {
        claimId: ' claim-1 ',
        enrichment: {
          short_summary: '  Summary  ',
          talking_points: [' Point A ', '', 'Point B'],
        },
        enrichedAt: '2026-09-24T00:00:00.000Z',
        enrichError: null,
        model: 'glm-5.3-flash',
      },
      {
        claimId: 'claim-2',
        enrichment: {
          short_summary: '   ',
          talking_points: ['Ignored'],
        },
        enrichedAt: '2026-09-24T00:00:00.000Z',
        enrichError: null,
        model: 'glm-5.3-flash',
      },
      null,
    ]),
    'utf8',
  );

  const records = await readClaimEnrichments(storePath);
  assert.deepEqual(records, [
    {
      claimId: 'claim-1',
      enrichment: {
        short_summary: 'Summary',
        talking_points: ['Point A', 'Point B'],
      },
      enrichedAt: '2026-09-24T00:00:00.000Z',
      enrichError: null,
      model: 'glm-5.3-flash',
    },
    {
      claimId: 'claim-2',
      enrichment: null,
      enrichedAt: '2026-09-24T00:00:00.000Z',
      enrichError: null,
      model: 'glm-5.3-flash',
    },
  ]);
});
