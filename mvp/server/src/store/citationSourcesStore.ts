import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { CitationSourceRecord, CitationSourcesStore } from '../types/citationGuard.js';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';
import { CITATION_SOURCES_PATH } from './paths.js';

/** Default retention aligned with Brief full-story / summary cache (NEWS-172 grill). */
export const CITATION_SOURCES_RETENTION_DAYS = 7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** sha256 of source text, first 16 hex — same style as Brief `sourceHash`. */
export function citationSourceContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Stable store key so the same contentHash can exist under multiple runIds. */
export function citationSourceRecordId(contentHash: string, runId: string): string {
  return `${contentHash}:${runId}`;
}

/**
 * True when `url` is an unresolved Google News host (`news.google.com`).
 * Those URLs are never valid citation sources (grill: unresolved GN is not a source).
 */
export function isUnresolvedGoogleNewsUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    return new URL(url).hostname.toLowerCase() === 'news.google.com';
  } catch {
    return false;
  }
}

/**
 * True when a candidate must not be written as a citation source.
 * Unresolved Google News URLs are never sources (grill), including empty /
 * placeholder bodies pretending to be publisher text.
 */
export function isRejectableCitationSource(
  record: Pick<CitationSourceRecord, 'url' | 'text'>,
): boolean {
  return isUnresolvedGoogleNewsUrl(record.url);
}

function normalizeRecord(key: string, raw: unknown): CitationSourceRecord | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id !== key) return null;
  if (!isStringOrNull(raw.url)) return null;
  if (typeof raw.text !== 'string') return null;
  if (typeof raw.fetchedAt !== 'string') return null;
  if (typeof raw.runId !== 'string') return null;
  if (typeof raw.contentHash !== 'string') return null;
  if (!isStringOrNull(raw.articleId)) return null;

  return {
    id: raw.id,
    url: raw.url,
    text: raw.text,
    fetchedAt: raw.fetchedAt,
    runId: raw.runId,
    contentHash: raw.contentHash,
    articleId: raw.articleId,
  };
}

function normalizeSources(parsed: unknown): CitationSourcesStore {
  if (!isRecord(parsed)) {
    throw new Error('citation-sources.json must contain a JSON object');
  }

  const sources: Record<string, CitationSourceRecord> = {};
  if (isRecord(parsed.sources)) {
    for (const [key, raw] of Object.entries(parsed.sources)) {
      const record = normalizeRecord(key, raw);
      if (record) sources[key] = record;
    }
  }

  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  return { sources, updatedAt };
}

/**
 * Read citation sources from disk.
 * Missing file → empty store; malformed records are dropped.
 */
export async function readCitationSources(
  sourcesPath: string = CITATION_SOURCES_PATH,
): Promise<CitationSourcesStore> {
  try {
    const raw = await readFile(sourcesPath, 'utf8');
    return normalizeSources(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { sources: {}, updatedAt: null };
    }
    throw err;
  }
}

async function mergeAndWrite(
  records: CitationSourceRecord[],
  sourcesPath: string,
): Promise<CitationSourcesStore> {
  const store = await readCitationSources(sourcesPath);
  for (const incoming of records) {
    if (isRejectableCitationSource(incoming)) continue;
    const contentHash = incoming.contentHash || citationSourceContentHash(incoming.text);
    const id = citationSourceRecordId(contentHash, incoming.runId);
    store.sources[id] = {
      ...incoming,
      id,
      contentHash,
    };
  }
  store.updatedAt = new Date().toISOString();
  await writeJsonAtomic(sourcesPath, store);
  return store;
}

/**
 * Upsert source records for a run (read-merge-write, atomic).
 * Unresolved Google News URLs are skipped and never written.
 * Registering already-known body text by `contentHash` into this runId's set
 * counts as fetched that run — no HTTP.
 */
export async function registerCitationSources(
  records: CitationSourceRecord[],
  sourcesPath: string = CITATION_SOURCES_PATH,
): Promise<CitationSourcesStore> {
  return enqueueFileWrite(sourcesPath, () => mergeAndWrite(records, sourcesPath));
}

/**
 * Read, apply `mutate`, write atomically; serialized per path.
 * `mutate` must not call other citation-sources writes (they would wait on this one).
 */
export async function updateCitationSources(
  mutate: (
    store: CitationSourcesStore,
  ) => CitationSourcesStore | Promise<CitationSourcesStore>,
  sourcesPath: string = CITATION_SOURCES_PATH,
): Promise<CitationSourcesStore> {
  return enqueueFileWrite(sourcesPath, async () => {
    const current = await readCitationSources(sourcesPath);
    const next = await mutate(current);
    await writeJsonAtomic(sourcesPath, next);
    return next;
  });
}

async function filterAndWrite(
  shouldDrop: (record: CitationSourceRecord) => boolean,
  sourcesPath: string,
): Promise<number> {
  const store = await readCitationSources(sourcesPath);
  const sources: Record<string, CitationSourceRecord> = {};
  for (const [id, record] of Object.entries(store.sources)) {
    if (!shouldDrop(record)) sources[id] = record;
  }
  const removed = Object.keys(store.sources).length - Object.keys(sources).length;
  if (removed > 0) {
    await writeJsonAtomic(sourcesPath, {
      sources,
      updatedAt: new Date().toISOString(),
    });
  }
  return removed;
}

/**
 * Drop sources matching an ISO cutoff or a drop-predicate.
 * - string: remove when `fetchedAt` is strictly older than the ISO timestamp
 * - function: remove when the predicate returns true
 * Leaves the file untouched when nothing is removed; missing file → 0, no create.
 */
export async function pruneCitationSources(
  olderThanIsoOrPredicate: string | ((record: CitationSourceRecord) => boolean),
  sourcesPath: string = CITATION_SOURCES_PATH,
): Promise<number> {
  const shouldDrop =
    typeof olderThanIsoOrPredicate === 'string'
      ? (record: CitationSourceRecord) => {
          const fetched = Date.parse(record.fetchedAt);
          const cutoff = Date.parse(olderThanIsoOrPredicate);
          return !Number.isNaN(fetched) && !Number.isNaN(cutoff) && fetched < cutoff;
        }
      : olderThanIsoOrPredicate;

  return enqueueFileWrite(sourcesPath, () => filterAndWrite(shouldDrop, sourcesPath));
}

/** Drop sources with `fetchedAt` older than `retentionDays` before `now` (default 7). */
export async function pruneCitationSourcesOlderThan(
  now: Date,
  retentionDays: number = CITATION_SOURCES_RETENTION_DAYS,
  sourcesPath: string = CITATION_SOURCES_PATH,
): Promise<number> {
  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  return pruneCitationSources(cutoffIso, sourcesPath);
}
