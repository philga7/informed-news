import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { StoreMeta } from '../types/article.js';
import { readMeta, updateMeta, writeMeta } from './metaStore.js';

function tempMetaPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'meta-'));
  return path.join(dir, 'nested', 'meta.json');
}

const RUN = {
  trigger: 'timer' as const,
  startedAt: '2026-09-30T12:00:00.000Z',
  completedAt: '2026-09-30T12:02:00.000Z',
  ok: true,
  error: null,
};

test('readMeta creates default meta when the file is missing', async () => {
  const metaPath = tempMetaPath();
  assert.deepEqual(await readMeta(metaPath), { lastFetchAt: null, lastError: null });
  assert.deepEqual(await readMeta(metaPath), { lastFetchAt: null, lastError: null });
});

test('readMeta keeps refresh and brief, and updateMeta merges without dropping them', async () => {
  const metaPath = tempMetaPath();
  const meta: StoreMeta = {
    lastFetchAt: '2026-09-30T12:02:00.000Z',
    lastError: null,
    refresh: { last: RUN, lastSuccess: RUN },
    brief: {
      at: '2026-09-30T12:02:00.000Z',
      summaries: { budget: 60, used: 4, generated: 3, reused: 2, unavailable: 1, errors: ['x'] },
    },
  };
  await writeMeta(meta, metaPath);
  assert.deepEqual(await readMeta(metaPath), meta);

  const next = await updateMeta({ lastError: 'CFP down' }, metaPath);
  assert.deepEqual(next, { ...meta, lastError: 'CFP down' });
  assert.deepEqual(await readMeta(metaPath), { ...meta, lastError: 'CFP down' });
});

test('writeMeta is atomic: concurrent writes leave valid JSON and no .tmp files', async () => {
  const metaPath = tempMetaPath();
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      writeMeta({ lastFetchAt: null, lastError: `e${i}` }, metaPath),
    ),
  );
  const meta = await readMeta(metaPath);
  assert.match(meta.lastError ?? '', /^e\d$/);
  assert.deepEqual(readdirSync(path.dirname(metaPath)), ['meta.json']);
});
