import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Article } from '../types/article.js';
import { articleIdFromCanonicalUrl } from './articleId.js';
import { articleNeedsRewrite, migrateArticle } from './migrateArticle.js';
import { mergeArticleOnUpsert } from './mergeArticleOnUpsert.js';
import { ARTICLES_PATH } from './paths.js';

type LoadedArticles = { articles: Article[]; needsWrite: boolean };

/** Read and migrate without writing. Missing file → empty store that needs a write. */
async function loadArticles(articlesPath: string): Promise<LoadedArticles> {
  let raw: string;
  try {
    raw = await readFile(articlesPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { articles: [], needsWrite: true };
    }
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('articles.json must contain a JSON array');
  }

  const articles: Article[] = [];
  let needsWrite = false;
  for (const entry of parsed) {
    const migrated = migrateArticle(entry);
    if (articleNeedsRewrite(entry, migrated)) {
      needsWrite = true;
    }
    articles.push(migrated);
  }
  return { articles, needsWrite };
}

/** Atomic write: temp file in the same directory, then rename. */
async function atomicWrite(articles: Article[], articlesPath: string): Promise<void> {
  await mkdir(path.dirname(articlesPath), { recursive: true });
  const tmpPath = `${articlesPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
    await rename(tmpPath, articlesPath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

/** Per-file write chains: ingest, triage, seeds, classify and prune must not interleave read-modify-write cycles. */
const writeChains = new Map<string, Promise<unknown>>();

function enqueueWrite<T>(articlesPath: string, work: () => Promise<T>): Promise<T> {
  const key = path.resolve(articlesPath);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(work);
  const settled = next.catch(() => undefined);
  writeChains.set(key, settled);
  void settled.then(() => {
    if (writeChains.get(key) === settled) writeChains.delete(key);
  });
  return next;
}

/**
 * Read, apply `mutate`, write atomically; serialized per path. Resolves to the written articles.
 * `mutate` must not call other article store writes (they would wait on this one).
 */
export async function updateArticles(
  mutate: (articles: Article[]) => Article[],
  articlesPath: string = ARTICLES_PATH,
): Promise<Article[]> {
  return enqueueWrite(articlesPath, async () => {
    const { articles } = await loadArticles(articlesPath);
    const next = mutate(articles);
    await atomicWrite(next, articlesPath);
    return next;
  });
}

/**
 * Keep only the subset `selectKept` returns from the articles on disk (serialized, atomic;
 * no write when nothing is dropped). Resolves to the number removed.
 */
export async function pruneArticles(
  selectKept: (articles: readonly Article[]) => Article[],
  articlesPath: string = ARTICLES_PATH,
): Promise<number> {
  return enqueueWrite(articlesPath, async () => {
    const { articles, needsWrite } = await loadArticles(articlesPath);
    const kept = selectKept(articles);
    const removed = articles.length - kept.length;
    if (removed > 0 || needsWrite) {
      await atomicWrite(kept, articlesPath);
    }
    return removed;
  });
}

/** Set `searchSeenAt` on the stored articles with these ids (serialized); unknown ids are ignored. */
export async function markArticlesSearchSeen(
  ids: readonly string[],
  at: string,
  articlesPath: string = ARTICLES_PATH,
): Promise<void> {
  const marked = new Set(ids);
  await updateArticles(
    (articles) =>
      articles.map((article) => (marked.has(article.id) ? { ...article, searchSeenAt: at } : article)),
    articlesPath,
  );
}

/**
 * Read all articles from disk. Creates an empty store file if missing.
 * Legacy CFP records (`cfpUrl` identity) are migrated to canonicalUrl + citations.
 */
export async function readArticles(articlesPath: string = ARTICLES_PATH): Promise<Article[]> {
  const { articles, needsWrite } = await loadArticles(articlesPath);
  if (needsWrite) {
    return updateArticles((current) => current, articlesPath);
  }
  return articles;
}

/**
 * Find a single article by id.
 */
export async function getArticleById(id: string): Promise<Article | null> {
  const articles = await readArticles();
  return articles.find((a) => a.id === id) ?? null;
}

/**
 * Insert or update an article by stable id (hash of canonicalUrl).
 * Ensures `id` matches `articleIdFromCanonicalUrl(canonicalUrl)`.
 */
export async function upsertArticle(
  article: Omit<Article, 'id'> & { id?: string },
  articlesPath: string = ARTICLES_PATH,
): Promise<Article> {
  const [next] = await upsertArticles([article], articlesPath);
  return next!;
}

/**
 * Upsert many articles in one serialized read/write cycle.
 */
export async function upsertArticles(
  incoming: Array<Omit<Article, 'id'> & { id?: string }>,
  articlesPath: string = ARTICLES_PATH,
): Promise<Article[]> {
  const results: Article[] = [];
  await updateArticles((articles) => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    for (const item of incoming) {
      const id = articleIdFromCanonicalUrl(item.canonicalUrl);
      const next = mergeArticleOnUpsert(byId.get(id), item, id);
      byId.set(id, next);
      results.push(next);
    }
    return [...byId.values()];
  }, articlesPath);
  return results;
}
