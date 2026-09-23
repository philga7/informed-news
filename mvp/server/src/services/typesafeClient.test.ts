import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import {
  getTypeSafeClient,
  resetTypeSafeClientForTests,
} from './typesafeClient.js';

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('getTypeSafeClient returns null when TYPESAFE_API_KEY is missing', () => {
  withEnv({ TYPESAFE_API_KEY: undefined }, () => {
    resetTypeSafeClientForTests();
    assert.equal(getTypeSafeClient(), null);
  });
});

test('getTypeSafeClient returns a client when TYPESAFE_API_KEY is present (no network)', () => {
  withEnv({ TYPESAFE_API_KEY: 'test-key' }, () => {
    resetTypeSafeClientForTests();
    const client = getTypeSafeClient();
    assert.ok(client);
    assert.ok(client instanceof TypeSafeClient);
  });
});

test('resetTypeSafeClientForTests restores lazy init state', () => {
  withEnv({ TYPESAFE_API_KEY: 'test-key' }, () => {
    resetTypeSafeClientForTests();
    const first = getTypeSafeClient();
    assert.ok(first);

    // Cached client should be returned even if env changes.
    delete process.env.TYPESAFE_API_KEY;
    const stillCached = getTypeSafeClient();
    assert.equal(stillCached, first);

    // After reset, missing key should yield null.
    resetTypeSafeClientForTests();
    assert.equal(getTypeSafeClient(), null);
  });
});

