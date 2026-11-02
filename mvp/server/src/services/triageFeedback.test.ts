import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  createFeedback,
  readFeedback,
  removeFeedback,
  type FeedbackEntry,
} from '../store/feedbackStore.js';
import {
  DEFAULT_FEEDBACK_MAX_ENTRIES,
  DEFAULT_FEEDBACK_TOKEN_BUDGET,
  DEFAULT_TRIAGE_JEV_BUDGET,
  resolveFeedbackLimits,
  resolveTriageBudgets,
} from './triageConfig.js';
import {
  estimateFeedbackTokens,
  selectFeedback,
  type FeedbackMatch,
} from './triageFeedback.js';

function entry(n: number, over: Partial<FeedbackEntry> = {}, source = 'other.com'): FeedbackEntry {
  const ts = new Date(Date.UTC(2026, 8, 1, 0, n)).toISOString();
  return {
    id: `f${n}`,
    itemId: `item${n}`,
    signal: 'like',
    comment: '',
    ts,
    snapshot: { headline: `Headline ${n}`, source, url: `https://x.test/${n}`, topics: [] },
    ...over,
  };
}

const LIMITS = { maxEntries: 20, tokenBudget: 100_000 };
const NONE: FeedbackMatch = { source: 'nowhere.test', topicIds: [] };
const ids = (entries: readonly FeedbackEntry[]) => entries.map((e) => e.id);

test('defaults are 20 entries and 1500 tokens; env overrides them; invalid falls back', () => {
  assert.equal(DEFAULT_FEEDBACK_MAX_ENTRIES, 20);
  assert.equal(DEFAULT_FEEDBACK_TOKEN_BUDGET, 1500);
  assert.deepEqual(resolveFeedbackLimits({}), { maxEntries: 20, tokenBudget: 1500 });
  assert.deepEqual(
    resolveFeedbackLimits({
      TRIAGE_FEEDBACK_MAX_ENTRIES: ' 5 ',
      TRIAGE_FEEDBACK_TOKEN_BUDGET: '300',
    }),
    { maxEntries: 5, tokenBudget: 300 },
  );
  assert.deepEqual(
    resolveFeedbackLimits({ TRIAGE_FEEDBACK_MAX_ENTRIES: 'x', TRIAGE_FEEDBACK_TOKEN_BUDGET: '-1' }),
    { maxEntries: 20, tokenBudget: 1500 },
  );
});

test('TRIAGE_JEV_BUDGET stays 300 and feedback env does not touch it', () => {
  assert.equal(DEFAULT_TRIAGE_JEV_BUDGET, 300);
  assert.equal(
    resolveTriageBudgets({ TRIAGE_FEEDBACK_MAX_ENTRIES: '1', TRIAGE_FEEDBACK_TOKEN_BUDGET: '1' })
      .jevCalls,
    300,
  );
});

test('selectFeedback is newest first when nothing matches', () => {
  const entries = [entry(1), entry(3), entry(2)];
  assert.deepEqual(ids(selectFeedback(entries, NONE, LIMITS)), ['f3', 'f2', 'f1']);
});

test('selectFeedback prefers the same source or a matching topic, newest first within each tier', () => {
  const entries = [
    entry(5),
    entry(4, {}, 'reuters.com'),
    entry(3),
    entry(2, {
      snapshot: {
        headline: 'h',
        source: 'a.com',
        url: 'https://x.test/2',
        topics: [{ id: 'iran', name: 'Iran' }],
      },
    }),
    entry(1, {}, 'reuters.com'),
  ];
  const picked = selectFeedback(entries, { source: 'reuters.com', topicIds: ['iran'] }, LIMITS);
  assert.deepEqual(ids(picked), ['f4', 'f2', 'f1', 'f5', 'f3']);
});

test('selectFeedback caps the count', () => {
  const entries = Array.from({ length: 30 }, (_, i) => entry(i + 1));
  assert.equal(selectFeedback(entries, NONE, { maxEntries: 20, tokenBudget: 100_000 }).length, 20);
  assert.equal(selectFeedback(entries, NONE, { maxEntries: 3, tokenBudget: 100_000 }).length, 3);
  assert.equal(selectFeedback(entries, NONE, { maxEntries: 0, tokenBudget: 100_000 }).length, 0);
});

test('selectFeedback stops at the token budget (chars/4)', () => {
  const entries = [entry(3), entry(2), entry(1)];
  const one = estimateFeedbackTokens(entries[0]!);
  assert.ok(one > 0);
  const picked = selectFeedback(entries, NONE, { maxEntries: 20, tokenBudget: one * 2 });
  assert.deepEqual(ids(picked), ['f3', 'f2']);
  const total = picked.reduce((sum, e) => sum + estimateFeedbackTokens(e), 0);
  assert.ok(total <= one * 2);
  assert.deepEqual(selectFeedback(entries, NONE, { maxEntries: 20, tokenBudget: one - 1 }), []);
});

test('a deleted entry is absent from the next selection', async () => {
  const feedbackPath = path.join(mkdtempSync(path.join(tmpdir(), 'tfb-')), 'feedback.json');
  const snapshot = { headline: 'Port strike', source: 'a.com', url: 'https://a.com/1', topics: [] };
  const first = await createFeedback({ itemId: 'i1', signal: 'like', snapshot }, feedbackPath);
  const second = await createFeedback(
    { itemId: 'i2', signal: 'not_relevant', comment: 'meh', snapshot },
    feedbackPath,
  );

  const before = selectFeedback((await readFeedback(feedbackPath)).entries, NONE, LIMITS);
  assert.deepEqual(new Set(ids(before)), new Set([first.entry.id, second.entry.id]));

  await removeFeedback(first.entry.id, feedbackPath);
  const after = selectFeedback((await readFeedback(feedbackPath)).entries, NONE, LIMITS);
  assert.deepEqual(ids(after), [second.entry.id]);
});
