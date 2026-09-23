import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TypeSafeClient, noul } from '@typesafe-ai/sdk';
import {
  getTypeSafeClient,
  getTypeSafeModelName,
  resetTypeSafeClientForTests,
  systemOne,
} from './typesafeClient.js';

async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
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
    return await fn();
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

test('getTypeSafeClient returns null when TYPESAFE_API_KEY is missing', async () => {
  await withEnv({ TYPESAFE_API_KEY: undefined }, () => {
    resetTypeSafeClientForTests();
    assert.equal(getTypeSafeClient(), null);
  });
});

test('getTypeSafeClient returns a client when TYPESAFE_API_KEY is present (no network)', () => {
  return withEnv({ TYPESAFE_API_KEY: 'test-key' }, () => {
    resetTypeSafeClientForTests();
    const client = getTypeSafeClient();
    assert.ok(client);
    assert.ok(client instanceof TypeSafeClient);
  });
});

test('resetTypeSafeClientForTests restores lazy init state', async () => {
  await withEnv({ TYPESAFE_API_KEY: 'test-key' }, () => {
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

test('getTypeSafeModelName defaults to pinned Jev model', async () => {
  await withEnv({ TYPESAFE_MODEL: undefined }, () => {
    assert.equal(getTypeSafeModelName(), 'jev-1.13.0');
  });
});

test('getTypeSafeModelName uses trimmed TYPESAFE_MODEL override', async () => {
  await withEnv({ TYPESAFE_MODEL: '  jev-custom  ' }, () => {
    assert.equal(getTypeSafeModelName(), 'jev-custom');
  });
});

test('systemOne applies pinned model when omitted', async () => {
  let capturedModel: string | undefined;

  const injected = {
    systemOne: async (request: { model?: string }) => {
      capturedModel = request.model;
      return {
        model: request.model ?? 'missing',
        answers: { q: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
  } as unknown as TypeSafeClient;

  await withEnv({ TYPESAFE_MODEL: undefined }, async () => {
    await systemOne(
      {
        state: 'hello',
        questions: { q: noul('Is this a test?') },
      },
      injected,
    );

    assert.equal(capturedModel, 'jev-1.13.0');
  });
});

test('systemOne throws when no client is configured', async () => {
  await withEnv({ TYPESAFE_API_KEY: undefined }, async () => {
    resetTypeSafeClientForTests();
    await assert.rejects(
      () =>
        systemOne({
          state: 'hello',
          questions: { q: noul('Is this a test?') },
        }),
      /TypeSafe client not configured/,
    );
  });
});

