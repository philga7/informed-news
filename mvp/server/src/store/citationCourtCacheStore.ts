import { readFile } from 'node:fs/promises';
import type { CourtCacheEntry, CourtCacheHit, CourtCacheStore } from '../types/citationGuard.js';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';
import { CITATION_COURT_CACHE_PATH } from './paths.js';

/** Court lookups are reused for the same window as other citation data (NEWS-173). */
export const CITATION_COURT_CACHE_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeHit(raw: unknown): CourtCacheHit | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  if (typeof raw.url !== 'string' || typeof raw.text !== 'string') return undefined;
  if (typeof raw.procedural !== 'boolean') return undefined;
  return { url: raw.url, text: raw.text, procedural: raw.procedural };
}

function normalizeEntry(key: string, raw: unknown): CourtCacheEntry | null {
  if (!isRecord(raw) || raw.key !== key) return null;
  if (typeof raw.fetchedAt !== 'string' || Number.isNaN(Date.parse(raw.fetchedAt))) return null;
  const hit = normalizeHit(raw.hit);
  if (hit === undefined) return null;
  return { key, fetchedAt: raw.fetchedAt, hit };
}

function normalizeStore(parsed: unknown): CourtCacheStore {
  if (!isRecord(parsed)) {
    throw new Error('citation-court-cache.json must contain a JSON object');
  }
  const entries: Record<string, CourtCacheEntry> = {};
  if (isRecord(parsed.entries)) {
    for (const [key, raw] of Object.entries(parsed.entries)) {
      const entry = normalizeEntry(key, raw);
      if (entry) entries[key] = entry;
    }
  }
  return { entries, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null };
}

/** True when the entry is no older than `retentionDays` before `now`. */
export function isCourtCacheEntryFresh(
  entry: CourtCacheEntry,
  now: Date,
  retentionDays: number = CITATION_COURT_CACHE_RETENTION_DAYS,
): boolean {
  return Date.parse(entry.fetchedAt) >= now.getTime() - retentionDays * DAY_MS;
}

/** Missing file → empty store; malformed entries are dropped. */
export async function readCitationCourtCache(
  cachePath: string = CITATION_COURT_CACHE_PATH,
): Promise<CourtCacheStore> {
  try {
    return normalizeStore(JSON.parse(await readFile(cachePath, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { entries: {}, updatedAt: null };
    }
    throw err;
  }
}

/** Upsert parsed cache entries (read-merge-write, atomic, serialized per path). */
export async function putCitationCourtCacheEntries(
  entries: CourtCacheEntry[],
  cachePath: string = CITATION_COURT_CACHE_PATH,
): Promise<void> {
  if (entries.length === 0) return;
  await enqueueFileWrite(cachePath, async () => {
    const store = await readCitationCourtCache(cachePath);
    for (const entry of entries) store.entries[entry.key] = entry;
    store.updatedAt = new Date().toISOString();
    await writeJsonAtomic(cachePath, store);
  });
}

/** Drop entries with `fetchedAt` older than `retentionDays` before `now` (default 7). */
export async function pruneCitationCourtCacheOlderThan(
  now: Date,
  retentionDays: number = CITATION_COURT_CACHE_RETENTION_DAYS,
  cachePath: string = CITATION_COURT_CACHE_PATH,
): Promise<number> {
  return enqueueFileWrite(cachePath, async () => {
    const store = await readCitationCourtCache(cachePath);
    const entries: Record<string, CourtCacheEntry> = {};
    for (const [key, entry] of Object.entries(store.entries)) {
      if (isCourtCacheEntryFresh(entry, now, retentionDays)) entries[key] = entry;
    }
    const removed = Object.keys(store.entries).length - Object.keys(entries).length;
    if (removed > 0) {
      await writeJsonAtomic(cachePath, { entries, updatedAt: new Date().toISOString() });
    }
    return removed;
  });
}
