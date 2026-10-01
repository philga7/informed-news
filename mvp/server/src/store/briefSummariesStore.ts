import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BriefSummariesStore,
  BriefSummaryRecord,
  SummaryStatus,
  SummaryTrigger,
} from '../types/brief.js';
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

  await mkdir(path.dirname(summariesPath), { recursive: true });
  const tmpPath = `${summariesPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(tmpPath, summariesPath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

/** Per-file write chains: refresh and on-demand puts must not interleave read-modify-write cycles. */
const writeChains = new Map<string, Promise<void>>();

/** Upsert records by articleId (read-merge-write, atomic). Pruning is the caller's job. */
export async function putBriefSummaries(
  records: BriefSummaryRecord[],
  summariesPath: string = BRIEF_SUMMARIES_PATH,
): Promise<void> {
  const key = path.resolve(summariesPath);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(() => mergeAndWrite(records, summariesPath));
  const settled = next.catch(() => undefined);
  writeChains.set(key, settled);
  void settled.then(() => {
    if (writeChains.get(key) === settled) writeChains.delete(key);
  });
  return next;
}
