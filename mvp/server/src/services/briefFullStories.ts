/**
 * On-demand Brief full stories (NEWS-89). This deliberately has its own
 * persistence and limiter: full stories are keyed by the kept article id and
 * may include kept search rows, unlike the older Accept-path enrichment.
 */
import { createHash } from 'node:crypto';
import {
  putBriefFullStories,
  readBriefFullStories,
} from '../store/index.js';
import type { Article } from '../types/article.js';
import type {
  BriefFullStoryEnrichment,
  BriefFullStoryRecord,
  BriefFullStoriesStore,
} from '../types/briefFullStory.js';
import type { TopicSection } from '../types/topic.js';
import type { TriageRecord } from '../types/triage.js';
import {
  FULL_STORY_MEMBER_MAX,
  ON_DEMAND_FULL_STORY_MAX_PER_HOUR,
  SUMMARY_POST_MIN_CHARS,
} from './briefConfig.js';
import {
  enrichFullStory,
  type FullStoryMemberInput,
  type FullStoryRequestedSection,
} from './briefFullStoryEnrichment.js';
import {
  composeBriefFromInputs,
  loadBriefInputs,
  type BriefSummaryDeps,
  type OnDemandLimiter,
} from './briefSummaries.js';
import { pickStoryQuote, storyPerspectives } from './kiteBriefAdapter.js';
import { getOllamaClient, getOllamaModelName } from './ollamaFraming.js';

export type GenerateFullStoryResult =
  | { ok: true; record: BriefFullStoryRecord }
  | { ok: false; code: 'not_in_brief' | 'rate_limited' | 'error'; error: string };

export type BriefFullStoryDeps = BriefSummaryDeps & {
  readBriefFullStories?: () => Promise<BriefFullStoriesStore>;
  putBriefFullStories?: (records: BriefFullStoryRecord[]) => Promise<void>;
  enrich?: typeof enrichFullStory;
  modelName?: () => string;
  rateLimiter?: OnDemandLimiter;
};

const HOUR_MS = 60 * 60 * 1000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function articleLink(article: Article): string {
  return article.publisherUrl || article.canonicalUrl;
}

