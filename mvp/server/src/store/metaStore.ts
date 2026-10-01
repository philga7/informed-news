import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreMeta } from '../types/article.js';
import { META_PATH } from './paths.js';

const EMPTY_META: StoreMeta = {
  lastFetchAt: null,
  lastError: null,
};

async function ensureDataDir(metaPath: string): Promise<void> {
  await mkdir(path.dirname(metaPath), { recursive: true });
}

/**
 * Read store metadata. Creates a default file if missing.
 * Optional fields (topicSearch, triage, refresh, brief) pass through unchanged.
 */
export async function readMeta(metaPath: string = META_PATH): Promise<StoreMeta> {
  await ensureDataDir(metaPath);
  try {
    const raw = await readFile(metaPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('meta.json must contain a JSON object');
    }
    return { ...EMPTY_META, ...(parsed as Partial<StoreMeta>) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      await writeMeta(EMPTY_META, metaPath);
      return { ...EMPTY_META };
    }
    throw err;
  }
}

/**
 * Write store metadata. Atomic: temp file in the same directory, then rename,
 * so a concurrent reader never sees a partial file.
 */
export async function writeMeta(meta: StoreMeta, metaPath: string = META_PATH): Promise<void> {
  await ensureDataDir(metaPath);
  const tmpPath = `${metaPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    await rename(tmpPath, metaPath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

/**
 * Merge partial updates into existing meta.
 */
export async function updateMeta(
  patch: Partial<StoreMeta>,
  metaPath: string = META_PATH,
): Promise<StoreMeta> {
  const current = await readMeta(metaPath);
  const next: StoreMeta = { ...current, ...patch };
  await writeMeta(next, metaPath);
  return next;
}
