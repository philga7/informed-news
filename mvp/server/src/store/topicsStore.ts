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
  const topics: Topic[] = [];

  if (Array.isArray(record.topics)) {
    for (const raw of record.topics) {
      const topic = normalizeTopic(raw);
      if (!topic || seenIds.has(topic.id)) continue;
      seenIds.add(topic.id);
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

/**
 * Read the operator topic list.
 * Missing file → seeded from the committed seed and written; an emptied list stays empty.
 */
export async function readTopics(paths: TopicsStorePaths = {}): Promise<TopicsStore> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  const seedPath = paths.seedPath ?? DEFAULT_TOPICS_SEED_PATH;
  await mkdir(path.dirname(topicsPath), { recursive: true });

  let raw: string;
  try {
    raw = await readFile(topicsPath, 'utf8');
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

  return normalizeTopics(JSON.parse(raw));
}

export async function createTopic(
  fields: TopicFields,
  paths: TopicsStorePaths = {},
): Promise<{ topic: Topic; topics: Topic[] }> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  const store = await readTopics(paths);

  const key = nameKey(fields.name);
  if (store.topics.some((t) => nameKey(t.name) === key)) {
    throw new TopicConflictError(fields.name.trim());
  }

  const now = new Date().toISOString();
  const topic: Topic = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
  const next: TopicsStore = { topics: [...store.topics, topic], updatedAt: now };
  await writeTopics(next, topicsPath);
  return { topic, topics: next.topics };
}

/** Patch a topic by id. Unknown id → null. */
export async function updateTopic(
  id: string,
  patch: TopicPatch,
  paths: TopicsStorePaths = {},
): Promise<{ topic: Topic; topics: Topic[] } | null> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  const trimmed = id.trim();
  const store = await readTopics(paths);
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
}

/** Remove a topic by id (idempotent). */
export async function removeTopic(
  id: string,
  paths: TopicsStorePaths = {},
): Promise<{ removed: boolean; topics: Topic[] }> {
  const topicsPath = paths.topicsPath ?? TOPICS_PATH;
  const trimmed = id.trim();
  const store = await readTopics(paths);
  if (!store.topics.some((t) => t.id === trimmed)) {
    return { removed: false, topics: store.topics };
  }

  const next: TopicsStore = {
    topics: store.topics.filter((t) => t.id !== trimmed),
    updatedAt: new Date().toISOString(),
  };
  await writeTopics(next, topicsPath);
  return { removed: true, topics: next.topics };
}
