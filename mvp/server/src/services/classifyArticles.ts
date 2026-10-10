import type { Article } from '../types/article.js';
import { getArticleById, readArticles, updateArticles } from '../store/index.js';
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
  /** How many attempted items came from each source (manual seeds and search rows are skipped). */
  bySourceKind: { cfp: number; xcancel: number; rss: number; manual: number; search: number };
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
 * Batch candidates: unclassified, newest-first, up to `limit`.
 * Manual seeds and untriaged search rows (until NEWS-87) are skipped.
 */
export function selectClassifyBatchCandidates(articles: Article[], limit: number): Article[] {
  return sortNewestFirst(articles)
    .filter(
      (a) =>
        a.classification === null && a.sourceKind !== 'manual' && a.sourceKind !== 'search',
    )
    .slice(0, limit);
}

export type ClassifyDeps = {
  classifyFraming?: typeof classifyFraming;
  articlesPath?: string;
};

type ClassifyFields = ReturnType<typeof articleFieldsFromClassifyResult>;

/**
 * Write classify results onto the articles as stored now: the model calls run outside the
 * article write queue, so other writes may land meanwhile. Articles pruned since are not
 * written back. Resolves to the updated articles that still exist.
 */
async function applyClassifyFields(
  fieldsById: ReadonlyMap<string, ClassifyFields>,
  articlesPath?: string,
): Promise<Article[]> {
  const applied: Article[] = [];
  await updateArticles(
    (articles) =>
      articles.map((article) => {
        const fields = fieldsById.get(article.id);
        if (!fields) return article;
        const next = { ...article, ...fields };
        applied.push(next);
        return next;
      }),
    articlesPath,
  );
  return applied;
}

/**
 * Classify articles with null classification, newest-first, up to `limit`.
 * Source-agnostic: CFP and xcancel items share FramingAnalysis.
 * Uses body text when present; otherwise title + snippet.
 * Persists each result (success or recoverable error) via a single write cycle.
 */
export async function classifyUnclassifiedArticles(
  options: ClassifyBatchOptions = {},
  deps: ClassifyDeps = {},
): Promise<ClassifyBatchResult> {
  const classify = deps.classifyFraming ?? classifyFraming;
  const limit = resolveBatchLimit(options.limit);
  const articles = await readArticles(deps.articlesPath);

  const candidates = selectClassifyBatchCandidates(articles, limit);

  let succeeded = 0;
  let failed = 0;
  const bySourceKind = { cfp: 0, xcancel: 0, rss: 0, manual: 0, search: 0 };
  const fieldsById = new Map<string, ClassifyFields>();

  for (const article of candidates) {
    bySourceKind[article.sourceKind] += 1;
    const result = await classify({
      title: article.title,
      snippet: article.snippet,
      publisherDomain: article.publisherDomain,
      bodyText: framingBodyText(article),
    });
    fieldsById.set(article.id, articleFieldsFromClassifyResult(result));
    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  const updated =
    fieldsById.size > 0 ? await applyClassifyFields(fieldsById, deps.articlesPath) : [];

  return {
    limit,
    attempted: fieldsById.size,
    succeeded,
    failed,
    bySourceKind,
    articles: updated,
  };
}

/**
 * Reclassify a single article by id (even if already classified).
 * Null when the article is missing, or was pruned while the model ran.
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
  const [next] = await applyClassifyFields(new Map([[id, fields]]));
  if (!next) {
    return null;
  }

  return {
    article: next,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
  };
}

export { sortNewestFirst };
