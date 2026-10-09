import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BriefSummaryRecord } from '../types/brief.js';
import type { BriefFullStoryRecord } from '../types/briefFullStory.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import { pruneBriefStores, type BriefRetentionDeps } from './briefRetention.js';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const DAYS_AGO = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function triageRecord(articleId: string, status: TriageRecord['status']): TriageRecord {
  return {
    articleId,
    status,
    reason: status === 'kept' ? null : 'duplicate',
    stage: 'headline',
    final: true,
    topicIds: ['t1'],
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: 1,
    significance: 1,
    bodyChecked: true,
    jevCalls: 1,
    triagedAt: DAYS_AGO(1),
  };
}

function summary(articleId: string, generatedAt: string): BriefSummaryRecord {
  return {
    articleId,
    status: 'ok',
    text: `Summary for ${articleId}.`,
    sourceArticleId: articleId,
    sourceHash: '0123456789abcdef',
    model: 'test-model',
    error: null,
    generatedAt,
    trigger: 'refresh',
  };
}

function fullStory(articleId: string, generatedAt: string): BriefFullStoryRecord {
  return {
    articleId,
    status: 'unavailable',
    enrichment: null,
    deterministic: {},
    sourceHash: null,
    topicSections: [],
    model: null,
    error: null,
    generatedAt,
    trigger: 'refresh',
  };
}

type Harness = {
  deps: BriefRetentionDeps;
  summaries: BriefSummaryRecord[];
  fullStories: BriefFullStoryRecord[];
};

function harness(
  triage: Record<string, TriageRecord['status']>,
  summaries: BriefSummaryRecord[],
  fullStories: BriefFullStoryRecord[],
  overrides: Partial<BriefRetentionDeps> = {},
): Harness {
  const store: TriageStore = {
    records: Object.fromEntries(
      Object.entries(triage).map(([id, status]) => [id, triageRecord(id, status)]),
    ),
    updatedAt: null,
  };
  const h: Harness = { deps: {}, summaries, fullStories };
  h.deps = {
    readTriage: async () => store,
    pruneBriefSummaries: async (keep) => {
      const before = h.summaries.length;
      h.summaries = h.summaries.filter(keep);
      return before - h.summaries.length;
    },
    pruneBriefFullStories: async (keep) => {
      const before = h.fullStories.length;
      h.fullStories = h.fullStories.filter(keep);
      return before - h.fullStories.length;
    },
    ...overrides,
  };
  return h;
}

const ids = (records: Array<{ articleId: string }>) => records.map((r) => r.articleId).sort();

test('pruneBriefStores drops records whose article is no longer kept and keeps kept ones', async () => {
  const h = harness(
    { keep: 'kept', dropped: 'dropped' },
    [summary('keep', DAYS_AGO(1)), summary('dropped', DAYS_AGO(1)), summary('gone', DAYS_AGO(1))],
    [fullStory('keep', DAYS_AGO(1)), fullStory('dropped', DAYS_AGO(1)), fullStory('gone', DAYS_AGO(1))],
  );

  const result = await pruneBriefStores({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.summaries), ['keep']);
  assert.deepEqual(ids(h.fullStories), ['keep']);
  assert.deepEqual(result, { summaries: 2, fullStories: 2, errors: [] });
});

test('pruneBriefStores drops kept records generated more than 7 days ago', async () => {
  const h = harness(
    { fresh: 'kept', edge: 'kept', old: 'kept', bad: 'kept' },
    [
      summary('fresh', DAYS_AGO(6)),
      summary('edge', DAYS_AGO(7)),
      summary('old', DAYS_AGO(7.01)),
      summary('bad', 'not a date'),
    ],
    [fullStory('fresh', DAYS_AGO(6)), fullStory('edge', DAYS_AGO(7)), fullStory('old', DAYS_AGO(8))],
  );

  const result = await pruneBriefStores({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.summaries), ['edge', 'fresh']);
  assert.deepEqual(ids(h.fullStories), ['edge', 'fresh']);
  assert.deepEqual(result, { summaries: 2, fullStories: 1, errors: [] });
});

test('pruneBriefStores prunes nothing when triage is unreadable', async () => {
  const h = harness({}, [summary('a', DAYS_AGO(1))], [fullStory('a', DAYS_AGO(1))], {
    readTriage: async () => {
      throw new Error('triage.json must contain a JSON object');
    },
  });

  const result = await pruneBriefStores({ now: NOW }, h.deps);

  assert.deepEqual(ids(h.summaries), ['a']);
  assert.deepEqual(ids(h.fullStories), ['a']);
  assert.deepEqual(result, {
    summaries: 0,
    fullStories: 0,
    errors: ['triage: triage.json must contain a JSON object'],
  });
});

test('a failing summaries prune does not stop the full-stories prune', async () => {
  const h = harness({}, [], [fullStory('gone', DAYS_AGO(1))], {
    pruneBriefSummaries: async () => {
      throw new Error('EACCES');
    },
  });

  const result = await pruneBriefStores({ now: NOW }, h.deps);

  assert.deepEqual(h.fullStories, []);
  assert.deepEqual(result, { summaries: 0, fullStories: 1, errors: ['summaries prune: EACCES'] });
});

test('a failing full-stories prune is reported after the summaries prune', async () => {
  const h = harness({}, [summary('gone', DAYS_AGO(1))], [], {
    pruneBriefFullStories: async () => {
      throw new Error('disk full');
    },
  });

  const result = await pruneBriefStores({ now: NOW }, h.deps);

  assert.deepEqual(h.summaries, []);
  assert.deepEqual(result, { summaries: 1, fullStories: 0, errors: ['full stories prune: disk full'] });
});
