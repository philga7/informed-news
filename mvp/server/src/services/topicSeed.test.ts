import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_TOPICS_SEED_PATH, loadTopicSeed } from './topicSeed.js';

function writeTempSeed(topics: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'topics-seed-'));
  const seedPath = path.join(dir, 'topics-seed.json');
  writeFileSync(seedPath, JSON.stringify({ topics }), 'utf8');
  return seedPath;
}

function seedEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'iran',
    name: 'Iran',
    kind: 'desired',
    level: 'core',
    description: 'Iranian state affairs',
    keywords: ['Iran'],
    searchQuery: 'Iran',
    sections: [],
    notes: '',
    ...overrides,
  };
}

test('DEFAULT_TOPICS_SEED_PATH points at committed config', () => {
  assert.equal(DEFAULT_TOPICS_SEED_PATH.endsWith('config/topics-seed.json'), true);
});

test('loadTopicSeed returns 23 desired topics: 12 core, 11 watch', () => {
  const topics = loadTopicSeed();
  assert.equal(topics.length, 23);
  assert.ok(topics.every((topic) => topic.kind === 'desired'));
  assert.equal(topics.filter((topic) => topic.level === 'core').length, 12);
  assert.equal(topics.filter((topic) => topic.level === 'watch').length, 11);
});

test('loadTopicSeed ids and names are unique', () => {
  const topics = loadTopicSeed();
  assert.equal(new Set(topics.map((topic) => topic.id)).size, topics.length);
  assert.equal(new Set(topics.map((topic) => topic.name.toLowerCase())).size, topics.length);
});

test('every seed topic has description, searchQuery, and keywords', () => {
  for (const topic of loadTopicSeed()) {
    assert.ok(topic.description.length > 0, `${topic.id} missing description`);
    assert.ok(topic.searchQuery.length > 0, `${topic.id} missing searchQuery`);
    assert.ok(topic.keywords.length > 0, `${topic.id} missing keywords`);
  }
});

test('seed sections spot-check', () => {
  const byId = new Map(loadTopicSeed().map((topic) => [topic.id, topic]));
  assert.deepEqual(byId.get('iran')?.sections, ['map', 'history']);
  assert.deepEqual(byId.get('gas-prices')?.sections, ['business', 'action']);
  assert.deepEqual(byId.get('ford-super-duty')?.sections, ['technical', 'action']);
  assert.deepEqual(byId.get('palantir')?.sections, ['business']);
  assert.deepEqual(byId.get('ice-enforcement')?.sections, []);
});

test('loadTopicSeed throws naming the index of an invalid entry', () => {
  const seedPath = writeTempSeed([
    seedEntry(),
    seedEntry({ id: 'no-level', name: 'No Level', level: null }),
  ]);
  assert.throws(() => loadTopicSeed(seedPath), /index 1.*level is required for desired topics/);
});

test('loadTopicSeed throws when an entry has no id', () => {
  const seedPath = writeTempSeed([seedEntry({ id: '  ' })]);
  assert.throws(() => loadTopicSeed(seedPath), /index 0/);
});

test('loadTopicSeed throws on duplicate id', () => {
  const seedPath = writeTempSeed([seedEntry(), seedEntry({ name: 'Iran again' })]);
  assert.throws(() => loadTopicSeed(seedPath), /duplicate topic id "iran"/);
});

test('loadTopicSeed throws on duplicate name (case-insensitive)', () => {
  const seedPath = writeTempSeed([seedEntry(), seedEntry({ id: 'iran-2', name: 'IRAN' })]);
  assert.throws(() => loadTopicSeed(seedPath), /duplicate topic name "IRAN"/);
});

test('loadTopicSeed throws when topics is not an array', () => {
  const seedPath = writeTempSeed({ nope: true });
  assert.throws(() => loadTopicSeed(seedPath), /topics must be an array/);
});

test('loadTopicSeed rethrows missing file errors', () => {
  assert.throws(() => loadTopicSeed('/nonexistent/topics-seed.json'), /ENOENT/);
});
