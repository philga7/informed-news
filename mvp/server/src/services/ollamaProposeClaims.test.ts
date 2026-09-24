import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Ollama } from 'ollama';
import { resetOllamaClient } from './ollamaFraming.js';
import { proposeClaimCandidates } from './ollamaProposeClaims.js';

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

function mockOllamaClient(content: string): Ollama {
  return {
    chat: async () => ({
      message: { content },
    }),
  } as unknown as Ollama;
}

test('proposeClaimCandidates: missing client returns ok:false', async () => {
  await withEnv({ OLLAMA_API_KEY: undefined }, async () => {
    resetOllamaClient();
    const res = await proposeClaimCandidates({
      title: 'Border clash reported',
      snippet: 'Officials said fighting continued overnight.',
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(
        res.error,
        'Ollama service not available — OLLAMA_API_KEY not configured',
      );
      assert.equal(res.model, null);
      assert.equal(res.rawText, null);
    }
  });
});

test('proposeClaimCandidates: injected mock client validates candidates', async () => {
  const fixture = JSON.stringify({
    candidates: [
      {
        text: 'Fighting continued overnight near the border',
        claimTypeGuess: 'event_occurrence',
        quote: 'fighting continued overnight',
      },
      {
        text: 'Invalid type should null',
        claimTypeGuess: 'not_a_real_type',
        quote: 'Invalid type',
      },
      {
        text: '',
        claimTypeGuess: 'attribution',
        quote: 'drop me',
      },
      {
        text: 'Officials attributed the strike to drone fire',
        claimTypeGuess: 'attribution',
        quote: null,
      },
    ],
  });

  const res = await proposeClaimCandidates(
    {
      title: 'Border clash reported',
      snippet: 'Officials said fighting continued overnight.',
      publisherDomain: 'example.com',
    },
    { client: mockOllamaClient(fixture), model: 'test-model' },
  );

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.model, 'test-model');
    assert.equal(res.candidates.length, 3);
    assert.deepEqual(res.candidates[0], {
      text: 'Fighting continued overnight near the border',
      claimTypeGuess: 'event_occurrence',
      quote: 'fighting continued overnight',
    });
    assert.deepEqual(res.candidates[1], {
      text: 'Invalid type should null',
      claimTypeGuess: null,
      quote: 'Invalid type',
    });
    assert.deepEqual(res.candidates[2], {
      text: 'Officials attributed the strike to drone fire',
      claimTypeGuess: 'attribution',
      quote: null,
    });
  }
});

test('proposeClaimCandidates: malformed JSON returns ok:false', async () => {
  const res = await proposeClaimCandidates(
    {
      title: 'Border clash reported',
      snippet: 'Officials said fighting continued overnight.',
    },
    { client: mockOllamaClient('definitely not json'), model: 'test-model' },
  );

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.match(res.error, /Could not parse JSON from model response/);
    assert.equal(res.model, 'test-model');
    assert.equal(res.rawText, 'definitely not json');
  }
});
