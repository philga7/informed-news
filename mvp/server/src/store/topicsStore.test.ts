import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadTopicSeed } from '../services/topicSeed.js';
import type { TopicFields } from '../types/topic.js';
import {
  TopicConflictError,
  createTopic,
  readTopics,
  removeTopic,
  updateTopic,
} from './topicsStore.js';

function tempTopicsPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'topics-'));
  return path.join(dir, 'topics.json');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const desiredFields: TopicFields = {
  name: 'Semiconductor supply',
  kind: 'desired',
  level: 'watch',
  description: 'Chip fabs and export controls',
  keywords: ['TSMC', 'export controls'],
  searchQuery: 'semiconductor supply chain',
  sections: ['business', 'technical'],
  notes: '',
};

const undesiredFields: TopicFields = {
  name: 'Celebrity gossip',
  kind: 'undesired',
  level: null,
  description: '',
  keywords: ['celebrity'],
  searchQuery: '',
  sections: [],
  notes: 'Drop entertainment tabloids',
};

test('readTopics seeds from the committed seed when the store is missing', async () => {
  const topicsPath = tempTopicsPath();
  const seed = loadTopicSeed();

  const store = await readTopics({ topicsPath });

  assert.equal(store.topics.length, 23);
  assert.deepEqual(
    store.topics.map((t) => t.id),
    seed.map((t) => t.id),
  );
  for (const topic of store.topics) {
    assert.equal(typeof topic.createdAt, 'string');
    assert.equal(typeof topic.updatedAt, 'string');
    assert.ok(topic.createdAt.length > 0);
    assert.ok(topic.updatedAt.length > 0);
  }
  assert.equal(typeof store.updatedAt, 'string');

  assert.ok(existsSync(topicsPath));
  const onDisk = JSON.parse(readFileSync(topicsPath, 'utf8'));
  assert.deepEqual(onDisk, store);
});

test('readTopics twice does not duplicate topics or change createdAt', async () => {
  const topicsPath = tempTopicsPath();

  const first = await readTopics({ topicsPath });
  await sleep(5);
  const second = await readTopics({ topicsPath });

  assert.equal(second.topics.length, first.topics.length);
  assert.deepEqual(second, first);
});

test('readTopics does not re-seed after all topics are removed', async () => {
  const topicsPath = tempTopicsPath();

  const seeded = await readTopics({ topicsPath });
  for (const topic of seeded.topics) {
    await removeTopic(topic.id, { topicsPath });
  }

  const store = await readTopics({ topicsPath });
  assert.deepEqual(store.topics, []);
});

test('createTopic persists desired and undesired topics with uuid ids', async () => {
  const topicsPath = tempTopicsPath();
  const seedIds = new Set(loadTopicSeed().map((t) => t.id));

  const desired = await createTopic(desiredFields, { topicsPath });
  const undesired = await createTopic(undesiredFields, { topicsPath });

  assert.equal(desired.topic.name, 'Semiconductor supply');
  assert.equal(desired.topic.createdAt, desired.topic.updatedAt);
  assert.ok(!seedIds.has(desired.topic.id));
  assert.match(desired.topic.id, /^[0-9a-f-]{36}$/);
  assert.equal(undesired.topics.length, 25);

  const stored = await readTopics({ topicsPath });
  assert.equal(stored.topics.length, 25);
  assert.deepEqual(stored.topics.at(-2), desired.topic);
  assert.deepEqual(stored.topics.at(-1), undesired.topic);
  assert.equal(stored.topics.at(-1)?.kind, 'undesired');
  assert.equal(stored.topics.at(-1)?.level, null);
});

test('createTopic rejects a duplicate name (case/whitespace-insensitive) without writing', async () => {
  const topicsPath = tempTopicsPath();
  await readTopics({ topicsPath });
  const before = readFileSync(topicsPath, 'utf8');

  await assert.rejects(
    createTopic({ ...desiredFields, name: '  iRAN  ' }, { topicsPath }),
    (err: unknown) => {
      assert.ok(err instanceof TopicConflictError);
      assert.equal(err.name, 'TopicConflictError');
      assert.equal(err.message, 'a topic named "iRAN" already exists');
      return true;
    },
  );

  assert.equal(readFileSync(topicsPath, 'utf8'), before);
});

test('updateTopic changes level, bumps updatedAt, keeps createdAt', async () => {
  const topicsPath = tempTopicsPath();
  const seeded = await readTopics({ topicsPath });
  const iran = seeded.topics.find((t) => t.id === 'iran')!;
  assert.equal(iran.level, 'core');

  await sleep(5);
  const result = await updateTopic('  iran  ', { level: 'watch' }, { topicsPath });

  assert.ok(result);
  assert.equal(result.topic.id, 'iran');
  assert.equal(result.topic.level, 'watch');
  assert.equal(result.topic.createdAt, iran.createdAt);
  assert.notEqual(result.topic.updatedAt, iran.updatedAt);

  const stored = await readTopics({ topicsPath });
  assert.equal(stored.topics[0]?.id, 'iran');
  assert.deepEqual(stored.topics[0], result.topic);
  assert.equal(stored.updatedAt, result.topic.updatedAt);
  assert.deepEqual(
    stored.topics.map((t) => t.id),
    seeded.topics.map((t) => t.id),
  );
});

