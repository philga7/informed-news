import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TopicSeedEntry } from '../types/topic.js';
import { parseTopicCreate } from './topicInput.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default committed seed at mvp/server/config/topics-seed.json */
export const DEFAULT_TOPICS_SEED_PATH = path.resolve(
  __dirname,
  '../../config/topics-seed.json',
);

function parseSeedEntry(entry: unknown, index: number): TopicSeedEntry {
  try {
    const record =
      entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    if (typeof record.id !== 'string' || !record.id.trim()) {
      throw new Error('id is required');
    }
    return { id: record.id.trim(), ...parseTopicCreate(entry) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`topics seed entry at index ${index} is invalid: ${reason}`);
  }
}

/**
 * Load the committed topic seed. Unlike radar sources, a broken seed throws:
 * it is committed config, and failing loudly beats silently seeding nothing.
 */
export function loadTopicSeed(seedPath: string = DEFAULT_TOPICS_SEED_PATH): TopicSeedEntry[] {
  const raw: unknown = JSON.parse(readFileSync(seedPath, 'utf8'));
  const topics =
    raw !== null && typeof raw === 'object' ? (raw as { topics?: unknown }).topics : undefined;
  if (!Array.isArray(topics)) {
    throw new Error('topics seed: topics must be an array');
  }

  const entries = topics.map(parseSeedEntry);
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`topics seed: duplicate topic id "${entry.id}"`);
    }
    ids.add(entry.id);
    const nameKey = entry.name.toLowerCase();
    if (names.has(nameKey)) {
      throw new Error(`topics seed: duplicate topic name "${entry.name}"`);
    }
    names.add(nameKey);
  }
  return entries;
}
