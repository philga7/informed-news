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

/** CFP fetch default: pending + nulls — do not wipe a prior scrape result. */
function isCfpBodyFetchPlaceholder(incoming: ArticleUpsertInput): boolean {
  return (
    incoming.bodyStatus === 'pending' &&
    incoming.bodyText === null &&
    incoming.publisherTitle === null
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
 *
 * Body fields: CFP fetch placeholders preserve an existing scrape; intentional
 * body writes (scrape, xcancel tweet text) apply from incoming.
 */
export function mergeArticleOnUpsert(
  existing: Article | undefined,
  incoming: ArticleUpsertInput,
  id: string,
): Article {
  const base: Article = { ...incoming, id };

  const withBody: Article =
    existing && isCfpBodyFetchPlaceholder(incoming)
      ? {
          ...base,
          bodyText: existing.bodyText,
          bodyStatus: existing.bodyStatus,
          publisherTitle: existing.publisherTitle,
        }
      : base;

  if (incomingWritesClassification(incoming) || !existing) {
    return withBody;
  }

  if (contentUnchanged(existing, incoming)) {
    return {
      ...withBody,
      classification: existing.classification,
      classifiedAt: existing.classifiedAt,
      classifyError: existing.classifyError,
    };
  }

  return {
    ...withBody,
    classification: null,
    classifiedAt: null,
    classifyError: null,
  };
}
