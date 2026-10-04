import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { Topic, TopicFields } from '../types/topic.js';
import {
  LESS_LIKE_THIS_KIND_ERROR,
  OUTLET_BLOCK_DESCRIPTION,
  lessLikeThis,
  lessLikeThisNotes,
  type LessLikeThisDeps,
} from './briefLessLikeThis.js';
import { TOPIC_TEXT_MAX, TopicValidationError } from './topicInput.js';

const AT = '2026-10-01T12:00:00.000Z';

function topic(id: string, over: Partial<Topic> = {}): Topic {
  return {
    id,
    name: id,
    kind: 'undesired',
    level: null,
    description: '',
    keywords: [],
    searchQuery: '',
    sections: [],
    notes: '',
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function article(id: string, over: Partial<Article> = {}): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'rss',
    canonicalUrl: `https://cfp.example/${id}`,
    citations: [],
    publisherUrl: `https://www.dailymail.co.uk/${id}`,
    publisherDomain: 'www.DailyMail.co.uk',
    handle: null,
    publishedAt: AT,
    snippet: '',
    bodyText: null,
    bodyStatus: 'unavailable',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: AT,
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...over,
  };
}

function harness(articles: Article[], initialTopics: Topic[] = []) {
  const state = { topics: [...initialTopics], created: [] as TopicFields[] };
  const deps: LessLikeThisDeps = {
    getArticle: async (id) => articles.find((a) => a.id === id) ?? null,
    readTopics: async () => ({ topics: state.topics }),
    createTopic: async (fields) => {
      state.created.push(fields);
      const created = topic(`new-${state.created.length}`, { ...fields });
      state.topics = [...state.topics, created];
      return { topic: created, topics: state.topics };
    },
  };
  return { deps, state };
}

test('bad kind → 400 before the article lookup', async () => {
  const { deps } = harness([]);
  for (const body of [{}, { kind: 'mute' }, null, [], 'outlet']) {
    assert.deepEqual(await lessLikeThis('missing', body, deps), {
      ok: false,
      status: 400,
      error: LESS_LIKE_THIS_KIND_ERROR,
    });
  }
});

test('unknown article → 404 story_not_found', async () => {
  const { deps, state } = harness([article('a1')]);
  assert.deepEqual(await lessLikeThis('nope', { kind: 'outlet' }, deps), {
    ok: false,
    status: 404,
    error: 'story_not_found',
  });
  assert.equal(state.created.length, 0);
});

test('outlet: creates an undesired outlet block on the normalized domain', async () => {
  const { deps, state } = harness([article('a1', { title: 'Royal row deepens' })], [topic('iran', { kind: 'desired', level: 'core' })]);
  const result = await lessLikeThis('a1', { kind: 'outlet' }, deps);
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.equal(result.created, true);
  assert.deepEqual(state.created, [
    {
      name: 'dailymail.co.uk',
      kind: 'undesired',
      level: null,
      description: OUTLET_BLOCK_DESCRIPTION,
      keywords: ['dailymail.co.uk'],
      searchQuery: '',
      sections: [],
      notes: 'Added with Less like this on: Royal row deepens',
    },
  ]);
  assert.equal(result.topic.name, 'dailymail.co.uk');
  assert.equal(result.topics.length, 2);
});

test('outlet: an existing undesired block (bare or parent domain) is reused, not duplicated', async () => {
  const existing = topic('tabloids', { keywords: ['Daily Mail', 'www.dailymail.co.uk'] });
  const { deps, state } = harness(
    [article('a1'), article('a2', { publisherDomain: 'us.dailymail.co.uk' })],
    [existing],
  );
  for (const id of ['a1', 'a2']) {
    const result = await lessLikeThis(id, { kind: 'outlet' }, deps);
    assert.deepEqual(result, { ok: true, created: false, topic: existing, topics: [existing] });
  }
  assert.equal(state.created.length, 0);
});

test('outlet: a desired topic with the domain keyword does not count as a block', async () => {
  const desired = topic('mail-watch', { kind: 'desired', level: 'watch', keywords: ['dailymail.co.uk'] });
  const { deps, state } = harness([article('a1')], [desired]);
  const result = await lessLikeThis('a1', { kind: 'outlet' }, deps);
  assert.ok(result.ok);
  assert.equal(result.created, true);
  assert.equal(state.created.length, 1);
});