function articleDomain(article: Article): string {
  if (article.publisherDomain) return article.publisherDomain.replace(/^www\./, '');
  try {
    return new URL(articleLink(article)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isDuplicateMember(record: TriageRecord | undefined): boolean {
  return record?.status === 'dropped' && record.reason === 'duplicate';
}

/**
 * Keep this aligned with Topic Brief links: kept article first, then duplicate
 * members, with one link per domain. Full-story prompts have a smaller cap.
 */
function membersForStory(
  record: TriageRecord,
  articlesById: Map<string, Article>,
  triageRecords: Record<string, TriageRecord>,
): Article[] {
  const kept = articlesById.get(record.articleId);
  if (!kept) return [];
  const candidates = [
    kept,
    ...record.memberIds
      .filter((id) => isDuplicateMember(triageRecords[id]))
      .map((id) => articlesById.get(id))
      .filter((article): article is Article => article !== undefined),
  ];
  const domains = new Set<string>();
  const members: Article[] = [];
  for (const article of candidates) {
    const domain = articleDomain(article);
    if (domain && domains.has(domain)) continue;
    if (domain) domains.add(domain);
    members.push(article);
    if (members.length >= FULL_STORY_MEMBER_MAX) break;
  }
  return members;
}

function textForMember(article: Article): string | null {
  if (article.bodyStatus === 'ok') {
    return article.bodyText?.trim() || null;
  }
  const snippet = article.snippet?.trim() || '';
  return snippet.length >= SUMMARY_POST_MIN_CHARS ? snippet : null;
}

function inputForMembers(members: Article[]): FullStoryMemberInput[] {
  return members.flatMap((article) => {
    const bodyOrSnippet = textForMember(article);
    if (!bodyOrSnippet) return [];
    const framingSummary = article.classification?.framingSummary?.trim() || undefined;
    return [{
      title: article.title,
      publisherDomain: articleDomain(article),
      publishedAt: article.publishedAt ?? article.fetchedAt,
      bodyOrSnippet,
      ...(framingSummary ? { framingSummary } : {}),
    }];
  });
}

function requestedSections(sections: TopicSection[]): FullStoryRequestedSection[] {
  return sections.filter(
    (section): section is FullStoryRequestedSection => section !== 'map',
  );
}

export function sourceHashForMembers(
  members: FullStoryMemberInput[],
  sections: TopicSection[],
): string {
  const sources = members.map((member) =>
    [
      member.title,
      member.publisherDomain,
      member.publishedAt,
      member.bodyOrSnippet,
      member.framingSummary ?? '',
    ].join('\n'),
  );
  const keys = requestedSections(sections).sort();
  return createHash('sha256')
    .update(JSON.stringify({ sources, requestedSections: keys }))
    .digest('hex')
    .slice(0, 16);
}

function unavailableRecord(
  articleId: string,
  at: string,
  trigger: BriefFullStoryRecord['trigger'],
  topicSections: TopicSection[],
): BriefFullStoryRecord {
  return {
    articleId,
    status: 'unavailable',
    enrichment: null,
    deterministic: {},
    sourceHash: null,
    topicSections,
    model: null,
    error: null,
    generatedAt: at,
    trigger,
  };
}

function errorRecord(
  articleId: string,
  at: string,
  trigger: BriefFullStoryRecord['trigger'],
  topicSections: TopicSection[],
  sourceHash: string,
  error: string,
): BriefFullStoryRecord {
  return {
    articleId,
    status: 'error',
    enrichment: null,
    deterministic: {},
    sourceHash,
    topicSections,
    model: null,
    error,
    generatedAt: at,
    trigger,
  };
}

function timelineKey(event: { date: string; content: string }): string {
  return `${event.date}\n${event.content}`;
}

/**
 * Preserve prior dated events while allowing the latest AI output to replace
 * other generated prose. A changed record always carries a concise update cue.
 */
export function mergeLivingFullStory(
  prior: BriefFullStoryRecord,
  next: BriefFullStoryRecord,
): BriefFullStoryRecord {
  if (prior.status !== 'ok' || next.status !== 'ok' || !prior.enrichment || !next.enrichment) {
    return next;
  }
  const known = new Set(prior.enrichment.timeline.map(timelineKey));
  const additions = next.enrichment.timeline.filter((event) => !known.has(timelineKey(event)));
  const timeline = [...prior.enrichment.timeline, ...additions];
  const enrichment: BriefFullStoryEnrichment = {
    ...next.enrichment,
    timeline,
  };
  return {
    ...next,
    enrichment,
    deterministic: {
      perspectives: next.deterministic.perspectives ?? prior.deterministic.perspectives,
      quote: next.deterministic.quote ?? prior.deterministic.quote,
    },
    updatedAt: next.generatedAt,
    changeSummary: additions.length > 0
      ? `Updated story; timeline +${additions.length}`
      : 'Updated story with new source material',
    priorTimeline: prior.enrichment.timeline,
  };
}

/** Sliding one-hour window; separate from the summary limiter. */
export function createFullStoryOnDemandLimiter(
  maxPerHour: number = ON_DEMAND_FULL_STORY_MAX_PER_HOUR,
  now: () => number = Date.now,
): OnDemandLimiter {
  const stamps: number[] = [];
  return {
    tryAcquire(): boolean {
      const time = now();
      while (stamps.length > 0 && time - stamps[0]! >= HOUR_MS) stamps.shift();
      if (stamps.length >= maxPerHour) return false;
      stamps.push(time);
      return true;
    },
  };
}

const defaultLimiter = createFullStoryOnDemandLimiter();
const inFlight = new Map<string, Promise<GenerateFullStoryResult>>();

async function putSafely(
  deps: BriefFullStoryDeps,
  record: BriefFullStoryRecord,
): Promise<string | null> {
  try {
    await (deps.putBriefFullStories ?? putBriefFullStories)([record]);
    return null;
  } catch (err) {
    return errorMessage(err);
  }
}

async function generateFullStoryOnce(
  articleId: string,
  now: Date,
  options: { trigger?: 'on_demand' | 'refresh'; skipRateLimit?: boolean },
  deps: BriefFullStoryDeps,
): Promise<GenerateFullStoryResult> {
  const errors: string[] = [];
  const loaded = await loadBriefInputs(deps, true, errors);
  if (!loaded) return { ok: false, code: 'error', error: errors.join('; ') || 'Brief inputs unavailable' };

  const brief = composeBriefFromInputs(loaded, now);
  const located = brief.sections
    .flatMap((section) => section.stories.map((story) => ({ section, story })))
    .find(({ story }) => story.articleId === articleId);
  if (!located) {
    return { ok: false, code: 'not_in_brief', error: 'Story is not in the current Brief' };
  }

  const record = loaded.triage.records[articleId];
  if (!record) return { ok: false, code: 'not_in_brief', error: 'Story is not in the current Brief' };
  const trigger = options.trigger ?? 'on_demand';
  const at = now.toISOString();
  const topic = loaded.topics.find((candidate) => candidate.id === located.story.topicId);
  const sections = (topic?.sections ?? []).filter((section) => section !== 'map');
  const members = membersForStory(record, loaded.articlesById, loaded.triage.records);
  const inputs = inputForMembers(members);

  if (inputs.length === 0) {
    const unavailable = unavailableRecord(articleId, at, trigger, sections);
    const writeError = await putSafely(deps, unavailable);
    return writeError
      ? { ok: false, code: 'error', error: `full story write: ${writeError}` }
      : { ok: true, record: unavailable };
  }

  const sourceHash = sourceHashForMembers(inputs, sections);
  let store: BriefFullStoriesStore;
  try {
    store = await (deps.readBriefFullStories ?? readBriefFullStories)();
  } catch (err) {
    return { ok: false, code: 'error', error: `full stories: ${errorMessage(err)}` };
  }
  const prior = store.fullStories[articleId];
  if (prior?.status === 'ok' && prior.sourceHash === sourceHash) {
    return { ok: true, record: prior };
  }

  if (!(deps.ollamaAvailable ?? (() => getOllamaClient() !== null))()) {
    return { ok: false, code: 'error', error: 'Ollama not configured' };
  }
  if (
    trigger === 'on_demand' &&
    !options.skipRateLimit &&
    !(deps.rateLimiter ?? defaultLimiter).tryAcquire()
  ) {
    return {
      ok: false,
      code: 'rate_limited',
      error: `On-demand full story limit reached (${ON_DEMAND_FULL_STORY_MAX_PER_HOUR} per hour)`,
    };
  }

  try {
    const enrichment = await (deps.enrich ?? enrichFullStory)({
      members: inputs,
      requestedSections: requestedSections(sections),
    });
    const quote = pickStoryQuote(members);
    const next: BriefFullStoryRecord = {
      articleId,
      status: 'ok',
      enrichment,
      deterministic: {
        ...(storyPerspectives(members) ? { perspectives: storyPerspectives(members) } : {}),
        quote,
      },
      sourceHash,
      topicSections: sections,
      model: (deps.modelName ?? getOllamaModelName)(),
      error: null,
      generatedAt: at,
      trigger,
    };
    const merged = prior?.status === 'ok' ? mergeLivingFullStory(prior, next) : next;
    const writeError = await putSafely(deps, merged);
    return writeError
      ? { ok: false, code: 'error', error: `full story write: ${writeError}` }
      : { ok: true, record: merged };
  } catch (err) {
    const failed = errorRecord(articleId, at, trigger, sections, sourceHash, errorMessage(err));
    const writeError = await putSafely(deps, failed);
    return {
      ok: false,
      code: 'error',
      error: writeError ? `full story write: ${writeError}` : failed.error!,
    };
  }
}

/**
 * Generates a rich story for a currently visible Brief card. Concurrent
 * requests for one article share work and every failure is converted to a
 * result object.
 */
export function generateFullStory(
  articleId: string,
  options: { now?: Date; trigger?: 'on_demand' | 'refresh'; skipRateLimit?: boolean } = {},
  deps: BriefFullStoryDeps = {},
): Promise<GenerateFullStoryResult> {
  const existing = inFlight.get(articleId);
  if (existing) return existing;
  const promise = generateFullStoryOnce(articleId, options.now ?? new Date(), options, deps)
    .catch((err): GenerateFullStoryResult => ({
      ok: false,
      code: 'error',
      error: errorMessage(err),
    }))
    .finally(() => {
      inFlight.delete(articleId);
    });
  inFlight.set(articleId, promise);
  return promise;
}
