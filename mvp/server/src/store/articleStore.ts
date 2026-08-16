import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Article } from '../types/article.js';
import { articleIdFromCanonicalUrl } from './articleId.js';
import { articleNeedsRewrite, migrateArticle } from './migrateArticle.js';
import { mergeArticleOnUpsert } from './mergeArticleOnUpsert.js';
import { ARTICLES_PATH, DATA_DIR } from './paths.js';

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

/**
 * Read all articles from disk. Creates an empty store file if missing.
 * Legacy CFP records (`cfpUrl` identity) are migrated to canonicalUrl + citations.
 */
export async function readArticles(): Promise<Article[]> {
  await ensureDataDir();
  try {
    const raw = await readFile(ARTICLES_PATH, 'utf8');
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
    if (needsWrite) {
      await writeArticles(articles);
    }
    return articles;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      await writeArticles([]);
      return [];
    }
    throw err;
  }
}

/**
 * Replace the entire articles store on disk.
 */
export async function writeArticles(articles: Article[]): Promise<void> {
  await ensureDataDir();
  await writeFile(ARTICLES_PATH, `${JSON.stringify(articles, null, 2)}\n`, 'utf8');
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
): Promise<Article> {
  const id = articleIdFromCanonicalUrl(article.canonicalUrl);
  const articles = await readArticles();
  const index = articles.findIndex((a) => a.id === id);
  const existing = index >= 0 ? articles[index] : undefined;
  const next = mergeArticleOnUpsert(existing, article, id);

  if (index >= 0) {
    articles[index] = next;
  } else {
    articles.push(next);
  }
  await writeArticles(articles);
  return next;
}

/**
 * Upsert many articles in one read/write cycle.
 */
export async function upsertArticles(
  incoming: Array<Omit<Article, 'id'> & { id?: string }>,
): Promise<Article[]> {
  const articles = await readArticles();
  const byId = new Map(articles.map((a) => [a.id, a]));
  const results: Article[] = [];

  for (const item of incoming) {
    const id = articleIdFromCanonicalUrl(item.canonicalUrl);
    const next = mergeArticleOnUpsert(byId.get(id), item, id);
    byId.set(id, next);
    results.push(next);
  }

  await writeArticles([...byId.values()]);
  return results;
}
