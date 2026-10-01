import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { BriefSummaryRecord } from '../types/brief.js';
import { putBriefSummaries, readBriefSummaries } from './briefSummariesStore.js';

function tempSummariesPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'brief-summaries-'));
  return path.join(dir, 'nested', 'brief-summaries.json');
}

function okRecord(articleId: string, overrides: Partial<BriefSummaryRecord> = {}): BriefSummaryRecord {
  return {
    articleId,
    status: 'ok',
    text: `Summary for ${articleId}.`,
    sourceArticleId: articleId,
    sourceHash: '0123456789abcdef',
    model: 'test-model',
    error: null,
    generatedAt: '2026-09-30T12:00:00.000Z',
    trigger: 'refresh',
    ...overrides,
  };
}

test('readBriefSummaries returns an empty store when the file is missing', async () => {
  assert.deepEqual(await readBriefSummaries(tempSummariesPath()), {
    summaries: {},
    updatedAt: null,
  });
});

test('putBriefSummaries round-trips records as pretty JSON and stamps updatedAt', async () => {
  const summariesPath = tempSummariesPath();
  const unavailable = okRecord('b', {
    status: 'unavailable',
    text: null,
    sourceArticleId: null,
    sourceHash: null,
    model: null,
  });
  const failed = okRecord('c', {
    status: 'error',
    text: null,
    error: 'summary too short',
    trigger: 'on_demand',
  });

  await putBriefSummaries([okRecord('a'), unavailable, failed], summariesPath);

  const store = await readBriefSummaries(summariesPath);
  assert.deepEqual(store.summaries, { a: okRecord('a'), b: unavailable, c: failed });
  assert.ok(!Number.isNaN(Date.parse(store.updatedAt ?? '')));

  const raw = await readFile(summariesPath, 'utf8');
  assert.ok(raw.endsWith('}\n'));
  assert.ok(raw.includes('\n  "summaries": {'));
});

test('putBriefSummaries merges with existing records and overwrites by articleId', async () => {
  const summariesPath = tempSummariesPath();
  await putBriefSummaries([okRecord('a'), okRecord('b')], summariesPath);
  await putBriefSummaries([okRecord('b', { text: 'Newer summary text.' })], summariesPath);

  const { summaries } = await readBriefSummaries(summariesPath);
  assert.deepEqual(Object.keys(summaries).sort(), ['a', 'b']);
  assert.equal(summaries.b?.text, 'Newer summary text.');
});

test('concurrent putBriefSummaries calls never lose records and leave no temp files', async () => {
  const summariesPath = tempSummariesPath();
  const ids = Array.from({ length: 10 }, (_, i) => `article-${i}`);

  await Promise.all(ids.map((id) => putBriefSummaries([okRecord(id)], summariesPath)));

  const { summaries } = await readBriefSummaries(summariesPath);
  assert.deepEqual(Object.keys(summaries).sort(), [...ids].sort());
  const leftovers = (await readdir(path.dirname(summariesPath))).filter(
    (name) => name !== path.basename(summariesPath),
  );
  assert.deepEqual(leftovers, []);
});

test('a failed put does not block later puts to the same file', async () => {
  const summariesPath = tempSummariesPath();
  await putBriefSummaries([okRecord('seed')], summariesPath);
  await writeFile(summariesPath, JSON.stringify(['not', 'an', 'object']), 'utf8');
  await assert.rejects(putBriefSummaries([okRecord('bad')], summariesPath));

  await writeFile(summariesPath, JSON.stringify({ summaries: {} }), 'utf8');
  await putBriefSummaries([okRecord('after')], summariesPath);
  assert.deepEqual(Object.keys((await readBriefSummaries(summariesPath)).summaries), ['after']);
});

test('readBriefSummaries throws on a corrupt file', async () => {
  const summariesPath = tempSummariesPath();
  await putBriefSummaries([okRecord('seed')], summariesPath);

  await writeFile(summariesPath, '{ not json', 'utf8');
  await assert.rejects(readBriefSummaries(summariesPath), SyntaxError);

  await writeFile(summariesPath, JSON.stringify(['not', 'an', 'object']), 'utf8');
  await assert.rejects(readBriefSummaries(summariesPath), {
    message: 'brief-summaries.json must contain a JSON object',
  });
});

test('readBriefSummaries drops malformed records', async () => {
  const summariesPath = tempSummariesPath();
  await putBriefSummaries([okRecord('seed')], summariesPath);
  await writeFile(
    summariesPath,
    JSON.stringify({
      summaries: {
        good: okRecord('good'),
        keyMismatch: okRecord('other'),
        badStatus: { ...okRecord('badStatus'), status: 'verified' },
        badTrigger: { ...okRecord('badTrigger'), trigger: 'cron' },
        badText: { ...okRecord('badText'), text: 42 },
        noGeneratedAt: { ...okRecord('noGeneratedAt'), generatedAt: undefined },
        notObject: 'summary',
      },
      updatedAt: 7,
    }),
    'utf8',
  );

  assert.deepEqual(await readBriefSummaries(summariesPath), {
    summaries: { good: okRecord('good') },
    updatedAt: null,
  });
});
