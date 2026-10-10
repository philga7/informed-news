import { randomUUID } from 'node:crypto';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import { articleIdFromCanonicalUrl } from '../store/articleId.js';
import {
  readArticles,
  readMuteRules,
  readTopics,
  readTriage,
  updateTriage,
  upsertArticle,
} from '../store/index.js';
import { scrapePublisherBody, type PublisherBodyResult } from './publisherBodyScrape.js';
import { publisherDomainFromUrl } from './publisherScrape.js';
import { TRIAGE_WINDOW_HOURS } from './triageConfig.js';
import { storiesAreDuplicates } from './triageDedupe.js';
import { muteReason } from './triageKeywords.js';

/** Shorter than the refresh scrape: the operator is waiting on the save. */
export const MANUAL_SEED_SCRAPE_TIMEOUT_MS = 8000;

const WINDOW_MS = TRIAGE_WINDOW_HOURS * 60 * 60 * 1000;

export type ManualSeedArticleInput = {
  title: string;
  note?: string;
  urls?: string[];
};

export type ManualSeedInput = ManualSeedArticleInput & {
  topicId: string;
  urls: string[];
};

export class ManualSeedValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManualSeedValidationError';
  }
}

export type ManualSeedConflictBody =
  | { ok: false; code: 'muted'; error: string }
  | {
      ok: false;
      code: 'duplicate';
      error: string;
      existing: { articleId: string; title: string; topicName: string };
    };

/** The seed would be muted or duplicates a kept story; nothing was written. */
export class ManualSeedConflictError extends Error {
  readonly body: ManualSeedConflictBody;

  constructor(body: ManualSeedConflictBody) {
    super(body.error);
    this.name = 'ManualSeedConflictError';
    this.body = body;
  }
}

export type CreateManualSeedResult = {
  article: Article;
  topicId: string;
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

  if (typeof record.topicId !== 'string') {
    throw new ManualSeedValidationError('topicId is required');
  }
  if (record.note !== undefined && typeof record.note !== 'string') {
    throw new ManualSeedValidationError('note must be a string');
  }
  if (record.urls === undefined || (Array.isArray(record.urls) && record.urls.length === 0)) {
    throw new ManualSeedValidationError('at least one URL is required');
  }
  if (!Array.isArray(record.urls)) {
    throw new ManualSeedValidationError('urls must be an array');
  }
  if (record.urls.some((url) => typeof url !== 'string')) {
    throw new ManualSeedValidationError('urls must be an array of strings');
  }

  const input: ManualSeedInput = {
    title: record.title,
    topicId: record.topicId,
    urls: record.urls as string[],
  };
  if (record.note !== undefined) {
    input.note = record.note as string;
  }
  return input;
}

/**
 * Build a manual Brief seed article (pure; no persistence).
 * Identity: manual://seed/{uuid} → id via articleIdFromCanonicalUrl; clusterId = id.
 */
export function buildManualSeedArticle(
  input: ManualSeedArticleInput,
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
    sourceTier: 'sensor',
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
  readTopics?: () => Promise<{ topics: Topic[] }>;
  readMuteRules?: () => Promise<{ rules: MuteRule[] }>;
  readArticles?: () => Promise<Article[]>;
  readTriage?: () => Promise<TriageStore>;
  upsertArticle?: typeof upsertArticle;
  updateTriage?: (mutate: (store: TriageStore) => TriageStore) => Promise<TriageStore>;
  scrapePublisherBody?: (
    url: string,
    opts: { timeoutMs: number },
  ) => Promise<PublisherBodyResult>;
  now?: () => string;
  uuid?: () => string;
};

function inWindow(article: Article, now: number): boolean {
  const time = Date.parse(article.publishedAt ?? article.fetchedAt);
  return !Number.isNaN(time) && now - time <= WINDOW_MS;
}

function outletCountOf(urls: readonly string[]): number {
  const hosts = new Set(
    urls.map((url) => new URL(url).hostname.toLowerCase().replace(/^www\./, '')),
  );
  return Math.max(1, hosts.size);
}

