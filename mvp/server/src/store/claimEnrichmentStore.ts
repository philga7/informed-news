import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BriefClaimVerbiage, ClaimEnrichmentRecord } from '../types/briefClaim.js';
import { CLAIM_ENRICHMENTS_PATH, DATA_DIR } from './paths.js';

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureClaimEnrichmentsDir(storePath: string): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
}

function normalizeVerbiage(raw: unknown): BriefClaimVerbiage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Partial<BriefClaimVerbiage>;
  const short_summary =
    typeof record.short_summary === 'string' ? record.short_summary.trim() : '';
  if (!short_summary) {
    return null;
  }

  const talking_points = Array.isArray(record.talking_points)
    ? record.talking_points
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return {
    short_summary,
    talking_points,
  };
}

function normalizeClaimEnrichmentRecord(raw: unknown): ClaimEnrichmentRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Partial<ClaimEnrichmentRecord>;
  const claimId = typeof record.claimId === 'string' ? record.claimId.trim() : '';
  if (!claimId) {
    return null;
  }

  const enrichment = record.enrichment === null ? null : normalizeVerbiage(record.enrichment);
  const enrichedAt =
    record.enrichedAt === null || typeof record.enrichedAt === 'string' ? record.enrichedAt : null;
  const enrichError =
    record.enrichError === null || typeof record.enrichError === 'string'
      ? record.enrichError
      : null;
  const model = record.model === null || typeof record.model === 'string' ? record.model : null;

  return {
    claimId,
    enrichment,
    enrichedAt,
    enrichError,
    model,
  };
}

function normalizeClaimEnrichments(parsed: unknown): ClaimEnrichmentRecord[] {
  if (!Array.isArray(parsed)) {
    throw new Error('claim-enrichments.json must contain a JSON array');
  }

  const seen = new Set<string>();
  const records: ClaimEnrichmentRecord[] = [];
  for (const raw of parsed) {
    const record = normalizeClaimEnrichmentRecord(raw);
    if (!record) continue;
    if (seen.has(record.claimId)) continue;
    seen.add(record.claimId);
    records.push(record);
  }
  return records;
}

export async function readClaimEnrichments(
  storePath: string = CLAIM_ENRICHMENTS_PATH,
): Promise<ClaimEnrichmentRecord[]> {
  if (storePath === CLAIM_ENRICHMENTS_PATH) {
    await ensureDataDir();
  } else {
    await ensureClaimEnrichmentsDir(storePath);
  }

  try {
    const raw = await readFile(storePath, 'utf8');
    return normalizeClaimEnrichments(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export async function writeClaimEnrichments(
  records: ClaimEnrichmentRecord[],
  storePath: string = CLAIM_ENRICHMENTS_PATH,
): Promise<void> {
  if (storePath === CLAIM_ENRICHMENTS_PATH) {
    await ensureDataDir();
  } else {
    await ensureClaimEnrichmentsDir(storePath);
  }

  await writeFile(storePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
}

export async function upsertClaimEnrichment(
  record: ClaimEnrichmentRecord,
  storePath: string = CLAIM_ENRICHMENTS_PATH,
): Promise<ClaimEnrichmentRecord> {
  const records = await readClaimEnrichments(storePath);
  const index = records.findIndex((entry) => entry.claimId === record.claimId);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  await writeClaimEnrichments(records, storePath);
  return record;
}

export async function getClaimEnrichment(
  claimId: string,
  storePath: string = CLAIM_ENRICHMENTS_PATH,
): Promise<ClaimEnrichmentRecord | null> {
  const records = await readClaimEnrichments(storePath);
  return records.find((record) => record.claimId === claimId) ?? null;
}
