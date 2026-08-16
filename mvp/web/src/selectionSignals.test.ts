import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from './types.ts';
import { selectionSignals, titlesDiffer } from './selectionSignals.ts';

function article(
  overrides: Partial<Article> & Pick<Article, 'id' | 'title'>,
): Article {
  return {
    sourceKind: 'cfp',
    canonicalUrl: `https://example.com/${overrides.id}`,
    citations: [],
    publisherUrl: 'https://news.example.com/story',
    publisherDomain: 'news.example.com',
    handle: null,
    publishedAt: '2026-08-16T12:00:00.000Z',
    snippet: '',
    bodyText: 'Full publisher body text here.',
    bodyStatus: 'ok',
    publisherTitle: null,
    clusterId: 'cluster-1',
    fetchedAt: '2026-08-16T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('titlesDiffer is case-insensitive', () => {
  assert.equal(titlesDiffer('Hello', 'hello'), false);
  assert.equal(titlesDiffer('Hello', 'Goodbye'), true);
  assert.equal(titlesDiffer('Hello', null), false);
});

test('differing headlines yield a selection signal', () => {
  const notes = selectionSignals(
    article({
      id: '1',
      title: 'CFP spin headline',
      publisherTitle: 'Publisher neutral headline',
    }),
  );
  assert.ok(notes.some((n) => n.includes('selection may be framing')));
});

test('missing publisher body yields an omission signal', () => {
  const notes = selectionSignals(
    article({
      id: '2',
      title: 'Same title',
      publisherTitle: 'Same title',
      bodyText: null,
      bodyStatus: 'unavailable',
      clusterId: 'cluster-1',
    }),
  );
  assert.ok(notes.some((n) => /isn.t available/i.test(n)));
});

test('matching titles with body yield no signals', () => {
  const notes = selectionSignals(
    article({
      id: '3',
      title: 'Story',
      publisherTitle: 'Story',
      clusterId: null,
    }),
  );
  assert.deepEqual(notes, []);
});

test('xcancel items get no selection signals', () => {
  const notes = selectionSignals(
    article({
      id: '4',
      title: 'Tweet',
      sourceKind: 'xcancel',
      bodyStatus: 'not_applicable',
      publisherTitle: null,
      clusterId: null,
    }),
  );
  assert.deepEqual(notes, []);
});
