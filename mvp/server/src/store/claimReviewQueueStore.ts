import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLAIM_REVIEW_QUEUE_PATH, DATA_DIR } from './paths.js';

export type ClaimReviewQueueEntry = {
  id: string;
  claimId: string;
  evidenceLinkId: string;
  articleId: string;
  reviewReasons: string[];
  candidateText: string;
  createdAt: string; // ISO
};

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function ensureQueueDir(queuePath: string): Promise<void> {
  await mkdir(path.dirname(queuePath), { recursive: true });
}

function queueEntryKey(entry: {
  articleId: string;
  claimId: string;
  evidenceLinkId: string;
}): string {
  return `${entry.articleId}::${entry.claimId}::${entry.evidenceLinkId}`;
}

function normalizeEntry(raw: unknown): ClaimReviewQueueEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Partial<ClaimReviewQueueEntry>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (id.length === 0) return null;

  const claimId = typeof record.claimId === 'string' ? record.claimId.trim() : '';
  if (claimId.length === 0) return null;

  const evidenceLinkId =
    typeof record.evidenceLinkId === 'string' ? record.evidenceLinkId.trim() : '';
  if (evidenceLinkId.length === 0) return null;

  const articleId = typeof record.articleId === 'string' ? record.articleId.trim() : '';
  if (articleId.length === 0) return null;

  const reviewReasons = Array.isArray(record.reviewReasons)
    ? record.reviewReasons.filter((r): r is string => typeof r === 'string')
    : [];

  const candidateText =
    typeof record.candidateText === 'string' ? record.candidateText : '';
  if (candidateText.length === 0) return null;

  const createdAt =
    typeof record.createdAt === 'string' ? record.createdAt.trim() : '';
  if (createdAt.length === 0) return null;

  return {
    id,
    claimId,
    evidenceLinkId,
    articleId,
    reviewReasons,
    candidateText,
    createdAt,
  };
}

function normalizeQueue(parsed: unknown): ClaimReviewQueueEntry[] {
  if (!Array.isArray(parsed)) {
    throw new Error('claim-review-queue.json must contain a JSON array');
  }

  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const entries: ClaimReviewQueueEntry[] = [];

  for (const raw of parsed) {
    const entry = normalizeEntry(raw);
    if (!entry) continue;
    if (seenIds.has(entry.id)) continue;
    const key = queueEntryKey(entry);
    if (seenKeys.has(key)) continue;
    seenIds.add(entry.id);
    seenKeys.add(key);
    entries.push(entry);
  }

  return entries;
}

/**
 * Read claim review queue from disk.
 * Missing file → empty array.
 */
export async function readClaimReviewQueue(
  queuePath: string = CLAIM_REVIEW_QUEUE_PATH,
): Promise<ClaimReviewQueueEntry[]> {
  if (queuePath === CLAIM_REVIEW_QUEUE_PATH) {
    await ensureDataDir();
  } else {
    await ensureQueueDir(queuePath);
  }

  try {
    const raw = await readFile(queuePath, 'utf8');
    return normalizeQueue(JSON.parse(raw));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

export async function writeClaimReviewQueue(
  entries: ClaimReviewQueueEntry[],
  queuePath: string = CLAIM_REVIEW_QUEUE_PATH,
): Promise<void> {
  if (queuePath === CLAIM_REVIEW_QUEUE_PATH) {
    await ensureDataDir();
  } else {
    await ensureQueueDir(queuePath);
  }

  await writeFile(queuePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

/** Idempotently enqueue a claim for human review. */
export async function enqueueClaimReview(
  entry: ClaimReviewQueueEntry,
  queuePath: string = CLAIM_REVIEW_QUEUE_PATH,
): Promise<{ entries: ClaimReviewQueueEntry[] }> {
  const normalized = normalizeEntry(entry);
  if (!normalized) {
    const queue = await readClaimReviewQueue(queuePath);
    return { entries: queue };
  }

  const queue = await readClaimReviewQueue(queuePath);
  const key = queueEntryKey(normalized);
  if (queue.some((existing) => queueEntryKey(existing) === key)) {
    return { entries: queue };
  }

  const next = [...queue, normalized];
  await writeClaimReviewQueue(next, queuePath);
  return { entries: next };
}
