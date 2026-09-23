import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Claim, ClaimStatus } from '../types/claim.js';
import { CLAIMS_PATH, DATA_DIR } from './paths.js';

const FALLBACK_CREATED_AT = new Date(0).toISOString();

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureClaimsDir(claimsPath: string): Promise<void> {
  await mkdir(path.dirname(claimsPath), { recursive: true });
}

function normalizeClaimStatus(input: unknown): ClaimStatus {
  if (input === 'reported') return 'reported';
  if (input === 'supported_by_primary') return 'supported_by_primary';
  if (input === 'contested') return 'contested';
  return 'insufficient_evidence';
}

function normalizeClaim(raw: unknown): Claim | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Partial<Claim>;

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (id.length === 0) return null;

  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (text.length === 0) return null;

  const claimType =
    record.claimType === 'event_occurrence' ||
    record.claimType === 'attribution' ||
    record.claimType === 'casualty_or_count' ||
    record.claimType === 'official_statement' ||
    record.claimType === 'territorial_or_control'
      ? record.claimType
      : null;
  if (!claimType) return null;

  const entities = Array.isArray(record.entities)
    ? record.entities
        .filter((e): e is string => typeof e === 'string')
        .map((e) => e.trim())
        .filter((e) => e.length > 0)
    : [];

  const createdAtRaw =
    typeof record.createdAt === 'string' ? record.createdAt.trim() : '';
  const createdAt = createdAtRaw.length > 0 ? createdAtRaw : FALLBACK_CREATED_AT;

  return {
    id,
    text,
    claimType,
    status: normalizeClaimStatus(record.status),
    entities,
    createdAt,
    domain: 'conflict',
  };
}

function normalizeClaims(parsed: unknown): Claim[] {
  if (!Array.isArray(parsed)) {
    throw new Error('claims.json must contain a JSON array');
  }

  const seen = new Set<string>();
  const claims: Claim[] = [];
  for (const raw of parsed) {
    const claim = normalizeClaim(raw);
    if (!claim) continue;
    if (seen.has(claim.id)) continue;
    seen.add(claim.id);
    claims.push(claim);
  }
  return claims;
}

/**
 * Read all claims from disk.
 * Missing file → empty array (created on write).
 */
export async function readClaims(
  claimsPath: string = CLAIMS_PATH,
): Promise<Claim[]> {
  if (claimsPath === CLAIMS_PATH) {
    await ensureDataDir();
  } else {
    await ensureClaimsDir(claimsPath);
  }

  try {
    const raw = await readFile(claimsPath, 'utf8');
    return normalizeClaims(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/** Replace the entire claims store on disk. */
export async function writeClaims(
  claims: Claim[],
  claimsPath: string = CLAIMS_PATH,
): Promise<void> {
  if (claimsPath === CLAIMS_PATH) {
    await ensureDataDir();
  } else {
    await ensureClaimsDir(claimsPath);
  }

  await writeFile(claimsPath, `${JSON.stringify(claims, null, 2)}\n`, 'utf8');
}

/** Find a single claim by id. */
export async function getClaimById(
  id: string,
  claimsPath: string = CLAIMS_PATH,
): Promise<Claim | null> {
  const claims = await readClaims(claimsPath);
  return claims.find((c) => c.id === id) ?? null;
}

export type UpsertClaimInput = Omit<
  Claim,
  'id' | 'createdAt' | 'domain' | 'status'
> & {
  id?: string;
  createdAt?: string;
  status?: ClaimStatus;
};

/**
 * Insert or update a claim by id.
 * - Defaults `status` to insufficient_evidence if omitted.
 * - Forces `domain` to 'conflict' (v1 locked ruling).
 */
export async function upsertClaim(
  input: UpsertClaimInput,
  claimsPath: string = CLAIMS_PATH,
): Promise<Claim> {
  const claims = await readClaims(claimsPath);

  const id = typeof input.id === 'string' && input.id.trim().length > 0
    ? input.id.trim()
    : randomUUID();

  const index = claims.findIndex((c) => c.id === id);
  const existing = index >= 0 ? claims[index] : null;

  const text = input.text.trim();
  const entities = input.entities
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);

  const createdAt =
    existing?.createdAt ??
    (typeof input.createdAt === 'string' && input.createdAt.trim().length > 0
      ? input.createdAt.trim()
      : new Date().toISOString());

  const status =
    input.status ?? existing?.status ?? ('insufficient_evidence' satisfies ClaimStatus);

  const next: Claim = {
    id,
    text,
    claimType: input.claimType,
    status,
    entities,
    createdAt,
    domain: 'conflict',
  };

  if (index >= 0) {
    claims[index] = next;
  } else {
    claims.push(next);
  }
  await writeClaims(claims, claimsPath);
  return next;
}

