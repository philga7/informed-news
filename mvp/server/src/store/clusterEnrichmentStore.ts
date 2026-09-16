import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { ClusterEnrichmentRecord } from '../types/clusterEnrichment.js';
import { CLUSTER_ENRICHMENTS_PATH, DATA_DIR } from './paths.js';

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/**
 * Read all cluster enrichments from disk.
 * Missing file → empty array (created on write).
 */
export async function readClusterEnrichments(): Promise<ClusterEnrichmentRecord[]> {
  await ensureDataDir();
  try {
    const raw = await readFile(CLUSTER_ENRICHMENTS_PATH, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('cluster-enrichments.json must contain a JSON array');
    }
    return parsed as ClusterEnrichmentRecord[];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/** Replace the entire cluster enrichments store on disk. */
export async function writeClusterEnrichments(
  records: ClusterEnrichmentRecord[],
): Promise<void> {
  await ensureDataDir();
  await writeFile(
    CLUSTER_ENRICHMENTS_PATH,
    `${JSON.stringify(records, null, 2)}\n`,
    'utf8',
  );
}

/** Upsert a record by stable `key`. */
export async function upsertClusterEnrichment(
  record: ClusterEnrichmentRecord,
): Promise<ClusterEnrichmentRecord> {
  const records = await readClusterEnrichments();
  const index = records.findIndex((r) => r.key === record.key);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  await writeClusterEnrichments(records);
  return record;
}

/** Get one record by key, or null. */
export async function getClusterEnrichment(
  key: string,
): Promise<ClusterEnrichmentRecord | null> {
  const records = await readClusterEnrichments();
  return records.find((r) => r.key === key) ?? null;
}

