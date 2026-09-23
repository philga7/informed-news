import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TrackedClaimEntry, TrackedClaims } from '../types/claim.js';
import { DATA_DIR, TRACKED_CLAIMS_PATH } from './paths.js';

export type { TrackedClaimEntry, TrackedClaims } from '../types/claim.js';

const EMPTY_TRACKED: TrackedClaims = {
  entries: [],
  updatedAt: null,
};

function normalizeClaimIdInput(claimId: string): string | null {
  const trimmed = claimId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureTrackedDir(trackedPath: string): Promise<void> {
  await mkdir(path.dirname(trackedPath), { recursive: true });
}

function normalizeEntry(raw: unknown): TrackedClaimEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Partial<TrackedClaimEntry>;
  const claimId = typeof record.claimId === 'string' ? record.claimId.trim() : '';
  if (claimId.length === 0) return null;

  const trackedAt =
    typeof record.trackedAt === 'string' ? record.trackedAt.trim() : '';
  if (trackedAt.length === 0) return null;

  if (typeof record.pendingUpdate !== 'boolean') return null;

  return { claimId, trackedAt, pendingUpdate: record.pendingUpdate };
}

function normalizeTracked(parsed: unknown): TrackedClaims {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('tracked-claims.json must contain a JSON object');
  }

  const record = parsed as Partial<TrackedClaims>;
  const seen = new Set<string>();
  const entries: TrackedClaimEntry[] = [];

  if (Array.isArray(record.entries)) {
    for (const raw of record.entries) {
      const entry = normalizeEntry(raw);
      if (entry && !seen.has(entry.claimId)) {
        seen.add(entry.claimId);
        entries.push(entry);
      }
    }
  }

  const updatedAt =
    record.updatedAt === null || typeof record.updatedAt === 'string'
      ? record.updatedAt
      : null;

  return { entries, updatedAt };
}

/**
 * Read tracked claims from disk.
 * Missing file → empty entries.
 */
export async function readTrackedClaims(
  trackedPath: string = TRACKED_CLAIMS_PATH,
): Promise<TrackedClaims> {
  if (trackedPath === TRACKED_CLAIMS_PATH) {
    await ensureDataDir();
  } else {
    await ensureTrackedDir(trackedPath);
  }

  try {
    const raw = await readFile(trackedPath, 'utf8');
    return normalizeTracked(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ...EMPTY_TRACKED };
    }
    throw err;
  }
}

async function writeTrackedClaims(
  tracked: TrackedClaims,
  trackedPath: string = TRACKED_CLAIMS_PATH,
): Promise<void> {
  if (trackedPath === TRACKED_CLAIMS_PATH) {
    await ensureDataDir();
  } else {
    await ensureTrackedDir(trackedPath);
  }

  await writeFile(trackedPath, `${JSON.stringify(tracked, null, 2)}\n`, 'utf8');
}

/** Idempotently track a claim for updates. */
export async function trackClaim(
  claimId: string,
  trackedPath: string = TRACKED_CLAIMS_PATH,
): Promise<{ entries: TrackedClaimEntry[] }> {
  const normalizedClaimId = normalizeClaimIdInput(claimId);
  if (!normalizedClaimId) {
    const tracked = await readTrackedClaims(trackedPath);
    return { entries: tracked.entries };
  }

  const tracked = await readTrackedClaims(trackedPath);
  const existing = tracked.entries.find((entry) => entry.claimId === normalizedClaimId);
  if (existing) {
    return { entries: tracked.entries };
  }

  const next: TrackedClaims = {
    entries: [
      ...tracked.entries,
      {
        claimId: normalizedClaimId,
        trackedAt: new Date().toISOString(),
        pendingUpdate: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeTrackedClaims(next, trackedPath);
  return { entries: next.entries };
}

/** Idempotently stop tracking a claim. */
export async function untrackClaim(
  claimId: string,
  trackedPath: string = TRACKED_CLAIMS_PATH,
): Promise<{ entries: TrackedClaimEntry[] }> {
  const normalizedClaimId = normalizeClaimIdInput(claimId);
  if (!normalizedClaimId) {
    const tracked = await readTrackedClaims(trackedPath);
    return { entries: tracked.entries };
  }

  const tracked = await readTrackedClaims(trackedPath);
  if (!tracked.entries.some((entry) => entry.claimId === normalizedClaimId)) {
    return { entries: tracked.entries };
  }

  const next: TrackedClaims = {
    entries: tracked.entries.filter((entry) => entry.claimId !== normalizedClaimId),
    updatedAt: new Date().toISOString(),
  };
  await writeTrackedClaims(next, trackedPath);
  return { entries: next.entries };
}

/**
 * Ack a tracked claim update (idempotent).
 * Clears pendingUpdate.
 */
export async function ackTrackedClaimUpdate(
  claimId: string,
  trackedPath: string = TRACKED_CLAIMS_PATH,
): Promise<{ entries: TrackedClaimEntry[] }> {
  const normalizedClaimId = normalizeClaimIdInput(claimId);
  if (!normalizedClaimId) {
    const tracked = await readTrackedClaims(trackedPath);
    return { entries: tracked.entries };
  }

  const tracked = await readTrackedClaims(trackedPath);
  const existing = tracked.entries.find((entry) => entry.claimId === normalizedClaimId);
  if (!existing || !existing.pendingUpdate) {
    return { entries: tracked.entries };
  }

  const entries = tracked.entries.map((entry) =>
    entry.claimId !== normalizedClaimId ? entry : { ...entry, pendingUpdate: false },
  );

  const next: TrackedClaims = {
    entries,
    updatedAt: new Date().toISOString(),
  };
  await writeTrackedClaims(next, trackedPath);
  return { entries: next.entries };
}

/**
 * Mark a tracked claim as having pending updates (idempotent).
 * Only sets pendingUpdate when the claim is already tracked.
 */
export async function markTrackedClaimPending(
  claimId: string,
  trackedPath: string = TRACKED_CLAIMS_PATH,
): Promise<{ entries: TrackedClaimEntry[] }> {
  const normalizedClaimId = normalizeClaimIdInput(claimId);
  if (!normalizedClaimId) {
    const tracked = await readTrackedClaims(trackedPath);
    return { entries: tracked.entries };
  }

  const tracked = await readTrackedClaims(trackedPath);
  const existing = tracked.entries.find((entry) => entry.claimId === normalizedClaimId);
  if (!existing || existing.pendingUpdate) {
    return { entries: tracked.entries };
  }

  const entries = tracked.entries.map((entry) =>
    entry.claimId !== normalizedClaimId ? entry : { ...entry, pendingUpdate: true },
  );

  const next: TrackedClaims = {
    entries,
    updatedAt: new Date().toISOString(),
  };
  await writeTrackedClaims(next, trackedPath);
  return { entries: next.entries };
}

