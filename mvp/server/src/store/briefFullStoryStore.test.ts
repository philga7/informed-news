import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { BriefFullStoryRecord } from '../types/briefFullStory.js';
import {
  pruneBriefFullStoriesByKeptIds,
  putBriefFullStories,
  readBriefFullStories,
  writeBriefFullStories,
} from './briefFullStoryStore.js';

function tempFullStoriesPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'brief-full-stories-'));
  return path.join(dir, 'nested', 'brief-full-stories.json');
}

function okRecord(articleId: string, overrides: Partial<BriefFullStoryRecord> = {}): BriefFullStoryRecord {
  return {
    articleId,
    status: 'ok',
    enrichment: {
      talking_points: ['Point one'],
      timeline: [{ date: '2026-10-01', content: 'Event' }],
      suggested_qna: [{ question: 'What changed?', answer: 'Verify with sources.' }],
    },
    deterministic: {
      perspectives: [{ text: 'Headline angle', sources: [{ name: 'example.com', url: 'https://example.com/a' }] }],
      quote: {
        quote: 'A quoted line.',
        quote_author: null,
        quote_attribution: 'Example',
        quote_source_url: 'https://example.com/a',
        quote_source_domain: 'example.com',
      },
    },
    sourceHash: '0123456789abcdef',
    topicSections: ['business', 'history'],
    model: 'test-model',
    error: null,
    generatedAt: '2026-09-30T12:00:00.000Z',
    trigger: 'refresh',
    ...overrides,
  };
}

test('readBriefFullStories returns an empty store when the file is missing', async () => {
  assert.deepEqual(await readBriefFullStories(tempFullStoriesPath()), {
    fullStories: {},
    updatedAt: null,
  });
});

test('readBriefFullStories treats an empty file as an empty store', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  await mkdir(path.dirname(fullStoriesPath), { recursive: true });
  await writeFile(fullStoriesPath, '   \n', 'utf8');
  assert.deepEqual(await readBriefFullStories(fullStoriesPath), {
    fullStories: {},
    updatedAt: null,
  });
});

test('putBriefFullStories round-trips records as pretty JSON and stamps updatedAt', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  const unavailable = okRecord('b', {
    status: 'unavailable',
    enrichment: null,
    sourceHash: null,
    model: null,
  });
  const failed = okRecord('c', {
    status: 'error',
    enrichment: null,
    error: 'Ollama timeout',
    trigger: 'on_demand',
  });

  await putBriefFullStories([okRecord('a'), unavailable, failed], fullStoriesPath);

  const store = await readBriefFullStories(fullStoriesPath);
  assert.deepEqual(store.fullStories, { a: okRecord('a'), b: unavailable, c: failed });
  assert.ok(!Number.isNaN(Date.parse(store.updatedAt ?? '')));

  const raw = await readFile(fullStoriesPath, 'utf8');
  assert.ok(raw.endsWith('}\n'));
  assert.ok(raw.includes('\n  "fullStories": {'));
});

test('putBriefFullStories merges with existing records and overwrites by articleId', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  await putBriefFullStories([okRecord('a'), okRecord('b')], fullStoriesPath);
  await putBriefFullStories(
    [okRecord('b', { changeSummary: '2 new outlets; timeline +1', updatedAt: '2026-10-01T00:00:00.000Z' })],
    fullStoriesPath,
  );

  const { fullStories } = await readBriefFullStories(fullStoriesPath);
  assert.deepEqual(Object.keys(fullStories).sort(), ['a', 'b']);
  assert.equal(fullStories.b?.changeSummary, '2 new outlets; timeline +1');
});

test('concurrent putBriefFullStories calls never lose records and leave no temp files', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  const ids = Array.from({ length: 10 }, (_, i) => `article-${i}`);

  await Promise.all(ids.map((id) => putBriefFullStories([okRecord(id)], fullStoriesPath)));

  const { fullStories } = await readBriefFullStories(fullStoriesPath);
  assert.deepEqual(Object.keys(fullStories).sort(), [...ids].sort());
  const leftovers = (await readdir(path.dirname(fullStoriesPath))).filter(
    (name) => name !== path.basename(fullStoriesPath),
  );
  assert.deepEqual(leftovers, []);
});

test('putBriefFullStories prunes non-kept article ids when keptArticleIds is provided', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  await putBriefFullStories([okRecord('keep'), okRecord('drop')], fullStoriesPath);
  await putBriefFullStories([okRecord('keep', { changeSummary: 'updated' })], fullStoriesPath, {
    keptArticleIds: new Set(['keep']),
  });

  const { fullStories } = await readBriefFullStories(fullStoriesPath);
  assert.deepEqual(Object.keys(fullStories), ['keep']);
});

test('pruneBriefFullStoriesByKeptIds drops records not in the kept set', () => {
  const store = {
    fullStories: { a: okRecord('a'), b: okRecord('b') },
    updatedAt: '2026-09-30T12:00:00.000Z',
  };
  const pruned = pruneBriefFullStoriesByKeptIds(store, new Set(['b']));
  assert.deepEqual(Object.keys(pruned.fullStories), ['b']);
  assert.equal(pruned.updatedAt, store.updatedAt);
});

test('writeBriefFullStories replaces the whole store', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  await putBriefFullStories([okRecord('a'), okRecord('b')], fullStoriesPath);
  await writeBriefFullStories({ fullStories: { c: okRecord('c') }, updatedAt: null }, fullStoriesPath);
  assert.deepEqual(Object.keys((await readBriefFullStories(fullStoriesPath)).fullStories), ['c']);
});

test('a failed put does not block later puts to the same file', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  await putBriefFullStories([okRecord('seed')], fullStoriesPath);
  await writeFile(fullStoriesPath, JSON.stringify(['not', 'an', 'object']), 'utf8');
  await assert.rejects(putBriefFullStories([okRecord('bad')], fullStoriesPath));

  await writeFile(fullStoriesPath, JSON.stringify({ fullStories: {} }), 'utf8');
  await putBriefFullStories([okRecord('after')], fullStoriesPath);
  assert.deepEqual(Object.keys((await readBriefFullStories(fullStoriesPath)).fullStories), ['after']);
});

test('readBriefFullStories throws on a corrupt file', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  await putBriefFullStories([okRecord('seed')], fullStoriesPath);

  await writeFile(fullStoriesPath, '{ not json', 'utf8');
  await assert.rejects(readBriefFullStories(fullStoriesPath), SyntaxError);

  await writeFile(fullStoriesPath, JSON.stringify(['not', 'an', 'object']), 'utf8');
  await assert.rejects(readBriefFullStories(fullStoriesPath), {
    message: 'brief-full-stories.json must contain a JSON object',
  });
});

test('readBriefFullStories drops malformed records', async () => {
  const fullStoriesPath = tempFullStoriesPath();
  await putBriefFullStories([okRecord('seed')], fullStoriesPath);
  await writeFile(
    fullStoriesPath,
    JSON.stringify({
      fullStories: {
        good: okRecord('good'),
        keyMismatch: okRecord('other'),
        badStatus: { ...okRecord('badStatus'), status: 'verified' },
        badTrigger: { ...okRecord('badTrigger'), trigger: 'cron' },
        badEnrichment: { ...okRecord('badEnrichment'), enrichment: { talking_points: 'nope' } },
        noGeneratedAt: { ...okRecord('noGeneratedAt'), generatedAt: undefined },
        notObject: 'story',
      },
      updatedAt: 7,
    }),
    'utf8',
  );

  assert.deepEqual(await readBriefFullStories(fullStoriesPath), {
    fullStories: { good: okRecord('good') },
    updatedAt: null,
  });
});