test('updateTopic to undesired clears level and sections', async () => {
  const topicsPath = tempTopicsPath();
  await readTopics({ topicsPath });

  const result = await updateTopic('iran', { kind: 'undesired' }, { topicsPath });

  assert.ok(result);
  assert.equal(result.topic.kind, 'undesired');
  assert.equal(result.topic.level, null);
  assert.deepEqual(result.topic.sections, []);

  const stored = await readTopics({ topicsPath });
  const iran = stored.topics.find((t) => t.id === 'iran')!;
  assert.equal(iran.level, null);
  assert.deepEqual(iran.sections, []);
});

test('updateTopic rejects renaming onto another topic, allows re-casing its own name', async () => {
  const topicsPath = tempTopicsPath();
  await readTopics({ topicsPath });
  const before = readFileSync(topicsPath, 'utf8');

  await assert.rejects(
    updateTopic('iran', { name: 'Israel' }, { topicsPath }),
    TopicConflictError,
  );
  assert.equal(readFileSync(topicsPath, 'utf8'), before);

  const result = await updateTopic('iran', { name: 'IRAN' }, { topicsPath });
  assert.ok(result);
  assert.equal(result.topic.name, 'IRAN');
});

test('updateTopic returns null for an unknown id', async () => {
  const topicsPath = tempTopicsPath();
  await readTopics({ topicsPath });
  const before = readFileSync(topicsPath, 'utf8');

  const result = await updateTopic('missing', { level: 'watch' }, { topicsPath });

  assert.equal(result, null);
  assert.equal(readFileSync(topicsPath, 'utf8'), before);
});

test('removeTopic removes and persists; unknown id is a no-op', async () => {
  const topicsPath = tempTopicsPath();
  await readTopics({ topicsPath });

  const removed = await removeTopic(' iran ', { topicsPath });
  assert.equal(removed.removed, true);
  assert.equal(removed.topics.length, 22);
  assert.ok(!removed.topics.some((t) => t.id === 'iran'));

  const stored = await readTopics({ topicsPath });
  assert.equal(stored.topics.length, 22);
  const before = readFileSync(topicsPath, 'utf8');

  const missing = await removeTopic('missing', { topicsPath });
  assert.equal(missing.removed, false);
  assert.equal(missing.topics.length, 22);
  assert.equal(readFileSync(topicsPath, 'utf8'), before);
});

test('readTopics drops malformed entries and duplicate ids from an existing file', async () => {
  const topicsPath = tempTopicsPath();
  const ts = '2026-09-01T00:00:00.000Z';
  const good = {
    id: 'good',
    ...desiredFields,
    createdAt: ts,
    updatedAt: ts,
  };
  writeFileSync(
    topicsPath,
    JSON.stringify({
      topics: [
        good,
        { ...good, id: 'good', name: 'Duplicate id' },
        { ...good, id: undefined, name: 'No id' },
        { ...good, id: 'bogus-kind', name: 'Bogus', kind: 'bogus' },
        { ...good, id: 'no-created', name: 'No createdAt', createdAt: '' },
        { ...good, id: 'no-level', name: 'Desired without level', level: null },
        'not an object',
      ],
      updatedAt: ts,
    }),
  );

  const store = await readTopics({ topicsPath });

  assert.deepEqual(store, { topics: [good], updatedAt: ts });
});

test('readTopics rejects a store that is not a JSON object', async () => {
  const topicsPath = tempTopicsPath();
  writeFileSync(topicsPath, '[]');

  await assert.rejects(readTopics({ topicsPath }), {
    message: 'topics.json must contain a JSON object',
  });
});

test('readTopics seeds from an explicit seed path', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'topics-seed-'));
  const seedPath = path.join(dir, 'seed.json');
  writeFileSync(
    seedPath,
    JSON.stringify({ topics: [{ id: 'only', ...undesiredFields }] }),
  );
  const topicsPath = path.join(dir, 'nested', 'topics.json');

  const store = await readTopics({ topicsPath, seedPath });

  assert.deepEqual(
    store.topics.map((t) => t.id),
    ['only'],
  );
  assert.equal(store.topics[0]?.createdAt, store.updatedAt);
  assert.equal(store.topics[0]?.updatedAt, store.updatedAt);
  assert.ok(existsSync(topicsPath));
});
