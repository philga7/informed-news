import type { Article } from '../types/article.js';
import type { BriefClaimItem, BriefClaimVerbiage } from '../types/briefClaim.js';
import type { Claim, ClaimMembership, EvidenceLink } from '../types/claim.js';
import type { MuteRulesStore } from '../store/muteRulesStore.js';
import {
  readArticles,
  readClaimEnrichments,
  readClaimMembership,
  readClaims,
  readEvidenceLinks,
  readMuteRules,
} from '../store/index.js';
import { briefClusterKey } from './briefClusterKey.js';
import {
  buildClaimArticleLookup,
  buildClaimLinkedHeadlines,
  resolveClaimLinkedArticles,
} from './claimEvidenceJoin.js';
import { claimMatchesMute } from './muteMatch.js';

export type BuildBriefClaimsFeedInput = {
  claims: Claim[];
  evidenceLinks: EvidenceLink[];
  articles: Article[];
  membership: ClaimMembership;
  muteRules: MuteRulesStore;
  enrichments: ReadonlyMap<string, BriefClaimVerbiage>;
};

function evidenceCounts(
  links: ReadonlyArray<EvidenceLink>,
): BriefClaimItem['evidence'] {
  const counts: BriefClaimItem['evidence'] = {
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

export function buildBriefClaimsFeed(
  input: BuildBriefClaimsFeedInput,
): { claims: BriefClaimItem[] } {
  const { claims, evidenceLinks, articles, membership, muteRules, enrichments } = input;

  const acceptedClaimIds = new Set(membership.acceptedClaimIds);
  if (acceptedClaimIds.size === 0) {
    return { claims: [] };
  }

  const evidenceByClaimId = new Map<string, EvidenceLink[]>();
  for (const link of evidenceLinks) {
    const list = evidenceByClaimId.get(link.claimId) ?? [];
    list.push(link);
    evidenceByClaimId.set(link.claimId, list);
  }

  const articleLookup = buildClaimArticleLookup(articles);

  const out: BriefClaimItem[] = [];
  for (const claim of claims) {
    if (!acceptedClaimIds.has(claim.id)) {
      continue;
    }

    const links = evidenceByClaimId.get(claim.id) ?? [];
    const linkedArticles = resolveClaimLinkedArticles(links, articleLookup);

    if (claimMatchesMute(claim, linkedArticles, muteRules.rules)) {
      continue;
    }

    const clusterKeys = Array.from(
      new Set(linkedArticles.map((article) => briefClusterKey(article))),
    ).sort((a, b) => a.localeCompare(b));
    const linkedHeadlines = buildClaimLinkedHeadlines(links, articleLookup);

    out.push({
      claimId: claim.id,
      text: claim.text,
      claimType: claim.claimType,
      status: claim.status,
      createdAt: claim.createdAt,
      confidence: maxEvidenceConfidence(links),
      evidence: evidenceCounts(links),
      clusterKeys,
      linkedHeadlines,
      verbiage: enrichments.get(claim.id) ?? null,
    });
  }

  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { claims: out };
}

export type LoadBriefClaimsDeps = {
  readClaims?: typeof readClaims;
  readEvidenceLinks?: typeof readEvidenceLinks;
  readArticles?: typeof readArticles;
  readMuteRules?: typeof readMuteRules;
  readClaimMembership?: typeof readClaimMembership;
  readClaimEnrichments?: typeof readClaimEnrichments;
};

export async function loadBriefClaims(
  deps: LoadBriefClaimsDeps = {},
): Promise<{ claims: BriefClaimItem[] }> {
  const loadClaims = deps.readClaims ?? readClaims;
  const loadEvidence = deps.readEvidenceLinks ?? readEvidenceLinks;
  const loadArticles = deps.readArticles ?? readArticles;
  const loadMutes = deps.readMuteRules ?? readMuteRules;
  const loadMembership = deps.readClaimMembership ?? readClaimMembership;
  const loadEnrichments = deps.readClaimEnrichments ?? readClaimEnrichments;

  const [claims, evidenceLinks, articles, muteRules, membership, enrichmentRecords] =
    await Promise.all([
      loadClaims(),
      loadEvidence(),
      loadArticles(),
      loadMutes(),
      loadMembership(),
      loadEnrichments(),
    ]);

  const enrichments = new Map(
    enrichmentRecords
      .filter((record) => record.enrichment !== null)
      .map((record) => [record.claimId, record.enrichment!] as const),
  );

  return buildBriefClaimsFeed({
    claims,
    evidenceLinks,
    articles,
    membership,
    muteRules,
    enrichments,
  });
}
