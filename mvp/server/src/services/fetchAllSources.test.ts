import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countFetchTiers } from './fetchAllSources.js';

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