test('outlet: a subdomain block does not cover the parent domain', async () => {
  const sub = topic('us-mail', { keywords: ['us.dailymail.co.uk'] });
  const { deps, state } = harness([article('a1')], [sub]);
  const result = await lessLikeThis('a1', { kind: 'outlet' }, deps);
  assert.ok(result.ok);
  assert.equal(result.created, true);
  assert.equal(state.created[0]!.name, 'dailymail.co.uk');
});

test('outlet: no usable publisher domain → 400 no_outlet', async () => {
  const { deps, state } = harness([
    article('none', { publisherDomain: null }),
    article('blank', { publisherDomain: '  ' }),
    article('dotless', { publisherDomain: 'localhost' }),
  ]);
  for (const id of ['none', 'blank', 'dotless']) {
    assert.deepEqual(await lessLikeThis(id, { kind: 'outlet' }, deps), {
      ok: false,
      status: 400,
      error: 'no_outlet',
    });
  }
  assert.equal(state.created.length, 0);
});

test('subject: creates an undesired topic from name, keywords, description', async () => {
  const { deps, state } = harness([article('a1', { title: 'Celebrity feud erupts' })]);
  const result = await lessLikeThis(
    'a1',
    {
      kind: 'subject',
      name: '  Celebrity gossip ',
      keywords: ['feud', ' Kardashian '],
      description: 'Not news.',
      level: 'core',
      sections: ['business'],
    },
    deps,
  );
  assert.ok(result.ok);
  assert.equal(result.created, true);
  assert.deepEqual(state.created, [
    {
      name: 'Celebrity gossip',
      kind: 'undesired',
      level: null,
      description: 'Not news.',
      keywords: ['feud', 'Kardashian'],
      searchQuery: '',
      sections: [],
      notes: 'Added with Less like this on: Celebrity feud erupts',
    },
  ]);
});

test('subject: keywords and description default to empty', async () => {
  const { deps, state } = harness([article('a1')]);
  const result = await lessLikeThis('a1', { kind: 'subject', name: 'Royals' }, deps);
  assert.ok(result.ok);
  assert.deepEqual(state.created[0]!.keywords, []);
  assert.equal(state.created[0]!.description, '');
});

test('subject: validation errors throw TopicValidationError', async () => {
  const { deps, state } = harness([article('a1')]);
  await assert.rejects(
    lessLikeThis('a1', { kind: 'subject', name: '  ' }, deps),
    (err: unknown) => err instanceof TopicValidationError && err.message === 'name is required',
  );
  await assert.rejects(
    lessLikeThis('a1', { kind: 'subject', name: 'X', keywords: 'feud' }, deps),
    (err: unknown) =>
      err instanceof TopicValidationError && err.message === 'keywords must be an array of strings',
  );
  assert.equal(state.created.length, 0);
});

test('store write failures propagate', async () => {
  const { deps } = harness([article('a1')]);
  deps.createTopic = async () => {
    throw new Error('disk full');
  };
  await assert.rejects(lessLikeThis('a1', { kind: 'outlet' }, deps), /disk full/);
});

test('lessLikeThisNotes: headline, no headline, and truncation to TOPIC_TEXT_MAX', () => {
  assert.equal(lessLikeThisNotes(' Short one '), 'Added with Less like this on: Short one');
  assert.equal(lessLikeThisNotes(''), 'Added with Less like this.');
  assert.equal(lessLikeThisNotes('   '), 'Added with Less like this.');
  assert.equal(lessLikeThisNotes(null), 'Added with Less like this.');

  const prefix = 'Added with Less like this on: ';
  const exact = 'x'.repeat(TOPIC_TEXT_MAX - prefix.length);
  assert.equal(lessLikeThisNotes(exact), `${prefix}${exact}`);

  const long = lessLikeThisNotes('y'.repeat(TOPIC_TEXT_MAX));
  assert.equal(long.length, TOPIC_TEXT_MAX);
  assert.ok(long.startsWith(`${prefix}yyy`));
  assert.ok(long.endsWith('y…'));
});
