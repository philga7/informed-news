import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvidenceLink, EvidenceStance, SourceTier } from '../types/claim.js';
import { deriveClaimStatus } from '../services/deriveClaimStatus.js';
import { getClaimById, readClaims, writeClaims } from './claimStore.js';
import { CLAIMS_PATH, DATA_DIR, EVIDENCE_LINKS_PATH } from './paths.js';

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureEvidenceDir(evidencePath: string): Promise<void> {
  await mkdir(path.dirname(evidencePath), { recursive: true });
}

function normalizeOptionalIdOrUrl(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStance(input: unknown): EvidenceStance | null {
  if (input === 'supports') return 'supports';
  if (input === 'contradicts') return 'contradicts';
  if (input === 'mentions') return 'mentions';
  return null;
}

function normalizeTier(input: unknown): SourceTier | null {
  if (input === 'primary') return 'primary';
  if (input === 'sensor') return 'sensor';
  return null;
}

function normalizeEvidenceLink(raw: unknown): EvidenceLink | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Partial<EvidenceLink>;

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (id.length === 0) return null;

  const claimId = typeof record.claimId === 'string' ? record.claimId.trim() : '';
  if (claimId.length === 0) return null;

  const articleId = normalizeOptionalIdOrUrl(record.articleId);
  const url = normalizeOptionalIdOrUrl(record.url);
  if (!articleId && !url) return null;

  const stance = normalizeStance(record.stance);
  if (!stance) return null;
  const sourceTier = normalizeTier(record.sourceTier);
  if (!sourceTier) return null;

  const confidence =
    typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? record.confidence
      : null;
  if (confidence === null) return null;

  const scores =
    record.scores === null ||
    (typeof record.scores === 'object' && record.scores !== null && !Array.isArray(record.scores))
      ? (record.scores as Record<string, number> | null)
      : null;

  const createdAt =
    typeof record.createdAt === 'string' ? record.createdAt.trim() : '';
  if (createdAt.length === 0) return null;

  return {
    id,
    claimId,
    articleId,
    url,
    stance,
    sourceTier,
    confidence,
    scores,
    createdAt,
  };
}

function normalizeEvidenceLinks(parsed: unknown): EvidenceLink[] {
  if (!Array.isArray(parsed)) {
    throw new Error('evidence-links.json must contain a JSON array');
  }
  const seen = new Set<string>();
  const links: EvidenceLink[] = [];
  for (const raw of parsed) {
    const link = normalizeEvidenceLink(raw);
    if (!link) continue;
    if (seen.has(link.id)) continue;
    seen.add(link.id);
    links.push(link);
  }
  return links;
}

/**
 * Read all evidence links from disk.
 * Missing file → empty array (created on write).
 */
