import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { countFetchTiers } from './fetchAllSources.js';

const here = dirname(fileURLToPath(import.meta.url));

test('countFetchTiers counts primary vs sensor (undefined treated as sensor)', () => {
  const tiers = countFetchTiers([
    { sourceTier: 'primary' },
    { sourceTier: 'sensor' },
    {},
  ]);

  assert.deepEqual(tiers, {
    sensor: { fetched: 2, upserted: 2 },
    primary: { fetched: 1, upserted: 1 },
  });
});

test('NEWS-123: refresh path does not import or ship xcancel ingest', () => {
  const fetchAllSrc = readFileSync(join(here, 'fetchAllSources.ts'), 'utf8');
  assert.doesNotMatch(fetchAllSrc, /xcancel/i);
  assert.doesNotMatch(fetchAllSrc, /xcancelFetch/);
  assert.equal(existsSync(join(here, 'xcancelFetch.ts')), false);
});

