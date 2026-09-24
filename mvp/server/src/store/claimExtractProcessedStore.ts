import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLAIM_EXTRACT_PROCESSED_PATH, DATA_DIR } from './paths.js';

export type ClaimExtractProcessed = {
  articleIds: string[];
  updatedAt: string | null;
};

const EMPTY_PROCESSED: ClaimExtractProcessed = {
  articleIds: [],
  updatedAt: null,
};

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureProcessedDir(processedPath: string): Promise<void> {
  await mkdir(path.dirname(processedPath), { recursive: true });
}

function normalizeArticleId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeProcessed(parsed: unknown): ClaimExtractProcessed {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('claim-extract-processed.json must contain a JSON object');
  }

  const record = parsed as Partial<ClaimExtractProcessed>;
  const seen = new Set<string>();
  const articleIds: string[] = [];

  if (Array.isArray(record.articleIds)) {
    for (const raw of record.articleIds) {
      const id = normalizeArticleId(raw);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      articleIds.push(id);
    }
  }

  const updatedAt =
    record.updatedAt === null || typeof record.updatedAt === 'string'
      ? record.updatedAt
      : null;

  return { articleIds, updatedAt };
}

/**
 * Read extract-processed article ids from disk.
 * Missing file → empty articleIds / null updatedAt.
 */
export async function readClaimExtractProcessed(
  processedPath: string = CLAIM_EXTRACT_PROCESSED_PATH,
): Promise<ClaimExtractProcessed> {
  if (processedPath === CLAIM_EXTRACT_PROCESSED_PATH) {
    await ensureDataDir();
  } else {
    await ensureProcessedDir(processedPath);
  }

  try {
    const raw = await readFile(processedPath, 'utf8');
    return normalizeProcessed(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { ...EMPTY_PROCESSED };
    }
    throw err;
  }
}

async function writeClaimExtractProcessed(
  processed: ClaimExtractProcessed,
  processedPath: string = CLAIM_EXTRACT_PROCESSED_PATH,
): Promise<void> {
  if (processedPath === CLAIM_EXTRACT_PROCESSED_PATH) {
    await ensureDataDir();
  } else {
    await ensureProcessedDir(processedPath);
  }

  await writeFile(
    processedPath,
    `${JSON.stringify(processed, null, 2)}\n`,
    'utf8',
  );
}

/** Mark article ids as extract-processed (idempotent merge). */
export async function markArticlesExtractProcessed(
  ids: string[],
  processedPath: string = CLAIM_EXTRACT_PROCESSED_PATH,
): Promise<{ articleIds: string[] }> {
  const normalizedIds = ids
    .map((id) => normalizeArticleId(id))
    .filter((id): id is string => id !== null);

  const processed = await readClaimExtractProcessed(processedPath);
  const seen = new Set(processed.articleIds);
  const newIds = normalizedIds.filter((id) => !seen.has(id));

  if (newIds.length === 0 && normalizedIds.length === 0) {
    return { articleIds: processed.articleIds };
  }

  if (newIds.length === 0) {
    return { articleIds: processed.articleIds };
  }

  const next: ClaimExtractProcessed = {
    articleIds: [...processed.articleIds, ...newIds],
    updatedAt: new Date().toISOString(),
  };
  await writeClaimExtractProcessed(next, processedPath);
  return { articleIds: next.articleIds };
}

/** Whether an article id has already been extract-processed. */
export async function isArticleExtractProcessed(
  articleId: string,
  processedPath: string = CLAIM_EXTRACT_PROCESSED_PATH,
): Promise<boolean> {
  const normalizedId = normalizeArticleId(articleId);
  if (!normalizedId) {
    return false;
  }

  const processed = await readClaimExtractProcessed(processedPath);
  return processed.articleIds.includes(normalizedId);
}
