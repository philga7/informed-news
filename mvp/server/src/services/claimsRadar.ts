import type {
  Claim,
  ClaimMembership,
  EvidenceLink,
  EvidenceStance,
  SourceTier,
  TrackedClaims,
  TrackedClaimEntry,
} from '../types/claim.js';
import type { Article } from '../types/article.js';
import type { ClaimReviewQueueEntry } from '../store/claimReviewQueueStore.js';
import type { MuteRulesStore } from '../store/muteRulesStore.js';
import { articleIdFromCanonicalUrl } from '../store/articleId.js';
import {
  readClaimMembership,
  readClaimReviewQueue,
  readClaims,
  readEvidenceLinks,
  readMuteRules,
  readArticles,
  readTrackedClaims,
} from '../store/index.js';
import { briefClusterKey } from './briefClusterKey.js';
import { claimMatchesMute } from './muteMatch.js';

export type ClaimRadarLinkedHeadline = {
  id: string;
  title: string;
  sourceKind: string;
  publisherDomain: string | null;
  publishedAt: string | null;
  canonicalUrl: string;
  sourceTier: SourceTier;
  stance: EvidenceStance;
};

export type ClaimRadarEvidenceCounts = {
  total: number;
  supports: number;
  contradicts: number;
  mentions: number;
  primary: number;
  sensor: number;
};

export type ClaimRadarItem = {
  claimId: string;
  text: string;
  claimType: string;
  status: string;
  createdAt: string;
  confidence: number | null;
  accepted: boolean;
  tracked: boolean;
  pendingUpdate: boolean;
  evidence: ClaimRadarEvidenceCounts;
  clusterKeys: string[];
  linkedHeadlines: ClaimRadarLinkedHeadline[];
  needsReview: boolean;
  reviewReasons: string[]; // empty when not in needsReview
};

export type ClaimsRadarResponse = {
  ok: true;
  claims: ClaimRadarItem[];
  needsReview: ClaimRadarItem[];
  hiddenMutedCount: number;
};

export type BuildClaimsRadarFeedInput = {
  claims: Claim[];
  evidenceLinks: EvidenceLink[];
  articles: Article[];
  muteRules: MuteRulesStore;
  reviewQueue: ClaimReviewQueueEntry[];
  membership: ClaimMembership;
  tracked: TrackedClaims;
};

function evidenceCounts(links: ReadonlyArray<EvidenceLink>): ClaimRadarEvidenceCounts {
  const counts: ClaimRadarEvidenceCounts = {
    total: links.length,
    supports: 0,
    contradicts: 0,
    mentions: 0,
    primary: 0,
    sensor: 0,
  };

  for (const link of links) {
    counts[link.stance] += 1;
    counts[link.sourceTier] += 1;
  }

  return counts;
}

function maxEvidenceConfidence(links: ReadonlyArray<EvidenceLink>): number | null {
  if (links.length === 0) return null;
  let max = -Infinity;
  for (const link of links) {
    if (link.confidence > max) {
      max = link.confidence;
    }
  }
  return Number.isFinite(max) ? max : null;
}

function newestKey(article: Pick<Article, 'publishedAt' | 'fetchedAt'>): string {
  return article.publishedAt || article.fetchedAt || '';
}

function resolveArticle(
  link: Pick<EvidenceLink, 'articleId' | 'url'>,
  byId: ReadonlyMap<string, Article>,
  byCanonicalUrl: ReadonlyMap<string, Article>,
): Article | null {
  if (link.articleId) {
    return byId.get(link.articleId) ?? null;
  }
  if (!link.url) return null;

  const byUrl = byCanonicalUrl.get(link.url);
  if (byUrl) return byUrl;

  const derived = articleIdFromCanonicalUrl(link.url);
  return byId.get(derived) ?? null;
}

function newestQueueReasonsForClaim(
  claimId: string,
  reviewQueue: ReadonlyArray<ClaimReviewQueueEntry>,
): string[] {
  let newest: ClaimReviewQueueEntry | null = null;
  for (const entry of reviewQueue) {
    if (entry.claimId !== claimId) continue;
    if (!newest || entry.createdAt.localeCompare(newest.createdAt) > 0) {
      newest = entry;
    }
  }
  return newest?.reviewReasons ?? [];
}

/**
 * Build the claims radar inbox payload.
 *
 * Locked rulings:
 * - confidence = max evidence confidence (null if none)
 * - needsReview partition: queue claimIds only in needsReview array
 * - mute via claimMatchesMute → hiddenMutedCount
 * - linkedHeadlines cap 8
 * - each array sorted by createdAt desc
 */
