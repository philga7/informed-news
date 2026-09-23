import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ClaimMembership } from '../types/claim.js';
import { CLAIM_MEMBERSHIP_PATH, DATA_DIR } from './paths.js';

export type { ClaimMembership } from '../types/claim.js';

const EMPTY_MEMBERSHIP: ClaimMembership = {
  acceptedClaimIds: [],
  updatedAt: null,
};

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureMembershipDir(membershipPath: string): Promise<void> {
  await mkdir(path.dirname(membershipPath), { recursive: true });
}

function normalizeMembership(parsed: unknown): ClaimMembership {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('claim-membership.json must contain a JSON object');
  }

  const record = parsed as Partial<ClaimMembership>;
  const acceptedClaimIds = Array.isArray(record.acceptedClaimIds)
    ? record.acceptedClaimIds.filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0,
      )
    : [];

  const updatedAt =
    record.updatedAt === null || typeof record.updatedAt === 'string'
      ? record.updatedAt
      : null;

  return { acceptedClaimIds, updatedAt };
}

/**
 * Read Claim membership from disk.
 * Missing file → empty accepted set.
 */
export async function readClaimMembership(
  membershipPath: string = CLAIM_MEMBERSHIP_PATH,
): Promise<ClaimMembership> {
  if (membershipPath === CLAIM_MEMBERSHIP_PATH) {
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

async function writeClaimMembership(
  membership: ClaimMembership,
  membershipPath: string = CLAIM_MEMBERSHIP_PATH,
): Promise<void> {
  if (membershipPath === CLAIM_MEMBERSHIP_PATH) {
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

/** Idempotently accept a claim onto membership. */
export async function acceptClaim(
  claimId: string,
  membershipPath: string = CLAIM_MEMBERSHIP_PATH,
): Promise<{ acceptedClaimIds: string[] }> {
  const trimmed = claimId.trim();
  if (!trimmed) {
    const membership = await readClaimMembership(membershipPath);
    return { acceptedClaimIds: membership.acceptedClaimIds };
  }

  const membership = await readClaimMembership(membershipPath);
  if (membership.acceptedClaimIds.includes(trimmed)) {
    return { acceptedClaimIds: membership.acceptedClaimIds };
  }

  const next: ClaimMembership = {
    acceptedClaimIds: [...membership.acceptedClaimIds, trimmed],
    updatedAt: new Date().toISOString(),
  };
  await writeClaimMembership(next, membershipPath);
  return { acceptedClaimIds: next.acceptedClaimIds };
}

/** Idempotently remove a claim from membership. */
export async function unacceptClaim(
  claimId: string,
  membershipPath: string = CLAIM_MEMBERSHIP_PATH,
): Promise<{ acceptedClaimIds: string[] }> {
  const trimmed = claimId.trim();
  if (!trimmed) {
    const membership = await readClaimMembership(membershipPath);
    return { acceptedClaimIds: membership.acceptedClaimIds };
  }

  const membership = await readClaimMembership(membershipPath);
  if (!membership.acceptedClaimIds.includes(trimmed)) {
    return { acceptedClaimIds: membership.acceptedClaimIds };
  }

  const next: ClaimMembership = {
    acceptedClaimIds: membership.acceptedClaimIds.filter((id) => id !== trimmed),
    updatedAt: new Date().toISOString(),
  };
  await writeClaimMembership(next, membershipPath);
  return { acceptedClaimIds: next.acceptedClaimIds };
}

