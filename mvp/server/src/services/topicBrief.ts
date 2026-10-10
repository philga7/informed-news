/**
 * Topic Brief (NEWS-88): composes the Brief from triage's kept records — one
 * section per desired topic (Core then Watch, topics-store order), operator
 * seeds pinned first, then stories ranked by significance then outlet breadth,
 * seen stories hidden after the next successful refresh. Pure: no store reads,
 * no network, no clock.
 */
import { createHash } from 'node:crypto';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article, StoreMeta } from '../types/article.js';
import type {
  BriefSeenEntry,
  BriefSeenStore,
  BriefSummariesStore,
  RefreshMeta,
} from '../types/brief.js';
import type { Topic } from '../types/topic.js';
import type { TriageLabel, TriageRecord, TriageStore } from '../types/triage.js';
import {
  BRIEF_MAX_LINKS,
  BRIEF_SEEN_RETENTION_DAYS,
  BRIEF_TOP_N,
  SIGNIFICANT_UPDATE_OUTLET_DELTA,
  SIGNIFICANT_UPDATE_SIGNIFICANCE_DELTA,
  SUMMARY_POST_MIN_CHARS,
  SUMMARY_SOURCE_MAX_CHARS,
} from './briefConfig.js';
import { TRIAGE_WINDOW_HOURS } from './triageConfig.js';
import { muteReason, normalizeOutletDomain } from './triageKeywords.js';

