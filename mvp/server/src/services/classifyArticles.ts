import { bodyNewlyUsable, usableBodyText, type Article } from '../types/article.js';
import { getArticleById, readArticles, updateArticles } from '../store/index.js';
import {
  articleFieldsFromClassifyResult,
  classifyFraming,
  type FramingClassifyResult,
} from './ollamaFraming.js';

const DEFAULT_BATCH_LIMIT = 10;

export type ClassifyBatchOptions = {
  /** Max unclassified articles to process (default 10). */
  limit?: number;
};

export type ClassifyBatchResult = {
  limit: number;
  /**
   * Articles classified; `succeeded` / `failed` count each once by its last model result, even
   * when its body landed mid-run and it was classified again.
   */
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

/** A model result and the article as classify read it. */
type ModelRun = { read: Article; result: FramingClassifyResult };

/**
 * Write each result onto its article as stored now: the model calls run outside the article
 * write queue, so other writes may land meanwhile. Articles pruned since are not written back.
 * A result made without a body is not written onto a row whose body became usable meanwhile;
 * those rows resolve as `bodyLanded`.
 */
async function writeModelRuns(
  runs: ReadonlyMap<string, ModelRun>,
  articlesPath?: string,
): Promise<{ applied: Article[]; bodyLanded: Article[] }> {
  const applied: Article[] = [];
  const bodyLanded: Article[] = [];
  await updateArticles(
    (stored) =>
      stored.map((article) => {
        const run = runs.get(article.id);
        if (!run) return article;
        if (bodyNewlyUsable(run.read, article)) {
          bodyLanded.push(article);
          return article;
        }
        const next = { ...article, ...articleFieldsFromClassifyResult(run.result) };
        applied.push(next);
        return next;
      }),
    articlesPath,
  );
  return { applied, bodyLanded };
}

type ClassifyRun = {
  /** Updated articles that still exist. */
  applied: Article[];
  /** The last model result for each article classified, including articles pruned meanwhile. */
  results: Map<string, FramingClassifyResult>;
};

/**
 * Classify each article as read and write the results (`writeModelRuns`). A row whose body
 * landed while the model ran is classified again with its body; it already has a usable body,
 * so its result can't be set aside again: at most two passes.
 */
async function classifyAndApply(
  articles: readonly Article[],
  classify: typeof classifyFraming,
  articlesPath?: string,
): Promise<ClassifyRun> {
  const applied: Article[] = [];
  const results = new Map<string, FramingClassifyResult>();
  let pending = articles;

  while (pending.length > 0) {
    const runs = new Map<string, ModelRun>();
    for (const article of pending) {
      const result = await classify({
        title: article.title,
        snippet: article.snippet,
        publisherDomain: article.publisherDomain,
        bodyText: usableBodyText(article),
      });
      runs.set(article.id, { read: article, result });
      results.set(article.id, result);
    }

    const written = await writeModelRuns(runs, articlesPath);
    applied.push(...written.applied);
    pending = written.bodyLanded;
  }

  return { applied, results };
}

/**
 * Classify articles with null classification, newest-first, up to `limit`.
 * Source-agnostic: CFP and xcancel items share FramingAnalysis.
 * Uses body text when present; otherwise title + snippet.
 * Persists each result (success or recoverable error) in one write cycle, plus one more for
 * rows whose body landed while the model ran.
 */
export async function classifyUnclassifiedArticles(
  options: ClassifyBatchOptions = {},
  deps: ClassifyDeps = {},
): Promise<ClassifyBatchResult> {
  const classify = deps.classifyFraming ?? classifyFraming;
  const limit = resolveBatchLimit(options.limit);
  const articles = await readArticles(deps.articlesPath);

  const candidates = selectClassifyBatchCandidates(articles, limit);

  const bySourceKind = { cfp: 0, xcancel: 0, rss: 0, manual: 0, search: 0 };
  for (const article of candidates) {
    bySourceKind[article.sourceKind] += 1;
  }

  const { applied, results } = await classifyAndApply(candidates, classify, deps.articlesPath);
  const succeeded = [...results.values()].filter((result) => result.ok).length;

  return {
    limit,
    attempted: results.size,
    succeeded,
    failed: results.size - succeeded,
    bySourceKind,
    articles: applied,
  };
}

/**
 * Reclassify a single article by id (even if already classified).
 * Null when the article is missing, or was pruned while the model ran.
 */
export async function classifyArticleById(
  id: string,
  deps: ClassifyDeps = {},
): Promise<ClassifyOneResult | null> {
  const article = await getArticleById(id, deps.articlesPath);
  if (!article) {
    return null;
  }

  const { applied, results } = await classifyAndApply(
    [article],
    deps.classifyFraming ?? classifyFraming,
    deps.articlesPath,
  );
  const [next] = applied;
  const result = results.get(id);
  if (!next || !result) {
    return null;
  }

  return {
    article: next,
    ok: result.ok,
    error: result.ok ? undefined : result.error,
  };
}

export { sortNewestFirst };