export function buildClaimsRadarFeed(
  input: BuildClaimsRadarFeedInput,
): Omit<ClaimsRadarResponse, 'ok'> {
  const { claims, evidenceLinks, articles, muteRules, reviewQueue, membership, tracked } =
    input;

  const evidenceByClaimId = new Map<string, EvidenceLink[]>();
  for (const link of evidenceLinks) {
    const list = evidenceByClaimId.get(link.claimId) ?? [];
    list.push(link);
    evidenceByClaimId.set(link.claimId, list);
  }

  const articleById = new Map(articles.map((a) => [a.id, a] as const));
  const articleByCanonicalUrl = new Map(articles.map((a) => [a.canonicalUrl, a] as const));

  const queuedClaimIds = new Set(reviewQueue.map((entry) => entry.claimId));
  const acceptedClaimIds = new Set(membership.acceptedClaimIds);

  const trackedByClaimId = new Map<string, Pick<TrackedClaimEntry, 'pendingUpdate'>>();
  for (const entry of tracked.entries) {
    trackedByClaimId.set(entry.claimId, { pendingUpdate: entry.pendingUpdate });
  }

  let hiddenMutedCount = 0;
  const claimsOut: ClaimRadarItem[] = [];
  const needsReviewOut: ClaimRadarItem[] = [];

  for (const claim of claims) {
    const links = evidenceByClaimId.get(claim.id) ?? [];

    const linkedArticles: Article[] = [];
    for (const link of links) {
      const resolved = resolveArticle(link, articleById, articleByCanonicalUrl);
      if (resolved) linkedArticles.push(resolved);
    }

    if (claimMatchesMute(claim, linkedArticles, muteRules.rules)) {
      hiddenMutedCount += 1;
      continue;
    }

    const clusterKeys = Array.from(
      new Set(linkedArticles.map((article) => briefClusterKey(article))),
    ).sort((a, b) => a.localeCompare(b));

    const newestLinkByArticleIdOrUrl = new Map<string, EvidenceLink>();
    for (const link of links) {
      const key = link.articleId ?? link.url ?? '';
      if (!key) continue;
      const existing = newestLinkByArticleIdOrUrl.get(key);
      if (!existing || link.createdAt.localeCompare(existing.createdAt) > 0) {
        newestLinkByArticleIdOrUrl.set(key, link);
      }
    }

    const headlineCandidates: Array<ClaimRadarLinkedHeadline & { sortKey: string }> = [];
    for (const link of newestLinkByArticleIdOrUrl.values()) {
      const resolved = resolveArticle(link, articleById, articleByCanonicalUrl);
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
        sortKey: newestKey(resolved),
      });
    }

    const linkedHeadlines = headlineCandidates
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .slice(0, 8)
      .map(({ sortKey: _sortKey, ...headline }) => headline);

    const needsReview = queuedClaimIds.has(claim.id);
    const reviewReasons = needsReview ? newestQueueReasonsForClaim(claim.id, reviewQueue) : [];

    const trackedEntry = trackedByClaimId.get(claim.id);
    const item: ClaimRadarItem = {
      claimId: claim.id,
      text: claim.text,
      claimType: claim.claimType,
      status: claim.status,
      createdAt: claim.createdAt,
      confidence: maxEvidenceConfidence(links),
      accepted: acceptedClaimIds.has(claim.id),
      tracked: trackedEntry !== undefined,
      pendingUpdate: trackedEntry?.pendingUpdate ?? false,
      evidence: evidenceCounts(links),
      clusterKeys,
      linkedHeadlines,
      needsReview,
      reviewReasons,
    };

    if (needsReview) {
      needsReviewOut.push(item);
    } else {
      claimsOut.push(item);
    }
  }

  const byCreatedAtDesc = (a: ClaimRadarItem, b: ClaimRadarItem) =>
    b.createdAt.localeCompare(a.createdAt);

  return {
    claims: claimsOut.sort(byCreatedAtDesc),
    needsReview: needsReviewOut.sort(byCreatedAtDesc),
    hiddenMutedCount,
  };
}

export type LoadClaimsRadarDeps = {
  readClaims?: typeof readClaims;
  readEvidenceLinks?: typeof readEvidenceLinks;
  readArticles?: typeof readArticles;
  readMuteRules?: typeof readMuteRules;
  readClaimReviewQueue?: typeof readClaimReviewQueue;
  readClaimMembership?: typeof readClaimMembership;
  readTrackedClaims?: typeof readTrackedClaims;
};

export async function loadClaimsRadar(
  deps: LoadClaimsRadarDeps = {},
): Promise<Omit<ClaimsRadarResponse, 'ok'>> {
  const loadClaims = deps.readClaims ?? readClaims;
  const loadEvidence = deps.readEvidenceLinks ?? readEvidenceLinks;
  const loadArticles = deps.readArticles ?? readArticles;
  const loadMutes = deps.readMuteRules ?? readMuteRules;
  const loadQueue = deps.readClaimReviewQueue ?? readClaimReviewQueue;
  const loadMembership = deps.readClaimMembership ?? readClaimMembership;
  const loadTracked = deps.readTrackedClaims ?? readTrackedClaims;

  const [claims, evidenceLinks, articles, muteRules, reviewQueue, membership, tracked] =
    await Promise.all([
    loadClaims(),
    loadEvidence(),
    loadArticles(),
    loadMutes(),
    loadQueue(),
    loadMembership(),
    loadTracked(),
  ]);

  return buildClaimsRadarFeed({
    claims,
    evidenceLinks,
    articles,
    muteRules,
    reviewQueue,
    membership,
    tracked,
  });
}

