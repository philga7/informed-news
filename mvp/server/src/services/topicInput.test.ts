import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TopicFields } from '../types/topic.js';
import {
  TopicValidationError,
  finalizeTopicFields,
  parseTopicCreate,
  parseTopicPatch,
} from './topicInput.js';

function assertValidationError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof TopicValidationError);
    assert.equal(error.name, 'TopicValidationError');
    assert.equal(error.message, message);
    return true;
  });
}

const existingDesired: TopicFields = {
  name: 'Iran',
  kind: 'desired',
  level: 'core',
  description: 'Iranian state affairs',
  keywords: ['Iran'],
  searchQuery: 'Iran',
  sections: ['map', 'history'],
  notes: '',
};

const existingUndesired: TopicFields = {
  name: 'Celebrity gossip',
  kind: 'undesired',
  level: null,
  description: '',
  keywords: [],
  searchQuery: '',
  sections: [],
  notes: '',
};

test('parseTopicCreate trims name and applies defaults for minimal desired topic', () => {
  assert.deepEqual(parseTopicCreate({ name: ' Iran ', kind: 'desired', level: 'core' }), {
    name: 'Iran',
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: '',
    sections: [],
    notes: '',
  });
});

test('parseTopicCreate forces level null and sections [] for undesired topics', () => {
  const topic = parseTopicCreate({
    name: 'Sports',
    kind: 'undesired',
    level: 'core',
    sections: ['map'],
  });
  assert.equal(topic.level, null);
  assert.deepEqual(topic.sections, []);
});

test('parseTopicCreate requires level for desired topics', () => {
  assertValidationError(
    () => parseTopicCreate({ name: 'Iran', kind: 'desired' }),
    'level is required for desired topics',
  );
});

test('parseTopicCreate requires name and kind', () => {
  assertValidationError(() => parseTopicCreate({ kind: 'desired', level: 'core' }), 'name is required');
  assertValidationError(() => parseTopicCreate({ name: 'Iran' }), 'kind is required');
});

test('parseTopicPatch rejects non-object bodies', () => {
  for (const body of [null, [], 'topic', 42, undefined]) {
    assertValidationError(() => parseTopicPatch(body), 'body must be a JSON object');
  }
});

test('parseTopicPatch rejects empty or non-string name', () => {
  assertValidationError(() => parseTopicPatch({ name: '   ' }), 'name is required');
  assertValidationError(() => parseTopicPatch({ name: 5 }), 'name is required');
});

test('parseTopicPatch rejects bad kind', () => {
  assertValidationError(() => parseTopicPatch({ kind: 'maybe' }), 'kind must be desired or undesired');
});

test('parseTopicPatch rejects bad level', () => {
  assertValidationError(() => parseTopicPatch({ level: 'urgent' }), 'level must be core or watch');
});

test('parseTopicPatch accepts null level', () => {
  assert.deepEqual(parseTopicPatch({ level: null }), { level: null });
});

test('parseTopicPatch rejects unknown section', () => {
  assertValidationError(
    () => parseTopicPatch({ sections: ['weather'] }),
    'sections must be a list of: business, technical, action, map, history',
  );
  assertValidationError(
    () => parseTopicPatch({ sections: 'map' }),
    'sections must be a list of: business, technical, action, map, history',
  );
});

test('parseTopicPatch trims, drops empty, and dedupes keywords case-insensitively', () => {
  assert.deepEqual(parseTopicPatch({ keywords: ['  Iran ', 'iran', '', 'Tehran'] }), {
    keywords: ['Iran', 'Tehran'],
  });
});

test('parseTopicPatch rejects non-string keywords', () => {
  assertValidationError(
    () => parseTopicPatch({ keywords: ['Iran', 3] }),
    'keywords must be an array of strings',
  );
  assertValidationError(
    () => parseTopicPatch({ keywords: 'Iran' }),
    'keywords must be an array of strings',
  );
});

test('parseTopicPatch dedupes sections into canonical order', () => {
  assert.deepEqual(parseTopicPatch({ sections: ['history', 'map', 'map'] }), {
    sections: ['map', 'history'],
  });
});

test('parseTopicPatch rejects name longer than 80 characters', () => {
  assertValidationError(
    () => parseTopicPatch({ name: 'a'.repeat(81) }),
    'name must be at most 80 characters',
  );
  assert.deepEqual(parseTopicPatch({ name: 'a'.repeat(80) }), { name: 'a'.repeat(80) });
});

test('parseTopicPatch validates text fields', () => {
  for (const field of ['description', 'searchQuery', 'notes'] as const) {
    assertValidationError(() => parseTopicPatch({ [field]: 1 }), `${field} must be a string`);
    assertValidationError(
      () => parseTopicPatch({ [field]: 'x'.repeat(501) }),
      `${field} must be at most 500 characters`,
    );
    assert.deepEqual(parseTopicPatch({ [field]: '  ok  ' }), { [field]: 'ok' });
  }
});

test('parseTopicPatch rejects more than 50 distinct keywords', () => {
  const keywords = Array.from({ length: 51 }, (_, index) => `keyword-${index}`);
  assertValidationError(() => parseTopicPatch({ keywords }), 'at most 50 keywords');
  assert.equal(parseTopicPatch({ keywords: keywords.slice(0, 50) }).keywords?.length, 50);
});

test('parseTopicPatch rejects keyword longer than 100 characters', () => {
  assertValidationError(
    () => parseTopicPatch({ keywords: ['k'.repeat(101)] }),
    'each keyword must be at most 100 characters',
  );
});

test('parseTopicPatch returns only fields present', () => {
  assert.deepEqual(parseTopicPatch({ level: 'watch' }), { level: 'watch' });
});

test('parseTopicPatch ignores unknown keys and server-owned fields', () => {
  assert.deepEqual(
    parseTopicPatch({
      id: 'x',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      extra: true,
      notes: 'n',
    }),
    { notes: 'n' },
  );
});

test('finalizeTopicFields clears level and sections when switching to undesired', () => {
  const topic = finalizeTopicFields(existingDesired, { kind: 'undesired' });
  assert.equal(topic.kind, 'undesired');
  assert.equal(topic.level, null);
  assert.deepEqual(topic.sections, []);
  assert.equal(topic.name, 'Iran');
});

test('finalizeTopicFields requires level when switching undesired to desired', () => {
  assertValidationError(
    () => finalizeTopicFields(existingUndesired, { kind: 'desired' }),
    'level is required for desired topics',
  );
  assert.equal(
    finalizeTopicFields(existingUndesired, { kind: 'desired', level: 'watch' }).level,
    'watch',
  );
});
