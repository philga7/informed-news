import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  putCitationCheckLog,
  readCitationCheckLog,
  readCitationSources,
  registerCitationSources,
} from '../../store/index.js';
import type {
  CitationCheckItem,
  CitationSourceRecord,
} from '../../types/citationGuard.js';
import {
  citationCheckItemId,
  citationGuardRunId,
  registerSourcesAndRunCitationGuard,
  runCitationGuardForArticle,
} from './runCitationGuard.js';

function hash16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'citation-guard-run-'));
}

test('citationGuardRunId prefers a shared refresh run id', () => {
  const now = new Date('2026-10-27T12:00:00.000Z');
  assert.equal(citationGuardRunId(now, '2026-10-27T11:00:00.000Z'), '2026-10-27T11:00:00.000Z');
  assert.equal(citationGuardRunId(now), '2026-10-27T12:00:00.000Z');
});

test('citationCheckItemId uses normalized url or sha256-16 of quote', () => {
  assert.equal(
    citationCheckItemId({ kind: 'url', url: ' https://Example.com/a ' }),
    'https://example.com/a',
  );
  const quote = 'Talks resumed today.';
  assert.equal(
    citationCheckItemId({ kind: 'quote', quote }),
    `quote:${hash16(quote)}`,
  );
});

test('runCitationGuardForArticle writes log and returns match / missing-source / mismatch', async () => {
  const dir = tempDir();
  const logPath = path.join(dir, 'citation-check-log.json');
  const now = new Date('2026-10-27T12:00:00.000Z');
  const sourceText = 'Officials said talks resumed today at the summit.';
  const sourcesForRun: CitationSourceRecord[] = [
    {
      id: `${hash16(sourceText)}:run-1`,
      url: 'https://publisher.example/story',
      text: sourceText,
      fetchedAt: now.toISOString(),
      runId: 'run-1',
      contentHash: hash16(sourceText),
      articleId: 'art-1',
    },
  ];
  const items: CitationCheckItem[] = [
    { kind: 'quote', quote: 'talks resumed today' },
    { kind: 'url', url: 'https://missing.example/x' },
    { kind: 'quote', quote: 'talks resumed yesterday' },
  ];

  const results = await runCitationGuardForArticle(
    {
      articleId: 'art-1',
      runId: 'run-1',
      now,
      sourcesForRun,
      items,
    },
    {
      putCitationCheckLog: (record) => putCitationCheckLog(record, logPath),
    },
  );

  assert.equal(results.length, 3);
  assert.equal(results[0]!.status, 'match');
  assert.equal(results[0]!.display, 'ok');
  assert.equal(results[1]!.status, 'missing-source');
  assert.equal(results[1]!.display, 'unverified');
  assert.equal(results[2]!.status, 'mismatch');
  assert.equal(results[2]!.display, 'unverified');

  const log = await readCitationCheckLog('art-1', logPath);
  assert.ok(log);
  assert.equal(log!.runId, 'run-1');
  assert.equal(log!.entries.length, 3);
  assert.equal(log!.entries[0]!.itemId, `quote:${hash16('talks resumed today')}`);
});

test('runCitationGuardForArticle swallows put errors and still returns check results', async () => {
  const results = await runCitationGuardForArticle(
    {
      articleId: 'art-err',
      runId: 'run-err',
      now: new Date('2026-10-27T12:00:00.000Z'),
      sourcesForRun: [],
      items: [{ kind: 'url', url: 'https://x.example' }],
    },
    {
      putCitationCheckLog: async () => {
        throw new Error('disk full');
      },
    },
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]!.status, 'missing-source');
});

test('runCitationGuardForArticle returns empty when check itself throws', async () => {
  const results = await runCitationGuardForArticle(
    {
      articleId: 'art-check-err',
      runId: 'run-err',
      now: new Date('2026-10-27T12:00:00.000Z'),
      sourcesForRun: [],
      items: [{ kind: 'url', url: 'https://x.example' }],
    },
    {
      checkCitationItems: () => {
        throw new Error('resolver boom');
      },
      putCitationCheckLog: async () => {
        throw new Error('should not be called');
      },
    },
  );
  assert.deepEqual(results, []);
});

test('registerSourcesAndRunCitationGuard registers by hash and checks against this run', async () => {
  const dir = tempDir();
  const sourcesPath = path.join(dir, 'citation-sources.json');
  const logPath = path.join(dir, 'citation-check-log.json');
  const now = new Date('2026-10-27T12:00:00.000Z');
  const text = 'Body containing the exact phrase "quoted line" for matching.';

  const results = await registerSourcesAndRunCitationGuard(
    {
      articleId: 'art-reg',
      runId: 'run-reg',
      now,
      sourceCandidates: [
        { url: 'https://publisher.example/story', text, articleId: 'art-reg' },
      ],
      items: [
        { kind: 'quote', quote: 'quoted line' },
        { kind: 'url', url: 'https://publisher.example/story' },
      ],
    },
    {
      registerCitationSources: (records) => registerCitationSources(records, sourcesPath),
      readCitationSources: () => readCitationSources(sourcesPath),
      putCitationCheckLog: (record) => putCitationCheckLog(record, logPath),
    },
  );

  assert.equal(results[0]!.status, 'match');
  assert.equal(results[1]!.status, 'match');
  const log = await readCitationCheckLog('art-reg', logPath);
  assert.equal(log?.entries.length, 2);
});
