import { readFile } from 'node:fs/promises';
import type {
  CitationCheckLogEntry,
  CitationCheckLogRecord,
  CitationCheckLogStore,
  CitationCheckStatus,
  CitationKind,
} from '../types/citationGuard.js';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';
import { CITATION_CHECK_LOG_PATH } from './paths.js';

/** Default retention aligned with Brief full-story / summary cache (NEWS-172 grill). */
export const CITATION_CHECK_LOG_RETENTION_DAYS = 7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCitationKind(value: unknown): value is CitationKind {
  return value === 'url' || value === 'quote' || value === 'claim' || value === 'court';
}

function isCitationCheckStatus(value: unknown): value is CitationCheckStatus {
  return value === 'match' || value === 'mismatch' || value === 'missing-source';
}

function isDisplay(value: unknown): value is CitationCheckLogEntry['display'] {
  return value === 'ok' || value === 'unverified' || value === 'unconfirmed';
}

function normalizeEntry(raw: unknown): CitationCheckLogEntry | null {
  if (!isRecord(raw)) return null;
  if (!isCitationKind(raw.kind)) return null;
  if (!isCitationCheckStatus(raw.status)) return null;
  if (!isDisplay(raw.display)) return null;
  if (typeof raw.itemId !== 'string') return null;
  if (typeof raw.checkedAt !== 'string') return null;
  if (typeof raw.runId !== 'string') return null;
  if (!isStringOrNull(raw.url) && raw.url !== undefined) return null;
  if (!isStringOrNull(raw.quote) && raw.quote !== undefined) return null;
  if (!isStringOrNull(raw.refutingUrl) && raw.refutingUrl !== undefined) return null;

  return {
    kind: raw.kind,
    status: raw.status,
    display: raw.display,
    itemId: raw.itemId,
    ...(raw.url !== undefined ? { url: raw.url } : {}),
    ...(raw.quote !== undefined ? { quote: raw.quote } : {}),
    ...(raw.refutingUrl !== undefined ? { refutingUrl: raw.refutingUrl } : {}),
    checkedAt: raw.checkedAt,
    runId: raw.runId,
  };
}

function normalizeRecord(key: string, raw: unknown): CitationCheckLogRecord | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.articleId !== 'string' || raw.articleId !== key) return null;
  if (typeof raw.updatedAt !== 'string') return null;
  if (typeof raw.runId !== 'string') return null;
  if (!Array.isArray(raw.entries)) return null;

  const entries: CitationCheckLogEntry[] = [];
  for (const entry of raw.entries) {
    const normalized = normalizeEntry(entry);
    if (normalized) entries.push(normalized);
  }

  return {
    articleId: raw.articleId,
    entries,
    updatedAt: raw.updatedAt,
    runId: raw.runId,
  };
}

function normalizeStore(parsed: unknown): CitationCheckLogStore {
  if (!isRecord(parsed)) {
    throw new Error('citation-check-log.json must contain a JSON object');
  }

  const logs: Record<string, CitationCheckLogRecord> = {};
  if (isRecord(parsed.logs)) {
    for (const [key, raw] of Object.entries(parsed.logs)) {
      const record = normalizeRecord(key, raw);
      if (record) logs[key] = record;
    }
  }

  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  return { logs, updatedAt };
}

/**
 * Read the citation check log store from disk.
 * Missing file → empty store; malformed records are dropped.
 */
export async function readCitationCheckLogs(
  logPath: string = CITATION_CHECK_LOG_PATH,
): Promise<CitationCheckLogStore> {
  try {
    const raw = await readFile(logPath, 'utf8');
    return normalizeStore(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { logs: {}, updatedAt: null };
    }
    throw err;
  }
}

/** Read one article's check log; missing article or file → null. */
export async function readCitationCheckLog(
  articleId: string,
  logPath: string = CITATION_CHECK_LOG_PATH,
): Promise<CitationCheckLogRecord | null> {
  const store = await readCitationCheckLogs(logPath);
  return store.logs[articleId] ?? null;
}

/**
 * Merge incoming entries into any prior log for the same articleId by itemId:
 * new entry replaces the same itemId; unrelated prior entries are kept.
 */
