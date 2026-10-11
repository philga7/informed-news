import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRetryableNetworkError } from './isRetryableNetworkError.js';

test('isRetryableNetworkError matches timeout / abort / reset / fetch-failed messages', () => {
  assert.equal(isRetryableNetworkError(new Error('The operation was aborted')), true);
  assert.equal(isRetryableNetworkError(new Error('request timeout')), true);
  assert.equal(isRetryableNetworkError(new Error('read ECONNRESET')), true);
  assert.equal(isRetryableNetworkError(new Error('connect ETIMEDOUT')), true);
  assert.equal(isRetryableNetworkError(new Error('fetch failed')), true);
  assert.equal(isRetryableNetworkError(new Error('HTTP 500')), false);
  assert.equal(isRetryableNetworkError('aborted'), false);
  assert.equal(isRetryableNetworkError(null), false);
});
