import type { Article } from '../types/article.js';
import { readArticles, writeArticles } from '../store/index.js';

/** Tiny English stop words so title overlap is not noise. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'by',
  'with',
  'from',
  'as',
  'it',
  'its',
  'this',
  'that',
  'after',
  'over',
  'into',
  'about',
  'says',
  'said',
]);

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** Min shared significant title tokens for same-domain pairing. */
const MIN_SHARED_TITLE_TOKENS = 3;

/** Jaccard threshold for title token sets (same domain). */
const TITLE_JACCARD_MIN = 0.4;

export type AssignClusterIdsResult = {
  articles: Article[];
  clustered: number;
  clusters: number;
};

/** Strip trailing slash, lowercase host, drop www., ignore hash. */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '';
    return `${u.protocol}//${host}${path}${u.search}`.toLowerCase();
  } catch {
    return null;
  }
}

export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) {
    if (b.has(t)) shared += 1;
  }
  return shared / (a.size + b.size - shared);
}

function sharedTokenCount(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) {
    if (b.has(t)) shared += 1;
  }
  return shared;
}

/** URLs this article "owns" for overlap matching. */
export function articleOwnedUrls(article: Article): Set<string> {
  const urls = new Set<string>();
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    const n = normalizeUrl(raw);
    if (n) urls.add(n);
  };
  add(article.canonicalUrl);
  add(article.publisherUrl);
  for (const c of article.citations) {
    add(c.url);
  }
  return urls;
}

/** URLs mentioned in tweet/snippet text (xcancel ↔ publisher link). */
export function urlsInText(...texts: Array<string | null | undefined>): Set<string> {
  const urls = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(URL_IN_TEXT_RE)) {
      const n = normalizeUrl(match[0]);
      if (n) urls.add(n);
    }
  }
  return urls;
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) {
    if (b.has(v)) return true;
  }
  return false;
}

/**
 * Crude relatedness: overlapping owned/mentioned URLs, or same publisher
 * domain with similar title tokens. Wrong groups are acceptable if obvious.
 */
export function articlesAreRelated(a: Article, b: Article): boolean {
  if (a.id === b.id) return false;

  const ownedA = articleOwnedUrls(a);
  const ownedB = articleOwnedUrls(b);
  const mentionedA = urlsInText(a.snippet, a.bodyText, a.title);
  const mentionedB = urlsInText(b.snippet, b.bodyText, b.title);

  // Shared URL identity, or one side mentions the other's URL.
  if (setsIntersect(ownedA, ownedB)) return true;
  if (setsIntersect(ownedA, mentionedB)) return true;
  if (setsIntersect(ownedB, mentionedA)) return true;

  const domainA = a.publisherDomain?.toLowerCase() ?? null;
  const domainB = b.publisherDomain?.toLowerCase() ?? null;
  if (!domainA || !domainB || domainA !== domainB) {
    return false;
  }

  const tokensA = titleTokens(a.publisherTitle?.trim() || a.title);
  const tokensB = titleTokens(b.publisherTitle?.trim() || b.title);
  const shared = sharedTokenCount(tokensA, tokensB);
  if (shared >= MIN_SHARED_TITLE_TOKENS) return true;
  return jaccard(tokensA, tokensB) >= TITLE_JACCARD_MIN;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const p = this.parent.get(id);
    if (p === undefined) {
      this.parent.set(id, id);
      return id;
    }
    if (p !== id) {
      const root = this.find(p);
      this.parent.set(id, root);
      return root;
    }
    return id;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // Prefer lexicographically smaller root for stable cluster ids.
    if (ra < rb) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

/**
 * Assign clusterId from connected components of related articles.
 * Singleton components stay null. Cluster id = min member article id.
 */
export function assignClusterIdsInMemory(articles: Article[]): Article[] {
  const uf = new UnionFind();
  for (const a of articles) {
    uf.add(a.id);
  }

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (articlesAreRelated(articles[i], articles[j])) {
        uf.union(articles[i].id, articles[j].id);
      }
    }
  }

  const membersByRoot = new Map<string, string[]>();
  for (const a of articles) {
    const root = uf.find(a.id);
    const list = membersByRoot.get(root) ?? [];
    list.push(a.id);
    membersByRoot.set(root, list);
  }

  const clusterIdByArticle = new Map<string, string | null>();
  for (const members of membersByRoot.values()) {
    if (members.length < 2) {
      for (const id of members) {
        clusterIdByArticle.set(id, null);
      }
      continue;
    }
    const clusterId = members.slice().sort()[0];
    for (const id of members) {
      clusterIdByArticle.set(id, clusterId);
    }
  }

  return articles.map((a) => ({
    ...a,
    clusterId: clusterIdByArticle.get(a.id) ?? null,
  }));
}

/** Recompute clusterIds for the whole store and persist. */
export async function assignClusterIds(): Promise<AssignClusterIdsResult> {
  const articles = await readArticles();
  const next = assignClusterIdsInMemory(articles);
  await writeArticles(next);

  const clustered = next.filter((a) => a.clusterId != null).length;
  const clusters = new Set(
    next.map((a) => a.clusterId).filter((id): id is string => id != null),
  ).size;

  return { articles: next, clustered, clusters };
}
