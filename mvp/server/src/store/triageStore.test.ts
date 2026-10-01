import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import { readTriage, writeTriage } from './triageStore.js';

function tempTriagePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'triage-store-'));
  return path.join(dir, 'nested', 'triage.json');
}

function keptRecord(articleId: string): TriageRecord {
  return {
    articleId,
    status: 'kept',
    reason: null,
    stage: 'body',
    final: true,
    topicIds: ['topic-a'],
    labels: ['official'],
    duplicateOf: null,
    memberIds: ['dup-1'],
    outletCount: 2,
    significance: 1.6,
    bodyChecked: true,
    jevCalls: 2,
    triagedAt: '2026-09-30T12:00:00.000Z',
  };
}

function droppedRecord(articleId: string): TriageRecord {
  return {
    articleId,
    status: 'dropped',
    reason: 'muted:rule-1',
    stage: 'keyword',
    final: true,
    topicIds: [],
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: null,
    significance: null,
    bodyChecked: false,
    jevCalls: 0,
    triagedAt: '2026-09-30T12:00:00.000Z',
  };
}

async function writeRaw(triagePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(triagePath), { recursive: true });
  await writeFile(triagePath, JSON.stringify(value), 'utf8');
}

test('readTriage returns an empty store when the file is missing', async () => {
  assert.deepEqual(await readTriage(tempTriagePath()), { records: {}, updatedAt: null });
});

test('writeTriage then readTriage round-trips pretty JSON', async () => {
  const triagePath = tempTriagePath();
  const store: TriageStore = {
    records: { a1: keptRecord('a1'), a2: droppedRecord('a2') },
    updatedAt: '2026-09-30T12:00:01.000Z',
  };

  await writeTriage(store, triagePath);

  const raw = await readFile(triagePath, 'utf8');
  assert.ok(raw.endsWith('}\n'));
  assert.ok(raw.includes('\n  "records": {'));
  assert.deepEqual(await readTriage(triagePath), store);
});

test('writeTriage leaves no tmp file behind', async () => {
  const triagePath = tempTriagePath();
  await writeTriage({ records: { a1: keptRecord('a1') }, updatedAt: null }, triagePath);
  await writeTriage({ records: {}, updatedAt: '2026-09-30T12:00:00.000Z' }, triagePath);
  assert.deepEqual(await readdir(path.dirname(triagePath)), ['triage.json']);
});

test('readTriage drops malformed records', async () => {
  const triagePath = tempTriagePath();
  const good = keptRecord('good');
  await writeRaw(triagePath, {
    records: {
      good,
      badStatus: { ...keptRecord('badStatus'), status: 'maybe' },
      badReason: { ...droppedRecord('badReason'), reason: 42 },
      badStage: { ...keptRecord('badStage'), stage: 'nowhere' },
      badFinal: { ...keptRecord('badFinal'), final: 'yes' },
      badBodyChecked: { ...keptRecord('badBodyChecked'), bodyChecked: 1 },
      badTopicIds: { ...keptRecord('badTopicIds'), topicIds: ['ok', 3] },
      badLabels: { ...keptRecord('badLabels'), labels: 'official' },
      badMemberIds: { ...keptRecord('badMemberIds'), memberIds: null },
      badDuplicateOf: { ...droppedRecord('badDuplicateOf'), duplicateOf: 7 },
      badOutletCount: { ...keptRecord('badOutletCount'), outletCount: '2' },
      badSignificance: { ...keptRecord('badSignificance'), significance: 'high' },
      badJevCalls: { ...keptRecord('badJevCalls'), jevCalls: null },
      badTriagedAt: { ...keptRecord('badTriagedAt'), triagedAt: 5 },
      notObject: 'nope',
      arrayRecord: [good],
    },
    updatedAt: '2026-09-30T12:00:00.000Z',
  });

  assert.deepEqual(await readTriage(triagePath), {
    records: { good },
    updatedAt: '2026-09-30T12:00:00.000Z',
  });
});

test('readTriage drops records whose articleId does not match the key', async () => {
  const triagePath = tempTriagePath();
  await writeRaw(triagePath, {
    records: { a1: keptRecord('a1'), wrongKey: keptRecord('other-id') },
    updatedAt: null,
  });
  assert.deepEqual(await readTriage(triagePath), {
    records: { a1: keptRecord('a1') },
    updatedAt: null,
  });
});

test('readTriage treats missing records / bad updatedAt as empty defaults', async () => {
  const triagePath = tempTriagePath();
  await writeRaw(triagePath, { records: ['x'], updatedAt: 12 });
  assert.deepEqual(await readTriage(triagePath), { records: {}, updatedAt: null });
});

test('readTriage throws when the file is not a JSON object', async () => {
  const triagePath = tempTriagePath();
  await writeRaw(triagePath, ['not', 'an', 'object']);
  await assert.rejects(readTriage(triagePath), {
    message: 'triage.json must contain a JSON object',
  });
});
