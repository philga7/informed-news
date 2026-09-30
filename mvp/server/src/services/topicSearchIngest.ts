import type { Article, ArticleCitation, StoreMeta } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import {
  SEARCH_PROVIDERS,
  type ProviderRunStatus,
  type SearchCandidate,
  type SearchProvider,
} from '../types/topicSearch.js';
import {
  getCachedGoogleNewsUrl,
  readArticles,
  readTopics,
  updateMeta,
  upsertArticles,
} from '../store/index.js';
import { searchGoogleNews } from './googleNewsRss.js';
import { resolveSearxngBaseUrl, searchSearxng } from './searxngSearch.js';
import { canonicalizeSearchUrl, normalizeTitleForMatch } from './searchUrl.js';
import {
  PROVIDER_ERRORS_MAX,
  TOPIC_SEARCH_CONCURRENCY,
  TOPIC_SEARCH_MAX_NEW_PER_TOPIC,
} from './topicSearchConfig.js';

export type TopicSearchTopicCounts = {
  found: number;
  merged: number;
  skippedSeen: number;
  new: number;
};

export type TopicSearchResult = {
  /** Disabled, topics unreadable, or no desired topics */
  skipped: boolean;
  providers: Record<SearchProvider, ProviderRunStatus>;
  /** Candidates across providers/topics (within window, pre-merge) */
  fetched: number;
  perTopic: Record<string, TopicSearchTopicCounts>;
  upserted: Article[];
  /** Run-level errors (e.g. topics or article store unreadable) */
  errors: string[];
};

export type TopicSearchDeps = {
  readTopics?: () => Promise<{ topics: Topic[] }>;
  readArticles?: () => Promise<Article[]>;
  upsertArticles?: typeof upsertArticles;
  updateMeta?: (patch: Partial<StoreMeta>) => Promise<unknown>;
  searchGoogleNews?: (query: string, options: { now: Date }) => Promise<SearchCandidate[]>;
  searchSearxng?: (
    query: string,
    options: { baseUrl: string; now: Date },
  ) => Promise<SearchCandidate[]>;
  getCachedGoogleNewsUrl?: (articleId: string) => Promise<string | null>;
};

/** One story after cross-provider merge within a topic. */
export type MergedCandidate = {
  canonicalUrl: string;
  publisherUrl: string | null;
  googleNewsUrl: string | null;
  title: string;
  publisherName: string | null;
  publisherDomain: string | null;
  publishedAt: string | null;
  snippet: string;
  providers: SearchProvider[];
};

type ArticleInput = Omit<Article, 'id'> & { id?: string };

const DISABLED_VALUES = new Set(['false', '0', 'off', 'no']);

export function isTopicSearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.TOPIC_SEARCH_ENABLED?.trim().toLowerCase();
  return raw === undefined || !DISABLED_VALUES.has(raw);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function providerStatus(
  state: ProviderRunStatus['state'],
  errors: string[] = [],
): ProviderRunStatus {
  return { state, topicsAttempted: 0, topicsFailed: 0, items: 0, errors };
}

function sameStory(a: SearchCandidate, b: SearchCandidate): boolean {
  if (a.publisherUrl && b.publisherUrl && a.publisherUrl === b.publisherUrl) return true;
  if (!a.publisherDomain || !b.publisherDomain || a.publisherDomain !== b.publisherDomain) {
    return false;
  }
  const title = normalizeTitleForMatch(a.title);
  return title !== '' && title === normalizeTitleForMatch(b.title);
}

function mergeGroup(members: SearchCandidate[]): MergedCandidate | null {
  const google = members.find((m) => m.provider === 'google_news');
  const searxng = members.find((m) => m.provider === 'searxng');
  const publisherUrl =
    members.find((m) => m.provider === 'searxng' && m.publisherUrl)?.publisherUrl ??
    members.find((m) => m.publisherUrl)?.publisherUrl ??
    null;
  const googleNewsUrl =
    members.find((m) => m.provider === 'google_news' && m.googleNewsUrl)?.googleNewsUrl ?? null;
  const canonicalUrl = publisherUrl ?? googleNewsUrl;
  if (!canonicalUrl) return null;

  return {
    canonicalUrl,
    publisherUrl,
    googleNewsUrl,
    title: (searxng ?? google ?? members[0]!).title,
    publisherName: google?.publisherName ?? null,
    publisherDomain: members.find((m) => m.publisherDomain)?.publisherDomain ?? null,
    publishedAt: google?.publishedAt ?? searxng?.publishedAt ?? null,
    snippet: members.find((m) => m.snippet)?.snippet ?? '',
    providers: SEARCH_PROVIDERS.filter((p) => members.some((m) => m.provider === p)),
  };
}

