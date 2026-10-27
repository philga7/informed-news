import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { CitationSourceRecord } from '../types/citationGuard.js';
import {
  citationSourceContentHash,
  citationSourceRecordId,
  isUnresolvedGoogleNewsUrl,
  pruneCitationSources,
  pruneCitationSourcesOlderThan,
  readCitationSources,
  registerCitationSources,
} from './citationSourcesStore.js';

function tempSourcesPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'citation-sources-'));
  return path.join(dir, 'nested', 'citation-sources.json');
}

function hash16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function record(
  overrides: Partial<CitationSourceRecord> & Pick<CitationSourceRecord, 'text' | 'runId'>,
): CitationSourceRecord {
  const contentHash = overrides.contentHash ?? hash16(overrides.text);
  const runId = overrides.runId;
  const id = overrides.id ?? `${contentHash}:${runId}`;
  return {
    id,
    url: overrides.url ?? 'https://publisher.example/story',
    text: overrides.text,
    fetchedAt: overrides.fetchedAt ?? '2026-10-27T12:00:00.000Z',
    runId,
    contentHash,
    articleId: overrides.articleId ?? 'art-1',
  };
}

test('readCitationSources returns an empty store when the file is missing', async () => {
  assert.deepEqual(await readCitationSources(tempSourcesPath()), {
    sources: {},
    updatedAt: null,
  });
});

test('registerCitationSources + readCitationSources round-trips a source', async () => {
  const sourcesPath = tempSourcesPath();
  const source = record({ text: 'Body text for round-trip.', runId: 'run-a' });

  await registerCitationSources([source], sourcesPath);

  const store = await readCitationSources(sourcesPath);
  assert.deepEqual(store.sources[source.id], source);
  assert.ok(!Number.isNaN(Date.parse(store.updatedAt ?? '')));
});

test('restart simulation: write then a fresh read from the same path restores sources', async () => {
  const sourcesPath = tempSourcesPath();
  const source = record({ text: 'Survives restart.', runId: 'run-restart' });
  await registerCitationSources([source], sourcesPath);

  const raw = await readFile(sourcesPath, 'utf8');
  assert.ok(raw.includes('"sources"'));

  // Simulate a new process: call read again with no in-memory cache.
  const restored = await readCitationSources(sourcesPath);
  assert.deepEqual(restored.sources[source.id], source);
});

test('pruneCitationSources drops old sources and keeps newer ones', async () => {
  const sourcesPath = tempSourcesPath();
  const old = record({
    text: 'Old body.',
    runId: 'run-old',
    fetchedAt: '2026-10-01T00:00:00.000Z',
  });
  const recent = record({
    text: 'Recent body.',
    runId: 'run-new',
    fetchedAt: '2026-10-25T00:00:00.000Z',
  });
  await registerCitationSources([old, recent], sourcesPath);

  const removed = await pruneCitationSources('2026-10-20T00:00:00.000Z', sourcesPath);
  assert.equal(removed, 1);

  const store = await readCitationSources(sourcesPath);
  assert.equal(store.sources[old.id], undefined);
  assert.deepEqual(store.sources[recent.id], recent);
});

test('pruneCitationSourcesOlderThan uses a 7-day retention window', async () => {
  const sourcesPath = tempSourcesPath();
  const now = new Date('2026-10-27T12:00:00.000Z');
  const stale = record({
    text: 'Eight days old.',
    runId: 'run-stale',
    fetchedAt: '2026-10-19T11:59:00.000Z',
  });
  const fresh = record({
    text: 'Six days old.',
    runId: 'run-fresh',
    fetchedAt: '2026-10-21T12:00:00.000Z',
  });
  await registerCitationSources([stale, fresh], sourcesPath);

  const removed = await pruneCitationSourcesOlderThan(now, 7, sourcesPath);
  assert.equal(removed, 1);
  const store = await readCitationSources(sourcesPath);
  assert.equal(Object.keys(store.sources).sort().join(','), fresh.id);
});

test('pruneCitationSources leaves the file untouched when nothing is removed', async () => {
  const sourcesPath = tempSourcesPath();
  const source = record({ text: 'Keep me.', runId: 'run-keep' });
  await registerCitationSources([source], sourcesPath);
  const before = await readFile(sourcesPath, 'utf8');

  assert.equal(await pruneCitationSources('2026-01-01T00:00:00.000Z', sourcesPath), 0);
  assert.equal(await readFile(sourcesPath, 'utf8'), before);
});

