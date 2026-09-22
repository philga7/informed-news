import type { Article, SourceKind, StoreMeta } from '../types/article.js';
import { briefClusterKey } from './briefClusterKey.js';

export type RadarHeadlineSourceKind = Extract<SourceKind, 'cfp' | 'rss'>;

export type RadarHeadline = {
  id: string;
  title: string;
  sourceKind: RadarHeadlineSourceKind;
  publisherDomain: string | null;
  publishedAt: string | null;
  canonicalUrl: string;
  citationLabel: string | null; // first citation label if any
};

export type RadarCluster = {
  clusterId: string; // existing id or `solo:<articleId>`
  headlines: RadarHeadline[]; // ≥1, newest first within cluster
  newestAt: string | null;
};

export type RadarResponse = {
  ok: true;
  clusters: RadarCluster[];
  meta: Pick<StoreMeta, 'lastFetchAt' | 'lastError'>;
};

function isRadarSource(sourceKind: SourceKind): sourceKind is RadarHeadlineSourceKind {
  return sourceKind === 'cfp' || sourceKind === 'rss';
}

function newestKey(article: Article): string {
  return article.publishedAt || article.fetchedAt || '';
}

function toHeadline(article: Article): RadarHeadline {
  return {
    id: article.id,
    title: article.title,
    sourceKind: article.sourceKind as RadarHeadlineSourceKind,
    publisherDomain: article.publisherDomain,
    publishedAt: article.publishedAt,
    canonicalUrl: article.canonicalUrl,
    citationLabel: article.citations[0]?.label ?? null,
  };
}

/**
 * Build the radar feed clusters from the full article store.
 *
 * - Filters to sourceKind `cfp` | `rss` only (excludes `xcancel`).
 * - Groups by existing `clusterId`; null/empty → `solo:<articleId>`.
 * - Sorts clusters by `newestAt` (desc); headlines newest-first within cluster.
 */
export function buildRadarFeed(articles: Article[]): RadarCluster[] {
  const filtered = articles.filter((a) => isRadarSource(a.sourceKind));

  const groups = new Map<string, Article[]>();
  for (const article of filtered) {
    const key = briefClusterKey(article);
    const list = groups.get(key) ?? [];
    list.push(article);
    groups.set(key, list);
  }

  const clusters: RadarCluster[] = [];

  for (const [clusterId, members] of groups) {
    const sortedMembers = [...members].sort((a, b) =>
      newestKey(b).localeCompare(newestKey(a)),
    );

    const newest =
      sortedMembers
        .map(newestKey)
        .filter((v) => v && v.length > 0)
        .sort()
        .at(-1) ?? '';

    clusters.push({
      clusterId,
      headlines: sortedMembers.map(toHeadline),
      newestAt: newest || null,
    });
  }

  return clusters.sort((a, b) => {
    const aKey = a.newestAt || '';
    const bKey = b.newestAt || '';
    return bKey.localeCompare(aKey);
  });
}

