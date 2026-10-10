/** Duplicate grouping and outlet breadth for triage (NEWS-87). Pure — no I/O. */
import type { Article } from '../types/article.js';
import {
  articleMentionedUrls,
  articleOwnedUrls,
  jaccard,
  sharedTokenCount,
  titleTokens,
  urlSetsLink,
} from './clusterArticles.js';
import { publisherDomainFromUrl } from './publisherScrape.js';
import { normalizeTitleForMatch } from './searchUrl.js';
import { normalizeOutletDomain } from './triageKeywords.js';
import {
  SIMILAR_TITLE_JACCARD_MIN,
  SIMILAR_TITLE_MIN_SHARED_TOKENS,
  SYNDICATION_MIN_TITLE_TOKENS,
} from './triageConfig.js';

export type DedupeCandidate = { article: Article; topicIds: string[] };

export type DedupeGroup = {
  /** Representative first, then alternates in representative order. */
  ordered: DedupeCandidate[];
  /** Set when the group joins a story kept earlier in the window (smallest kept id). */
  existingKeptId: string | null;
  /** Union of member candidate topics. */
  topicIds: string[];
};

type DedupeFeatures = {
  topicIds: string[];
  normalizedTitle: string;
  tokens: Set<string>;
  ownedUrls: Set<string>;
  mentionedUrls: Set<string>;
};

function dedupeFeatures(c: DedupeCandidate): DedupeFeatures {
  return {
    topicIds: c.topicIds,
    normalizedTitle: normalizeTitleForMatch(c.article.title),
    tokens: titleTokens(c.article.title),
    ownedUrls: articleOwnedUrls(c.article),
    mentionedUrls: articleMentionedUrls(c.article),
  };
}

function featuresAreDuplicates(a: DedupeFeatures, b: DedupeFeatures): boolean {
  if (urlSetsLink(a.ownedUrls, a.mentionedUrls, b.ownedUrls, b.mentionedUrls)) return true;
  if (
    a.normalizedTitle !== '' &&
    a.normalizedTitle === b.normalizedTitle &&
    a.tokens.size >= SYNDICATION_MIN_TITLE_TOKENS
  ) {
    return true;
  }
  return (
    a.topicIds.some((id) => b.topicIds.includes(id)) &&
    sharedTokenCount(a.tokens, b.tokens) >= SIMILAR_TITLE_MIN_SHARED_TOKENS &&
    jaccard(a.tokens, b.tokens) >= SIMILAR_TITLE_JACCARD_MIN
  );
}

/**
 * Same story: shared/mentioned URL, syndication (identical normalized
 * headline of ≥ SYNDICATION_MIN_TITLE_TOKENS tokens on any outlet), or similar
 * headlines within a shared topic (same outlet or not).
 */
export function storiesAreDuplicates(a: DedupeCandidate, b: DedupeCandidate): boolean {
  return featuresAreDuplicates(dedupeFeatures(a), dedupeFeatures(b));
}

/**
 * Primary tier, then has publisher URL, then body ok, then longer snippet,
 * then earlier publishedAt (nulls last), then id.
 */
function compareRepresentative(x: DedupeCandidate, y: DedupeCandidate): number {
  const a = x.article;
  const b = y.article;
  const flag = (v: boolean) => (v ? 0 : 1);
  const byFlags =
    flag(a.sourceTier === 'primary') - flag(b.sourceTier === 'primary') ||
    flag(a.publisherUrl != null) - flag(b.publisherUrl != null) ||
    flag(a.bodyStatus === 'ok') - flag(b.bodyStatus === 'ok') ||
    b.snippet.length - a.snippet.length;
  if (byFlags !== 0) return byFlags;

  const timeA = a.publishedAt ? Date.parse(a.publishedAt) : Number.NaN;
  const timeB = b.publishedAt ? Date.parse(b.publishedAt) : Number.NaN;
  const hasA = !Number.isNaN(timeA);
  const hasB = !Number.isNaN(timeB);
  if (hasA !== hasB) return hasA ? -1 : 1;
  if (hasA && hasB && timeA !== timeB) return timeA - timeB;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function makeUnionFind(size: number) {
  const parent = Array.from({ length: size }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  return { find, union };
}

/**
 * Connected components over candidates + recently kept stories. Groups with
 * no candidate are dropped. Output is sorted by representative id.
 */
export function groupCandidates(
  candidates: DedupeCandidate[],
  recentKept: DedupeCandidate[],
): DedupeGroup[] {
  const candidateIds = new Set(candidates.map((c) => c.article.id));
  const kept = recentKept.filter((k) => !candidateIds.has(k.article.id));
  const nodes = [...candidates, ...kept];
  const features = nodes.map(dedupeFeatures);
  const uf = makeUnionFind(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (featuresAreDuplicates(features[i]!, features[j]!)) uf.union(i, j);
    }
  }

  const byRoot = new Map<number, { members: DedupeCandidate[]; keptIds: string[] }>();
  nodes.forEach((node, i) => {
    const root = uf.find(i);
    const entry = byRoot.get(root) ?? { members: [], keptIds: [] };
    if (i < candidates.length) entry.members.push(node);
    else entry.keptIds.push(node.article.id);
    byRoot.set(root, entry);
  });

  const groups: DedupeGroup[] = [];
  for (const { members, keptIds } of byRoot.values()) {
    if (members.length === 0) continue;
    const ordered = members.slice().sort(compareRepresentative);
    const topicIds = [...new Set(ordered.flatMap((c) => c.topicIds))];
    const existingKeptId = keptIds.length > 0 ? keptIds.slice().sort()[0]! : null;
    groups.push({ ordered, existingKeptId, topicIds });
  }

  return groups.sort((a, b) => {
    const idA = a.ordered[0]!.article.id;
    const idB = b.ordered[0]!.article.id;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '');
}

/**
 * Distinct publisher domains among members, with domains that published the
 * same normalized headline (syndication) collapsed into one outlet.
 * Members without a domain are ignored; none with a domain → 1.
 */
export function outletCount(members: readonly Article[]): number {
  const parent = new Map<string, string>();
  const find = (d: string): string => {
    let root = d;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(d, root);
    return root;
  };

  const domainByTitle = new Map<string, string>();
  for (const article of members) {
    if (!article.publisherDomain) continue;
    const domain = normalizeDomain(article.publisherDomain);
    if (!domain) continue;
    if (!parent.has(domain)) parent.set(domain, domain);

    const title = normalizeTitleForMatch(article.title);
    if (!title) continue;
    const seen = domainByTitle.get(title);
    if (seen === undefined) {
      domainByTitle.set(title, domain);
      continue;
    }
    const ra = find(seen);
    const rb = find(domain);
    if (ra !== rb) parent.set(rb, ra);
  }

  if (parent.size === 0) return 1;
  return new Set([...parent.keys()].map(find)).size;
}

/**
 * A manual seed's outlets: distinct hosts of its save-time URLs plus its
 * members' publisher domains, so folded coverage never drops below the
 * save-time count. Minimum 1.
 */
export function seedOutletCount(seed: Article, members: readonly Article[]): number {
  const outlets = new Set<string>();
  const add = (domain: string | null) => {
    const normalized = normalizeOutletDomain(domain);
    if (normalized) outlets.add(normalized);
  };
  for (const { url } of seed.citations) add(publisherDomainFromUrl(url));
  for (const member of members) add(member.publisherDomain);
  return Math.max(1, outlets.size);
}
