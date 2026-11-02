import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { enqueueFileWrite, writeJsonAtomic } from './jsonFileQueue.js';
import { FEEDBACK_PATH, TOPICS_PATH } from './paths.js';

export const FEEDBACK_COMMENT_MAX = 500;

export type FeedbackSignal = 'like' | 'not_relevant';

export type FeedbackTopicSnapshot = {
  id: string;
  name: string;
};

export type FeedbackSnapshot = {
  headline: string;
  source: string;
  url: string;
  topics: FeedbackTopicSnapshot[];
};

export type FeedbackEntry = {
  id: string;
  itemId: string;
  signal: FeedbackSignal;
  comment: string;
  ts: string;
  snapshot: FeedbackSnapshot;
};

export type FeedbackFile = {
  entries: FeedbackEntry[];
  updatedAt: string | null;
};

const EMPTY: FeedbackFile = { entries: [], updatedAt: null };

const SIGNALS = new Set<FeedbackSignal>(['like', 'not_relevant']);

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeedbackValidationError';
  }
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSignal(value: unknown): value is FeedbackSignal {
  return typeof value === 'string' && SIGNALS.has(value as FeedbackSignal);
}

function parseComment(value: unknown, { required }: { required: boolean }): string | undefined {
  if (value === undefined || value === null) {
    if (required) return '';
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new FeedbackValidationError('comment must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length > FEEDBACK_COMMENT_MAX) {
    throw new FeedbackValidationError(
      `comment must be ${FEEDBACK_COMMENT_MAX} characters or fewer`,
    );
  }
  return trimmed;
}

function normalizeSnapshot(raw: unknown): FeedbackSnapshot | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const headline = nonEmpty(record.headline);
  const source = nonEmpty(record.source);
  const url = nonEmpty(record.url);
  if (!headline || !source || !url) return null;
  if (!Array.isArray(record.topics)) return null;
  const topics: FeedbackTopicSnapshot[] = [];
  const seen = new Set<string>();
  for (const topic of record.topics) {
    if (topic === null || typeof topic !== 'object' || Array.isArray(topic)) continue;
    const fields = topic as Record<string, unknown>;
    const id = nonEmpty(fields.id);
    const name = nonEmpty(fields.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    topics.push({ id, name });
  }
  return { headline, source, url, topics };
}

function normalizeEntry(raw: unknown): FeedbackEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = nonEmpty(record.id);
  const itemId = nonEmpty(record.itemId);
  const ts = nonEmpty(record.ts);
  const snapshot = normalizeSnapshot(record.snapshot);
  if (!id || !itemId || !ts || !snapshot || !isSignal(record.signal)) return null;
  if (typeof record.comment !== 'string') return null;
  const comment = record.comment.trim();
  if (comment.length > FEEDBACK_COMMENT_MAX) return null;
  return { id, itemId, signal: record.signal, comment, ts, snapshot };
}

function byNewest(a: FeedbackEntry, b: FeedbackEntry): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

function normalizeFile(parsed: unknown): FeedbackFile {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('feedback.json must contain a JSON object');
  }
  const record = parsed as Partial<Record<keyof FeedbackFile, unknown>>;
  const byItem = new Map<string, FeedbackEntry>();
  const seenIds = new Set<string>();
  if (Array.isArray(record.entries)) {
    for (const raw of record.entries) {
      const entry = normalizeEntry(raw);
      if (!entry || seenIds.has(entry.id)) continue;
      const current = byItem.get(entry.itemId);
      if (current && byNewest(entry, current) > 0) continue;
      if (current) seenIds.delete(current.id);
      seenIds.add(entry.id);
      byItem.set(entry.itemId, entry);
    }
  }
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : null;
  return { entries: [...byItem.values()].sort(byNewest), updatedAt };
}

async function loadFeedback(feedbackPath: string): Promise<FeedbackFile> {
  try {
    const raw = await readFile(feedbackPath, 'utf8');
    return normalizeFile(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY, entries: [] };
    throw err;
  }
}

/** Read feedback. Missing file → empty. Entries are newest first. */
export async function readFeedback(feedbackPath: string = FEEDBACK_PATH): Promise<FeedbackFile> {
  return loadFeedback(feedbackPath);
}

/**
 * Names for topic ids already on disk. A missing topics file stays missing
 * (no seed) so saving feedback does not create the topic list.
 */
