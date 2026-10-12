import { readFile } from 'node:fs/promises';
import type {
  BriefSummariesStore,
  BriefSummaryRecord,
  SummaryStatus,
  SummaryTrigger,
} from '../types/brief.js';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';
import { BRIEF_SUMMARIES_PATH } from './paths.js';

const STATUSES: ReadonlySet<string> = new Set<SummaryStatus>(['ok', 'unavailable', 'error']);
const TRIGGERS: ReadonlySet<string> = new Set<SummaryTrigger>(['refresh', 'on_demand']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function normalizeRecord(key: string, raw: unknown): BriefSummaryRecord | null {
  if (!isRecord(raw)) return null;
  if (raw.articleId !== key) return null;
  if (typeof raw.status !== 'string' || !STATUSES.has(raw.status)) return null;
  if (typeof raw.trigger !== 'string' || !TRIGGERS.has(raw.trigger)) return null;
  if (
    !isStringOrNull(raw.text) ||
    !isStringOrNull(raw.sourceArticleId) ||
    !isStringOrNull(raw.sourceHash) ||
    !isStringOrNull(raw.model) ||
    !isStringOrNull(raw.error)
  ) {
    return null;
  }
  if (typeof raw.generatedAt !== 'string') return null;

  return {
    articleId: key,
    status: raw.status as SummaryStatus,
    text: raw.text,
    sourceArticleId: raw.sourceArticleId,
    sourceHash: raw.sourceHash,
    model: raw.model,
    error: raw.error,
    generatedAt: raw.generatedAt,
    trigger: raw.trigger as SummaryTrigger,
  };
}

function normalizeSummaries(parsed: unknown): BriefSummariesStore {
  if (!isRecord(parsed)) {
    throw new Error('brief-summaries.json must contain a JSON object');
  }

  const summaries: Record<string, BriefSummaryRecord> = {};
  if (isRecord(parsed.summaries)) {
    for (const [key, raw] of Object.entries(parsed.summaries)) {
      const record = normalizeRecord(key, raw);
      if (record) summaries[key] = record;
    }
  }

  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  return { summaries, updatedAt };
}

/**
 * Read Brief summaries from disk.
 * Missing file → empty store; malformed records are dropped.
 */
export async function readBriefSummaries(
  summariesPath: string = BRIEF_SUMMARIES_PATH,
): Promise<BriefSummariesStore> {
  try {
    const raw = await readFile(summariesPath, 'utf8');
    return normalizeSummaries(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { summaries: {}, updatedAt: null };
    }
    throw err;
  }
}

async function mergeAndWrite(
  records: BriefSummaryRecord[],
  summariesPath: string,
): Promise<void> {
  const store = await readBriefSummaries(summariesPath);
  for (const record of records) store.summaries[record.articleId] = record;
  store.updatedAt = new Date().toISOString();
  await writeJsonAtomic(summariesPath, store);
}

/** Upsert records by articleId (read-merge-write, atomic). Retention is `pruneBriefSummaries`. */
export async function putBriefSummaries(
  records: BriefSummaryRecord[],
  summariesPath: string = BRIEF_SUMMARIES_PATH,
): Promise<void> {
  return enqueueFileWrite(summariesPath, () => mergeAndWrite(records, summariesPath));
}

async function filterAndWrite(
  keep: (record: BriefSummaryRecord) => boolean,
  summariesPath: string,
): Promise<number> {
  const store = await readBriefSummaries(summariesPath);
  const summaries: Record<string, BriefSummaryRecord> = {};
  for (const [articleId, record] of Object.entries(store.summaries)) {
    if (keep(record)) summaries[articleId] = record;
  }
  const removed = Object.keys(store.summaries).length - Object.keys(summaries).length;
  if (removed > 0) {
    await writeJsonAtomic(summariesPath, { summaries, updatedAt: new Date().toISOString() });
  }
  return removed;
}

/** Drop records `keep` rejects (read-filter-write, atomic). Resolves to the number removed. */
export async function pruneBriefSummaries(
  keep: (record: BriefSummaryRecord) => boolean,
  summariesPath: string = BRIEF_SUMMARIES_PATH,
): Promise<number> {
  return enqueueFileWrite(summariesPath, () => filterAndWrite(keep, summariesPath));
}
