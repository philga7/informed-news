import type { Article } from './types';

export type FeedEntry =
  | { kind: 'single'; article: Article }
  | { kind: 'cluster'; clusterId: string; lead: Article; related: Article[] };

function articleTime(a: Article): number {
  const raw = a.publishedAt || a.fetchedAt;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** Prefer a CFP lead; otherwise newest member. */
export function pickClusterLead(members: Article[]): Article {
  const cfp = members.filter((a) => a.sourceKind === 'cfp');
  const pool = cfp.length > 0 ? cfp : members;
  return pool.reduce((best, a) => (articleTime(a) > articleTime(best) ? a : best));
}

/**
 * Walk newest-first articles into feed entries.
 * Ungrouped (null clusterId) stay single cards.
 * Shared clusterId → one expandable group (lead + related).
 */
export function groupFeedArticles(articles: Article[]): FeedEntry[] {
  const byCluster = new Map<string, Article[]>();
  for (const article of articles) {
    if (!article.clusterId) continue;
    const list = byCluster.get(article.clusterId) ?? [];
    list.push(article);
    byCluster.set(article.clusterId, list);
  }

  const seenClusters = new Set<string>();
  const entries: FeedEntry[] = [];

  for (const article of articles) {
    const clusterId = article.clusterId;
    if (!clusterId) {
      entries.push({ kind: 'single', article });
      continue;
    }
    if (seenClusters.has(clusterId)) continue;
    seenClusters.add(clusterId);

    const members = byCluster.get(clusterId) ?? [article];
    if (members.length < 2) {
      // Defensive: singleton cluster id still renders flat.
      entries.push({ kind: 'single', article: members[0] });
      continue;
    }

    const lead = pickClusterLead(members);
    const related = members
      .filter((a) => a.id !== lead.id)
      .slice()
      .sort((a, b) => articleTime(b) - articleTime(a));

    entries.push({ kind: 'cluster', clusterId, lead, related });
  }

  return entries;
}
