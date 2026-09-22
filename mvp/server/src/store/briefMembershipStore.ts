import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BRIEF_MEMBERSHIP_PATH, DATA_DIR } from './paths.js';

export type BriefMembership = {
  acceptedClusterIds: string[];
  updatedAt: string | null;
};

const EMPTY_MEMBERSHIP: BriefMembership = {
  acceptedClusterIds: [],
  updatedAt: null,
};

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureMembershipDir(membershipPath: string): Promise<void> {
  await mkdir(path.dirname(membershipPath), { recursive: true });
}

function normalizeMembership(parsed: unknown): BriefMembership {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('brief-membership.json must contain a JSON object');
  }

  const record = parsed as Partial<BriefMembership>;
  const acceptedClusterIds = Array.isArray(record.acceptedClusterIds)
    ? record.acceptedClusterIds.filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0,
      )
    : [];

  const updatedAt =
    record.updatedAt === null || typeof record.updatedAt === 'string'
      ? record.updatedAt
      : null;

  return { acceptedClusterIds, updatedAt };
}

/**
 * Read Brief membership from disk.
 * Missing file → empty accepted set.
 */
export async function readBriefMembership(
  membershipPath: string = BRIEF_MEMBERSHIP_PATH,
): Promise<BriefMembership> {
  if (membershipPath === BRIEF_MEMBERSHIP_PATH) {
    await ensureDataDir();
  } else {
    await ensureMembershipDir(membershipPath);
  }

  try {
    const raw = await readFile(membershipPath, 'utf8');
    return normalizeMembership(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ...EMPTY_MEMBERSHIP };
    }
    throw err;
  }
}

async function writeBriefMembership(
  membership: BriefMembership,
  membershipPath: string = BRIEF_MEMBERSHIP_PATH,
): Promise<void> {
  if (membershipPath === BRIEF_MEMBERSHIP_PATH) {
    await ensureDataDir();
  } else {
    await ensureMembershipDir(membershipPath);
  }

  await writeFile(
    membershipPath,
    `${JSON.stringify(membership, null, 2)}\n`,
    'utf8',
  );
}

/** Idempotently accept a cluster onto the Brief. */
export async function acceptCluster(
  clusterId: string,
  membershipPath: string = BRIEF_MEMBERSHIP_PATH,
): Promise<{ acceptedClusterIds: string[] }> {
  const membership = await readBriefMembership(membershipPath);
  if (membership.acceptedClusterIds.includes(clusterId)) {
    return { acceptedClusterIds: membership.acceptedClusterIds };
  }

  const next: BriefMembership = {
    acceptedClusterIds: [...membership.acceptedClusterIds, clusterId],
    updatedAt: new Date().toISOString(),
  };
  await writeBriefMembership(next, membershipPath);
  return { acceptedClusterIds: next.acceptedClusterIds };
}

/** Idempotently remove a cluster from Brief membership. */
export async function unacceptCluster(
  clusterId: string,
  membershipPath: string = BRIEF_MEMBERSHIP_PATH,
): Promise<{ acceptedClusterIds: string[] }> {
  const membership = await readBriefMembership(membershipPath);
  if (!membership.acceptedClusterIds.includes(clusterId)) {
    return { acceptedClusterIds: membership.acceptedClusterIds };
  }

  const next: BriefMembership = {
    acceptedClusterIds: membership.acceptedClusterIds.filter((id) => id !== clusterId),
    updatedAt: new Date().toISOString(),
  };
  await writeBriefMembership(next, membershipPath);
  return { acceptedClusterIds: next.acceptedClusterIds };
}