/**
 * Group one topic's candidates into stories: same publisher URL, or same
 * publisher domain + normalized title. Candidates with no URL are dropped.
 */
export function mergeCandidates(candidates: SearchCandidate[]): MergedCandidate[] {
  const groups: SearchCandidate[][] = [];
  for (const candidate of candidates) {
    const matching = groups.filter((g) => g.some((m) => sameStory(m, candidate)));
    if (matching.length === 0) {
      groups.push([candidate]);
      continue;
    }
    const [target, ...rest] = matching;
    target!.push(...rest.flat(), candidate);
    for (const group of rest) groups.splice(groups.indexOf(group), 1);
  }
  return groups.map(mergeGroup).filter((m): m is MergedCandidate => m !== null);
}

function seenKey(url: string): string {
  return canonicalizeSearchUrl(url) ?? url;
}

/** Canonicalized canonical / publisher / Google URLs of every stored article. */
export function buildSeenKeys(articles: Article[]): Set<string> {
  const seen = new Set<string>();
  for (const article of articles) {
    for (const url of [article.canonicalUrl, article.publisherUrl, article.googleNewsUrl]) {
      if (url) seen.add(seenKey(url));
    }
  }
  return seen;
}

/** Drop already-stored stories, then keep the newest `max` (undated last). */
export function selectNewForTopic(
  merged: MergedCandidate[],
  seen: Set<string>,
  max: number,
): { selected: MergedCandidate[]; skippedSeen: number } {
  const isSeen = (url: string | null): boolean => url !== null && seen.has(seenKey(url));
  const fresh = merged.filter(
    (m) => !isSeen(m.canonicalUrl) && !isSeen(m.publisherUrl) && !isSeen(m.googleNewsUrl),
  );
  const publishedMs = (m: MergedCandidate): number =>
    m.publishedAt === null ? Number.NaN : Date.parse(m.publishedAt);
  const byNewest = (a: MergedCandidate, b: MergedCandidate): number => {
    const aMs = publishedMs(a);
    const bMs = publishedMs(b);
    if (Number.isNaN(aMs)) return Number.isNaN(bMs) ? 0 : 1;
    if (Number.isNaN(bMs)) return -1;
    return bMs - aMs;
  };
  return {
    selected: [...fresh].sort(byNewest).slice(0, max),
    skippedSeen: merged.length - fresh.length,
  };
}

export function toArticleInput(
  merged: MergedCandidate,
  topicIds: string[],
  fetchedAt: string,
): ArticleInput {
  const citations: ArticleCitation[] = [
    {
      label: merged.publisherName ?? merged.publisherDomain ?? 'Publisher',
      url: merged.publisherUrl ?? merged.canonicalUrl,
    },
  ];
  if (merged.googleNewsUrl && merged.googleNewsUrl !== citations[0]!.url) {
    citations.push({ label: 'Google News', url: merged.googleNewsUrl });
  }

  return {
    title: merged.title,
    sourceKind: 'search',
    sourceTier: 'sensor',
    canonicalUrl: merged.canonicalUrl,
    citations,
    publisherUrl: merged.publisherUrl,
    publisherDomain: merged.publisherDomain,
    handle: null,
    publishedAt: merged.publishedAt,
    snippet: merged.snippet,
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt,
    classification: null,
    classifiedAt: null,
    classifyError: null,
    topicIds,
    searchProviders: merged.providers,
    googleNewsUrl: merged.googleNewsUrl,
  };
}

type CombinedStory = { merged: MergedCandidate; topicIds: string[]; keys: Set<string> };

function storyKeys(story: MergedCandidate): string[] {
  return [story.canonicalUrl, story.publisherUrl, story.googleNewsUrl].filter(
    (url): url is string => url !== null,
  );
}