test('pruneCitationSources on a missing file removes nothing and creates no file', async () => {
  const sourcesPath = tempSourcesPath();
  assert.equal(await pruneCitationSources('2099-01-01T00:00:00.000Z', sourcesPath), 0);
  await assert.rejects(access(sourcesPath), { code: 'ENOENT' });
});

test('hash registration stores by contentHash without any network', async () => {
  const sourcesPath = tempSourcesPath();
  const text = 'Already-known article body for this run.';
  const contentHash = citationSourceContentHash(text);
  assert.equal(contentHash, hash16(text));
  assert.equal(contentHash.length, 16);

  const runId = 'run-hash';
  const source = record({
    text,
    runId,
    contentHash,
    id: citationSourceRecordId(contentHash, runId),
    url: null,
    articleId: 'art-hash',
  });

  await registerCitationSources([source], sourcesPath);
  const store = await readCitationSources(sourcesPath);
  assert.deepEqual(store.sources[source.id], source);
  assert.equal(store.sources[source.id]?.contentHash, contentHash);
});

test('registering the same contentHash under a second runId keeps both records', async () => {
  const sourcesPath = tempSourcesPath();
  const text = 'Shared body across runs.';
  const contentHash = citationSourceContentHash(text);
  const first = record({ text, runId: 'run-1', contentHash });
  const second = record({
    text,
    runId: 'run-2',
    contentHash,
    fetchedAt: '2026-10-27T13:00:00.000Z',
  });

  await registerCitationSources([first, second], sourcesPath);
  const store = await readCitationSources(sourcesPath);
  assert.equal(Object.keys(store.sources).length, 2);
  assert.ok(store.sources[first.id]);
  assert.ok(store.sources[second.id]);
});

test('isUnresolvedGoogleNewsUrl detects news.google.com hosts', () => {
  assert.equal(isUnresolvedGoogleNewsUrl('https://news.google.com/rss/articles/CBMiXyz'), true);
  assert.equal(isUnresolvedGoogleNewsUrl('https://NEWS.GOOGLE.COM/articles/CBMiXyz'), true);
  assert.equal(isUnresolvedGoogleNewsUrl('https://publisher.example/story'), false);
  assert.equal(isUnresolvedGoogleNewsUrl(null), false);
  assert.equal(isUnresolvedGoogleNewsUrl('not-a-url'), false);
});

test('GN-unresolved URL with empty or placeholder body is not stored as a source', async () => {
  const sourcesPath = tempSourcesPath();
  const gnUrl = 'https://news.google.com/rss/articles/CBMiReject';
  const rejected = [
    record({
      text: '',
      runId: 'run-gn',
      url: gnUrl,
      contentHash: citationSourceContentHash(''),
    }),
    record({
      text: '   ',
      runId: 'run-gn-ws',
      url: gnUrl,
      contentHash: citationSourceContentHash('   '),
    }),
    record({
      text: 'placeholder',
      runId: 'run-gn-ph',
      url: gnUrl,
      contentHash: citationSourceContentHash('placeholder'),
    }),
  ];
  const ok = record({
    text: 'Real publisher body.',
    runId: 'run-ok',
    url: 'https://publisher.example/ok',
  });

  await registerCitationSources([...rejected, ok], sourcesPath);
  const store = await readCitationSources(sourcesPath);
  assert.deepEqual(Object.keys(store.sources), [ok.id]);
  assert.deepEqual(store.sources[ok.id], ok);
});

test('readCitationSources drops malformed records', async () => {
  const sourcesPath = tempSourcesPath();
  const good = record({ text: 'Good body.', runId: 'run-good' });
  await registerCitationSources([good], sourcesPath);
  await writeFile(
    sourcesPath,
    JSON.stringify({
      sources: {
        [good.id]: good,
        bad: { id: 'bad', text: 1, url: null, fetchedAt: 'x', runId: 'r', contentHash: 'h', articleId: null },
        mismatch: { ...good, id: 'wrong-key' },
      },
      updatedAt: '2026-10-27T12:00:00.000Z',
    }),
    'utf8',
  );

  const store = await readCitationSources(sourcesPath);
  assert.deepEqual(Object.keys(store.sources), [good.id]);
  assert.deepEqual(store.sources[good.id], good);
});
