import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { StoreMeta } from '../types/article.js';
import { DATA_DIR, META_PATH } from './paths.js';

const EMPTY_META: StoreMeta = {
  lastFetchAt: null,
  lastError: null,
};

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/**
 * Read store metadata. Creates a default file if missing.
 */
export async function readMeta(): Promise<StoreMeta> {
  await ensureDataDir();
  try {
    const raw = await readFile(META_PATH, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('meta.json must contain a JSON object');
    }
    return { ...EMPTY_META, ...(parsed as Partial<StoreMeta>) };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      await writeMeta(EMPTY_META);
      return { ...EMPTY_META };
    }
    throw err;
  }
}

/**
 * Write store metadata (last fetch time / last error).
 */
export async function writeMeta(meta: StoreMeta): Promise<void> {
  await ensureDataDir();
  await writeFile(META_PATH, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

/**
 * Merge partial updates into existing meta.
 */
export async function updateMeta(patch: Partial<StoreMeta>): Promise<StoreMeta> {
  const current = await readMeta();
  const next: StoreMeta = { ...current, ...patch };
  await writeMeta(next);
  return next;
}
