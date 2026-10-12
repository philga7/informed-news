import { updateArticles } from '../store/index.js';
import type { Article } from '../types/article.js';
import { resolveGoogleNewsUrl } from './googleNewsResolve.js';
import { scrapePublisherBody, type PublisherBodyResult } from './publisherBodyScrape.js';
import { publisherDomainFromUrl } from './publisherScrape.js';
import { TRIAGE_WINDOW_HOURS } from './triageConfig.js';

export type SurvivorDeps = {
  resolveGoogleNewsUrl?: (googleUrl: string) => Promise<string | null>;
  scrapePublisherBody?: (url: string | null) => Promise<PublisherBodyResult>;
};

export type SurvivorResult = {
  article: Article;
  changed: boolean;
  dateIssue: 'undated' | 'stale' | null;
};

const WINDOW_MS = TRIAGE_WINDOW_HOURS * 60 * 60 * 1000;

const UNAVAILABLE_BODY: PublisherBodyResult = {
  bodyText: null,
  bodyStatus: 'unavailable',
  publisherTitle: null,
  imageUrl: null,
  imageCaption: null,
  imageCredit: null,
  publishedAt: null,
};

/** Search rows must carry a real date; other sources fall back to when we fetched them. */
function dateIssueFor(article: Article, now: Date): SurvivorResult['dateIssue'] {
  const isSearch = article.sourceKind === 'search';
  const published = article.publishedAt ? Date.parse(article.publishedAt) : Number.NaN;
  const time = Number.isNaN(published) && !isSearch ? Date.parse(article.fetchedAt) : published;
  if (Number.isNaN(time)) return isSearch ? 'undated' : null;
  return now.getTime() - time > WINDOW_MS ? 'stale' : null;
}

async function resolvePublisher(
  article: Article,
  resolve: (googleUrl: string) => Promise<string | null>,
): Promise<Article> {
  if (article.publisherUrl || !article.googleNewsUrl) return article;

  let publisherUrl: string | null = null;
  try {
    publisherUrl = await resolve(article.googleNewsUrl);
  } catch {
    publisherUrl = null;
  }
  if (!publisherUrl) return article;

  const publisherDomain = publisherDomainFromUrl(publisherUrl) ?? article.publisherDomain;
  const alreadyCited = article.citations.some((c) => c.url === publisherUrl);
  const label = article.citations[0]?.label ?? publisherDomain ?? 'Publisher';
  return {
    ...article,
    publisherUrl,
    publisherDomain,
    citations: alreadyCited ? article.citations : [...article.citations, { label, url: publisherUrl }],
  };
}

async function scrapeBody(
  url: string | null,
  scrape: (url: string | null) => Promise<PublisherBodyResult>,
): Promise<PublisherBodyResult> {
  if (!url) return UNAVAILABLE_BODY;
  try {
    return await scrape(url);
  } catch {
    return UNAVAILABLE_BODY;
  }
}

/**
 * Ready a headline-cleared story for the body check: resolve a Google-only
 * link to its publisher, scrape the body, and date it from page metadata when
 * the feed gave no date. Only `pending` rows touch the network. Never throws;
 * `canonicalUrl` and `id` never change.
 */
export async function prepareSurvivor(
  article: Article,
  now: Date,
  deps: SurvivorDeps = {},
): Promise<SurvivorResult> {
  if (article.bodyStatus !== 'pending') {
    return { article, changed: false, dateIssue: dateIssueFor(article, now) };
  }

  const resolve =
    deps.resolveGoogleNewsUrl ?? ((googleUrl: string) => resolveGoogleNewsUrl(googleUrl));
  const scrape = deps.scrapePublisherBody ?? scrapePublisherBody;

  const resolved = await resolvePublisher(article, resolve);
  const body = await scrapeBody(resolved.publisherUrl, scrape);
  const prepared: Article = {
    ...resolved,
    bodyText: body.bodyText,
    bodyStatus: body.bodyStatus,
    publisherTitle: body.publisherTitle ?? resolved.publisherTitle,
    imageUrl: body.imageUrl ?? resolved.imageUrl,
    imageCaption: body.imageCaption ?? resolved.imageCaption,
    imageCredit: body.imageCredit ?? resolved.imageCredit,
    publishedAt: resolved.publishedAt ?? body.publishedAt,
  };

  return { article: prepared, changed: true, dateIssue: dateIssueFor(prepared, now) };
}

/**
 * The fields survivor prep owns, from `prepared` onto the stored row: publisher link, citations,
 * body, publisherTitle, image, and publishedAt only when the stored one is empty. Everything else
 * (classification, cluster, topic search stamps, fetchedAt) keeps its stored value.
 */
export function withSurvivorFields(stored: Article, prepared: Article): Article {
  return {
    ...stored,
    publisherUrl: prepared.publisherUrl,
    publisherDomain: prepared.publisherDomain,
    citations: prepared.citations,
    bodyText: prepared.bodyText,
    bodyStatus: prepared.bodyStatus,
    publisherTitle: prepared.publisherTitle,
    imageUrl: prepared.imageUrl,
    imageCaption: prepared.imageCaption,
    imageCredit: prepared.imageCredit,
    publishedAt: stored.publishedAt ?? prepared.publishedAt,
  };
}

/**
 * Write survivor prep onto the articles as stored now. Triage read its copies at the start of
 * the refresh, so it patches only the fields it owns; other writes since then stand. A row no
 * longer `pending` was prepared by another writer meanwhile and is left alone; articles pruned
 * meanwhile aren't brought back.
 */
export async function writeBackSurvivors(
  prepared: readonly Article[],
  articlesPath?: string,
): Promise<void> {
  const byId = new Map(prepared.map((a) => [a.id, a]));
  await updateArticles(
    (articles) =>
      articles.map((article) => {
        const survivor = byId.get(article.id);
        return survivor && article.bodyStatus === 'pending'
          ? withSurvivorFields(article, survivor)
          : article;
      }),
    articlesPath,
  );
}
