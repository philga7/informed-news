import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BriefFullStoryDeterministic,
  BriefFullStoryEnrichment,
  BriefFullStoryPerspective,
  BriefFullStoryQuote,
  BriefFullStoryRecord,
  BriefFullStoriesStore,
  FullStoryStatus,
  FullStoryTrigger,
} from '../types/briefFullStory.js';
import type { EnrichmentQnA, EnrichmentTimelineEvent } from '../types/clusterEnrichment.js';
import { TOPIC_SECTIONS, type TopicSection } from '../types/topic.js';
import { BRIEF_FULL_STORIES_PATH } from './paths.js';

const STATUSES: ReadonlySet<string> = new Set<FullStoryStatus>(['ok', 'unavailable', 'error']);
const TRIGGERS: ReadonlySet<string> = new Set<FullStoryTrigger>(['refresh', 'on_demand']);
const TOPIC_SECTION_SET: ReadonlySet<string> = new Set<string>(TOPIC_SECTIONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeTimeline(raw: unknown): EnrichmentTimelineEvent[] | null {
  if (!Array.isArray(raw)) return null;
  const events: EnrichmentTimelineEvent[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.date !== 'string' || typeof item.content !== 'string') continue;
    const event: EnrichmentTimelineEvent = { date: item.date, content: item.content };
    if (typeof item.date_iso === 'string') event.date_iso = item.date_iso;
    events.push(event);
  }
  return events;
}

function normalizeQna(raw: unknown): EnrichmentQnA[] | null {
  if (!Array.isArray(raw)) return null;
  const items: EnrichmentQnA[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.question !== 'string' || typeof item.answer !== 'string') continue;
    items.push({ question: item.question, answer: item.answer });
  }
  return items;
}

function normalizeEnrichment(raw: unknown): BriefFullStoryEnrichment | null {
  if (!isRecord(raw)) return null;
  const talking_points = isStringArray(raw.talking_points) ? raw.talking_points : null;
  const timeline = normalizeTimeline(raw.timeline);
  const suggested_qna = normalizeQna(raw.suggested_qna);
  if (!talking_points || !timeline || !suggested_qna) return null;

  const enrichment: BriefFullStoryEnrichment = {
    talking_points,
    timeline,
    suggested_qna,
  };
  if (typeof raw.business_angle_text === 'string') {
    enrichment.business_angle_text = raw.business_angle_text;
  }
  if (isStringArray(raw.business_angle_points)) {
    enrichment.business_angle_points = raw.business_angle_points;
  }
  if (isStringArray(raw.technical_details)) {
    enrichment.technical_details = raw.technical_details;
  }
  if (isStringArray(raw.user_action_items)) {
    enrichment.user_action_items = raw.user_action_items;
  }
  if (typeof raw.historical_background === 'string') {
    enrichment.historical_background = raw.historical_background;
  }
  return enrichment;
}

function normalizePerspective(raw: unknown): BriefFullStoryPerspective | null {
  if (!isRecord(raw) || typeof raw.text !== 'string') return null;
  if (!Array.isArray(raw.sources)) return null;
  const sources: Array<{ name: string; url: string }> = [];
  for (const source of raw.sources) {
    if (!isRecord(source)) continue;
    if (typeof source.name !== 'string' || typeof source.url !== 'string') continue;
    sources.push({ name: source.name, url: source.url });
  }
  return { text: raw.text, sources };
}

function normalizeQuote(raw: unknown): BriefFullStoryQuote | null {
  if (!isRecord(raw) || typeof raw.quote !== 'string') return null;
  if (
    !isStringOrNull(raw.quote_author) ||
    !isStringOrNull(raw.quote_attribution) ||
    !isStringOrNull(raw.quote_source_url) ||
    !isStringOrNull(raw.quote_source_domain)
  ) {
    return null;
  }
  return {
    quote: raw.quote,
    quote_author: raw.quote_author,
    quote_attribution: raw.quote_attribution,
    quote_source_url: raw.quote_source_url,
    quote_source_domain: raw.quote_source_domain,
  };
}

function normalizeDeterministic(raw: unknown): BriefFullStoryDeterministic {
  if (!isRecord(raw)) return {};
  const deterministic: BriefFullStoryDeterministic = {};
  if (Array.isArray(raw.perspectives)) {
    const perspectives = raw.perspectives
      .map((item) => normalizePerspective(item))
      .filter((item): item is BriefFullStoryPerspective => item !== null);
    if (perspectives.length > 0) deterministic.perspectives = perspectives;
  }
  if (raw.quote === null) {
    deterministic.quote = null;
  } else if (raw.quote !== undefined) {
    const quote = normalizeQuote(raw.quote);
    if (quote) deterministic.quote = quote;
  }
  return deterministic;
}

function normalizeTopicSections(raw: unknown): TopicSection[] {
  if (!Array.isArray(raw)) return [];
  const sections: TopicSection[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && TOPIC_SECTION_SET.has(item)) {
      sections.push(item as TopicSection);
    }
  }
  return sections;
}

