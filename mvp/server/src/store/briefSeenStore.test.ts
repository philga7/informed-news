import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { BriefSeenStore } from '../types/brief.js';
import { readBriefSeen, writeBriefSeen } from './briefSeenStore.js';

function tempSeenPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'brief-seen-'));
  return path.join(dir, 'nested', 'brief-seen.json');
}

const STORE: BriefSeenStore = {
  seen: {
    a: { seenAt: '2026-09-30T12:00:00.000Z', outletCount: 3, significance: 1.5 },
    b: { seenAt: '2026-09-30T13:00:00.000Z', outletCount: null, significance: null },
  },
  updatedAt: '2026-09-30T13:00:00.000Z',
};

test('readBriefSeen returns an empty store when the file is missing', async () => {
  assert.deepEqual(await readBriefSeen(tempSeenPath()), { seen: {}, updatedAt: null });
});

test('writeBriefSeen round-trips as pretty JSON with no temp files left', async () => {
  const seenPath = tempSeenPath();
  await writeBriefSeen(STORE, seenPath);

  assert.deepEqual(await readBriefSeen(seenPath), STORE);
  const raw = await readFile(seenPath, 'utf8');
  assert.ok(raw.endsWith('}\n'));
  assert.ok(raw.includes('\n  "seen": {'));
  assert.deepEqual(await readdir(path.dirname(seenPath)), [path.basename(seenPath)]);
});

test('writeBriefSeen replaces the whole store', async () => {
  const seenPath = tempSeenPath();
  await writeBriefSeen(STORE, seenPath);
  const next: BriefSeenStore = { seen: { c: STORE.seen.a! }, updatedAt: null };
  await writeBriefSeen(next, seenPath);
  assert.deepEqual(await readBriefSeen(seenPath), next);
});

test('readBriefSeen throws on a corrupt file', async () => {
  const seenPath = tempSeenPath();
  await writeBriefSeen(STORE, seenPath);

  await writeFile(seenPath, '{ not json', 'utf8');
  await assert.rejects(readBriefSeen(seenPath), SyntaxError);

  await writeFile(seenPath, JSON.stringify(['not', 'an', 'object']), 'utf8');
  await assert.rejects(readBriefSeen(seenPath), {
    message: 'brief-seen.json must contain a JSON object',
  });
});

test('readBriefSeen drops malformed entries', async () => {
  const seenPath = tempSeenPath();
  await writeBriefSeen(STORE, seenPath);
  await writeFile(
    seenPath,
    JSON.stringify({
      seen: {
        good: { seenAt: '2026-09-30T12:00:00.000Z', outletCount: 2, significance: 0.8 },
        noSeenAt: { outletCount: 2, significance: 0.8 },
        badOutlets: { seenAt: '2026-09-30T12:00:00.000Z', outletCount: '2', significance: 0.8 },
        missingSignificance: { seenAt: '2026-09-30T12:00:00.000Z', outletCount: 2 },
        notObject: true,
      },
    }),
    'utf8',
  );

  assert.deepEqual(await readBriefSeen(seenPath), {
    seen: { good: { seenAt: '2026-09-30T12:00:00.000Z', outletCount: 2, significance: 0.8 } },
    updatedAt: null,
  });
});
