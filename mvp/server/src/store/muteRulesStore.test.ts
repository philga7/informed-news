import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { addMuteRule, readMuteRules, removeMuteRule } from './muteRulesStore.js';

function tempMutePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mute-rules-'));
  return path.join(dir, 'mute-rules.json');
}

test('readMuteRules returns empty when file is missing', async () => {
  const mutePath = tempMutePath();
  const store = await readMuteRules(mutePath);

  assert.deepEqual(store, {
    rules: [],
    updatedAt: null,
  });
});

test('addMuteRule trims keyword and persists', async () => {
  const mutePath = tempMutePath();

  const first = await addMuteRule('  Crypto  ', undefined, mutePath);
  assert.equal(first.rules.length, 1);
  assert.equal(first.rules[0]?.keyword, 'Crypto');
  assert.equal(first.rules[0]?.source, null);
  assert.equal(typeof first.rules[0]?.id, 'string');
  assert.equal(typeof first.rules[0]?.createdAt, 'string');

  const stored = await readMuteRules(mutePath);
  assert.equal(stored.rules.length, 1);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('addMuteRule is idempotent for keyword+source (case-insensitive)', async () => {
  const mutePath = tempMutePath();

  await addMuteRule('  Crypto  ', null, mutePath);
  const before = await readMuteRules(mutePath);
  const second = await addMuteRule('crypto', '   ', mutePath);
  const after = await readMuteRules(mutePath);

  assert.deepEqual(second.rules, before.rules);
  assert.deepEqual(after, before);
});

test('addMuteRule allows duplicate keyword with different sources', async () => {
  const mutePath = tempMutePath();

  await addMuteRule('crypto', null, mutePath);
  const second = await addMuteRule('crypto', 'nytimes.com', mutePath);
  assert.equal(second.rules.length, 2);
  assert.equal(second.rules[0]?.source, null);
  assert.equal(second.rules[1]?.source, 'nytimes.com');
});

test('removeMuteRule deletes by id and persists', async () => {
  const mutePath = tempMutePath();

  const added = await addMuteRule('crypto', 'nytimes.com', mutePath);
  const id = added.rules[0]!.id;

  const removed = await removeMuteRule(id, mutePath);
  assert.equal(removed.rules.length, 0);

  const stored = await readMuteRules(mutePath);
  assert.equal(stored.rules.length, 0);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('removeMuteRule is idempotent when id missing', async () => {
  const mutePath = tempMutePath();

  await addMuteRule('crypto', null, mutePath);
  const before = await readMuteRules(mutePath);
  const removed = await removeMuteRule('missing', mutePath);
  const after = await readMuteRules(mutePath);

  assert.deepEqual(removed.rules, before.rules);
  assert.deepEqual(after, before);
});

