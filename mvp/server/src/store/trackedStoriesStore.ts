import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, TRACKED_STORIES_PATH } from './paths.js';

export type TrackedEntry = {
  clusterId: string;
  trackedAt: string;
  memberCountSnapshot: number;
  pendingUpdate: boolean;
};

export type TrackedStories = {
  entries: TrackedEntry[];
  updatedAt: string | null;
};

const EMPTY_TRACKED: TrackedStories = {
  entries: [],
  updatedAt: null,
};

function normalizeClusterIdInput(clusterId: string): string | null {
  const trimmed = clusterId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidMemberCount(count: number): boolean {
  return Number.isFinite(count) && Number.isInteger(count) && count >= 0;
}

function normalizeMemberCountFromMap(count: unknown): number {
  if (typeof count !== 'number') return 0;
  if (!Number.isFinite(count)) return 0;
  if (!Number.isInteger(count)) return 0;
  if (count < 0) return 0;
  return count;
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureTrackedDir(trackedPath: string): Promise<void> {
  await mkdir(path.dirname(trackedPath), { recursive: true });
}

function normalizeEntry(raw: unknown): TrackedEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Partial<TrackedEntry>;
  const clusterId =
    typeof record.clusterId === 'string' ? record.clusterId.trim() : '';
  if (clusterId.length === 0) {
    return null;
  }
  const trackedAt =
    typeof record.trackedAt === 'string' ? record.trackedAt.trim() : '';
  if (trackedAt.length === 0) {
    return null;
  }
  if (typeof record.memberCountSnapshot !== 'number' || !isValidMemberCount(record.memberCountSnapshot)) {
    return null;
  }
  if (typeof record.pendingUpdate !== 'boolean') {
    return null;
  }

  return {
    clusterId,
    trackedAt,
    memberCountSnapshot: record.memberCountSnapshot,
    pendingUpdate: record.pendingUpdate,
  };
}

function normalizeTracked(parsed: unknown): TrackedStories {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('tracked-stories.json must contain a JSON object');
  }

  const record = parsed as Partial<TrackedStories>;
  const seen = new Set<string>();
  const entries: TrackedEntry[] = [];

  if (Array.isArray(record.entries)) {
    for (const raw of record.entries) {
      const entry = normalizeEntry(raw);
      if (entry && !seen.has(entry.clusterId)) {
        seen.add(entry.clusterId);
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
 * Read tracked developing stories from disk.
 * Missing file → empty entries.
 */
export async function readTrackedStories(
  trackedPath: string = TRACKED_STORIES_PATH,
): Promise<TrackedStories> {
  if (trackedPath === TRACKED_STORIES_PATH) {
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

async function writeTrackedStories(
  tracked: TrackedStories,
  trackedPath: string = TRACKED_STORIES_PATH,
): Promise<void> {
  if (trackedPath === TRACKED_STORIES_PATH) {
    await ensureDataDir();
  } else {
    await ensureTrackedDir(trackedPath);
  }

  await writeFile(
    trackedPath,
    `${JSON.stringify(tracked, null, 2)}\n`,
    'utf8',
  );
}

/** Idempotently track a cluster for developing-story alerts. */
export async function trackCluster(
  clusterId: string,
  memberCount: number,
  trackedPath: string = TRACKED_STORIES_PATH,
): Promise<{ entries: TrackedEntry[] }> {
  const normalizedClusterId = normalizeClusterIdInput(clusterId);
  if (!normalizedClusterId || !isValidMemberCount(memberCount)) {
    const tracked = await readTrackedStories(trackedPath);
    return { entries: tracked.entries };
  }

  const tracked = await readTrackedStories(trackedPath);
  const existing = tracked.entries.find(
    (entry) => entry.clusterId === normalizedClusterId,
  );
  if (existing) {
    return { entries: tracked.entries };
  }

  const next: TrackedStories = {
    entries: [
      ...tracked.entries,
      {
        clusterId: normalizedClusterId,
        trackedAt: new Date().toISOString(),
        memberCountSnapshot: memberCount,
        pendingUpdate: false,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeTrackedStories(next, trackedPath);
  return { entries: next.entries };
}

/** Idempotently stop tracking a cluster. */
export async function untrackCluster(
  clusterId: string,
  trackedPath: string = TRACKED_STORIES_PATH,
): Promise<{ entries: TrackedEntry[] }> {
  const normalizedClusterId = normalizeClusterIdInput(clusterId);
  if (!normalizedClusterId) {
    const tracked = await readTrackedStories(trackedPath);
    return { entries: tracked.entries };
  }

  const tracked = await readTrackedStories(trackedPath);
  if (!tracked.entries.some((entry) => entry.clusterId === normalizedClusterId)) {
    return { entries: tracked.entries };
  }

  const next: TrackedStories = {
    entries: tracked.entries.filter((entry) => entry.clusterId !== normalizedClusterId),
    updatedAt: new Date().toISOString(),
  };
  await writeTrackedStories(next, trackedPath);
  return { entries: next.entries };
}

/**
 * After fetch, mark tracked clusters whose member count grew since snapshot.
 * Does not bump snapshots — NEWS-61 ack/view owns that.
 */
export async function syncTrackedAfterFetch(
  countByClusterId: Readonly<Record<string, number>>,
  trackedPath: string = TRACKED_STORIES_PATH,
): Promise<{ entries: TrackedEntry[] }> {
  const tracked = await readTrackedStories(trackedPath);
  let changed = false;

  const entries = tracked.entries.map((entry) => {
    const currentCount = normalizeMemberCountFromMap(countByClusterId[entry.clusterId]);
    if (currentCount > entry.memberCountSnapshot && !entry.pendingUpdate) {
      changed = true;
      return { ...entry, pendingUpdate: true };
    }
    return entry;
  });

  if (!changed) {
    return { entries: tracked.entries };
  }

  const next: TrackedStories = {
    entries,
    updatedAt: new Date().toISOString(),
  };
  await writeTrackedStories(next, trackedPath);
  return { entries: next.entries };
}
