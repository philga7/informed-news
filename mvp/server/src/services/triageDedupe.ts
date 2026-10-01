/** Duplicate grouping and outlet breadth for triage (NEWS-87). Pure — no I/O. */
import type { Article } from '../types/article.js';
import { articlesAreRelated, jaccard, sharedTokenCount, titleTokens } from './clusterArticles.js';
import { normalizeTitleForMatch } from './searchUrl.js';
import { SIMILAR_TITLE_JACCARD_MIN, SIMILAR_TITLE_MIN_SHARED_TOKENS } from './triageConfig.js';

export type DedupeCandidate = { article: Article; topicIds: string[] };

export type DedupeGroup = {
  /** Representative first, then alternates in representative order. */
  ordered: DedupeCandidate[];
  /** Set when the group joins a story kept earlier in the window (smallest kept id). */
  existingKeptId: string | null;
  /** Union of member candidate topics. */
  topicIds: string[];
};

function sharesTopic(a: DedupeCandidate, b: DedupeCandidate): boolean {
  return a.topicIds.some((id) => b.topicIds.includes(id));
}

function isSyndicated(a: Article, b: Article): boolean {
  const title = normalizeTitleForMatch(a.title);
  return title !== '' && title === normalizeTitleForMatch(b.title);
}

function hasSimilarTitle(a: Article, b: Article): boolean {
  const tokensA = titleTokens(a.title);
  const tokensB = titleTokens(b.title);
  return (
    sharedTokenCount(tokensA, tokensB) >= SIMILAR_TITLE_MIN_SHARED_TOKENS &&
    jaccard(tokensA, tokensB) >= SIMILAR_TITLE_JACCARD_MIN
  );
}

/**
 * Same story: existing relatedness (shared URL / same-domain similar title),
 * syndication (identical normalized headline on any outlet), or similar
 * headlines across outlets within a shared topic.
 */
export function storiesAreDuplicates(a: DedupeCandidate, b: DedupeCandidate): boolean {
  if (articlesAreRelated(a.article, b.article)) return true;
  if (isSyndicated(a.article, b.article)) return true;
  return sharesTopic(a, b) && hasSimilarTitle(a.article, b.article);
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
  const uf = makeUnionFind(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (storiesAreDuplicates(nodes[i]!, nodes[j]!)) uf.union(i, j);
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