export async function readEvidenceLinks(
  evidencePath: string = EVIDENCE_LINKS_PATH,
): Promise<EvidenceLink[]> {
  if (evidencePath === EVIDENCE_LINKS_PATH) {
    await ensureDataDir();
  } else {
    await ensureEvidenceDir(evidencePath);
  }

  try {
    const raw = await readFile(evidencePath, 'utf8');
    return normalizeEvidenceLinks(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/** Replace the entire evidence-links store on disk. */
export async function writeEvidenceLinks(
  links: EvidenceLink[],
  evidencePath: string = EVIDENCE_LINKS_PATH,
): Promise<void> {
  if (evidencePath === EVIDENCE_LINKS_PATH) {
    await ensureDataDir();
  } else {
    await ensureEvidenceDir(evidencePath);
  }

  await writeFile(evidencePath, `${JSON.stringify(links, null, 2)}\n`, 'utf8');
}

export async function listEvidenceForClaim(
  claimId: string,
  evidencePath: string = EVIDENCE_LINKS_PATH,
): Promise<EvidenceLink[]> {
  const links = await readEvidenceLinks(evidencePath);
  return links.filter((l) => l.claimId === claimId);
}

function normalizeArticleIdInput(articleId: string | null | undefined): string | null {
  if (articleId === null || articleId === undefined) return null;
  const trimmed = articleId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUrlInput(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type UpsertEvidenceLinkInput = Omit<
  EvidenceLink,
  'id' | 'createdAt' | 'articleId' | 'url'
> & {
  id?: string;
  createdAt?: string;
  articleId?: string | null;
  url?: string | null;
};

/**
 * Insert or update an evidence link by id.
 *
 * Locked ruling: on upsert, recompute and persist claim.status via deriveClaimStatus.
 * Validation: requires at least one of articleId or url.
 */
export async function upsertEvidenceLink(
  input: UpsertEvidenceLinkInput,
  evidencePath: string = EVIDENCE_LINKS_PATH,
  claimsPath: string = CLAIMS_PATH,
): Promise<EvidenceLink | null> {
  const claimId = input.claimId.trim();
  if (claimId.length === 0) return null;

  const articleId = normalizeArticleIdInput(input.articleId);
  const url = normalizeUrlInput(input.url);
  if (!articleId && !url) {
    return null;
  }

  // Evidence is only meaningful for an existing claim in v1.
  const claim = await getClaimById(claimId, claimsPath);
  if (!claim) return null;

  const links = await readEvidenceLinks(evidencePath);

  const id =
    typeof input.id === 'string' && input.id.trim().length > 0
      ? input.id.trim()
      : randomUUID();

  const index = links.findIndex((l) => l.id === id);
  const existing = index >= 0 ? links[index] : null;

  const next: EvidenceLink = {
    id,
    claimId,
    articleId,
    url,
    stance: input.stance,
    sourceTier: input.sourceTier,
    confidence: input.confidence,
    scores: input.scores ?? null,
    createdAt:
      existing?.createdAt ??
      (typeof input.createdAt === 'string' && input.createdAt.trim().length > 0
        ? input.createdAt.trim()
        : new Date().toISOString()),
  };

  if (index >= 0) {
    links[index] = next;
  } else {
    links.push(next);
  }
  await writeEvidenceLinks(links, evidencePath);

  const claimLinks = links.filter((l) => l.claimId === claimId);
  const nextStatus = deriveClaimStatus(claimLinks);

  const claims = await readClaims(claimsPath);
  const claimIndex = claims.findIndex((c) => c.id === claimId);
  if (claimIndex >= 0) {
    claims[claimIndex] = { ...claims[claimIndex]!, status: nextStatus };
    await writeClaims(claims, claimsPath);
  }

  return next;
}

/**
 * Remove an evidence link by id (idempotent).
 *
 * Locked ruling: on remove, recompute and persist claim.status via deriveClaimStatus.
 */
export async function removeEvidenceLink(
  id: string,
  evidencePath: string = EVIDENCE_LINKS_PATH,
  claimsPath: string = CLAIMS_PATH,
): Promise<{ removed: boolean }> {
  const trimmed = id.trim();
  if (!trimmed) return { removed: false };

  const links = await readEvidenceLinks(evidencePath);
  const existing = links.find((l) => l.id === trimmed);
  if (!existing) return { removed: false };

  const nextLinks = links.filter((l) => l.id !== trimmed);
  await writeEvidenceLinks(nextLinks, evidencePath);

  const claimId = existing.claimId;
  const claim = await getClaimById(claimId, claimsPath);
  if (claim) {
    const remaining = nextLinks.filter((l) => l.claimId === claimId);
    const nextStatus = deriveClaimStatus(remaining);

    const claims = await readClaims(claimsPath);
    const claimIndex = claims.findIndex((c) => c.id === claimId);
    if (claimIndex >= 0) {
      claims[claimIndex] = { ...claims[claimIndex]!, status: nextStatus };
      await writeClaims(claims, claimsPath);
    }
  }

  return { removed: true };
}

