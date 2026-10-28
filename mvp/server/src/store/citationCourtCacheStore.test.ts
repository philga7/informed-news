import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  pruneCitationCourtCacheOlderThan,
  putCitationCourtCacheEntries,
  readCitationCourtCache,
} from './citationCourtCacheStore.js';

async function tempPath(): Promise<{ file: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'court-cache-'));
  return { file: path.join(dir, 'citation-court-cache.json'), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const NOW = new Date('2026-10-27T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

test('missing cache file reads as empty', async () => {
  const t = await tempPath();
  try {
    assert.deepEqual(await readCitationCourtCache(t.file), { entries: {}, updatedAt: null });
  } finally {
    await t.cleanup();
  }
});

test('malformed entries are dropped on read', async () => {
  const t = await tempPath();
  try {
    await writeFile(
      t.file,
      JSON.stringify({
        entries: {
          good: { key: 'good', fetchedAt: daysAgo(1), hit: { url: 'https://x', text: 't', procedural: false } },
          nullHit: { key: 'nullHit', fetchedAt: daysAgo(1), hit: null },
          badKey: { key: 'other', fetchedAt: daysAgo(1), hit: null },
          badHit: { key: 'badHit', fetchedAt: daysAgo(1), hit: { url: 1 } },
          noDate: { key: 'noDate', hit: null },
        },
        updatedAt: null,
      }),
    );
    const store = await readCitationCourtCache(t.file);
    assert.deepEqual(Object.keys(store.entries).sort(), ['good', 'nullHit']);
  } finally {
    await t.cleanup();
  }
});

test('put merges entries and prune drops entries older than 7 days', async () => {
  const t = await tempPath();
  try {
    await putCitationCourtCacheEntries(
      [
        { key: 'old', fetchedAt: daysAgo(8), hit: null },
        { key: 'fresh', fetchedAt: daysAgo(1), hit: { url: 'https://x', text: 't', procedural: true } },
      ],
      t.file,
    );
    assert.equal(await pruneCitationCourtCacheOlderThan(NOW, 7, t.file), 1);
    const store = JSON.parse(await readFile(t.file, 'utf8'));
    assert.deepEqual(Object.keys(store.entries), ['fresh']);
  } finally {
    await t.cleanup();
  }
});

test('prune on a missing file removes nothing and creates nothing', async () => {
  const t = await tempPath();
  try {
    assert.equal(await pruneCitationCourtCacheOlderThan(NOW, 7, t.file), 0);
    await assert.rejects(readFile(t.file, 'utf8'));
  } finally {
    await t.cleanup();
  }
});
