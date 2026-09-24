import type { Article, BodyStatus } from '../types/article.js';

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

/** Keep an existing body when incoming is a placeholder or a weaker unavailable. */
function shouldKeepExistingBody(
  existing: Article,
  incoming: ArticleUpsertInput,
): boolean {
  if (isCfpBodyFetchPlaceholder(incoming)) {
    return true;
  }
  // Do not let a flaky re-scrape erase a prior successful body.
  return (
    existing.bodyStatus === 'ok' &&
    Boolean(existing.bodyText) &&
    incoming.bodyStatus === 'unavailable'
  );
}

function shouldKeepExistingImage(
  existing: Article,
  incoming: ArticleUpsertInput,
): boolean {
  // Only preserve when the incoming fetch did not find an image.
  if (incoming.imageUrl !== null) {
    return false;
  }
  if (!existing.imageUrl) {
    return false;
  }
  // If the item is otherwise unchanged, keep the existing image metadata.
  return contentUnchanged(existing, incoming);
}

function hasUsableBody(status: BodyStatus, bodyText: string | null): boolean {
  return (
    (status === 'ok' || status === 'not_applicable') && Boolean(bodyText?.trim())
  );
}

/** True when merged body becomes usable for framing vs the prior row. */
function bodyNewlyUsable(existing: Article, merged: Article): boolean {
  return (
    hasUsableBody(merged.bodyStatus, merged.bodyText) &&
    !hasUsableBody(existing.bodyStatus, existing.bodyText)
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
 * - body newly becomes usable (ok / not_applicable with text) → clear analysis
 * - no existing row → stay unclassified
 *
 * We clear rather than mark stale: `classifyUnclassifiedArticles` already
 * selects `classification === null`, and a stale flag would need schema + UI.
 *
 * Body fields: placeholders and flaky unavailable do not wipe a prior ok scrape;
 * intentional ok/blocked (and xcancel tweet text) apply from incoming.
 *
 * clusterId: fetch paths send null; keep existing until the cluster pass rewrites.
 */
export function mergeArticleOnUpsert(
  existing: Article | undefined,
  incoming: ArticleUpsertInput,
  id: string,
): Article {
  const sourceTier = incoming.sourceTier ?? existing?.sourceTier ?? 'sensor';
  const base: Article = { ...incoming, id, sourceTier };

  const withBody: Article =
    existing && shouldKeepExistingBody(existing, incoming)
      ? {
          ...base,
          bodyText: existing.bodyText,
          bodyStatus: existing.bodyStatus,
          publisherTitle: existing.publisherTitle ?? incoming.publisherTitle,
        }
      : base;

  const withImage: Article =
    existing && shouldKeepExistingImage(existing, incoming)
      ? {
          ...withBody,
          imageUrl: existing.imageUrl,
          imageCaption: existing.imageCaption,
          imageCredit: existing.imageCredit,
        }
      : withBody;

  const withCluster: Article =
    existing && incoming.clusterId == null && existing.clusterId != null
      ? { ...withImage, clusterId: existing.clusterId }
      : withImage;

  if (incomingWritesClassification(incoming) || !existing) {
    return withCluster;
  }

  if (bodyNewlyUsable(existing, withCluster)) {
    return {
      ...withCluster,
      classification: null,
      classifiedAt: null,
      classifyError: null,
    };
  }

  if (contentUnchanged(existing, incoming)) {
    return {
      ...withCluster,
      classification: existing.classification,
      classifiedAt: existing.classifiedAt,
      classifyError: existing.classifyError,
    };
  }

  return {
    ...withCluster,
    classification: null,
    classifiedAt: null,
    classifyError: null,
  };
}
