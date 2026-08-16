import type { Article } from '../types/article.js';
import {
  getArticleById,
  readArticles,
  upsertArticle,
  writeArticles,
} from '../store/index.js';
import {
  articleFieldsFromClassifyResult,
  classifyFraming,
} from './ollamaFraming.js';

const DEFAULT_BATCH_LIMIT = 10;

export type ClassifyBatchOptions = {
  /** Max unclassified articles to process (default 10). */
  limit?: number;
};

export type ClassifyBatchResult = {
  limit: number;
  attempted: number;
  succeeded: number;
  failed: number;
  /** How many attempted items came from each source (both kinds are eligible). */
  bySourceKind: { cfp: number; xcancel: number };
  articles: Article[];
};

export type ClassifyOneResult = {
  article: Article;
  ok: boolean;
  error?: string;
};

function resolveBatchLimit(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.CLASSIFY_BATCH_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return DEFAULT_BATCH_LIMIT;
}

function sortNewestFirst(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    const aKey = a.publishedAt || a.fetchedAt || '';
    const bKey = b.publishedAt || b.fetchedAt || '';
    return bKey.localeCompare(aKey);
  });
}

/**
 * Body usable for framing: publisher scrape ok, or xcancel tweet-as-body.
 */
export function framingBodyText(article: Article): string | null {
  if (
    (article.bodyStatus === 'ok' || article.bodyStatus === 'not_applicable') &&
    article.bodyText?.trim()
  ) {
    return article.bodyText.trim();
  }
  return null;
}

/**
 * Classify articles with null classification, newest-first, up to `limit`.
 * Source-agnostic: CFP and xcancel items share FramingAnalysis.
 * Uses body text when present; otherwise title + snippet.
 * Persists each result (success or recoverable error) via a single write cycle.
 */
export async function classifyUnclassifiedArticles(
  options: ClassifyBatchOptions = {},
): Promise<ClassifyBatchResult> {
  const limit = resolveBatchLimit(options.limit);
  const articles = await readArticles();
  const byId = new Map(articles.map((a) => [a.id, a]));

  const candidates = sortNewestFirst(articles)
    .filter((a) => a.classification === null)
    .slice(0, limit);

  let succeeded = 0;
  let failed = 0;
  const bySourceKind = { cfp: 0, xcancel: 0 };
  const updated: Article[] = [];

  for (const article of candidates) {
    bySourceKind[article.sourceKind] += 1;
    const result = await classifyFraming({
      title: article.title,
      snippet: article.snippet,
      publisherDomain: article.publisherDomain,
      bodyText: framingBodyText(article),
    });
    const fields = articleFieldsFromClassifyResult(result);
    const next: Article = { ...article, ...fields };
    byId.set(next.id, next);
    updated.push(next);
    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  if (updated.length > 0) {
    await writeArticles([...byId.values()]);
  }

  return {
    limit,
    attempted: updated.length,
    succeeded,
    failed,
    bySourceKind,
    articles: updated,
  };
}

/**
 * Reclassify a single article by id (even if already classified).
 */
export async function classifyArticleById(
  id: string,
): Promise<ClassifyOneResult | null> {
  const article = await getArticleById(id);
  if (!article) {
    return null;
  }

  const result = await classifyFraming({
    title: article.title,
    snippet: article.snippet,
    publisherDomain: article.publisherDomain,
    bodyText: framingBodyText(article),
  });
  const fields = articleFieldsFromClassifyResult(result);
  const next = await upsertArticle({ ...article, ...fields });

  return {
    article: next,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
  };
}

export { sortNewestFirst };