export async function feedbackTopicNames(
  ids: readonly string[],
  topicsPath: string = TOPICS_PATH,
): Promise<Map<string, string>> {
  const wanted = new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0));
  const names = new Map<string, string>();
  if (wanted.size === 0) return names;

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(topicsPath, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return names;
    throw err;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return names;
  const topics = (parsed as { topics?: unknown }).topics;
  if (!Array.isArray(topics)) return names;
  for (const topic of topics) {
    if (topic === null || typeof topic !== 'object' || Array.isArray(topic)) continue;
    const record = topic as { id?: unknown; name?: unknown };
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    const id = record.id.trim();
    const name = record.name.trim();
    if (wanted.has(id) && name.length > 0) names.set(id, name);
  }
  return names;
}

export type CreateFeedbackInput = {
  itemId: string;
  signal: unknown;
  comment?: unknown;
  snapshot: FeedbackSnapshot;
};

export async function createFeedback(
  input: CreateFeedbackInput,
  feedbackPath: string = FEEDBACK_PATH,
): Promise<{ entry: FeedbackEntry; entries: FeedbackEntry[]; replaced: boolean }> {
  const itemId = nonEmpty(input.itemId);
  if (!itemId) throw new FeedbackValidationError('itemId is required');
  const signal = input.signal;
  if (!isSignal(signal)) {
    throw new FeedbackValidationError('signal must be like or not_relevant');
  }
  const comment = parseComment(input.comment, { required: true }) ?? '';
  const snapshot = normalizeSnapshot(input.snapshot);
  if (!snapshot) throw new FeedbackValidationError('snapshot is incomplete');

  return enqueueFileWrite(feedbackPath, async () => {
    const store = await loadFeedback(feedbackPath);
    const replaced = store.entries.some((entry) => entry.itemId === itemId);
    const ts = new Date().toISOString();
    const entry: FeedbackEntry = {
      id: randomUUID(),
      itemId,
      signal,
      comment,
      ts,
      snapshot,
    };
    const entries = [entry, ...store.entries.filter((existing) => existing.itemId !== itemId)].sort(
      byNewest,
    );
    const next: FeedbackFile = { entries, updatedAt: ts };
    await writeJsonAtomic(feedbackPath, next);
    return { entry, entries, replaced };
  });
}

export type FeedbackPatch = {
  signal?: unknown;
  comment?: unknown;
};

/** Change signal and comment. Unknown id → null. Does not move ts or the snapshot. */
export async function updateFeedback(
  id: string,
  patch: FeedbackPatch,
  feedbackPath: string = FEEDBACK_PATH,
): Promise<{ entry: FeedbackEntry; entries: FeedbackEntry[] } | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const hasSignal = patch.signal !== undefined;
  const hasComment = patch.comment !== undefined;
  if (!hasSignal && !hasComment) {
    throw new FeedbackValidationError('signal or comment is required');
  }
  if (hasSignal && !isSignal(patch.signal)) {
    throw new FeedbackValidationError('signal must be like or not_relevant');
  }
  const comment = hasComment ? parseComment(patch.comment, { required: true }) : undefined;

  return enqueueFileWrite(feedbackPath, async () => {
    const store = await loadFeedback(feedbackPath);
    const existing = store.entries.find((entry) => entry.id === trimmed);
    if (!existing) return null;
    const entry: FeedbackEntry = {
      ...existing,
      ...(hasSignal && isSignal(patch.signal) ? { signal: patch.signal } : {}),
      ...(comment !== undefined ? { comment } : {}),
    };
    const entries = store.entries.map((current) => (current.id === existing.id ? entry : current));
    const next: FeedbackFile = { entries, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(feedbackPath, next);
    return { entry, entries };
  });
}

/** Delete by feedback id. Unknown id → null. */
export async function removeFeedback(
  id: string,
  feedbackPath: string = FEEDBACK_PATH,
): Promise<{ removed: true; entries: FeedbackEntry[] } | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return enqueueFileWrite(feedbackPath, async () => {
    const store = await loadFeedback(feedbackPath);
    if (!store.entries.some((entry) => entry.id === trimmed)) return null;
    const entries = store.entries.filter((entry) => entry.id !== trimmed);
    const next: FeedbackFile = { entries, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(feedbackPath, next);
    return { removed: true, entries };
  });
}
