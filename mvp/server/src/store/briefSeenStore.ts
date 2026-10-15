import { readFile } from 'node:fs/promises';
import type { BriefSeenEntry, BriefSeenStore } from '../types/brief.js';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';
import { BRIEF_SEEN_PATH } from './paths.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function normalizeEntry(raw: unknown): BriefSeenEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.seenAt !== 'string') return null;
  if (!isNumberOrNull(raw.outletCount) || !isNumberOrNull(raw.significance)) return null;
  return { seenAt: raw.seenAt, outletCount: raw.outletCount, significance: raw.significance };
}

function normalizeSeen(parsed: unknown): BriefSeenStore {
  if (!isRecord(parsed)) {
    throw new Error('brief-seen.json must contain a JSON object');
  }

  const seen: Record<string, BriefSeenEntry> = {};
  if (isRecord(parsed.seen)) {
    for (const [articleId, raw] of Object.entries(parsed.seen)) {
      const entry = normalizeEntry(raw);
      if (entry) seen[articleId] = entry;
    }
  }

  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  return { seen, updatedAt };
}

/**
 * Read Brief seen snapshots from disk.
 * Missing file → empty store; malformed entries are dropped.
 */
export async function readBriefSeen(seenPath: string = BRIEF_SEEN_PATH): Promise<BriefSeenStore> {
  try {
    const raw = await readFile(seenPath, 'utf8');
    return normalizeSeen(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { seen: {}, updatedAt: null };
    }
    throw err;
  }
}

/** Atomic write: temp file in the same directory, then rename. */
export async function writeBriefSeen(
  store: BriefSeenStore,
  seenPath: string = BRIEF_SEEN_PATH,
): Promise<void> {
  await writeJsonAtomic(seenPath, store);
}

/**
 * Read, apply `mutate`, write atomically; serialized per path so concurrent
 * mark-seen merges don't drop each other's ids. `mutate` must not call other
 * brief-seen writes (they would wait on this one).
 */
export async function updateBriefSeen(
  mutate: (seen: BriefSeenStore) => BriefSeenStore | Promise<BriefSeenStore>,
  seenPath: string = BRIEF_SEEN_PATH,
): Promise<BriefSeenStore> {
  return enqueueFileWrite(seenPath, async () => {
    const current = await readBriefSeen(seenPath);
    const next = await mutate(current);
    await writeJsonAtomic(seenPath, next);
    return next;
  });
}
