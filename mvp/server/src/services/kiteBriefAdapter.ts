import type { Article } from '../types/article.js';
import type { ClusterEnrichmentPayload } from '../types/clusterEnrichment.js';

/** Stable batch id for the live owned brief (not a Kagi UUID). */
export const OWNED_BATCH_ID = 'owned-latest';

/** Fixed category UUID so stories routes stay stable across reloads. */
export const OWNED_CATEGORY_UUID = '00000000-0000-4000-8000-000000000001';

/** Use `world` so Kite’s default `/world/latest` route shows owned stories. */
export const OWNED_CATEGORY_SLUG = 'world';
export const OWNED_CATEGORY_NAME = 'World';

/** Distinctive fixture title for empty-store / Playwright smoke. */
export const OWNED_FIXTURE_TITLE =
  'Owned brief fixture — CFP sample (replace via POST /api/fetch)';

export type KiteBriefArticle = {
  title: string;
  link: string;
  domain: string;
  date: string;
};

export type KiteBriefStory = {
  id: string;
  cluster_number: number;
  category: string;
  title: string;
  short_summary: string;
  articles: KiteBriefArticle[];
  domains?: Array<{ name: string }>;
  quote?: string;
  quote_author?: string | null;
  quote_attribution?: string | null;
  quote_source_url?: string | null;
  quote_source_domain?: string | null;
  talking_points?: string[];
  timeline?: Array<{ date: string; content: string; date_iso?: string }>;
  suggested_qna?: Array<{ question: string; answer: string }>;
  perspectives?: Array<{
    text: string;
    sources: Array<{ name: string; url: string }>;
  }>;
};

export type KiteBatchInfo = {
  id: string;
  createdAt: string;
  dateSlug: string;
  totalReadCount: number;
};

export type KiteBatchCategoriesResponse = {
  batchId: string;
  createdAt: string;
  hasOnThisDay: boolean;
  categories: Array<{
    id: string;
    categoryId: string;
    categoryName: string;
    timestamp: number;
    readCount: number;
    clusterCount: number;
  }>;
};

export type KiteBatchStoriesResponse = {
  batchId: string;
  categoryId: string;
  categoryName: string;
  timestamp: number;
  stories: KiteBriefStory[];
  totalStories: number;
  domains: Array<{ name: string }>;
  readCount: number;
};

/** Minimal sample when `articles.json` is empty so Brief still renders. */
export function ownedBriefFixtureArticles(
  now: Date = new Date(),
): Article[] {
  const iso = now.toISOString();
  return [
    {
      id: 'owned-fixture-cfp-1',
      title: OWNED_FIXTURE_TITLE,
      sourceKind: 'cfp',
      canonicalUrl: 'https://citizenfreepress.com/owned-brief-fixture/',
      citations: [
        {
          label: 'CFP',
          url: 'https://citizenfreepress.com/owned-brief-fixture/',
        },
        {
          label: 'Original',
          url: 'https://example.com/owned-brief-fixture',
        },
      ],
      publisherUrl: 'https://example.com/owned-brief-fixture',
      publisherDomain: 'example.com',
      handle: null,
      publishedAt: iso,
      snippet:
        'Placeholder cluster from Informed News owned-brief adapter. Run POST /api/fetch after login to replace with live CFP/xcancel ingest.',
      bodyText: null,
      bodyStatus: 'not_applicable',
      publisherTitle: null,
      imageUrl: null,
      imageCaption: null,
      imageCredit: null,
      clusterId: 'owned-fixture-cluster',
      fetchedAt: iso,
      classification: {
        genre: 'news_blurb',
        headlineDevices: [],
        dimensions: {
          loadedLanguage: 0.1,
          emotionalAppeal: 0.1,
          certaintyClaiming: 0.1,
          omissionOrSelectionRisk: 0.1,
          attributionClarity: 0.9,
        },
        framingSummary:
          'Fixture framing summary for the owned brief sample cluster.',
        evidenceQuotes: [
          'Fixture sample quote for the owned brief.',
        ],
        openQuestions: [],
        confidence: 0.5,
      },
      classifiedAt: null,
      classifyError: null,
    },
    {
      id: 'owned-fixture-cfp-2',
      title: 'Owned brief fixture — secondary member',
      sourceKind: 'cfp',
      canonicalUrl: 'https://citizenfreepress.com/owned-brief-fixture-2/',
      citations: [
        {
          label: 'CFP',
          url: 'https://citizenfreepress.com/owned-brief-fixture-2/',
        },
        {
          label: 'Original',
          url: 'https://example.org/owned-brief-fixture-2',
        },
      ],
      publisherUrl: 'https://example.org/owned-brief-fixture-2',
      publisherDomain: 'example.org',
      handle: null,
      publishedAt: iso,
      snippet:
        'Secondary member for the owned brief fixture cluster to test perspectives.',
      bodyText: null,
      bodyStatus: 'not_applicable',
      publisherTitle: null,
      imageUrl: null,
      imageCaption: null,
      imageCredit: null,
      clusterId: 'owned-fixture-cluster',
      fetchedAt: iso,
      classification: {
        genre: 'news_blurb',
        headlineDevices: [],
        dimensions: {
          loadedLanguage: 0.1,
          emotionalAppeal: 0.1,
          certaintyClaiming: 0.1,
          omissionOrSelectionRisk: 0.1,
          attributionClarity: 0.9,
        },
        framingSummary:
          'Secondary fixture framing summary for the owned brief sample cluster.',
        evidenceQuotes: [
          'Secondary fixture sample quote for the owned brief.',
        ],
        openQuestions: [],
        confidence: 0.5,
      },
      classifiedAt: null,
      classifyError: null,
    },
  ];
}

