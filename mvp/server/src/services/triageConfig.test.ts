import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_TRIAGE_JEV_BUDGET,
  DEFAULT_TRIAGE_SUMMARY_BUDGET,
  isTriageEnabled,
  resolveTriageBudgets,
} from './triageConfig.js';

test('isTriageEnabled defaults on when TRIAGE_ENABLED is unset', () => {
  assert.equal(isTriageEnabled({}), true);
});

test('isTriageEnabled treats off values (trimmed, case-insensitive) as disabled', () => {
  for (const value of ['false', '0', 'off', 'no', ' FALSE ', 'Off', 'NO']) {
    assert.equal(isTriageEnabled({ TRIAGE_ENABLED: value }), false, value);
  }
});

test('isTriageEnabled stays on for any other value', () => {
  for (const value of ['true', '1', 'yes', 'on', '', 'banana']) {
    assert.equal(isTriageEnabled({ TRIAGE_ENABLED: value }), true, value);
  }
});

test('resolveTriageBudgets returns defaults when unset', () => {
  assert.deepEqual(resolveTriageBudgets({}), {
    jevCalls: DEFAULT_TRIAGE_JEV_BUDGET,
    summaries: DEFAULT_TRIAGE_SUMMARY_BUDGET,
  });
  assert.equal(DEFAULT_TRIAGE_JEV_BUDGET, 300);
  assert.equal(DEFAULT_TRIAGE_SUMMARY_BUDGET, 60);
});

test('resolveTriageBudgets parses trimmed non-negative integers', () => {
  assert.deepEqual(
    resolveTriageBudgets({ TRIAGE_JEV_BUDGET: ' 25 ', TRIAGE_SUMMARY_BUDGET: '7' }),
    { jevCalls: 25, summaries: 7 },
  );
});

test('resolveTriageBudgets accepts 0', () => {
  assert.deepEqual(
    resolveTriageBudgets({ TRIAGE_JEV_BUDGET: '0', TRIAGE_SUMMARY_BUDGET: '0' }),
    { jevCalls: 0, summaries: 0 },
  );
});

test('resolveTriageBudgets falls back to defaults for invalid values', () => {
  for (const value of ['', '  ', '-1', '1.5', 'abc', '10abc', '1e3', '+5']) {
    assert.deepEqual(
      resolveTriageBudgets({ TRIAGE_JEV_BUDGET: value, TRIAGE_SUMMARY_BUDGET: value }),
      { jevCalls: DEFAULT_TRIAGE_JEV_BUDGET, summaries: DEFAULT_TRIAGE_SUMMARY_BUDGET },
      value,
    );
  }
});