function normalizeRecord(key: string, raw: unknown): BriefFullStoryRecord | null {
  if (!isRecord(raw)) return null;
  if (raw.articleId !== key) return null;
  if (typeof raw.status !== 'string' || !STATUSES.has(raw.status)) return null;
  if (typeof raw.trigger !== 'string' || !TRIGGERS.has(raw.trigger)) return null;
  if (!isStringOrNull(raw.sourceHash) || !isStringOrNull(raw.model) || !isStringOrNull(raw.error)) {
    return null;
  }
  if (typeof raw.generatedAt !== 'string') return null;

  const enrichment =
    raw.enrichment === null ? null : normalizeEnrichment(raw.enrichment);
  if (raw.enrichment !== null && raw.enrichment !== undefined && enrichment === null) {
    return null;
  }

  const record: BriefFullStoryRecord = {
    articleId: key,
    status: raw.status as FullStoryStatus,
    enrichment,
    deterministic: normalizeDeterministic(raw.deterministic),
    sourceHash: raw.sourceHash,
    topicSections: normalizeTopicSections(raw.topicSections),
    model: raw.model,
    error: raw.error,
    generatedAt: raw.generatedAt,
    trigger: raw.trigger as FullStoryTrigger,
  };

  if (typeof raw.updatedAt === 'string') record.updatedAt = raw.updatedAt;
  if (typeof raw.changeSummary === 'string') record.changeSummary = raw.changeSummary;
  else if (raw.changeSummary === null) record.changeSummary = null;
  const priorTimeline = normalizeTimeline(raw.priorTimeline);
  if (priorTimeline && priorTimeline.length > 0) record.priorTimeline = priorTimeline;

  return record;
}

function normalizeFullStories(parsed: unknown): BriefFullStoriesStore {
  if (!isRecord(parsed)) {
    throw new Error('brief-full-stories.json must contain a JSON object');
  }

  const fullStories: Record<string, BriefFullStoryRecord> = {};
  if (isRecord(parsed.fullStories)) {
    for (const [key, raw] of Object.entries(parsed.fullStories)) {
      const record = normalizeRecord(key, raw);
      if (record) fullStories[key] = record;
    }
  }

  const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
  return { fullStories, updatedAt };
}

function emptyStore(): BriefFullStoriesStore {
  return { fullStories: {}, updatedAt: null };
}

/**
 * Drop full-story records whose articleId is not in the kept triage set.
 */
export function pruneBriefFullStoriesByKeptIds(
  store: BriefFullStoriesStore,
  keptArticleIds: ReadonlySet<string>,
): BriefFullStoriesStore {
  const fullStories: Record<string, BriefFullStoryRecord> = {};
  for (const [articleId, record] of Object.entries(store.fullStories)) {
    if (keptArticleIds.has(articleId)) fullStories[articleId] = record;
  }
  return { fullStories, updatedAt: store.updatedAt };
}

/**
 * Read Brief full stories from disk.
 * Missing or empty file → empty store; malformed records are dropped.
 */
export async function readBriefFullStories(
  fullStoriesPath: string = BRIEF_FULL_STORIES_PATH,
): Promise<BriefFullStoriesStore> {
  try {
    const raw = await readFile(fullStoriesPath, 'utf8');
    if (!raw.trim()) return emptyStore();
    return normalizeFullStories(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyStore();
    }
    throw err;
  }
}

async function atomicWrite(store: BriefFullStoriesStore, fullStoriesPath: string): Promise<void> {
  await mkdir(path.dirname(fullStoriesPath), { recursive: true });
  const tmpPath = `${fullStoriesPath}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(tmpPath, fullStoriesPath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

/** Per-file write chains: refresh and on-demand puts must not interleave read-modify-write cycles. */
const writeChains = new Map<string, Promise<void>>();

function enqueueWrite(fullStoriesPath: string, work: () => Promise<void>): Promise<void> {
  const key = path.resolve(fullStoriesPath);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const next = previous.then(work);
  const settled = next.catch(() => undefined);
  writeChains.set(key, settled);
  void settled.then(() => {
    if (writeChains.get(key) === settled) writeChains.delete(key);
  });
  return next;
}

/** Replace the whole store (atomic). */
export async function writeBriefFullStories(
  store: BriefFullStoriesStore,
  fullStoriesPath: string = BRIEF_FULL_STORIES_PATH,
): Promise<void> {
  return enqueueWrite(fullStoriesPath, () => atomicWrite(store, fullStoriesPath));
}

export type PutBriefFullStoriesOptions = {
  /** When set, records for ids not in this set are removed before write. */
  keptArticleIds?: ReadonlySet<string>;
};

async function mergeAndWrite(
  records: BriefFullStoryRecord[],
  fullStoriesPath: string,
  options?: PutBriefFullStoriesOptions,
): Promise<void> {
  let store = await readBriefFullStories(fullStoriesPath);
  for (const record of records) store.fullStories[record.articleId] = record;
  if (options?.keptArticleIds) {
    store = pruneBriefFullStoriesByKeptIds(store, options.keptArticleIds);
  }
  store.updatedAt = new Date().toISOString();
  await atomicWrite(store, fullStoriesPath);
}

/** Upsert records by articleId (read-merge-write, atomic). Optional prune of non-kept ids. */
export async function putBriefFullStories(
  records: BriefFullStoryRecord[],
  fullStoriesPath: string = BRIEF_FULL_STORIES_PATH,
  options?: PutBriefFullStoriesOptions,
): Promise<void> {
  return enqueueWrite(fullStoriesPath, () => mergeAndWrite(records, fullStoriesPath, options));
}
