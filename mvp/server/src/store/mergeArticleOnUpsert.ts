import type { Article } from '../types/article.js';

export type ArticleUpsertInput = Omit<Article, 'id'> & { id?: string };

function incomingWritesClassification(incoming: ArticleUpsertInput): boolean {
  return (
    incoming.classification !== null ||
    incoming.classifiedAt !== null ||
    incoming.classifyError !== null
  );
}

function contentUnchanged(existing: Article, incoming: ArticleUpsertInput): boolean {
  return (
    existing.canonicalUrl === incoming.canonicalUrl &&
    existing.title === incoming.title &&
    existing.snippet === incoming.snippet
  );
}

/**
 * Merge an incoming upsert onto an existing article (if any).
 *
 * Fetch paths send `classification` / `classifiedAt` / `classifyError` as null.
 * Classify paths write at least one of those fields (analysis, timestamp, or error).
 *
 * When the caller did not write classification:
 * - same canonical URL, title, and snippet → keep existing analysis
 * - changed title or snippet → clear analysis so batch classify can re-run
 * - no existing row → stay unclassified
 *
 * We clear rather than mark stale: `classifyUnclassifiedArticles` already
 * selects `classification === null`, and a stale flag would need schema + UI.
 */
export function mergeArticleOnUpsert(
  existing: Article | undefined,
  incoming: ArticleUpsertInput,
  id: string,
): Article {
  const base: Article = { ...incoming, id };

  if (incomingWritesClassification(incoming) || !existing) {
    return base;
  }

  if (contentUnchanged(existing, incoming)) {
    return {
      ...base,
      classification: existing.classification,
      classifiedAt: existing.classifiedAt,
      classifyError: existing.classifyError,
    };
  }

  return {
    ...base,
    classification: null,
    classifiedAt: null,
    classifyError: null,
  };
}