export type BriefLink = {
  title: string;
  url: string;
  domain: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

export type BriefSummaryStatus = 'ok' | 'missing' | 'unavailable';

export type BriefStory = {
  articleId: string;
  topicId: string;
  /** 1-based within the section */
  rank: number;
  /** rank > BRIEF_TOP_N */
  more: boolean;
  title: string;
  link: string;
  domain: string | null;
  /** Kept article's `publisherDomain`, normalized; no URL fallback (outlet blocks match on it) */
  publisherDomain: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  outletCount: number;
  labels: TriageLabel[];
  significance: number | null;
  /** Operator-added seed (kept article `sourceKind: 'manual'`); pinned first in its section */
  manualSeed: boolean;
  /** Kept article first, then duplicate members; distinct domains, ≤ BRIEF_MAX_LINKS */
  links: BriefLink[];
  summary: { status: BriefSummaryStatus; text: string | null };
  imageUrl: string | null;
  imageCaption: string | null;
  imageCredit: string | null;
};

export type BriefTopicRef = { id: string; name: string; level: 'core' | 'watch' };
export type BriefSection = { topic: BriefTopicRef; stories: BriefStory[] };
export type TopicBrief = {
  /** startedAt of the last successful refresh; seen entries before it hide stories */
  boundaryAt: string | null;
  /** Topics with at least one visible story, in section order */
  sections: BriefSection[];
  /** Desired topics with no visible story, in section order */
  quiet: BriefTopicRef[];
};

export type ComposeTopicBriefInput = {
  topics: Topic[];
  muteRules: MuteRule[];
  articles: Article[];
  triage: TriageStore;
  seen: BriefSeenStore;
  summaries: BriefSummariesStore;
  refresh: RefreshMeta | null;
  now: Date;
  /** When provided (even null), overrides refresh.lastSuccess.startedAt */
  boundaryAt?: string | null;
};

export type SummarySource = { sourceArticleId: string; text: string; hash: string };

const WINDOW_MS = TRIAGE_WINDOW_HOURS * 60 * 60 * 1000;
/** Absorbs float error so 1.3 → 1.8 counts as +0.5 */
const SIGNIFICANCE_EPSILON = 1e-9;

function articleTime(article: Article): number {
  return Date.parse(article.publishedAt ?? article.fetchedAt);
}

function inWindow(article: Article, now: Date): boolean {
  const time = articleTime(article);
  return !Number.isNaN(time) && now.getTime() - time <= WINDOW_MS;
}

function articleLink(article: Article): string {
  return article.publisherUrl || article.canonicalUrl;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

function articleDomain(article: Article): string | null {
  const publisherDomain = article.publisherDomain?.replace(/^www\./, '');
  return publisherDomain || hostnameOf(articleLink(article));
}

function isDuplicateMember(triage: TriageStore, id: string): boolean {
  const rec = triage.records[id];
  return rec?.status === 'dropped' && rec.reason === 'duplicate';
}

function okBody(article: Article): string | null {
  if (article.bodyStatus !== 'ok') return null;
  const body = article.bodyText?.trim();
  return body ? body : null;
}

function sourceFrom(article: Article, body: string): SummarySource {
  const text = `${article.title}\n\n${body.slice(0, SUMMARY_SOURCE_MAX_CHARS)}`;
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return { sourceArticleId: article.id, text, hash };
}

/**
 * Text a summary may be written from: the kept article's body; else the first
 * duplicate member's body (memberIds order); else a post's snippet when long
 * enough. null → "Full text unavailable", never an Ollama call.
 */
export function summarySourceFor(
  record: TriageRecord,
  articles: Map<string, Article>,
  triage: TriageStore,
): SummarySource | null {
  const kept = articles.get(record.articleId);
  if (!kept) return null;

  const keptBody = okBody(kept);
  if (keptBody) return sourceFrom(kept, keptBody);

  for (const id of record.memberIds) {
    if (!isDuplicateMember(triage, id)) continue;
    const member = articles.get(id);
    const body = member ? okBody(member) : null;
    if (member && body) return sourceFrom(member, body);
  }

  if (kept.bodyStatus === 'not_applicable') {
    const post = kept.snippet.trim();
    if (post.length >= SUMMARY_POST_MIN_CHARS) return sourceFrom(kept, post);
  }
  return null;
}

/** Triage outlet count and significance at one point in time; null = unknown */
export type SignificanceSnapshot = { outletCount: number | null; significance: number | null };

/** Outlets +2 or significance +0.5 since the prior snapshot; unknown outlet counts are 1. */
export function isSignificantlyUpdated(
  current: SignificanceSnapshot,
  prior: SignificanceSnapshot,
): boolean {
  if ((current.outletCount ?? 1) >= (prior.outletCount ?? 1) + SIGNIFICANT_UPDATE_OUTLET_DELTA) {
    return true;
  }
  return (
    current.significance !== null &&
    prior.significance !== null &&
    current.significance - prior.significance >=
      SIGNIFICANT_UPDATE_SIGNIFICANCE_DELTA - SIGNIFICANCE_EPSILON
  );
}

/**
 * Record stories the operator read: a snapshot of each id's kept record
 * (unknown / non-kept ids are ignored; re-reading overwrites). Entries older
 * than BRIEF_SEEN_RETENTION_DAYS or no longer kept are pruned.
 */
export function markBriefSeen(input: {
  seen: BriefSeenStore;
  triage: TriageStore;
  articleIds: string[];
  now: Date;
}): { store: BriefSeenStore; recorded: number } {
  const seenAt = input.now.toISOString();
  const cutoff = input.now.getTime() - BRIEF_SEEN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const isKept = (id: string) => input.triage.records[id]?.status === 'kept';

  const seen: Record<string, BriefSeenEntry> = {};
  for (const [id, entry] of Object.entries(input.seen.seen)) {
    const time = Date.parse(entry.seenAt);
    if (isKept(id) && !Number.isNaN(time) && time >= cutoff) seen[id] = entry;
  }

  let recorded = 0;
  for (const id of new Set(input.articleIds)) {
    const record = input.triage.records[id];
    if (record?.status !== 'kept') continue;
    seen[id] = { seenAt, outletCount: record.outletCount, significance: record.significance };
    recorded += 1;
  }
  return { store: { seen, updatedAt: seenAt }, recorded };
}

function isHiddenAsSeen(
  record: TriageRecord,
  seen: BriefSeenStore,
  boundaryTime: number | null,
): boolean {
  if (boundaryTime === null) return false;
  const entry = seen.seen[record.articleId];
  if (!entry) return false;
  const seenTime = Date.parse(entry.seenAt);
  if (Number.isNaN(seenTime) || seenTime >= boundaryTime) return false;
  return !isSignificantlyUpdated(record, entry);
}

function topicRef(topic: Topic): BriefTopicRef {
  return { id: topic.id, name: topic.name, level: topic.level === 'watch' ? 'watch' : 'core' };
}

function buildLinks(
  record: TriageRecord,
  kept: Article,
  articles: Map<string, Article>,
  triage: TriageStore,
): BriefLink[] {
  const candidates = [
    kept,
    ...record.memberIds
      .filter((id) => isDuplicateMember(triage, id))
      .map((id) => articles.get(id))
      .filter((a): a is Article => a !== undefined),
  ];
  const domains = new Set<string>();
  const links: BriefLink[] = [];
  for (const article of candidates) {
    if (links.length >= BRIEF_MAX_LINKS) break;
    const domain = articleDomain(article);
    if (domain !== null) {
      if (domains.has(domain)) continue;
      domains.add(domain);
    }
    links.push({
      title: article.title,
      url: articleLink(article),
      domain,
      publishedAt: article.publishedAt,
      fetchedAt: article.fetchedAt,
    });
  }
  return links;
}

function summaryFor(
  record: TriageRecord,
  articles: Map<string, Article>,
  triage: TriageStore,
  summaries: BriefSummariesStore,
): BriefStory['summary'] {
  const source = summarySourceFor(record, articles, triage);
  if (!source) return { status: 'unavailable', text: null };
  const cached = summaries.summaries[record.articleId];
  if (cached?.status === 'ok' && cached.text && cached.sourceHash === source.hash) {
    return { status: 'ok', text: cached.text };
  }
  return { status: 'missing', text: null };
}

type Candidate = { record: TriageRecord; article: Article };

function isSeed(article: Article): boolean {
  return article.sourceKind === 'manual';
}

function compareNewestThenId(a: Candidate, b: Candidate): number {
  const timeA = articleTime(a.article);
  const timeB = articleTime(b.article);
  const time = (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
  if (time !== 0) return time;
  return a.article.id < b.article.id ? -1 : a.article.id > b.article.id ? 1 : 0;
}

/** Seeds first (newest first), then significance desc (null last), outlets desc, newest, id. */
function compareCandidates(a: Candidate, b: Candidate): number {
  const seedA = isSeed(a.article);
  const seedB = isSeed(b.article);
  if (seedA !== seedB) return seedA ? -1 : 1;
  if (seedA) return compareNewestThenId(a, b);
  const sigA = a.record.significance;
  const sigB = b.record.significance;
  if (sigA !== sigB) {
    if (sigA === null) return 1;
    if (sigB === null) return -1;
    return sigB - sigA;
  }
  const outlets = (b.record.outletCount ?? 1) - (a.record.outletCount ?? 1);
  if (outlets !== 0) return outlets;
  return compareNewestThenId(a, b);
}

export function composeTopicBrief(input: ComposeTopicBriefInput): TopicBrief {
  const desired = input.topics.filter((t) => t.kind === 'desired');
  const undesired = input.topics.filter((t) => t.kind === 'undesired');
  const sectionTopics = [
    ...desired.filter((t) => t.level !== 'watch'),
    ...desired.filter((t) => t.level === 'watch'),
  ];
  const sectionIndexById = new Map(sectionTopics.map((t, i) => [t.id, i]));
  const articles = new Map(input.articles.map((a) => [a.id, a]));

  const boundaryAt =
    input.boundaryAt !== undefined
      ? input.boundaryAt
      : (input.refresh?.lastSuccess?.startedAt ?? null);
  const parsedBoundary = boundaryAt === null ? Number.NaN : Date.parse(boundaryAt);
  const boundaryTime = Number.isNaN(parsedBoundary) ? null : parsedBoundary;

  const bySection: Candidate[][] = sectionTopics.map(() => []);
  for (const record of Object.values(input.triage.records)) {
    if (record.status !== 'kept') continue;
    const article = articles.get(record.articleId);
    if (!article || !inWindow(article, input.now)) continue;
    const indexes = record.topicIds
      .map((id) => sectionIndexById.get(id))
      .filter((i): i is number => i !== undefined);
    if (indexes.length === 0) continue;
    if (muteReason(article, input.muteRules, undesired) !== null) continue;
    if (isHiddenAsSeen(record, input.seen, boundaryTime)) continue;
    bySection[Math.min(...indexes)]!.push({ record, article });
  }

  const sections: BriefSection[] = [];
  const quiet: BriefTopicRef[] = [];
  sectionTopics.forEach((topic, index) => {
    const candidates = bySection[index]!.sort(compareCandidates);
    if (candidates.length === 0) {
      quiet.push(topicRef(topic));
      return;
    }
    sections.push({
      topic: topicRef(topic),
      stories: candidates.map(({ record, article }, i) => ({
        articleId: article.id,
        topicId: topic.id,
        rank: i + 1,
        more: i + 1 > BRIEF_TOP_N,
        title: article.title,
        link: articleLink(article),
        domain: articleDomain(article),
        publisherDomain: normalizeOutletDomain(article.publisherDomain),
        publishedAt: article.publishedAt,
        fetchedAt: article.fetchedAt,
        outletCount: record.outletCount ?? 1,
        labels: [...record.labels],
        significance: record.significance,
        manualSeed: isSeed(article),
        links: buildLinks(record, article, articles, input.triage),
        summary: summaryFor(record, articles, input.triage, input.summaries),
        imageUrl: article.imageUrl,
        imageCaption: article.imageCaption,
        imageCredit: article.imageCredit,
      })),
    });
  });

  return { boundaryAt, sections, quiet };
}

const PROVIDER_LABELS = [
  ['searxng', 'SearXNG'],
  ['google_news', 'Google News'],
] as const;

function pluralStories(n: number): string {
  return n === 1 ? '1 story' : `${n} stories`;
}

/** Plain-language status lines for the refresh bar, built from meta.json. */
export function buildRefreshNotices(meta: StoreMeta): string[] {
  const notices: string[] = [];

  const providers = meta.topicSearch?.providers;
  if (providers) {
    for (const [key, label] of PROVIDER_LABELS) {
      const state = providers[key]?.state;
      if (state === 'down') notices.push(`${label} unavailable`);
      else if (state === 'partial') notices.push(`${label} partly failed`);
    }
  }

  const triage = meta.triage;
  if (triage) {
    if (triage.errors.some((e) => e.includes('TypeSafe not configured'))) {
      notices.push('Story scoring unavailable (TypeSafe not configured)');
    }
    const unscored = triage.byReason.not_scored_budget ?? 0;
    if (unscored > 0) notices.push(`${pluralStories(unscored)} not scored (budget)`);
  }

  if (meta.brief?.summaries.errors.some((e) => e.includes('Ollama not configured'))) {
    notices.push('Summaries unavailable (Ollama not configured)');
  }

  const last = meta.refresh?.last;
  if (last && last.ok === false) {
    notices.push(`Last refresh failed: ${last.error ?? 'unknown error'}`);
  }
  return notices;
}
