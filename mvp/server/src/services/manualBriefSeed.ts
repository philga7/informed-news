import { randomUUID } from 'node:crypto';
import type { Article } from '../types/article.js';
import { articleIdFromCanonicalUrl } from '../store/articleId.js';
import { acceptCluster, trackCluster, upsertArticle } from '../store/index.js';
import { publisherDomainFromUrl } from './publisherScrape.js';

export type ManualSeedInput = {
  title: string;
  note?: string;
  urls?: string[];
};

export class ManualSeedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualSeedValidationError';
  }
}

export type CreateManualSeedResult = {
  article: Article;
  acceptedClusterIds: string[];
};

function parseHttpHttpsUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ManualSeedValidationError('title is required');
  }
  return trimmed;
}

function normalizeUrls(urls: string[] | undefined): string[] {
  if (!urls || urls.length === 0) {
    return [];
  }
  const normalized: string[] = [];
  for (const raw of urls) {
    const parsed = parseHttpHttpsUrl(raw);
    if (!parsed) {
      throw new ManualSeedValidationError('urls must be valid http or https URLs');
    }
    normalized.push(parsed);
  }
  return normalized;
}

/** Parse and validate POST /api/brief/seed body. */
export function parseManualSeedBody(body: unknown): ManualSeedInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ManualSeedValidationError('title is required');
  }

  const record = body as Record<string, unknown>;
  if (typeof record.title !== 'string') {
    throw new ManualSeedValidationError('title is required');
  }

  const input: ManualSeedInput = {
    title: record.title,
  };

  if (record.note !== undefined) {
    if (typeof record.note !== 'string') {
      throw new ManualSeedValidationError('note must be a string');
    }
    input.note = record.note;
  }

  if (record.urls !== undefined) {
    if (!Array.isArray(record.urls)) {
      throw new ManualSeedValidationError('urls must be an array');
    }
    if (record.urls.some((url) => typeof url !== 'string')) {
      throw new ManualSeedValidationError('urls must be an array of strings');
    }
    input.urls = record.urls as string[];
  }

  return input;
}

/**
 * Build a manual Brief seed article (pure; no persistence).
 * Identity: manual://seed/{uuid} → id via articleIdFromCanonicalUrl; clusterId = id.
 */
export function buildManualSeedArticle(
  input: ManualSeedInput,
  now: string,
  seedUuid: string = randomUUID(),
): Article {
  const title = normalizeTitle(input.title);
  const validUrls = normalizeUrls(input.urls);
  const canonicalUrl = `manual://seed/${seedUuid}`;
  const id = articleIdFromCanonicalUrl(canonicalUrl);
  const publisherUrl = validUrls[0] ?? null;

  return {
    id,
    title,
    sourceKind: 'manual',
    canonicalUrl,
    citations: validUrls.map((url) => ({ label: 'Source', url })),
    publisherUrl,
    publisherDomain: publisherDomainFromUrl(publisherUrl),
    handle: null,
    publishedAt: null,
    snippet: input.note?.trim() ?? '',
    bodyText: null,
    bodyStatus: 'not_applicable',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: id,
    fetchedAt: now,
    classification: null,
    classifiedAt: null,
    classifyError: null,
  };
}

export type CreateManualSeedDeps = {
  upsertArticle?: typeof upsertArticle;
  acceptCluster?: typeof acceptCluster;
  trackCluster?: typeof trackCluster;
  now?: () => string;
  uuid?: () => string;
};

/** Persist a manual seed and accept its cluster onto the Brief. */
export async function createManualSeed(
  input: ManualSeedInput,
  deps: CreateManualSeedDeps = {},
): Promise<CreateManualSeedResult> {
  const upsert = deps.upsertArticle ?? upsertArticle;
  const accept = deps.acceptCluster ?? acceptCluster;
  const track = deps.trackCluster ?? trackCluster;
  const now = deps.now?.() ?? new Date().toISOString();
  const seedUuid = deps.uuid?.() ?? randomUUID();

  const article = buildManualSeedArticle(input, now, seedUuid);
  const upserted = await upsert(article);
  const clusterId = upserted.clusterId;
  if (!clusterId) {
    throw new Error('manual seed is missing clusterId');
  }

  const { acceptedClusterIds } = await accept(clusterId);
  // NEWS-59: default Track on accept (Track ≠ Accept; this is the seed path).
  await track(clusterId, 1);

  return { article: upserted, acceptedClusterIds };
}
