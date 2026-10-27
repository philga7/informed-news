import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type {
  CitationCheckLogEntry,
  CitationCheckLogRecord,
} from '../types/citationGuard.js';
import {
  pruneCitationCheckLogs,
  pruneCitationCheckLogsOlderThan,
  putCitationCheckLog,
  readCitationCheckLog,
  readCitationCheckLogs,
} from './citationCheckLogStore.js';

function tempLogPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'citation-check-log-'));
  return path.join(dir, 'nested', 'citation-check-log.json');
}

function entry(
  overrides: Partial<CitationCheckLogEntry> = {},
): CitationCheckLogEntry {
  return {
    kind: overrides.kind ?? 'url',
    status: overrides.status ?? 'missing-source',
    display: overrides.display ?? 'unverified',
    itemId: overrides.itemId ?? 'https://example.com/a',
    url: overrides.url === undefined ? 'https://example.com/a' : overrides.url,
    quote: overrides.quote === undefined ? null : overrides.quote,
    refutingUrl: overrides.refutingUrl === undefined ? null : overrides.refutingUrl,
    checkedAt: overrides.checkedAt ?? '2026-10-27T12:00:00.000Z',
    runId: overrides.runId ?? 'run-a',
  };
}

function record(
  articleId: string,
  overrides: Partial<CitationCheckLogRecord> = {},
): CitationCheckLogRecord {
  return {
    articleId,
    entries: overrides.entries ?? [entry()],
    updatedAt: overrides.updatedAt ?? '2026-10-27T12:00:00.000Z',
    runId: overrides.runId ?? 'run-a',
  };
}

test('readCitationCheckLogs returns an empty store when the file is missing', async () => {
  assert.deepEqual(await readCitationCheckLogs(tempLogPath()), {
    logs: {},
    updatedAt: null,
  });
});

test('readCitationCheckLog returns null when the article has no log', async () => {
  const logPath = tempLogPath();
  await putCitationCheckLog(record('art-1'), logPath);
  assert.equal(await readCitationCheckLog('missing', logPath), null);
});

test('putCitationCheckLog + readCitationCheckLog round-trips a record', async () => {
  const logPath = tempLogPath();
  const log = record('art-1', {
    entries: [
      entry({ kind: 'quote', status: 'mismatch', display: 'unverified', itemId: 'quote:abc', quote: 'Hello', url: null }),
      entry({ kind: 'url', status: 'match', display: 'ok', itemId: 'https://pub.example/x' }),
    ],
  });

  await putCitationCheckLog(log, logPath);

  assert.deepEqual(await readCitationCheckLog('art-1', logPath), log);
  const store = await readCitationCheckLogs(logPath);
  assert.deepEqual(store.logs['art-1'], log);
  assert.ok(!Number.isNaN(Date.parse(store.updatedAt ?? '')));
});

test('restart simulation: write then a fresh read from the same path restores logs', async () => {
  const logPath = tempLogPath();
  const log = record('art-restart');
  await putCitationCheckLog(log, logPath);

  const raw = await readFile(logPath, 'utf8');
  assert.ok(raw.includes('"logs"'));

  const restored = await readCitationCheckLog('art-restart', logPath);
  assert.deepEqual(restored, log);
});

test('readCitationCheckLogs drops malformed records', async () => {
  const logPath = tempLogPath();
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });
  await writeFile(
    logPath,
    JSON.stringify({
      logs: {
        good: record('good'),
        bad: { articleId: 'bad' },
        wrongKey: record('other-id'),
      },
      updatedAt: '2026-10-27T12:00:00.000Z',
    }),
    'utf8',
  );

  const store = await readCitationCheckLogs(logPath);
  assert.deepEqual(Object.keys(store.logs), ['good']);
  assert.deepEqual(store.logs.good, record('good'));
});

test('pruneCitationCheckLogsOlderThan drops logs older than 7 days', async () => {
  const logPath = tempLogPath();
  const now = new Date('2026-10-27T12:00:00.000Z');
  await putCitationCheckLog(
    record('stale', { updatedAt: '2026-10-19T11:59:00.000Z' }),
    logPath,
  );
  await putCitationCheckLog(
    record('fresh', { updatedAt: '2026-10-21T12:00:00.000Z' }),
    logPath,
  );

  const removed = await pruneCitationCheckLogsOlderThan(now, 7, logPath);
  assert.equal(removed, 1);
  assert.equal(await readCitationCheckLog('stale', logPath), null);
  assert.ok(await readCitationCheckLog('fresh', logPath));
});

test('pruneCitationCheckLogs leaves the file untouched when nothing is removed', async () => {
  const logPath = tempLogPath();
  await putCitationCheckLog(record('keep'), logPath);
  const before = await readFile(logPath, 'utf8');

  assert.equal(await pruneCitationCheckLogs('2026-01-01T00:00:00.000Z', logPath), 0);
  assert.equal(await readFile(logPath, 'utf8'), before);
});

test('pruneCitationCheckLogs on a missing file removes nothing and creates no file', async () => {
  const logPath = tempLogPath();
  assert.equal(await pruneCitationCheckLogs('2099-01-01T00:00:00.000Z', logPath), 0);
  await assert.rejects(access(logPath), { code: 'ENOENT' });
});
