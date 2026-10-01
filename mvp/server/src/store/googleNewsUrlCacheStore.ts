import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GOOGLE_NEWS_URL_CACHE_PATH } from './paths.js';

export type GoogleNewsUrlCacheEntry = {
  url: string;
  resolvedAt: string;
};

/** Google News article id → resolved publisher URL (successful resolutions only). */
export type GoogleNewsUrlCache = {
  entries: Record<string, GoogleNewsUrlCacheEntry>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEntry(raw: unknown): GoogleNewsUrlCacheEntry | null {
  if (!isRecord(raw)) return null;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const resolvedAt = typeof raw.resolvedAt === 'string' ? raw.resolvedAt.trim() : '';
  if (url.length === 0 || resolvedAt.length === 0) return null;
  return { url, resolvedAt };
}

function normalizeCache(parsed: unknown): GoogleNewsUrlCache {
  if (!isRecord(parsed)) {
    throw new Error('google-news-url-cache.json must contain a JSON object');
  }

  const entries: Record<string, GoogleNewsUrlCacheEntry> = {};
  if (isRecord(parsed.entries)) {
    for (const [articleId, raw] of Object.entries(parsed.entries)) {
      const entry = normalizeEntry(raw);
      if (entry) entries[articleId] = entry;
    }
  }
  return { entries };
}

/**
 * Read the Google News URL cache from disk.
 * Missing file → empty entries; malformed entries are dropped.
 */
export async function readGoogleNewsUrlCache(
  cachePath: string = GOOGLE_NEWS_URL_CACHE_PATH,
): Promise<GoogleNewsUrlCache> {
  try {
    const raw = await readFile(cachePath, 'utf8');
    return normalizeCache(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { entries: {} };
    }
    throw err;
  }
}

export async function getCachedGoogleNewsUrl(
  articleId: string,
  cachePath: string = GOOGLE_NEWS_URL_CACHE_PATH,
): Promise<string | null> {
  const cache = await readGoogleNewsUrlCache(cachePath);
  return cache.entries[articleId]?.url ?? null;
}

/** Per-file write chains: parallel resolves must not interleave read-modify-write cycles. */
const writeChains = new Map<string, Promise<void>>();

async function writeEntry(articleId: string, url: string, cachePath: string): Promise<void> {
  const cache = await readGoogleNewsUrlCache(cachePath);
  cache.entries[articleId] = { url, resolvedAt: new Date().toISOString() };
  await mkdir(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
    await rename(tempPath, cachePath);
  } catch (err) {
    await rm(tempPath, { force: true });
    throw err;
  }
}

export async function putCachedGoogleNewsUrl(
  articleId: string,
  url: string,
  cachePath: string = GOOGLE_NEWS_URL_CACHE_PATH,
): Promise<void> {
  const key = path.resolve(cachePath);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(() => writeEntry(articleId, url, cachePath));
  const settled = next.catch(() => undefined);
  writeChains.set(key, settled);
  void settled.then(() => {
    if (writeChains.get(key) === settled) writeChains.delete(key);
  });
  return next;
}
