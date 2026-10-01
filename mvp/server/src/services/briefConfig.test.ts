import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_REFRESH_INTERVAL_HOURS,
  MIN_REFRESH_INTERVAL_HOURS,
  resolveRefreshIntervalHours,
} from './briefConfig.js';

test('resolveRefreshIntervalHours defaults to 3 hours when unset', () => {
  assert.equal(DEFAULT_REFRESH_INTERVAL_HOURS, 3);
  assert.equal(resolveRefreshIntervalHours({}), 3);
});

test('resolveRefreshIntervalHours accepts trimmed decimals', () => {
  assert.equal(resolveRefreshIntervalHours({ REFRESH_INTERVAL_HOURS: '2.5' }), 2.5);
  assert.equal(resolveRefreshIntervalHours({ REFRESH_INTERVAL_HOURS: ' 6 ' }), 6);
});

test('resolveRefreshIntervalHours treats off values (trimmed, case-insensitive) as disabled', () => {
  for (const value of ['0', 'off', 'false', 'no', ' OFF ', 'False', 'NO']) {
    assert.equal(resolveRefreshIntervalHours({ REFRESH_INTERVAL_HOURS: value }), null, value);
  }
});

test('resolveRefreshIntervalHours clamps small intervals up to the minimum', () => {
  assert.equal(MIN_REFRESH_INTERVAL_HOURS, 0.25);
  assert.equal(resolveRefreshIntervalHours({ REFRESH_INTERVAL_HOURS: '0.1' }), 0.25);
});

test('resolveRefreshIntervalHours falls back to the default for invalid values', () => {
  for (const value of ['abc', '', '  ', '-1', '0.0', '2h', 'Infinity', '1e3', '+5']) {
    assert.equal(resolveRefreshIntervalHours({ REFRESH_INTERVAL_HOURS: value }), 3, value);
  }
});
