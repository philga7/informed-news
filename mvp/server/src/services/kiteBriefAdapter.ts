import type { Article, StoreMeta } from '../types/article.js';
import type { RefreshRun } from '../types/brief.js';
import type { ClusterEnrichmentPayload } from '../types/clusterEnrichment.js';
import type { BriefFullStoryRecord } from '../types/briefFullStory.js';
import type { TriageLabel } from '../types/triage.js';
import type { MuteRule } from '../store/muteRulesStore.js';
import { briefClusterKey } from './briefClusterKey.js';
import { clusterMatchesMute } from './muteMatch.js';
import {
  buildRefreshNotices,
  type BriefStory,
  type BriefSummaryStatus,
  type BriefTopicRef,
  type TopicBrief,
} from './topicBrief.js';
import { isHostnameLike, normalizeOutletDomain } from './triageKeywords.js';

/** Stable batch id for the live owned brief (not a Kagi UUID). */
export const OWNED_BATCH_ID = 'owned-latest';

/** Fixed category UUID so stories routes stay stable across reloads. */
export const OWNED_CATEGORY_UUID = '00000000-0000-4000-8000-000000000001';

/**
 * Use slug `world` so Kite’s default `/world/latest` route (and its
 * default-enabled categories) shows owned stories. One category: the topic Brief.
 */
export const OWNED_CATEGORY_SLUG = 'world';
export const OWNED_CATEGORY_NAME = 'Brief';

/** Distinctive fixture title for empty-store / Playwright smoke. */
export const OWNED_FIXTURE_TITLE =
  'Owned brief fixture — CFP sample (replace via POST /api/fetch)';

export type KiteBriefArticle = {
  title: string;
  link: string;
  domain: string;
  date: string;
  image?: string;
};

export type KiteBriefPrimaryImage = {
  url: string;
  caption: string;
  credit?: string;
  link?: string;
};

