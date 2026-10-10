import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import { articleIdFromCanonicalUrl } from './articleId.js';
import {
  markArticlesSearchSeen,
  pruneArticles,
  readArticles,
  updateArticles,
  upsertArticle,
  upsertArticles,
} from './articleStore.js';

function tempArticlesPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'article-store-'));
  return path.join(dir, 'nested', 'articles.json');
}

function article(slug: string): Article {
  const canonicalUrl = `https://example.com/${slug}`;
  return {
    id: articleIdFromCanonicalUrl(canonicalUrl),
    title: `Headline ${slug}`,
    sourceKind: 'rss',
    sourceTier: 'sensor',
    canonicalUrl,
    citations: [{ label: 'Example', url: canonicalUrl }],
    publisherUrl: canonicalUrl,
    publisherDomain: 'example.com',
    handle: null,
    publishedAt: '2026-10-10T12:00:00.000Z',
    snippet: `Snippet ${slug}`,
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-10-10T12:00:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
  };
}

const titles = (articles: Article[]) => articles.map((a) => a.title).sort();

test('updateArticles applies concurrent updates one after another; neither is lost', async () => {
  const articlesPath = tempArticlesPath();

  await Promise.all([
    updateArticles((articles) => [...articles, article('a')], articlesPath),
    updateArticles((articles) => [...articles, article('b')], articlesPath),
  ]);

  assert.deepEqual(titles(await readArticles(articlesPath)), ['Headline a', 'Headline b']);
});

test('updateArticles: a throwing mutator rejects that call only and writes nothing', async () => {
  const articlesPath = tempArticlesPath();
  await upsertArticle(article('a'), articlesPath);

  const failing = updateArticles(() => {
    throw new Error('mutator boom');
  }, articlesPath);
  const following = upsertArticle(article('b'), articlesPath);

  await assert.rejects(failing, { message: 'mutator boom' });
  await following;
  assert.deepEqual(titles(await readArticles(articlesPath)), ['Headline a', 'Headline b']);
});

const without =
  (title: string) =>
  (articles: readonly Article[]): Article[] =>
    articles.filter((a) => a.title !== title);

test('pruneArticles keeps only the selected articles and resolves to the number removed', async () => {
  const articlesPath = tempArticlesPath();
  await upsertArticles([article('a'), article('b'), article('c')], articlesPath);

  const removed = await pruneArticles(without('Headline b'), articlesPath);

  assert.equal(removed, 1);
  assert.deepEqual(titles(await readArticles(articlesPath)), ['Headline a', 'Headline c']);
});

test('pruneArticles does not rewrite the file when nothing is dropped', async () => {
  const articlesPath = tempArticlesPath();
  await upsertArticles([article('a')], articlesPath);
  const before = (await stat(articlesPath)).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(await pruneArticles((articles) => [...articles], articlesPath), 0);
  assert.equal((await stat(articlesPath)).mtimeMs, before);
});

test('pruneArticles never loses an upsert queued alongside it', async () => {
  const articlesPath = tempArticlesPath();
  await upsertArticles([article('old')], articlesPath);

  await Promise.all([
    pruneArticles(without('Headline old'), articlesPath),
    upsertArticle(article('new'), articlesPath),
  ]);

  assert.deepEqual(titles(await readArticles(articlesPath)), ['Headline new']);
});

test('markArticlesSearchSeen stamps only the given ids, and a later upsert keeps the stamp', async () => {
  const articlesPath = tempArticlesPath();
  const [a, b] = await upsertArticles([article('a'), article('b')], articlesPath);

  await markArticlesSearchSeen([a!.id, 'missing-id'], '2026-10-11T00:00:00.000Z', articlesPath);
  await upsertArticle({ ...article('a'), snippet: 'Updated' }, articlesPath);

  const stored = await readArticles(articlesPath);
  assert.equal(stored.find((x) => x.id === a!.id)?.searchSeenAt, '2026-10-11T00:00:00.000Z');
  assert.equal(stored.find((x) => x.id === a!.id)?.snippet, 'Updated');
  assert.equal('searchSeenAt' in stored.find((x) => x.id === b!.id)!, false);
});

test('concurrent upsertArticle and upsertArticles calls keep every write', async () => {
  const articlesPath = tempArticlesPath();

  await Promise.all([
    upsertArticles([article('a'), article('b')], articlesPath),
    upsertArticle(article('c'), articlesPath),
    upsertArticles([article('d')], articlesPath),
    upsertArticle(article('e'), articlesPath),
  ]);

  assert.deepEqual(titles(await readArticles(articlesPath)), [
    'Headline a',
    'Headline b',
    'Headline c',
    'Headline d',
    'Headline e',
  ]);
});