/** Two copies of one story; the copy with a direct publisher URL supplies the identity. */
function combineStories(a: MergedCandidate, b: MergedCandidate): MergedCandidate {
  const [primary, other] = !a.publisherUrl && b.publisherUrl ? [b, a] : [a, b];
  return {
    ...primary,
    googleNewsUrl: primary.googleNewsUrl ?? other.googleNewsUrl,
    publisherName: primary.publisherName ?? other.publisherName,
    publisherDomain: primary.publisherDomain ?? other.publisherDomain,
    publishedAt: primary.publishedAt ?? other.publishedAt,
    snippet: primary.snippet || other.snippet,
    providers: SEARCH_PROVIDERS.filter(
      (p) => primary.providers.includes(p) || other.providers.includes(p),
    ),
  };
}

/**
 * One entry per story across topics: stories sharing any canonical, publisher,
 * or Google URL join (transitively). `topicIds` follow `topicOrder`.
 */
function combineAcrossTopics(
  selectedByTopic: Array<{ topicId: string; selected: MergedCandidate[] }>,
  topicOrder: string[],
): CombinedStory[] {
  let entries: CombinedStory[] = [];

  for (const { topicId, selected } of selectedByTopic) {
    for (const story of selected) {
      const keys = storyKeys(story);
      const matches = entries.filter((e) => keys.some((key) => e.keys.has(key)));
      const target = matches[0];
      if (!target) {
        entries.push({ merged: story, topicIds: [topicId], keys: new Set(keys) });
        continue;
      }
      for (const absorbed of matches.slice(1)) {
        target.merged = combineStories(target.merged, absorbed.merged);
        target.topicIds.push(...absorbed.topicIds);
        absorbed.keys.forEach((key) => target.keys.add(key));
      }
      entries = entries.filter((e) => !matches.includes(e) || e === target);
      target.merged = combineStories(target.merged, story);
      keys.forEach((key) => target.keys.add(key));
      const topicIds = new Set([...target.topicIds, topicId]);
      target.topicIds = topicOrder.filter((id) => topicIds.has(id));
    }
  }
  return entries;
}

type ProviderRun = (query: string) => Promise<SearchCandidate[]>;

type TopicOutcome = {
  settled: Partial<Record<SearchProvider, PromiseSettledResult<SearchCandidate[]>>>;
  candidates: SearchCandidate[];
};

async function withCachedPublisherUrls(
  candidates: SearchCandidate[],
  lookup: (articleId: string) => Promise<string | null>,
): Promise<SearchCandidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.provider !== 'google_news' || !candidate.googleArticleId) return candidate;
      const hit = await lookup(candidate.googleArticleId).catch(() => null);
      const publisherUrl = hit ? canonicalizeSearchUrl(hit) : null;
      return publisherUrl ? { ...candidate, publisherUrl } : candidate;
    }),
  );
}

