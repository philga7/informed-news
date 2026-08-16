import type {
  Article,
  ArticleCitation,
  BodyStatus,
  FramingAnalysis,
  SourceKind,
} from '../types/article.js';
import { truncateBodyText } from '../types/article.js';
import { articleIdFromCanonicalUrl } from './articleId.js';

const SOURCE_KINDS = new Set<SourceKind>(['cfp', 'xcancel']);
const BODY_STATUSES = new Set<BodyStatus>([
  'ok',
  'unavailable',
  'blocked',
  'not_applicable',
  'pending',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === 'string' ? value : null;
}

function parseCitations(value: unknown): ArticleCitation[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const citations: ArticleCitation[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }
    const label = asString(item.label);
    const url = asString(item.url);
    if (!label || !url) {
      return null;
    }
    citations.push({ label, url });
  }
  return citations;
}

export function citationsFromCfp(
  canonicalUrl: string,
  publisherUrl: string | null,
): ArticleCitation[] {
  const citations: ArticleCitation[] = [{ label: 'CFP', url: canonicalUrl }];
  if (publisherUrl) {
    citations.push({ label: 'Original', url: publisherUrl });
  }
  return citations;
}

/** Dual citations for an xcancel-ingested tweet: mirror page + x.com permalink. */
export function citationsFromXcancel(
  xcancelUrl: string,
  xPermalink: string,
): ArticleCitation[] {
  return [
    { label: 'xcancel', url: xcancelUrl },
    { label: 'X', url: xPermalink },
  ];
}

function parseClassification(value: unknown): FramingAnalysis | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  return value as FramingAnalysis;
}

function parseBodyStatus(
  value: unknown,
  sourceKind: SourceKind,
): BodyStatus {
  if (typeof value === 'string' && BODY_STATUSES.has(value as BodyStatus)) {
    return value as BodyStatus;
  }
  // Tweet text is the body; no publisher scrape.
  return sourceKind === 'xcancel' ? 'not_applicable' : 'pending';
}

/**
 * Normalize a stored article to the source-agnostic shape.
 * Legacy records used `cfpUrl` as identity and had no sourceKind / citations / handle.
 */
export function migrateArticle(raw: unknown): Article {
  if (!isRecord(raw)) {
    throw new Error('articles.json entries must be objects');
  }

  const title = asString(raw.title);
  if (!title) {
    throw new Error('article is missing title');
  }

  const legacyCfpUrl = asString(raw.cfpUrl);
  const canonicalUrl = asString(raw.canonicalUrl) || legacyCfpUrl;
  if (!canonicalUrl) {
    throw new Error('article is missing canonicalUrl (or legacy cfpUrl)');
  }

  const sourceKindRaw = raw.sourceKind;
  const sourceKind: SourceKind =
    typeof sourceKindRaw === 'string' && SOURCE_KINDS.has(sourceKindRaw as SourceKind)
      ? (sourceKindRaw as SourceKind)
      : 'cfp';

  const publisherUrl = asNullableString(raw.publisherUrl);
  const parsedCitations = parseCitations(raw.citations);
  const citations = parsedCitations ?? citationsFromCfp(canonicalUrl, publisherUrl);

  const snippet = asString(raw.snippet) ?? '';
  const bodyStatus = parseBodyStatus(raw.bodyStatus, sourceKind);
  const rawBody =
    asNullableString(raw.bodyText) ??
    (sourceKind === 'xcancel' && snippet ? snippet : null);
  const bodyText = rawBody === null ? null : truncateBodyText(rawBody);

  return {
    id: articleIdFromCanonicalUrl(canonicalUrl),
    title,
    sourceKind,
    canonicalUrl,
    citations,
    publisherUrl,
    publisherDomain: asNullableString(raw.publisherDomain),
    handle: asNullableString(raw.handle),
    publishedAt: asNullableString(raw.publishedAt),
    snippet,
    bodyText,
    bodyStatus,
    publisherTitle: asNullableString(raw.publisherTitle),
    fetchedAt: asString(raw.fetchedAt) ?? new Date().toISOString(),
    classification: parseClassification(raw.classification),
    classifiedAt: asNullableString(raw.classifiedAt),
    classifyError: asNullableString(raw.classifyError),
  };
}

/** True when the on-disk record still has the legacy shape or a stale id. */
export function articleNeedsRewrite(raw: unknown, migrated: Article): boolean {
  if (!isRecord(raw)) {
    return true;
  }
  if ('cfpUrl' in raw) {
    return true;
  }
  if (raw.sourceKind !== migrated.sourceKind) {
    return true;
  }
  if (raw.canonicalUrl !== migrated.canonicalUrl) {
    return true;
  }
  if (!('handle' in raw)) {
    return true;
  }
  if (!Array.isArray(raw.citations)) {
    return true;
  }
  if (raw.id !== migrated.id) {
    return true;
  }
  if (!('bodyStatus' in raw) || !('bodyText' in raw) || !('publisherTitle' in raw)) {
    return true;
  }
  return false;
}
