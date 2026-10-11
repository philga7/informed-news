import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { finalizeTopicFields, parseTopicPatch } from '../services/topicInput.js';
import { DEFAULT_TOPICS_SEED_PATH, loadTopicSeed } from '../services/topicSeed.js';
import type { Topic, TopicFields, TopicPatch, TopicsStore } from '../types/topic.js';
import { TOPICS_PATH } from './paths.js';

export type TopicsStorePaths = { topicsPath?: string; seedPath?: string };

export class TopicConflictError extends Error {
  constructor(name: string) {
    super(`a topic named "${name}" already exists`);
    this.name = 'TopicConflictError';
  }
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTopic(raw: unknown): Topic | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const id = nonEmptyString(record.id);
  const createdAt = nonEmptyString(record.createdAt);
  const updatedAt = nonEmptyString(record.updatedAt);
  if (!id || !createdAt || !updatedAt) {
    return null;
  }

  try {
    const fields = finalizeTopicFields({}, parseTopicPatch(record));
    return { id, ...fields, createdAt, updatedAt };
  } catch {
    return null;
  }
}

function normalizeTopics(parsed: unknown): TopicsStore {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('topics.json must contain a JSON object');
  }

  const record = parsed as Partial<Record<keyof TopicsStore, unknown>>;
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const topics: Topic[] = [];

  if (Array.isArray(record.topics)) {
    for (const raw of record.topics) {
      const topic = normalizeTopic(raw);
      if (!topic || seenIds.has(topic.id)) continue;
      const key = nameKey(topic.name);
      if (seenNames.has(key)) continue;
      seenIds.add(topic.id);
      seenNames.add(key);
      topics.push(topic);
    }
  }

  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : null;

  return { topics, updatedAt };
}

function withoutMeta(topic: Topic): TopicFields {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = topic;
  return fields;
}

async function writeTopics(store: TopicsStore, topicsPath: string): Promise<void> {
  await mkdir(path.dirname(topicsPath), { recursive: true });
  await writeFile(topicsPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

/** Per-file write chains so create/update/remove cannot interleave read-modify-write. */
const writeChains = new Map<string, Promise<unknown>>();

function enqueueWrite<T>(topicsPath: string, work: () => Promise<T>): Promise<T> {
  const key = path.resolve(topicsPath);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(work);
  const settled = next.catch(() => undefined);
  writeChains.set(key, settled);
  void settled.then(() => {
    if (writeChains.get(key) === settled) writeChains.delete(key);
  });
  return next;
}

/**
 * Read or seed without taking the write chain. Callers that mutate must already hold
 * `enqueueWrite` for this path (or accept a race on first seed).
 */
async function loadTopics(paths: TopicsStorePaths): Promise<TopicsStore> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  const seedPath = paths.seedPath ?? DEFAULT_TOPICS_SEED_PATH;

  try {
    const raw = await readFile(topicsPath, 'utf8');
    return normalizeTopics(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    const now = new Date().toISOString();
    const seeded: TopicsStore = {
      topics: loadTopicSeed(seedPath).map((entry) => ({
        ...entry,
        createdAt: now,
        updatedAt: now,
      })),
      updatedAt: now,
    };
    await writeTopics(seeded, topicsPath);
    return seeded;
  }
}

/**
 * Read the operator topic list.
 * Missing file → seeded from the committed seed and written; an emptied list stays empty.
 */
export async function readTopics(paths: TopicsStorePaths = {}): Promise<TopicsStore> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  try {
    const raw = await readFile(topicsPath, 'utf8');
    return normalizeTopics(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
    // Serialize first-time seed so concurrent readers don't double-write the seed.
    return enqueueWrite(topicsPath, async () => loadTopics(paths));
  }
}

export async function createTopic(
  fields: TopicFields,
  paths: TopicsStorePaths = {},
): Promise<{ topic: Topic; topics: Topic[] }> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  return enqueueWrite(topicsPath, async () => {
    const store = await loadTopics(paths);

    const key = nameKey(fields.name);
    if (store.topics.some((t) => nameKey(t.name) === key)) {
      throw new TopicConflictError(fields.name.trim());
    }

    const now = new Date().toISOString();
    const topic: Topic = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
    const next: TopicsStore = { topics: [...store.topics, topic], updatedAt: now };
    await writeTopics(next, topicsPath);
    return { topic, topics: next.topics };
  });
}

/** Patch a topic by id. Unknown id → null. */
export async function updateTopic(
  id: string,
  patch: TopicPatch,
  paths: TopicsStorePaths = {},
): Promise<{ topic: Topic; topics: Topic[] } | null> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  return enqueueWrite(topicsPath, async () => {
    const trimmed = id.trim();
    const store = await loadTopics(paths);
    const existing = store.topics.find((t) => t.id === trimmed);
    if (!existing) {
      return null;
    }

    const merged = finalizeTopicFields(withoutMeta(existing), patch);
    const key = nameKey(merged.name);
    if (store.topics.some((t) => t.id !== existing.id && nameKey(t.name) === key)) {
      throw new TopicConflictError(merged.name);
    }

    const now = new Date().toISOString();
    const topic: Topic = {
      id: existing.id,
      ...merged,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
    const next: TopicsStore = {
      topics: store.topics.map((t) => (t.id === existing.id ? topic : t)),
      updatedAt: now,
    };
    await writeTopics(next, topicsPath);
    return { topic, topics: next.topics };
  });
}

/** Remove a topic by id (idempotent). */
export async function removeTopic(
  id: string,
  paths: TopicsStorePaths = {},
): Promise<{ removed: boolean; topics: Topic[] }> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  return enqueueWrite(topicsPath, async () => {
    const trimmed = id.trim();
    const store = await loadTopics(paths);
    if (!store.topics.some((t) => t.id === trimmed)) {
      return { removed: false, topics: store.topics };
    }

    const next: TopicsStore = {
      topics: store.topics.filter((t) => t.id !== trimmed),
      updatedAt: new Date().toISOString(),
    };
    await writeTopics(next, topicsPath);
    return { removed: true, topics: next.topics };
  });
}
