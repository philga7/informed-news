import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import { articleIdFromCanonicalUrl } from '../store/articleId.js';
import {
  buildManualSeedArticle,
  createManualSeed,
  ManualSeedValidationError,
  parseManualSeedBody,
} from './manualBriefSeed.js';

const FIXED_NOW = '2026-09-21T12:00:00.000Z';
const FIXED_UUID = '11111111-2222-4333-8444-555555555555';

test('buildManualSeedArticle requires non-empty title', () => {
  assert.throws(
    () => buildManualSeedArticle({ title: '   ' }, FIXED_NOW, FIXED_UUID),
    (err: unknown) =>
      err instanceof ManualSeedValidationError && err.message === 'title is required',
  );
});

test('buildManualSeedArticle maps note to snippet', () => {
  const article = buildManualSeedArticle(
    { title: 'Test story', note: '  Operator note  ' },
    FIXED_NOW,
    FIXED_UUID,
  );

  assert.equal(article.snippet, 'Operator note');
});

test('buildManualSeedArticle uses empty snippet when note is omitted', () => {
  const article = buildManualSeedArticle({ title: 'Test story' }, FIXED_NOW, FIXED_UUID);

  assert.equal(article.snippet, '');
});

test('buildManualSeedArticle maps urls to citations and publisherUrl', () => {
  const article = buildManualSeedArticle(
    {
      title: 'Test story',
      urls: [' https://example.com/a ', 'https://news.test/b'],
    },
    FIXED_NOW,
    FIXED_UUID,
  );

  assert.deepEqual(article.citations, [
    { label: 'Source', url: 'https://example.com/a' },
    { label: 'Source', url: 'https://news.test/b' },
  ]);
  assert.equal(article.publisherUrl, 'https://example.com/a');
  assert.equal(article.publisherDomain, 'example.com');
});

test('buildManualSeedArticle sets clusterId equal to id', () => {
  const article = buildManualSeedArticle({ title: 'Test story' }, FIXED_NOW, FIXED_UUID);
  const expectedId = articleIdFromCanonicalUrl(`manual://seed/${FIXED_UUID}`);

  assert.equal(article.id, expectedId);
  assert.equal(article.clusterId, expectedId);
  assert.equal(article.sourceKind, 'manual');
  assert.equal(article.bodyText, null);
  assert.equal(article.bodyStatus, 'not_applicable');
});

test('buildManualSeedArticle rejects invalid urls', () => {
  assert.throws(
    () =>
      buildManualSeedArticle(
        { title: 'Test story', urls: ['ftp://files.example.com/x'] },
        FIXED_NOW,
        FIXED_UUID,
      ),
    (err: unknown) =>
      err instanceof ManualSeedValidationError &&
      err.message === 'urls must be valid http or https URLs',
  );
});

test('parseManualSeedBody rejects missing title', () => {
  assert.throws(
    () => parseManualSeedBody({}),
    (err: unknown) =>
      err instanceof ManualSeedValidationError && err.message === 'title is required',
  );
});

test('createManualSeed upserts article and accepts cluster', async () => {
  const upserted: Article[] = [];
  let acceptedClusterId: string | null = null;

  const result = await createManualSeed(
    { title: 'Manual seed', note: 'Note text', urls: ['https://example.com/story'] },
    {
      now: () => FIXED_NOW,
      uuid: () => FIXED_UUID,
      upsertArticle: async (article) => {
        upserted.push(article as Article);
        return article as Article;
      },
      acceptCluster: async (clusterId) => {
        acceptedClusterId = clusterId;
        return { acceptedClusterIds: [clusterId] };
      },
    },
  );

  assert.equal(upserted.length, 1);
  assert.equal(upserted[0]?.title, 'Manual seed');
  assert.equal(acceptedClusterId, result.article.id);
  assert.deepEqual(result.acceptedClusterIds, [result.article.id]);
  assert.equal(result.article.clusterId, result.article.id);
});
