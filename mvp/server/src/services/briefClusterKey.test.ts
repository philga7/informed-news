import assert from 'node:assert/strict';
import { test } from 'node:test';
import { briefClusterKey, isSoloClusterKey } from './briefClusterKey.js';

test('briefClusterKey returns trimmed clusterId when present', () => {
  assert.equal(
    briefClusterKey({ id: 'a1', clusterId: '  c1  ' }),
    'c1',
  );
});

test('briefClusterKey returns solo key when clusterId is null', () => {
  assert.equal(briefClusterKey({ id: 'a1', clusterId: null }), 'solo:a1');
});

test('briefClusterKey returns solo key when clusterId is empty or whitespace', () => {
  assert.equal(briefClusterKey({ id: 'a2', clusterId: '' }), 'solo:a2');
  assert.equal(briefClusterKey({ id: 'a3', clusterId: '   ' }), 'solo:a3');
});

test('isSoloClusterKey identifies solo keys', () => {
  assert.equal(isSoloClusterKey('solo:a1'), true);
  assert.equal(isSoloClusterKey('c1'), false);
  assert.equal(isSoloClusterKey('singleton:a1'), false);
});
