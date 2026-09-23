import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TypeSafeClient } from '@typesafe-ai/sdk';
import { resetTypeSafeClientForTests } from './typesafeClient.js';
import {
  buildClaimJudgeQuestions,
  judgeClaimCandidate,
  routeClaimJudgeAnswers,
  type ClaimJudgeAnswers,
  type ClaimJudgeState,
} from './typesafeClaimQuestions.js';

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

function fixtureAnswers(
  overrides: Partial<ClaimJudgeAnswers> = {},
): ClaimJudgeAnswers {
  return {
    isAssertable: { noul: 0.9 },
    claimType: {
      choice: 'event_occurrence',
      confidence: 0.95,
      probabilities: { event_occurrence: 0.95 },
    },
    claimAlignment: {
      choice: 'new',
      confidence: 0.95,
      probabilities: { new: 0.95 },
    },
    evidenceStance: {
      choice: 'supports',
      confidence: 0.95,
      probabilities: { supports: 0.95 },
    },
    sourceUtility: { score: 2, confidence: 0.95 },
    ...overrides,
  };
}

const baseState: ClaimJudgeState = {
  articleExcerpt: 'Excerpt about an incident.',
  candidateText: 'Candidate claim text.',
  candidateQuote: null,
  existingClaims: [
    { id: 'c1', text: 'Existing claim one', claimType: 'event_occurrence' },
    { id: 'c2', text: 'Existing claim two', claimType: 'attribution' },
  ],
};

test('buildClaimJudgeQuestions includes all five keys and closed option sets', () => {
  const qs = buildClaimJudgeQuestions(baseState.existingClaims);

  assert.deepEqual(Object.keys(qs).sort(), [
    'claimAlignment',
    'claimType',
    'evidenceStance',
    'isAssertable',
    'sourceUtility',
  ]);

  assert.equal(qs.claimType.type, 'choice');
  assert.deepEqual(Object.keys(qs.claimType.criteria).sort(), [
    'attribution',
    'casualty_or_count',
    'event_occurrence',
    'official_statement',
    'territorial_or_control',
  ]);

  assert.equal(qs.claimAlignment.type, 'choice');
  const alignmentKeys = Object.keys(qs.claimAlignment.criteria);
  assert.ok(alignmentKeys.includes('new'));
  assert.ok(alignmentKeys.includes('c1'));
  assert.ok(alignmentKeys.includes('c2'));
});

test('routeClaimJudgeAnswers: high-confidence answers do not need review', () => {
  const routed = routeClaimJudgeAnswers(fixtureAnswers());
  assert.equal(routed.needsReview, false);
  assert.deepEqual(routed.reviewReasons, []);
});

test('routeClaimJudgeAnswers: low choice confidence gates to needsReview', () => {
  const routed = routeClaimJudgeAnswers(
    fixtureAnswers({
      claimType: {
        choice: 'event_occurrence',
        confidence: 0.59,
        probabilities: { event_occurrence: 0.59 },
      },
    }),
  );
  assert.equal(routed.needsReview, true);
  assert.ok(routed.reviewReasons.includes('low_confidence:claimType'));
});

test('routeClaimJudgeAnswers: assertable noul in uncertain band needs review', () => {
  const routed = routeClaimJudgeAnswers(
    fixtureAnswers({
      isAssertable: { noul: 0.5 },
    }),
  );
  assert.equal(routed.needsReview, true);
  assert.ok(routed.reviewReasons.includes('uncertain:isAssertable'));
});

test('judgeClaimCandidate: injected mock client yields ok result', async () => {
  const injected = {
    systemOne: async (_request: unknown) => {
      return {
        model: 'jev-test',
        answers: {
          isAssertable: { type: 'noul', noul: 0.9 },
          claimType: {
            type: 'choice',
            choice: 'event_occurrence',
            confidence: 0.95,
            probabilities: {
              event_occurrence: 0.95,
              attribution: 0.01,
              casualty_or_count: 0.01,
              official_statement: 0.01,
              territorial_or_control: 0.02,
            },
          },
          claimAlignment: {
            type: 'choice',
            choice: 'new',
            confidence: 0.95,
            probabilities: {
              new: 0.95,
              c1: 0.03,
              c2: 0.02,
            },
          },
          evidenceStance: {
            type: 'choice',
            choice: 'supports',
            confidence: 0.95,
            probabilities: {
              supports: 0.95,
              contradicts: 0.02,
              mentions: 0.03,
            },
          },
          sourceUtility: {
            type: 'score',
            score: 2,
            confidence: 0.95,
            legend: {
              0: 'Sensor reprint / low novelty',
              1: 'Useful sensor detail',
              2: 'Strong primary-grade evidence',
            },
            probabilities: { 0: 0.01, 1: 0.04, 2: 0.95 },
          },
        },
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
  } as unknown as TypeSafeClient;

  const res = await judgeClaimCandidate(baseState, { client: injected });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.model, 'jev-test');
    assert.equal(res.needsReview, false);
    assert.equal(res.answers.claimType.choice, 'event_occurrence');
    assert.equal(res.answers.claimAlignment.choice, 'new');
  }
});

test('judgeClaimCandidate: missing client path returns ok:false (no secrets)', async () => {
  await withEnv({ TYPESAFE_API_KEY: undefined }, async () => {
    resetTypeSafeClientForTests();
    const res = await judgeClaimCandidate(baseState);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(
        res.error,
        'TypeSafe service not available — TYPESAFE_API_KEY not configured',
      );
      assert.equal(res.model, null);
    }
  });
});