/** Minimal enrichment sample when `cluster-enrichments.json` is empty. */
export function ownedBriefFixtureEnrichments(): Map<
  string,
  ClusterEnrichmentPayload
> {
  return new Map([
    [
      'owned-fixture-cluster',
      {
        talking_points: [
          'Owned brief fixture highlight: this story is a placeholder so the Brief UI renders even when `mvp/data/articles.json` is empty.',
          'Replace this fixture by logging in and running POST /api/fetch (and optionally /api/classify + /api/enrich).',
        ],
        timeline: [
          {
            date: 'Today',
            content:
              'Fixture enrichment is served from a local JSON store; it is AI-assisted and may be incomplete or wrong.',
          },
        ],
        suggested_qna: [
          {
            question: 'What should I do next?',
            answer:
              'Log in to the MVP API, run POST /api/fetch, then optionally POST /api/classify and POST /api/enrich to populate story enrichments.',
          },
        ],
        short_summary:
          'Owned brief fixture enrichment: sample talking points, timeline, and Q&A for the placeholder cluster.',
      },
    ],
  ]);
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function articleLink(article: Article): string {
  return article.publisherUrl || article.canonicalUrl;
}

function articleDomain(article: Article): string {
  return article.publisherDomain || domainFromUrl(articleLink(article));
}

function articleDate(article: Article): string {
  return article.publishedAt || article.fetchedAt;
}

function shortSummary(article: Article): string {
  const framing = article.classification?.framingSummary?.trim();
  if (framing) return framing;
  const snippet = article.snippet?.trim();
  if (snippet) return snippet;
  return article.title;
}

function storyDomains(
  members: Article[],
): Array<{ name: string }> | undefined {
  const names = [
    ...new Set(members.map((m) => articleDomain(m)).filter(Boolean)),
  ];
  if (names.length === 0) return undefined;
  return names.map((name) => ({ name }));
}

type StoryPerspective = {
  text: string;
  sources: Array<{ name: string; url: string }>;
};

function storyPerspectives(
  members: Article[],
): StoryPerspective[] | undefined {
  if (members.length < 2) return undefined;

  const perspectives: StoryPerspective[] = [];

  for (const member of members) {
    const title = member.title?.trim();
    const snippet = member.snippet?.trim();
    const text = title || snippet;
    if (!text) continue;

    const url = articleLink(member);
    const name = articleDomain(member);

    perspectives.push({
      text,
      sources: [{ name, url }],
    });
  }

  if (perspectives.length === 0) return undefined;
  return perspectives;
}

type StoryQuoteFields = {
  quote: string;
  quote_author: string | null;
  quote_attribution: string | null;
  quote_source_url: string | null;
  quote_source_domain: string | null;
};

function pickStoryQuote(members: Article[]): StoryQuoteFields | null {
  for (const article of members) {
    const quoteText =
      article.classification?.evidenceQuotes?.find(
        (q) => q && q.trim().length > 0,
      ) ?? null;
    if (!quoteText) continue;

    const sourceUrl =
      article.publisherUrl ??
      article.citations[0]?.url ??
      article.canonicalUrl;
    const sourceDomain =
      article.publisherDomain ??
      (sourceUrl ? domainFromUrl(sourceUrl) : null);
    const attribution = article.publisherTitle ?? sourceDomain ?? null;

    return {
      quote: quoteText.trim(),
      quote_author: null,
      quote_attribution: attribution,
      quote_source_url: sourceUrl ?? null,
      quote_source_domain: sourceDomain,
    };
  }
  return null;
}

/**
 * Group flat MVP articles into Kite-shaped stories.
 * Shared `clusterId` → one story; null → one story per article.
 */
export function articlesToKiteStories(
  articles: Article[],
  options: {
    limit?: number;
    enrichments?:
      | Map<string, ClusterEnrichmentPayload>
      | Record<string, ClusterEnrichmentPayload>;
  } = {},
): KiteBriefStory[] {
  const limit = options.limit ?? 12;
  const enrichments = options.enrichments;
  const groups = new Map<string, Article[]>();
  const order: string[] = [];

  for (const article of articles) {
    const key = article.clusterId?.trim() || `solo:${article.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(article);
  }

  const stories: KiteBriefStory[] = [];
  let clusterNumber = 1;

  for (const key of order) {
    if (stories.length >= limit) break;
    const members = groups.get(key)!;
    members.sort((a, b) => {
      const ta = Date.parse(articleDate(a)) || 0;
      const tb = Date.parse(articleDate(b)) || 0;
      return tb - ta;
    });
    const primary = members[0]!;
    const quote = pickStoryQuote(members);
    const domains = storyDomains(members);
    const perspectives = storyPerspectives(members);
    const enrichment =
      enrichments instanceof Map
        ? enrichments.get(key)
        : enrichments
          ? enrichments[key]
          : undefined;
    const story: KiteBriefStory = {
      id: primary.clusterId?.trim() || primary.id,
      cluster_number: clusterNumber++,
      category: OWNED_CATEGORY_SLUG,
      title: primary.title,
      short_summary: shortSummary(primary),
      articles: members.map((m) => ({
        title: m.title,
        link: articleLink(m),
        domain: articleDomain(m),
        date: articleDate(m),
      })),
    };
    const enrichmentSummary = enrichment?.short_summary?.trim();
    if (enrichmentSummary) {
      story.short_summary = enrichmentSummary;
    }
    if (domains && domains.length > 0) {
      story.domains = domains;
    }
    if (perspectives && perspectives.length > 0) {
      story.perspectives = perspectives;
    }
    if (quote) {
      story.quote = quote.quote;
      story.quote_author = quote.quote_author;
      story.quote_attribution = quote.quote_attribution;
      story.quote_source_url = quote.quote_source_url;
      story.quote_source_domain = quote.quote_source_domain;
    }
    if (enrichment?.talking_points && enrichment.talking_points.length > 0) {
      story.talking_points = enrichment.talking_points;
    }
    if (enrichment?.timeline && enrichment.timeline.length > 0) {
      story.timeline = enrichment.timeline;
    }
    if (enrichment?.suggested_qna && enrichment.suggested_qna.length > 0) {
      story.suggested_qna = enrichment.suggested_qna;
    }
    stories.push(story);
  }

  return stories;
}

export function buildOwnedBatchInfo(
  articles: Article[],
  now: Date = new Date(),
): KiteBatchInfo {
  const createdAt = now.toISOString();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return {
    id: OWNED_BATCH_ID,
    createdAt,
    dateSlug: `${y}-${m}-${d}.1`,
    totalReadCount: articles.length,
  };
}

export function buildOwnedCategoriesResponse(
  articles: Article[],
  now: Date = new Date(),
): KiteBatchCategoriesResponse {
  const batch = buildOwnedBatchInfo(articles, now);
  const stories = articlesToKiteStories(articles);
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    batchId: batch.id,
    createdAt: batch.createdAt,
    hasOnThisDay: false,
    categories: [
      {
        id: OWNED_CATEGORY_UUID,
        categoryId: OWNED_CATEGORY_SLUG,
        categoryName: OWNED_CATEGORY_NAME,
        timestamp,
        readCount: articles.length,
        clusterCount: stories.length,
      },
    ],
  };
}

export function buildOwnedStoriesResponse(
  articles: Article[],
  categoryId: string,
  options: {
    limit?: number;
    now?: Date;
    enrichments?:
      | Map<string, ClusterEnrichmentPayload>
      | Record<string, ClusterEnrichmentPayload>;
  } = {},
): KiteBatchStoriesResponse | null {
  const known =
    categoryId === OWNED_CATEGORY_UUID ||
    categoryId === OWNED_CATEGORY_SLUG ||
    categoryId === 'latest';
  if (!known) return null;

  const now = options.now ?? new Date();
  const stories = articlesToKiteStories(articles, {
    limit: options.limit,
    enrichments: options.enrichments,
  });
  const domains = [
    ...new Set(stories.flatMap((s) => s.articles.map((a) => a.domain))),
  ].map((name) => ({ name }));

  return {
    batchId: OWNED_BATCH_ID,
    categoryId: OWNED_CATEGORY_UUID,
    categoryName: OWNED_CATEGORY_NAME,
    timestamp: Math.floor(now.getTime() / 1000),
    stories,
    totalStories: stories.length,
    domains,
    readCount: articles.length,
  };
}

/**
 * Resolve articles for the owned brief: live store, or fixture when empty.
 */
export function resolveOwnedBriefArticles(
  stored: Article[],
  now: Date = new Date(),
): { articles: Article[]; fromFixture: boolean } {
  if (stored.length > 0) {
    return { articles: stored, fromFixture: false };
  }
  return { articles: ownedBriefFixtureArticles(now), fromFixture: true };
}