function muteConflict(
  reason: `muted:${string}`,
  rules: readonly MuteRule[],
  undesired: readonly Topic[],
): ManualSeedConflictError {
  const id = reason.slice('muted:'.length);
  const rule = rules.find((r) => r.id === id);
  if (rule) {
    return new ManualSeedConflictError({
      ok: false,
      code: 'muted',
      error: `This matches your mute rule '${rule.keyword}', so it wouldn't show.`,
    });
  }
  const topicName = undesired.find((t) => t.id === id)?.name ?? id;
  return new ManualSeedConflictError({
    ok: false,
    code: 'muted',
    error: `This matches your undesired topic '${topicName}', so it wouldn't show.`,
  });
}

function findKeptDuplicate(
  seed: Article,
  topicId: string,
  articles: readonly Article[],
  triage: TriageStore,
  now: number,
): { record: TriageRecord; article: Article } | null {
  const byId = new Map(articles.map((a) => [a.id, a]));
  for (const record of Object.values(triage.records)) {
    if (record.status !== 'kept') continue;
    const article = byId.get(record.articleId);
    if (!article || !inWindow(article, now)) continue;
    if (
      storiesAreDuplicates(
        { article: seed, topicIds: [topicId] },
        { article, topicIds: record.topicIds },
      )
    ) {
      return { record, article };
    }
  }
  return null;
}

/**
 * Save an operator seed as a kept story under one desired topic. Refused (nothing
 * written) when a mute rule / undesired topic would hide it or it duplicates a kept
 * story in the window.
 */
export async function createManualSeed(
  input: ManualSeedInput,
  deps: CreateManualSeedDeps = {},
): Promise<CreateManualSeedResult> {
  const upsert = deps.upsertArticle ?? upsertArticle;
  const update = deps.updateTriage ?? ((mutate) => updateTriage(mutate));
  const scrape = deps.scrapePublisherBody ?? scrapePublisherBody;
  const now = deps.now?.() ?? new Date().toISOString();
  const seedUuid = deps.uuid?.() ?? randomUUID();

  const [{ topics }, { rules }, articles, triage] = await Promise.all([
    (deps.readTopics ?? (() => readTopics()))(),
    (deps.readMuteRules ?? (() => readMuteRules()))(),
    (deps.readArticles ?? readArticles)(),
    (deps.readTriage ?? (() => readTriage()))(),
  ]);

  const topic = topics.find((t) => t.id === input.topicId);
  if (!topic || topic.kind !== 'desired') {
    throw new ManualSeedValidationError('topic must be a desired topic');
  }

  const article = buildManualSeedArticle(input, now, seedUuid);
  const scrapeUrl = article.publisherUrl;
  if (!scrapeUrl) {
    throw new ManualSeedValidationError('at least one URL is required');
  }

  const undesired = topics.filter((t) => t.kind === 'undesired');
  const muted = muteReason(article, rules, undesired);
  if (muted) {
    throw muteConflict(muted, rules, undesired);
  }

  const duplicate = findKeptDuplicate(article, topic.id, articles, triage, Date.parse(now));
  if (duplicate) {
    const topicName =
      duplicate.record.topicIds
        .map((id) => topics.find((t) => t.id === id))
        .find((t) => t !== undefined)?.name ?? 'another topic';
    const title = duplicate.article.title;
    throw new ManualSeedConflictError({
      ok: false,
      code: 'duplicate',
      error: `Already in your Brief: '${title}' under ${topicName}.`,
      existing: { articleId: duplicate.article.id, title, topicName },
    });
  }

  const body = await scrape(scrapeUrl, { timeoutMs: MANUAL_SEED_SCRAPE_TIMEOUT_MS });
  if (body.bodyStatus === 'ok') {
    article.bodyText = body.bodyText;
    article.bodyStatus = 'ok';
  }

  const saved = await upsert(article);
  const record: TriageRecord = {
    articleId: saved.id,
    status: 'kept',
    reason: null,
    stage: 'manual',
    final: true,
    topicIds: [topic.id],
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: outletCountOf(saved.citations.map((c) => c.url)),
    significance: null,
    bodyChecked: false,
    jevCalls: 0,
    triagedAt: now,
  };
  await update((store) => ({
    records: { ...store.records, [record.articleId]: record },
    updatedAt: now,
  }));

  return { article: saved, topicId: topic.id };
}
