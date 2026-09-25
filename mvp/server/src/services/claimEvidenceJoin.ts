import type { Article } from '../types/article.js';
import type { EvidenceLink } from '../types/claim.js';
import { articleIdFromCanonicalUrl } from '../store/articleId.js';

export type ClaimLinkedHeadline = {
  id: string;
  title: string;
  sourceKind: string;
  publisherDomain: string | null;
  publishedAt: string | null;
  canonicalUrl: string;
  sourceTier: EvidenceLink['sourceTier'];
  stance: EvidenceLink['stance'];
};

export type ClaimArticleLookup = {
  articleById: ReadonlyMap<string, Article>;
  articleByCanonicalUrl: ReadonlyMap<string, Article>;
};

export function buildClaimArticleLookup(
  articles: ReadonlyArray<Article>,
): ClaimArticleLookup {
  return {
    articleById: new Map(articles.map((article) => [article.id, article] as const)),
    articleByCanonicalUrl: new Map(
      articles.map((article) => [article.canonicalUrl, article] as const),
    ),
  };
}

export function newestArticleKey(
  article: Pick<Article, 'publishedAt' | 'fetchedAt'>,
): string {
  return article.publishedAt || article.fetchedAt || '';
}

export function resolveEvidenceLinkArticle(
  link: Pick<EvidenceLink, 'articleId' | 'url'>,
  lookup: ClaimArticleLookup,
): Article | null {
  if (link.articleId) {
    return lookup.articleById.get(link.articleId) ?? null;
  }
  if (!link.url) return null;

  const byUrl = lookup.articleByCanonicalUrl.get(link.url);
  if (byUrl) {
    return byUrl;
  }

  const derived = articleIdFromCanonicalUrl(link.url);
  return lookup.articleById.get(derived) ?? null;
}

export function resolveClaimLinkedArticles(
  links: ReadonlyArray<EvidenceLink>,
  lookup: ClaimArticleLookup,
): Article[] {
  const linkedArticles: Article[] = [];
  for (const link of links) {
    const resolved = resolveEvidenceLinkArticle(link, lookup);
    if (resolved) {
      linkedArticles.push(resolved);
    }
  }
  return linkedArticles;
}

export function buildClaimLinkedHeadlines(
  links: ReadonlyArray<EvidenceLink>,
  lookup: ClaimArticleLookup,
): ClaimLinkedHeadline[] {
  const newestLinkByArticleIdOrUrl = new Map<string, EvidenceLink>();
  for (const link of links) {
    const key = link.articleId ?? link.url ?? '';
    if (!key) continue;

    const existing = newestLinkByArticleIdOrUrl.get(key);
    if (!existing || link.createdAt.localeCompare(existing.createdAt) > 0) {
      newestLinkByArticleIdOrUrl.set(key, link);
    }
  }

  const headlineCandidates: Array<ClaimLinkedHeadline & { sortKey: string }> = [];
  for (const link of newestLinkByArticleIdOrUrl.values()) {
    const resolved = resolveEvidenceLinkArticle(link, lookup);
    if (!resolved) continue;

    headlineCandidates.push({
      id: resolved.id,
      title: resolved.title,
      sourceKind: resolved.sourceKind,
      publisherDomain: resolved.publisherDomain,
      publishedAt: resolved.publishedAt,
      canonicalUrl: resolved.canonicalUrl,
      sourceTier: link.sourceTier,
      stance: link.stance,
      sortKey: newestArticleKey(resolved),
    });
  }

  return headlineCandidates
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .slice(0, 8)
    .map(({ sortKey: _sortKey, ...headline }) => headline);
}