export type KiteBriefStory = {
  id: string;
  /** Brief membership / Unaccept key (`briefClusterKey`); may differ from `id` for solos. */
  membership_key: string;
  cluster_number: number;
  category: string;
  title: string;
  short_summary: string;
  articles: KiteBriefArticle[];
  primary_image?: KiteBriefPrimaryImage;
  domains?: Array<{ name: string }>;
  quote?: string;
  quote_author?: string | null;
  quote_attribution?: string | null;
  quote_source_url?: string | null;
  quote_source_domain?: string | null;
  talking_points?: string[];
  timeline?: Array<{ date: string; content: string; date_iso?: string }>;
  suggested_qna?: Array<{ question: string; answer: string }>;
  business_angle_text?: string;
  business_angle_points?: string[];
  technical_details?: string[];
  user_action_items?: string[];
  historical_background?: string;
  perspectives?: Array<{
    text: string;
    sources: Array<{ name: string; url: string }>;
  }>;
  /** Informed News topic Brief glue (NEWS-88) */
  informed_article_id?: string;
  informed_topic_id?: string;
  informed_topic_name?: string;
  informed_more?: boolean;
  informed_outlet_count?: number;
  informed_labels?: TriageLabel[];
  informed_summary_status?: BriefSummaryStatus;
  /** Full-story cache state; missing means it has never been requested. */
  informed_full_story_status?: 'missing' | 'ok' | 'unavailable' | 'error';
  /** Plain-language living-update note, when the cached full story changed. */
  informed_full_story_updated?: string;
  /** Kept article's normalized publisher domain ("Less like this" outlet block, NEWS-90). */
  informed_publisher_domain?: string;
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
      imageUrl: 'https://picsum.photos/seed/owned-brief-fixture/800/450',
      imageCaption:
        'Owned brief fixture image — stable placeholder for smoke tests.',
      imageCredit: 'picsum.photos',
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

const MANUAL_SEED_EMPTY_NOTE_SUMMARY =
  'Operator-seeded story — no publisher body yet.';

function shortSummary(article: Article): string {
  if (article.sourceKind === 'manual') {
    const snippet = article.snippet?.trim();
    if (snippet) return snippet;
    return MANUAL_SEED_EMPTY_NOTE_SUMMARY;
  }
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

export type StoryPerspective = {
  text: string;
  sources: Array<{ name: string; url: string }>;
};

export function storyPerspectives(
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

function pickStoryPrimaryImage(
  members: Article[],
): KiteBriefPrimaryImage | undefined {
  for (const member of members) {
    const url = member.imageUrl?.trim();
    if (!url) continue;

    const caption =
      member.imageCaption?.trim() ||
      member.publisherTitle?.trim() ||
      member.title?.trim() ||
      '';
    const credit =
      member.imageCredit?.trim() || member.publisherDomain || undefined;
    const link = member.publisherUrl || member.canonicalUrl;

    return {
      url,
      caption,
      credit,
      link,
    };
  }
  return undefined;
}

export type StoryQuoteFields = {
  quote: string;
  quote_author: string | null;
  quote_attribution: string | null;
  quote_source_url: string | null;
  quote_source_domain: string | null;
};

export function pickStoryQuote(members: Article[]): StoryQuoteFields | null {
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
    const key = briefClusterKey(article);
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
    const primaryImage = pickStoryPrimaryImage(members);
    const enrichment =
      enrichments instanceof Map
        ? enrichments.get(key)
        : enrichments
          ? enrichments[key]
          : undefined;
    const story: KiteBriefStory = {
      // Keep `id` as clusterId or bare article id for client read-state continuity.
      id: primary.clusterId?.trim() || primary.id,
      membership_key: key,
      cluster_number: clusterNumber++,
      category: OWNED_CATEGORY_NAME,
      title: primary.title,
      short_summary: shortSummary(primary),
      articles: members.map((m) => ({
        title: m.title,
        link: articleLink(m),
        domain: articleDomain(m),
        date: articleDate(m),
        ...(m.imageUrl?.trim()
          ? { image: m.imageUrl.trim() }
          : {}),
      })),
    };
    if (primaryImage) {
      story.primary_image = primaryImage;
    }
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
  return ownedBatchInfo(articles.length, now);
}

function ownedBatchInfo(totalReadCount: number, now: Date): KiteBatchInfo {
  const createdAt = now.toISOString();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return {
    id: OWNED_BATCH_ID,
    createdAt,
    dateSlug: `${y}-${m}-${d}.1`,
    totalReadCount,
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

function isOwnedCategoryId(categoryId: string): boolean {
  return (
    categoryId === OWNED_CATEGORY_UUID ||
    categoryId === OWNED_CATEGORY_SLUG ||
    categoryId === 'latest'
  );
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
  if (!isOwnedCategoryId(categoryId)) return null;

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

export type KiteCategoryMetadataResponse = {
  categories: Array<{
    categoryId: string;
    categoryType: 'core' | 'community';
    isCore: boolean;
    displayName: string;
  }>;
};

/** Kite `/api/categories/metadata`: the single owned Brief category. */
export function buildOwnedCategoryMetadata(): KiteCategoryMetadataResponse {
  return {
    categories: [
      {
        categoryId: OWNED_CATEGORY_SLUG,
        categoryType: 'core',
        isCore: true,
        displayName: OWNED_CATEGORY_NAME,
      },
    ],
  };
}

/**
 * Keep articles whose Brief cluster key is in the accepted membership set.
 */
export function filterArticlesForBrief(
  articles: Article[],
  acceptedClusterIds: string[],
): Article[] {
  const accepted = new Set(acceptedClusterIds);
  return articles.filter((article) => accepted.has(briefClusterKey(article)));
}

function filterMutedClustersForBrief(
  articles: Article[],
  rules: ReadonlyArray<MuteRule>,
): Article[] {
  if (rules.length === 0 || articles.length === 0) return articles;

  const groups = new Map<string, Article[]>();
  const order: string[] = [];

  for (const article of articles) {
    const key = briefClusterKey(article);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(article);
  }

  const filtered: Article[] = [];
  for (const key of order) {
    const members = groups.get(key)!;
    if (clusterMatchesMute({ articles: members }, rules)) {
      continue;
    }
    filtered.push(...members);
  }

  return filtered;
}

/**
 * Resolve articles for the owned brief: fixture when the store is empty;
 * otherwise filter to accepted cluster keys only (empty accepted → []).
 * The default Kite path only takes the fixture branch: a non-empty store
 * serves the topic Brief (NEWS-88).
 */
export function resolveOwnedBriefArticles(
  stored: Article[],
  acceptedClusterIds: string[] = [],
  now: Date = new Date(),
  muteRules: Iterable<MuteRule> = [],
): { articles: Article[]; fromFixture: boolean } {
  const rules = [...muteRules];
  if (stored.length > 0) {
    const accepted = filterArticlesForBrief(stored, acceptedClusterIds);
    return {
      articles: filterMutedClustersForBrief(accepted, rules),
      fromFixture: false,
    };
  }
  const fixture = ownedBriefFixtureArticles(now);
  return {
    articles: filterMutedClustersForBrief(fixture, rules),
    fromFixture: true,
  };
}

function topicStoryToKite(
  story: BriefStory,
  topic: BriefTopicRef,
  clusterNumber: number,
  fullStory?: BriefFullStoryRecord,
): KiteBriefStory {
  const articles: KiteBriefArticle[] = story.links.map((link) => ({
    title: link.title,
    link: link.url,
    domain: link.domain ?? domainFromUrl(link.url),
    date: link.publishedAt ?? link.fetchedAt,
  }));
  const domains = [...new Set(articles.map((a) => a.domain))];
  const kite: KiteBriefStory = {
    id: story.articleId,
    membership_key: story.articleId,
    cluster_number: clusterNumber,
    category: OWNED_CATEGORY_SLUG,
    title: story.title,
    short_summary: story.summary.status === 'ok' ? (story.summary.text ?? '') : '',
    articles,
    informed_article_id: story.articleId,
    informed_topic_id: topic.id,
    informed_topic_name: topic.name,
    informed_more: story.more,
    informed_outlet_count: story.outletCount,
    informed_labels: [...story.labels],
    informed_summary_status: story.summary.status,
    informed_full_story_status: fullStory?.status ?? 'missing',
  };
  if (domains.length > 0) {
    kite.domains = domains.map((name) => ({ name }));
  }
  const publisherDomain = normalizeOutletDomain(story.publisherDomain);
  if (publisherDomain && isHostnameLike(publisherDomain)) {
    kite.informed_publisher_domain = publisherDomain;
  }
  const imageUrl = story.imageUrl?.trim();
  if (imageUrl) {
    kite.primary_image = {
      url: imageUrl,
      caption: story.imageCaption?.trim() || story.title,
      credit: story.imageCredit?.trim() || story.domain || undefined,
      link: story.link,
    };
  }
  if (fullStory?.changeSummary) {
    kite.informed_full_story_updated = fullStory.changeSummary;
  }
  if (fullStory?.status === 'ok') {
    const enrichment = fullStory.enrichment;
    if (enrichment) {
      kite.talking_points = enrichment.talking_points;
      kite.timeline = enrichment.timeline;
      kite.suggested_qna = enrichment.suggested_qna;
      if (enrichment.business_angle_text) kite.business_angle_text = enrichment.business_angle_text;
      if (enrichment.business_angle_points) kite.business_angle_points = enrichment.business_angle_points;
      if (enrichment.technical_details) kite.technical_details = enrichment.technical_details;
      if (enrichment.user_action_items) kite.user_action_items = enrichment.user_action_items;
      if (enrichment.historical_background) kite.historical_background = enrichment.historical_background;
    }
    if (fullStory.deterministic.perspectives) {
      kite.perspectives = fullStory.deterministic.perspectives;
    }
    if (fullStory.deterministic.quote) {
      Object.assign(kite, fullStory.deterministic.quote);
    }
  }
  return kite;
}

/** Topic Brief stories in Brief order (sections in order, ranked within each). */
export function topicBriefToKiteStories(
  brief: TopicBrief,
  fullStories: Readonly<Record<string, BriefFullStoryRecord>> = {},
): KiteBriefStory[] {
  return brief.sections
    .flatMap((section) => section.stories.map((story) => ({ topic: section.topic, story })))
    .map(({ topic, story }, index) =>
      topicStoryToKite(story, topic, index + 1, fullStories[story.articleId]),
    );
}

function topicBriefStoryCount(brief: TopicBrief): number {
  return brief.sections.reduce((n, section) => n + section.stories.length, 0);
}

/** Unix seconds of the last successful refresh; `now` when there is none. */
function refreshTimestamp(lastSuccess: RefreshRun | null | undefined, now: Date): number {
  const completed = lastSuccess ? Date.parse(lastSuccess.completedAt) : Number.NaN;
  return Math.floor((Number.isNaN(completed) ? now.getTime() : completed) / 1000);
}

export type TopicBriefResponseOptions = {
  now?: Date;
  lastSuccess?: RefreshRun | null;
  fullStories?: Readonly<Record<string, BriefFullStoryRecord>>;
};

export function buildTopicBriefBatchInfo(
  brief: TopicBrief,
  now: Date = new Date(),
): KiteBatchInfo {
  return ownedBatchInfo(topicBriefStoryCount(brief), now);
}

export function buildTopicBriefCategoriesResponse(
  brief: TopicBrief,
  options: TopicBriefResponseOptions = {},
): KiteBatchCategoriesResponse {
  const now = options.now ?? new Date();
  const count = topicBriefStoryCount(brief);
  return {
    batchId: OWNED_BATCH_ID,
    createdAt: now.toISOString(),
    hasOnThisDay: false,
    categories: [
      {
        id: OWNED_CATEGORY_UUID,
        categoryId: OWNED_CATEGORY_SLUG,
        categoryName: OWNED_CATEGORY_NAME,
        timestamp: refreshTimestamp(options.lastSuccess, now),
        readCount: count,
        clusterCount: count,
      },
    ],
  };
}

/** Every visible story in Brief order; Kite's `limit` does not apply to the topic Brief. */
export function buildTopicBriefStoriesResponse(
  brief: TopicBrief,
  categoryId: string,
  options: TopicBriefResponseOptions = {},
): KiteBatchStoriesResponse | null {
  if (!isOwnedCategoryId(categoryId)) return null;
  const now = options.now ?? new Date();
  const stories = topicBriefToKiteStories(brief, options.fullStories);
  const domains = [
    ...new Set(stories.flatMap((s) => s.articles.map((a) => a.domain))),
  ].map((name) => ({ name }));
  return {
    batchId: OWNED_BATCH_ID,
    categoryId: OWNED_CATEGORY_UUID,
    categoryName: OWNED_CATEGORY_NAME,
    timestamp: refreshTimestamp(options.lastSuccess, now),
    stories,
    totalStories: stories.length,
    domains,
    readCount: stories.length,
  };
}

export type BriefOverview = {
  ok: true;
  /** Empty article store: Kite renders the fixture stories as before */
  fixture: boolean;
  refresh: {
    last: RefreshRun | null;
    lastSuccess: RefreshRun | null;
    /** ISO; null when auto-refresh is disabled or nothing has succeeded yet */
    nextAt: string | null;
    intervalHours: number | null;
    running: boolean;
  };
  notices: string[];
  sections: Array<{
    topicId: string;
    name: string;
    level: BriefTopicRef['level'];
    storyIds: string[];
    moreIds: string[];
  }>;
  quiet: BriefTopicRef[];
  /** Dropped by the last triage run; null when none ran or it was skipped */
  filteredOut: number | null;
};

function nextRefreshAt(
  lastSuccess: RefreshRun | null,
  intervalHours: number | null,
): string | null {
  if (!lastSuccess || intervalHours === null) return null;
  const completed = Date.parse(lastSuccess.completedAt);
  if (Number.isNaN(completed)) return null;
  return new Date(completed + intervalHours * 60 * 60 * 1000).toISOString();
}

/** Brief stores that may be unreadable without failing the Brief (read as empty). */
export type BriefDegradedStore = 'seen' | 'summaries' | 'fullStories';

const DEGRADED_NOTICES: Record<BriefDegradedStore, string> = {
  seen: 'Read history unavailable (brief-seen.json unreadable)',
  summaries: 'Saved summaries unavailable (brief-summaries.json unreadable)',
  fullStories: 'Saved full stories unavailable (brief-full-stories.json unreadable)',
};

/** `brief: null` = fixture (empty article store): no sections or quiet line. */
export function buildBriefOverview(input: {
  brief: TopicBrief | null;
  meta: StoreMeta;
  intervalHours: number | null;
  running: boolean;
  degraded?: readonly BriefDegradedStore[];
}): BriefOverview {
  const last = input.meta.refresh?.last ?? null;
  const lastSuccess = input.meta.refresh?.lastSuccess ?? null;
  const triage = input.meta.triage ?? null;
  const notices = [
    ...buildRefreshNotices(input.meta),
    ...(input.degraded ?? []).map((store) => DEGRADED_NOTICES[store]),
  ];
  return {
    ok: true,
    fixture: input.brief === null,
    refresh: {
      last,
      lastSuccess,
      nextAt: nextRefreshAt(lastSuccess, input.intervalHours),
      intervalHours: input.intervalHours,
      running: input.running,
    },
    notices,
    sections: (input.brief?.sections ?? []).map((section) => ({
      topicId: section.topic.id,
      name: section.topic.name,
      level: section.topic.level,
      storyIds: section.stories.filter((s) => !s.more).map((s) => s.articleId),
      moreIds: section.stories.filter((s) => s.more).map((s) => s.articleId),
    })),
    quiet: [...(input.brief?.quiet ?? [])],
    filteredOut: triage && !triage.skipped ? triage.dropped : null,
  };
}