export function mergeCitationCheckLogEntries(
  prior: CitationCheckLogEntry[] | undefined,
  incoming: CitationCheckLogEntry[],
): CitationCheckLogEntry[] {
  const byId = new Map<string, CitationCheckLogEntry>();
  for (const entry of prior ?? []) {
    byId.set(entry.itemId, entry);
  }
  for (const entry of incoming) {
    byId.set(entry.itemId, entry);
  }
  return [...byId.values()];
}

async function mergeAndWrite(
  record: CitationCheckLogRecord,
  logPath: string,
): Promise<CitationCheckLogStore> {
  const store = await readCitationCheckLogs(logPath);
  const prior = store.logs[record.articleId];
  store.logs[record.articleId] = {
    ...record,
    entries: mergeCitationCheckLogEntries(prior?.entries, record.entries),
  };
  store.updatedAt = new Date().toISOString();
  await writeJsonAtomic(logPath, store);
  return store;
}

/**
 * Upsert one article's check log (read-merge-write, atomic).
 * Entries are merged by `itemId` with any existing log for that article
 * (summary + full-story runs accumulate marks).
 */
export async function putCitationCheckLog(
  record: CitationCheckLogRecord,
  logPath: string = CITATION_CHECK_LOG_PATH,
): Promise<CitationCheckLogStore> {
  return enqueueFileWrite(logPath, () => mergeAndWrite(record, logPath));
}

/**
 * Read, apply `mutate`, write atomically; serialized per path.
 * `mutate` must not call other citation-check-log writes (they would wait on this one).
 */
export async function updateCitationCheckLog(
  mutate: (
    store: CitationCheckLogStore,
  ) => CitationCheckLogStore | Promise<CitationCheckLogStore>,
  logPath: string = CITATION_CHECK_LOG_PATH,
): Promise<CitationCheckLogStore> {
  return enqueueFileWrite(logPath, async () => {
    const current = await readCitationCheckLogs(logPath);
    const next = await mutate(current);
    await writeJsonAtomic(logPath, next);
    return next;
  });
}

async function filterAndWrite(
  shouldDrop: (record: CitationCheckLogRecord) => boolean,
  logPath: string,
): Promise<number> {
  const store = await readCitationCheckLogs(logPath);
  const logs: Record<string, CitationCheckLogRecord> = {};
  for (const [id, record] of Object.entries(store.logs)) {
    if (!shouldDrop(record)) logs[id] = record;
  }
  const removed = Object.keys(store.logs).length - Object.keys(logs).length;
  if (removed > 0) {
    await writeJsonAtomic(logPath, {
      logs,
      updatedAt: new Date().toISOString(),
    });
  }
  return removed;
}

/**
 * Drop logs matching an ISO cutoff or a drop-predicate.
 * - string: remove when `updatedAt` is strictly older than the ISO timestamp
 * - function: remove when the predicate returns true
 * Leaves the file untouched when nothing is removed; missing file → 0, no create.
 */
export async function pruneCitationCheckLogs(
  olderThanIsoOrPredicate: string | ((record: CitationCheckLogRecord) => boolean),
  logPath: string = CITATION_CHECK_LOG_PATH,
): Promise<number> {
  const shouldDrop =
    typeof olderThanIsoOrPredicate === 'string'
      ? (record: CitationCheckLogRecord) => {
          const updated = Date.parse(record.updatedAt);
          const cutoff = Date.parse(olderThanIsoOrPredicate);
          return !Number.isNaN(updated) && !Number.isNaN(cutoff) && updated < cutoff;
        }
      : olderThanIsoOrPredicate;

  return enqueueFileWrite(logPath, () => filterAndWrite(shouldDrop, logPath));
}

/** Drop logs with `updatedAt` older than `retentionDays` before `now` (default 7). */
export async function pruneCitationCheckLogsOlderThan(
  now: Date,
  retentionDays: number = CITATION_CHECK_LOG_RETENTION_DAYS,
  logPath: string = CITATION_CHECK_LOG_PATH,
): Promise<number> {
  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  return pruneCitationCheckLogs(cutoffIso, logPath);
}
