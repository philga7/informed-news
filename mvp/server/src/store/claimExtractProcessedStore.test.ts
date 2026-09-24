import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  isArticleExtractProcessed,
  markArticlesExtractProcessed,
  readClaimExtractProcessed,
} from './claimExtractProcessedStore.js';

function tempProcessedPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'claim-extract-processed-'));
  return path.join(dir, 'claim-extract-processed.json');
}

test('readClaimExtractProcessed returns empty when file is missing', async () => {
  const processedPath = tempProcessedPath();
  const processed = await readClaimExtractProcessed(processedPath);

  assert.deepEqual(processed, {
    articleIds: [],
    updatedAt: null,
  });
});

test('markArticlesExtractProcessed persists article ids', async () => {
  const processedPath = tempProcessedPath();

  const result = await markArticlesExtractProcessed(['article-1', 'article-2'], processedPath);
  assert.deepEqual(result.articleIds, ['article-1', 'article-2']);

  const stored = await readClaimExtractProcessed(processedPath);
  assert.deepEqual(stored.articleIds, ['article-1', 'article-2']);
  assert.equal(typeof stored.updatedAt, 'string');
});

test('markArticlesExtractProcessed is idempotent', async () => {
  const processedPath = tempProcessedPath();

  await markArticlesExtractProcessed(['article-1'], processedPath);
  const before = await readClaimExtractProcessed(processedPath);

  const second = await markArticlesExtractProcessed(['article-1'], processedPath);
  const after = await readClaimExtractProcessed(processedPath);

  assert.deepEqual(second.articleIds, before.articleIds);
  assert.deepEqual(after, before);
});

test('markArticlesExtractProcessed merges new ids', async () => {
  const processedPath = tempProcessedPath();

  await markArticlesExtractProcessed(['article-1'], processedPath);
  const result = await markArticlesExtractProcessed(['article-2'], processedPath);

  assert.deepEqual(result.articleIds, ['article-1', 'article-2']);
});

test('isArticleExtractProcessed reflects stored ids', async () => {
  const processedPath = tempProcessedPath();

  assert.equal(await isArticleExtractProcessed('article-1', processedPath), false);

  await markArticlesExtractProcessed(['article-1'], processedPath);

  assert.equal(await isArticleExtractProcessed('article-1', processedPath), true);
  assert.equal(await isArticleExtractProcessed('article-2', processedPath), false);
});

test('isArticleExtractProcessed returns false for blank ids', async () => {
  const processedPath = tempProcessedPath();

  await markArticlesExtractProcessed(['article-1'], processedPath);

  assert.equal(await isArticleExtractProcessed('  ', processedPath), false);
});
