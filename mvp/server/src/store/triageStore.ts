import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  TriageLabel,
  TriageReason,
  TriageRecord,
  TriageStage,
  TriageStatus,
  TriageStore,
} from '../types/triage.js';
import { TRIAGE_PATH } from './paths.js';

const STATUSES: ReadonlySet<string> = new Set<TriageStatus>(['kept', 'dropped']);
const STAGES: ReadonlySet<string> = new Set<TriageStage>([
  'keyword',
  'dedupe',
  'headline',
  'survivor',
  'body',
  'budget',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function normalizeRecord(key: string, raw: unknown): TriageRecord | null {
  if (!isRecord(raw)) return null;
  if (raw.articleId !== key) return null;
  if (typeof raw.status !== 'string' || !STATUSES.has(raw.status)) return null;
  if (!isStringOrNull(raw.reason)) return null;
  if (typeof raw.stage !== 'string' || !STAGES.has(raw.stage)) return null;
  if (typeof raw.final !== 'boolean' || typeof raw.bodyChecked !== 'boolean') return null;
  if (!isStringArray(raw.topicIds) || !isStringArray(raw.labels) || !isStringArray(raw.memberIds)) {
    return null;
  }
  if (!isStringOrNull(raw.duplicateOf)) return null;
  if (!isNumberOrNull(raw.outletCount) || !isNumberOrNull(raw.significance)) return null;
  if (!isNumber(raw.jevCalls)) return null;
  if (typeof raw.triagedAt !== 'string') return null;

  return {
    articleId: key,
    status: raw.status as TriageStatus,
    reason: raw.reason as TriageReason | null,
    stage: raw.stage as TriageStage,
    final: raw.final,
    topicIds: raw.topicIds,
    labels: raw.labels as TriageLabel[],
    duplicateOf: raw.duplicateOf,
    memberIds: raw.memberIds,
    outletCount: raw.outletCount,
    significance: raw.significance,
    bodyChecked: raw.bodyChecked,
    jevCalls: raw.jevCalls,
    triagedAt: raw.triagedAt,
  };
}

function normalizeTriage(parsed: unknown): TriageStore {
  if (!isRecord(parsed)) {
    throw new Error('triage.json must contain a JSON object');
  }

  const records: Record<string, TriageRecord> = {};
  if (isRecord(parsed.records)) {
    for (const [key, raw] of Object.entries(parsed.records)) {
      const record = normalizeRecord(key, raw);
      if (record) records[key] = record;
    }
  }

  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  return { records, updatedAt };
}

/**
 * Read triage records from disk.
 * Missing file → empty store; malformed records are dropped.
 */
export async function readTriage(triagePath: string = TRIAGE_PATH): Promise<TriageStore> {
  try {
    const raw = await readFile(triagePath, 'utf8');
    return normalizeTriage(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { records: {}, updatedAt: null };
    }
    throw err;
  }
}

/** Atomic write: temp file in the same directory, then rename. */
export async function writeTriage(
  store: TriageStore,
  triagePath: string = TRIAGE_PATH,
): Promise<void> {
  await mkdir(path.dirname(triagePath), { recursive: true });
  const tmpPath = `${triagePath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(tmpPath, triagePath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}
