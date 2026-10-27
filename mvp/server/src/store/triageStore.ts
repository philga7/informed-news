import { readFile } from 'node:fs/promises';
import type {
  TriageAdvisoryVerdict,
  TriageLabel,
  TriageReason,
  TriageRecord,
  TriageStage,
  TriageStatus,
  TriageStore,
} from '../types/triage.js';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';
import { TRIAGE_PATH } from './paths.js';

const STATUSES: ReadonlySet<string> = new Set<TriageStatus>(['kept', 'dropped']);
const ADVISORY_VERDICTS: ReadonlySet<string> = new Set<TriageAdvisoryVerdict>([
  'approved',
  'filtered',
]);
const STAGES: ReadonlySet<string> = new Set<TriageStage>([
  'keyword',
  'dedupe',
  'headline',
  'survivor',
  'body',
  'budget',
  'manual',
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

  const record: TriageRecord = {
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

  // NEWS-167 advisory layer: all four present and valid → keep; otherwise omit (old rows / bad partials).
  const hasAnyAdvisory =
    'verdict' in raw || 'confidence' in raw || 'reasonText' in raw || 'criteriaRef' in raw;
  if (hasAnyAdvisory) {
    const verdictOk =
      typeof raw.verdict === 'string' && ADVISORY_VERDICTS.has(raw.verdict);
    const confidenceOk =
      typeof raw.confidence === 'number' &&
      Number.isFinite(raw.confidence) &&
      raw.confidence >= 0 &&
      raw.confidence <= 1;
    const reasonTextOk = typeof raw.reasonText === 'string';
    const criteriaRefOk = typeof raw.criteriaRef === 'string' && raw.criteriaRef.length > 0;
    if (verdictOk && confidenceOk && reasonTextOk && criteriaRefOk) {
      record.verdict = raw.verdict as TriageAdvisoryVerdict;
      record.confidence = raw.confidence as number;
      record.reasonText = raw.reasonText as string;
      record.criteriaRef = raw.criteriaRef as string;
    }
  }

  return record;
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
  await writeJsonAtomic(triagePath, store);
}

/**
 * Read, apply `mutate`, write atomically; serialized per path. Resolves to the written store.
 * An async `mutate` holds the queue until it settles; it must not call `updateTriage` itself
 * or await any write that waits on this queue.
 */
export async function updateTriage(
  mutate: (store: TriageStore) => TriageStore | Promise<TriageStore>,
  triagePath: string = TRIAGE_PATH,
): Promise<TriageStore> {
  return enqueueFileWrite(triagePath, async () => {
    const next = await mutate(await readTriage(triagePath));
    await writeTriage(next, triagePath);
    return next;
  });
}