async function searchTopic(
  topic: Topic,
  runs: Partial<Record<SearchProvider, ProviderRun>>,
  lookup: (articleId: string) => Promise<string | null>,
): Promise<TopicOutcome> {
  const query = topic.searchQuery.trim() || topic.name;
  const enabled = SEARCH_PROVIDERS.filter((p) => runs[p]);
  const results = await Promise.allSettled(enabled.map((p) => runs[p]!(query)));

  const settled: TopicOutcome['settled'] = {};
  const found: SearchCandidate[] = [];
  enabled.forEach((provider, i) => {
    const result = results[i]!;
    settled[provider] = result;
    if (result.status === 'fulfilled') found.push(...result.value);
  });
  return { settled, candidates: await withCachedPublisherUrls(found, lookup) };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function finalizeState(status: ProviderRunStatus): void {
  if (status.state === 'disabled') return;
  if (status.topicsAttempted > 0 && status.topicsFailed === status.topicsAttempted) {
    status.state = 'down';
  } else if (status.topicsFailed > 0) {
    status.state = 'partial';
  } else {
    status.state = 'ok';
  }
}

/**
 * Search every desired topic on Google News RSS + SearXNG, merge and dedupe
 * against the store, and upsert new stories as `search` articles. Provider
 * failures are recorded per topic; this never throws. Writes `meta.topicSearch`.
 */
export async function runTopicSearch(
  options: { now?: Date; env?: NodeJS.ProcessEnv } = {},
  deps: TopicSearchDeps = {},
): Promise<TopicSearchResult> {
  const now = options.now ?? new Date();
  const env = options.env ?? process.env;
  const writeMeta = deps.updateMeta ?? updateMeta;
  const enabled = isTopicSearchEnabled(env);
  const searxngBaseUrl = resolveSearxngBaseUrl(env);

  const result: TopicSearchResult = {
    skipped: false,
    providers: {
      google_news: providerStatus(enabled ? 'ok' : 'disabled'),
      searxng: providerStatus(enabled && searxngBaseUrl ? 'ok' : 'disabled'),
    },
    fetched: 0,
    perTopic: {},
    upserted: [],
    errors: [],
  };

  const finish = async (): Promise<TopicSearchResult> => {
    try {
      await writeMeta({ topicSearch: { at: now.toISOString(), providers: result.providers } });
    } catch (err) {
      console.error('Topic search meta write failed:', errorMessage(err));
    }
    return result;
  };

  if (!enabled) {
    result.skipped = true;
    return finish();
  }

  let topics: Topic[];
  try {
    topics = (await (deps.readTopics ?? readTopics)()).topics.filter((t) => t.kind === 'desired');
  } catch (err) {
    const message = errorMessage(err);
    result.skipped = true;
    result.errors.push(message);
    for (const status of Object.values(result.providers)) {
      if (status.state !== 'disabled') Object.assign(status, providerStatus('down', [message]));
    }
    return finish();
  }
  if (topics.length === 0) {
    result.skipped = true;
    return finish();
  }

  const googleSearch = deps.searchGoogleNews ?? searchGoogleNews;
  const searxngSearch = deps.searchSearxng ?? searchSearxng;
  const runs: Partial<Record<SearchProvider, ProviderRun>> = {
    google_news: (query) => googleSearch(query, { now }),
  };
  if (searxngBaseUrl) {
    runs.searxng = (query) => searxngSearch(query, { baseUrl: searxngBaseUrl, now });
  }
  const lookup = deps.getCachedGoogleNewsUrl ?? ((id: string) => getCachedGoogleNewsUrl(id));

  const outcomes = await mapWithConcurrency(topics, TOPIC_SEARCH_CONCURRENCY, (topic) =>
    searchTopic(topic, runs, lookup),
  );

  const mergedByTopic = outcomes.map((outcome, i) => {
    const topic = topics[i]!;
    for (const [provider, settled] of Object.entries(outcome.settled) as Array<
      [SearchProvider, PromiseSettledResult<SearchCandidate[]>]
    >) {
      const status = result.providers[provider];
      status.topicsAttempted += 1;
      if (settled.status === 'fulfilled') {
        status.items += settled.value.length;
      } else {
        status.topicsFailed += 1;
        if (status.errors.length < PROVIDER_ERRORS_MAX) {
          status.errors.push(`${topic.id}: ${errorMessage(settled.reason)}`);
        }
      }
    }
    result.fetched += outcome.candidates.length;
    return mergeCandidates(outcome.candidates);
  });
  for (const status of Object.values(result.providers)) finalizeState(status);

  try {
    const seen = buildSeenKeys(await (deps.readArticles ?? readArticles)());
    const selectedByTopic = mergedByTopic.map((merged, i) => {
      const topic = topics[i]!;
      const { selected, skippedSeen } = selectNewForTopic(
        merged,
        seen,
        TOPIC_SEARCH_MAX_NEW_PER_TOPIC,
      );
      result.perTopic[topic.id] = {
        found: outcomes[i]!.candidates.length,
        merged: merged.length,
        skippedSeen,
        new: selected.length,
      };
      return { topicId: topic.id, selected };
    });
    const combined = combineAcrossTopics(
      selectedByTopic,
      topics.map((t) => t.id),
    );

    const fetchedAt = now.toISOString();
    const inputs = combined.map(({ merged, topicIds }) =>
      toArticleInput(merged, topicIds, fetchedAt),
    );
    if (inputs.length > 0) {
      result.upserted = await (deps.upsertArticles ?? upsertArticles)(inputs);
    }
  } catch (err) {
    result.errors.push(errorMessage(err));
  }

  return finish();
}
