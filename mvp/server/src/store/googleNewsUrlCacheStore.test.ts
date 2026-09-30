import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  getCachedGoogleNewsUrl,
  putCachedGoogleNewsUrl,
  readGoogleNewsUrlCache,
} from './googleNewsUrlCacheStore.js';

function tempCachePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'google-news-url-cache-'));
  return path.join(dir, 'nested', 'google-news-url-cache.json');
}

test('readGoogleNewsUrlCache returns empty entries when file is missing', async () => {
  const cachePath = tempCachePath();
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
  assert.equal(await getCachedGoogleNewsUrl('CBMiMissing', cachePath), null);
});

test('putCachedGoogleNewsUrl persists pretty JSON and getCachedGoogleNewsUrl reads it back', async () => {
  const cachePath = tempCachePath();

  await putCachedGoogleNewsUrl('CBMiAbc', 'https://www.reuters.com/world/story', cachePath);
  await putCachedGoogleNewsUrl('CBMiDef', 'https://apnews.com/article/x', cachePath);

  assert.equal(
    await getCachedGoogleNewsUrl('CBMiAbc', cachePath),
    'https://www.reuters.com/world/story',
  );
  assert.equal(await getCachedGoogleNewsUrl('CBMiDef', cachePath), 'https://apnews.com/article/x');

  const raw = await readFile(cachePath, 'utf8');
  assert.ok(raw.endsWith('}\n'));
  assert.ok(raw.includes('\n  "entries": {'));
  const parsed = JSON.parse(raw) as {
    entries: Record<string, { url: string; resolvedAt: string }>;
  };
  assert.equal(parsed.entries.CBMiAbc?.url, 'https://www.reuters.com/world/story');
  assert.ok(!Number.isNaN(Date.parse(parsed.entries.CBMiAbc?.resolvedAt ?? '')));
});

test('putCachedGoogleNewsUrl overwrites an existing entry', async () => {
  const cachePath = tempCachePath();
  await putCachedGoogleNewsUrl('CBMiAbc', 'https://old.example.com/a', cachePath);
  await putCachedGoogleNewsUrl('CBMiAbc', 'https://new.example.com/a', cachePath);
  assert.equal(await getCachedGoogleNewsUrl('CBMiAbc', cachePath), 'https://new.example.com/a');
});

test('readGoogleNewsUrlCache drops malformed entries', async () => {
  const cachePath = tempCachePath();
  await putCachedGoogleNewsUrl('CBMiSeed', 'https://seed.example.com', cachePath);
  await writeFile(
    cachePath,
    JSON.stringify({
      entries: {
        good: { url: 'https://example.com/good', resolvedAt: '2026-09-29T12:00:00.000Z' },
        noUrl: { resolvedAt: '2026-09-29T12:00:00.000Z' },
        emptyUrl: { url: '  ', resolvedAt: '2026-09-29T12:00:00.000Z' },
        noResolvedAt: { url: 'https://example.com/x' },
        notObject: 'https://example.com/y',
        arrayEntry: ['https://example.com/z'],
      },
    }),
    'utf8',
  );

  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), {
    entries: {
      good: { url: 'https://example.com/good', resolvedAt: '2026-09-29T12:00:00.000Z' },
    },
  });
});

test('readGoogleNewsUrlCache treats a missing or non-object entries field as empty', async () => {
  const cachePath = tempCachePath();
  await putCachedGoogleNewsUrl('CBMiSeed', 'https://seed.example.com', cachePath);
  await writeFile(cachePath, JSON.stringify({ entries: ['x'] }), 'utf8');
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
  await writeFile(cachePath, JSON.stringify({}), 'utf8');
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
});

test('readGoogleNewsUrlCache throws when the file is not a JSON object', async () => {
  const cachePath = tempCachePath();
  await putCachedGoogleNewsUrl('CBMiSeed', 'https://seed.example.com', cachePath);
  await writeFile(cachePath, JSON.stringify(['not', 'an', 'object']), 'utf8');
  await assert.rejects(readGoogleNewsUrlCache(cachePath), {
    message: 'google-news-url-cache.json must contain a JSON object',
  });
});
