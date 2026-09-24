import type { Article } from '../types/article.js';
import type { ClaimEnrichmentRecord } from '../types/briefClaim.js';
import type { Claim, EvidenceLink } from '../types/claim.js';
import {
  getClaimEnrichment,
  readArticles,
  readClaimMembership,
  readClaims,
  readEvidenceLinks,
  upsertClaimEnrichment,
} from '../store/index.js';
import {
  buildClaimArticleLookup,
  buildClaimLinkedHeadlines,
} from './claimEvidenceJoin.js';
import { CLASSIFY_RAW_DELIMITER } from './ollamaFraming.js';
import type {
  ClaimHeadlineInput,
  ClaimVerbiageInput,
  ClaimVerbiageResult,
} from './ollamaClaimVerbiage.js';
import { generateClaimVerbiage } from './ollamaClaimVerbiage.js';

export type EnrichClaimsOptions = {
  claimIds?: string[];
  force?: boolean;
  readClaimsFn?: () => Promise<Claim[]>;
  readEvidenceLinksFn?: () => Promise<EvidenceLink[]>;
  readArticlesFn?: () => Promise<Article[]>;
  readClaimMembershipFn?: typeof readClaimMembership;
  getClaimEnrichmentFn?: (claimId: string) => Promise<ClaimEnrichmentRecord | null>;
  upsertClaimEnrichmentFn?: (
    record: ClaimEnrichmentRecord,
  ) => Promise<ClaimEnrichmentRecord>;
  enrichFn?: (input: ClaimVerbiageInput) => Promise<ClaimVerbiageResult>;
  nowIsoFn?: () => string;
};

export type EnrichClaimsResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  claimIds: string[];
  skippedClaimIds: string[];
};

function normalizeRequestedClaimIds(claimIds: string[] | undefined): string[] {
  if (!Array.isArray(claimIds)) {
    return [];
  }

  return Array.from(
    new Set(
      claimIds
        .filter((claimId): claimId is string => typeof claimId === 'string')
        .map((claimId) => claimId.trim())
        .filter(Boolean),
    ),
  );
}
export async function enrichAcceptedClaims(
  options: EnrichClaimsOptions = {},
): Promise<EnrichClaimsResult> {
  const force = Boolean(options.force);
  const readClaimsFn = options.readClaimsFn ?? readClaims;
  const readEvidenceLinksFn = options.readEvidenceLinksFn ?? readEvidenceLinks;
  const readArticlesFn = options.readArticlesFn ?? readArticles;
  const readClaimMembershipFn = options.readClaimMembershipFn ?? readClaimMembership;
  const getClaimEnrichmentFn = options.getClaimEnrichmentFn ?? getClaimEnrichment;
  const upsertClaimEnrichmentFn =
    options.upsertClaimEnrichmentFn ?? upsertClaimEnrichment;
  const enrichFn = options.enrichFn ?? generateClaimVerbiage;
  const nowIsoFn = options.nowIsoFn ?? (() => new Date().toISOString());

  const [claims, evidenceLinks, articles, membership] = await Promise.all([
    readClaimsFn(),
    readEvidenceLinksFn(),
    readArticlesFn(),
    readClaimMembershipFn(),
  ]);

  const requestedClaimIds = normalizeRequestedClaimIds(options.claimIds);
  const acceptedClaimIds = new Set(membership.acceptedClaimIds);
  const requestedSet =
    requestedClaimIds.length > 0 ? new Set(requestedClaimIds) : null;

  const skippedClaimIds =
    requestedSet === null
      ? []
      : requestedClaimIds.filter((claimId) => !acceptedClaimIds.has(claimId));

  const candidateClaims = claims
    .filter((claim) => acceptedClaimIds.has(claim.id))
    .filter((claim) => (requestedSet ? requestedSet.has(claim.id) : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const evidenceByClaimId = new Map<string, EvidenceLink[]>();
  for (const link of evidenceLinks) {
    const list = evidenceByClaimId.get(link.claimId) ?? [];
    list.push(link);
    evidenceByClaimId.set(link.claimId, list);
  }

  const articleLookup = buildClaimArticleLookup(articles);

  const attemptedClaimIds: string[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const claim of candidateClaims) {
    const existing = await getClaimEnrichmentFn(claim.id);
    if (!force && existing && existing.enrichment !== null) {
      continue;
    }

    attemptedClaimIds.push(claim.id);

    const links = evidenceByClaimId.get(claim.id) ?? [];
    const linkedHeadlines = buildClaimLinkedHeadlines(links, articleLookup).map(
      (headline): ClaimHeadlineInput => ({
        title: headline.title,
        stance: headline.stance,
        sourceTier: headline.sourceTier,
        publisherDomain: headline.publisherDomain,
        publishedAt: headline.publishedAt,
      }),
    );
    const result = await enrichFn({
      claimText: claim.text,
      claimType: claim.claimType,
      status: claim.status,
      linkedHeadlines,
    });

    if (result.ok) {
      await upsertClaimEnrichmentFn({
        claimId: claim.id,
        enrichment: result.enrichment,
        enrichedAt: nowIsoFn(),
        enrichError: null,
        model: result.model,
      });
      succeeded += 1;
      continue;
    }

    const enrichError = result.rawText
      ? `${result.error}${CLASSIFY_RAW_DELIMITER}${result.rawText}`
      : result.error;

    await upsertClaimEnrichmentFn({
      claimId: claim.id,
      enrichment: null,
      enrichedAt: null,
      enrichError,
      model: result.model,
    });
    failed += 1;
  }

  return {
    attempted: attemptedClaimIds.length,
    succeeded,
    failed,
    claimIds: attemptedClaimIds,
    skippedClaimIds,
  };
}
