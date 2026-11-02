import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REASON_TEXT_MAX,
  advisoryFromJev,
  advisoryForKeep,
  advisoryForNonAiDrop,
  parseAdvisoryVerdict,
  truncateReasonText,
} from './triageVerdict.js';

test('parseAdvisoryVerdict accepts all four fields', () => {
  assert.deepEqual(
    parseAdvisoryVerdict({
      verdict: 'approved',
      confidence: 0.82,
      reasonText: 'Relevant to Core topic Iran.',
      criteriaRef: 'topic:t-iran',
    }),
    {
      verdict: 'approved',
      confidence: 0.82,
      reasonText: 'Relevant to Core topic Iran.',
      criteriaRef: 'topic:t-iran',
    },
  );
});

test('parseAdvisoryVerdict falls back to filtered/unparseable on malformed input', () => {
  assert.deepEqual(parseAdvisoryVerdict(null), {
    verdict: 'filtered',
    confidence: 0,
    reasonText: 'unparseable',
    criteriaRef: 'global',
  });
  assert.deepEqual(parseAdvisoryVerdict({ verdict: 'maybe', confidence: 1, reasonText: 'x', criteriaRef: 'global' }), {
    verdict: 'filtered',
    confidence: 0,
    reasonText: 'unparseable',
    criteriaRef: 'global',
  });
  assert.deepEqual(parseAdvisoryVerdict({ verdict: 'approved', confidence: 2, reasonText: 'x', criteriaRef: 'global' }), {
    verdict: 'filtered',
    confidence: 0,
    reasonText: 'unparseable',
    criteriaRef: 'global',
  });
  assert.deepEqual(parseAdvisoryVerdict({ verdict: 'filtered', confidence: 0.5, reasonText: 12, criteriaRef: 'global' }), {
    verdict: 'filtered',
    confidence: 0,
    reasonText: 'unparseable',
    criteriaRef: 'global',
  });
});

test('truncateReasonText cuts at 300 characters', () => {
  const long = 'a'.repeat(REASON_TEXT_MAX + 40);
  const cut = truncateReasonText(long);
  assert.equal(cut.length, REASON_TEXT_MAX);
  assert.equal(truncateReasonText('short'), 'short');
});

test('advisoryForNonAiDrop uses confidence 1 and the rule in criteriaRef', () => {
  assert.deepEqual(
    advisoryForNonAiDrop({ criteriaRef: 'rule:mute:r1', reasonText: 'Muted by rule r1.' }),
    {
      verdict: 'filtered',
      confidence: 1,
      reasonText: 'Muted by rule r1.',
      criteriaRef: 'rule:mute:r1',
    },
  );
  assert.deepEqual(
    advisoryForNonAiDrop({
      criteriaRef: 'rule:duplicate',
      reasonText: 'x'.repeat(400),
    }).reasonText.length,
    REASON_TEXT_MAX,
  );
  assert.equal(
    advisoryForNonAiDrop({ criteriaRef: 'rule:budget', reasonText: 'Budget exhausted.' }).criteriaRef,
    'rule:budget',
  );
});

test('advisoryForKeep sets approved with truncated reasonText', () => {
  assert.deepEqual(
    advisoryForKeep({
      confidence: 0.7,
      reasonText: 'Kept for topics A and B.',
      criteriaRef: 'topic:a',
    }),
    {
      verdict: 'approved',
      confidence: 0.7,
      reasonText: 'Kept for topics A and B.',
      criteriaRef: 'topic:a',
    },
  );
});

test('advisoryFromJev cites feedback:<id> over topic and source refs', () => {
  const topics = new Map<string, never>();
  const answers = {
    relevance: {},
    undesired: {},
    quality: { choice: 'news' as const, confidence: 0.9 },
    significance: 2,
  };
  const keep = { decision: 'keep' as const, topicIds: ['t1'], labels: [], significance: 2 };
  const cited = advisoryFromJev(keep, answers, topics, 'macrumors', {
    id: 'fb-1',
    signal: 'like',
  });
  assert.equal(cited.criteriaRef, 'feedback:fb-1');
  assert.equal(cited.verdict, 'approved');
  assert.match(cited.reasonText, /feedback/i);
  assert.equal(advisoryFromJev(keep, answers, topics, 'macrumors').criteriaRef, 'source:macrumors');

  const offTopic = {
    decision: 'drop' as const,
    reason: 'off_topic' as const,
    topicIds: ['t1'],
    significance: 0,
  };
  const dropped = advisoryFromJev(offTopic, answers, topics, undefined, {
    id: 'fb-2',
    signal: 'not_relevant',
  });
  assert.equal(dropped.criteriaRef, 'feedback:fb-2');
  assert.equal(dropped.verdict, 'filtered');

  const muted = {
    decision: 'drop' as const,
    reason: 'muted:u1' as const,
    topicIds: ['t1'],
    significance: 0,
  };
  assert.equal(
    advisoryFromJev(muted, answers, topics, undefined, { id: 'fb-2', signal: 'not_relevant' })
      .criteriaRef,
    'topic:u1',
  );
});
