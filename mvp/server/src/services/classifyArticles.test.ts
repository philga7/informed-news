import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pruneArticles, readArticles, upsertArticle, upsertArticles } from '../store/index.js';
import type { Article } from '../types/article.js';
import { classifyUnclassifiedArticles, selectClassifyBatchCandidates } from './classifyArticles.js';

function article(overrides: Partial<Article> & Pick<Article, 'id'>): Article {
  return {
    sourceKind: 'cfp',
    title: `Title ${overrides.id}`,
    canonicalUrl: `https://citizenfreepress.com/${overrides.id}`,
    citations: [{ label: 'CFP', url: `https://citizenfreepress.com/${overrides.id}` }],
    publisherUrl: null,
    publisherDomain: null,
    handle: null,
    publishedAt: '2026-09-12T12:00:00.000Z',
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-09-12T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('selectClassifyBatchCandidates skips untriaged search and manual rows', () => {
  const search = article({
    id: 'search-1',
    sourceKind: 'search',
    sourceTier: 'sensor',
    publishedAt: '2026-09-13T12:00:00.000Z',
  });
  const manual = article({
    id: 'manual-1',
    sourceKind: 'manual',
    publishedAt: '2026-09-13T11:00:00.000Z',
  });
  const cfp = article({ id: 'cfp-1' });

  const selected = selectClassifyBatchCandidates([search, manual, cfp], 10);

  assert.deepEqual(
    selected.map((a) => a.id),
    ['cfp-1'],
  );
});

test('classifyUnclassifiedArticles keeps article writes made while it waits on the model', async () => {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'classify-')), 'articles.json');
  await upsertArticles(
    [
      article({ id: 'a', title: 'A', publishedAt: '2026-09-12T12:00:00.000Z' }),
      article({ id: 'c', title: 'C', publishedAt: '2026-09-11T12:00:00.000Z' }),
    ],
    articlesPath,
  );

  const result = await classifyUnclassifiedArticles(
    {},
    {
      articlesPath,
      classifyFraming: async (input) => {
        if (input.title === 'A') {
          await upsertArticle(article({ id: 'b', title: 'B' }), articlesPath);
          await pruneArticles((all) => all.filter((x) => x.title !== 'C'), articlesPath);
        }
        return { ok: false, error: 'offline', model: null, rawText: null };
      },
    },
  );

  const stored = await readArticles(articlesPath);
  assert.deepEqual(stored.map((x) => x.title).sort(), ['A', 'B']);
  assert.equal(stored.find((x) => x.title === 'A')?.classifyError, 'offline');
  assert.equal(result.attempted, 2);
});
