import { randomUUID } from 'node:crypto';
import type { Article } from '../types/article.js';
import type { Claim, ClaimType, EvidenceLink, EvidenceStance } from '../types/claim.js';
import type { ClaimReviewQueueEntry } from '../store/claimReviewQueueStore.js';
import {
  enqueueClaimReview,
  isArticleExtractProcessed,
  markArticlesExtractProcessed,
  readArticles,
  getClaimById,
  readClaims,
  upsertClaim,
  upsertEvidenceLink,
} from '../store/index.js';
import {
  CLAIM_EXTRACT_PROCESSED_PATH,
  CLAIM_REVIEW_QUEUE_PATH,
  CLAIMS_PATH,
  EVIDENCE_LINKS_PATH,
} from '../store/paths.js';
import { framingBodyText, sortNewestFirst } from './classifyArticles.js';
import {
  proposeClaimCandidates,
  type ProposeClaimsInput,
  type ProposeClaimsResult,
} from './ollamaProposeClaims.js';
import {
  judgeClaimCandidate,
  type ClaimJudgeResult,
  type ClaimJudgeState,
} from './typesafeClaimQuestions.js';

const DEFAULT_BATCH_LIMIT = 10;

const ASSERTABLE_UNCERTAIN_MIN_EXCLUSIVE = 0.4;
const ASSERTABLE_UNCERTAIN_MAX_EXCLUSIVE = 0.6;

const CLAIM_TYPES: readonly ClaimType[] = [
  'event_occurrence',
  'attribution',
  'casualty_or_count',
  'official_statement',
  'territorial_or_control',
];

const EVIDENCE_STANCES: readonly EvidenceStance[] = [
  'supports',
  'contradicts',
  'mentions',
];

export type ExtractClaimsOptions = {
  limit?: number;
  force?: boolean;
  articleIds?: string[];
  /** Dependency injection (tests): override IO and AI calls. */
  readArticlesFn?: () => Promise<Article[]>;
  readClaimsFn?: (claimsPath?: string) => Promise<Claim[]>;
  isArticleExtractProcessedFn?: (
    articleId: string,
    processedPath?: string,
  ) => Promise<boolean>;
  markArticlesExtractProcessedFn?: (
    ids: string[],
    processedPath?: string,
  ) => Promise<{ articleIds: string[] }>;
  upsertClaimFn?: typeof upsertClaim;
  upsertEvidenceLinkFn?: typeof upsertEvidenceLink;
  enqueueClaimReviewFn?: typeof enqueueClaimReview;
  proposeFn?: (
    input: ProposeClaimsInput,
    opts?: { client?: unknown; model?: string },
  ) => Promise<ProposeClaimsResult>;
  judgeFn?: (
    state: ClaimJudgeState,
    opts?: { client?: unknown; model?: string },
  ) => Promise<ClaimJudgeResult>;
  claimsPath?: string;
  evidencePath?: string;
  queuePath?: string;
  processedPath?: string;
};

export type ExtractClaimsResult = {
  ok: boolean;
  limit: number;
  attempted: number;
  proposed: number;
  judged: number;
  persistedClaims: number;
  persistedEvidence: number;
  needsReview: number;
  failed: number;
  articlesProcessed: number;
  claims: Claim[];
  evidence: EvidenceLink[];
  reviewQueued: ClaimReviewQueueEntry[];
};

function resolveBatchLimit(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const fromEnv = Number(process.env.CLAIMS_EXTRACT_BATCH_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return DEFAULT_BATCH_LIMIT;
}

function articleExcerpt(article: Article): string {
  const body = framingBodyText(article);
  if (body) return body;
  const title = article.title?.trim() || '';
  const snippet = article.snippet?.trim() || '';
  const combined = [title, snippet].filter(Boolean).join('\n\n');
  return combined || '(no text)';
}

function normalizeClaimType(choice: string): ClaimType {
  const trimmed = choice.trim();
  return (CLAIM_TYPES as readonly string[]).includes(trimmed)
    ? (trimmed as ClaimType)
    : 'event_occurrence';
}

function normalizeEvidenceStance(choice: string): EvidenceStance | null {
  const trimmed = choice.trim();
  return (EVIDENCE_STANCES as readonly string[]).includes(trimmed)
    ? (trimmed as EvidenceStance)
    : null;
}

function isClearNonAssertable(noul: number): boolean {
  if (
    noul > ASSERTABLE_UNCERTAIN_MIN_EXCLUSIVE &&
    noul < ASSERTABLE_UNCERTAIN_MAX_EXCLUSIVE
  ) {
    return false;
  }
  return noul <= ASSERTABLE_UNCERTAIN_MIN_EXCLUSIVE;
}

function evidenceConfidence(answers: ClaimJudgeResult & { ok: true }): number {
  return Math.min(
    answers.answers.claimType.confidence,
    answers.answers.claimAlignment.confidence,
    answers.answers.evidenceStance.confidence,
    answers.answers.sourceUtility.confidence,
  );
}

function evidenceScores(answers: ClaimJudgeResult & { ok: true }): Record<string, number> {
  return {
    isAssertable: answers.answers.isAssertable.noul,
    claimTypeConfidence: answers.answers.claimType.confidence,
    claimAlignmentConfidence: answers.answers.claimAlignment.confidence,
    evidenceStanceConfidence: answers.answers.evidenceStance.confidence,
    sourceUtility: answers.answers.sourceUtility.score,
    sourceUtilityConfidence: answers.answers.sourceUtility.confidence,
  };
}

async function selectArticles(
  options: ExtractClaimsOptions,
  limit: number,
  force: boolean,
  readArticlesFn: () => Promise<Article[]>,
  isProcessedFn: (articleId: string) => Promise<boolean>,
): Promise<Article[]> {
  const articles = await readArticlesFn();
  const idFilter =
    options.articleIds && options.articleIds.length > 0
      ? new Set(options.articleIds.map((id) => id.trim()).filter(Boolean))
      : null;

  const sorted = sortNewestFirst(articles)
    .filter((a) => a.sourceKind !== 'manual')
    .filter((a) => (idFilter ? idFilter.has(a.id) : true));

  const selected: Article[] = [];
  for (const article of sorted) {
    if (selected.length >= limit) break;
    if (!force && (await isProcessedFn(article.id))) continue;
    selected.push(article);
  }
  return selected;
}

/**
 * Propose → judge → persist → queue for claim candidates from articles.
 * Existing claims passed to the judge are capped at the newest 8 from readClaims() store order.
 */
export async function extractClaimsFromArticles(
  options: ExtractClaimsOptions = {},
): Promise<ExtractClaimsResult> {
  const limit = resolveBatchLimit(options.limit);
  const force = options.force === true;

  const claimsPath = options.claimsPath ?? CLAIMS_PATH;
  const evidencePath = options.evidencePath ?? EVIDENCE_LINKS_PATH;
  const queuePath = options.queuePath ?? CLAIM_REVIEW_QUEUE_PATH;
  const processedPath = options.processedPath ?? CLAIM_EXTRACT_PROCESSED_PATH;

  const readArticlesFn = options.readArticlesFn ?? readArticles;
  const readClaimsFn = options.readClaimsFn ?? readClaims;
  const isProcessedFn =
    options.isArticleExtractProcessedFn ??
    ((articleId: string) => isArticleExtractProcessed(articleId, processedPath));
  const markProcessedFn =
    options.markArticlesExtractProcessedFn ??
    ((ids: string[]) => markArticlesExtractProcessed(ids, processedPath));
  const upsertClaimFn = options.upsertClaimFn ?? upsertClaim;
  const upsertEvidenceLinkFn = options.upsertEvidenceLinkFn ?? upsertEvidenceLink;
  const enqueueReviewFn = options.enqueueClaimReviewFn ?? enqueueClaimReview;
  const proposeFn = options.proposeFn ?? proposeClaimCandidates;
  const judgeFn = options.judgeFn ?? judgeClaimCandidate;

  const candidates = await selectArticles(
    options,
    limit,
    force,
    readArticlesFn,
    isProcessedFn,
  );

  const result: ExtractClaimsResult = {
    ok: true,
    limit,
    attempted: candidates.length,
    proposed: 0,
    judged: 0,
    persistedClaims: 0,
    persistedEvidence: 0,
    needsReview: 0,
    failed: 0,
    articlesProcessed: 0,
    claims: [],
    evidence: [],
    reviewQueued: [],
  };

  for (const article of candidates) {
    const bodyText = framingBodyText(article);
    const proposeResult = await proposeFn({
      title: article.title,
      snippet: article.snippet,
      bodyText,
      publisherDomain: article.publisherDomain,
    });

    if (!proposeResult.ok) {
      result.failed += 1;
      continue;
    }

    result.proposed += proposeResult.candidates.length;

    // Newest 8 from readClaims() — upsertClaim appends, so tail is most recent.
    const existingClaims = (await readClaimsFn(claimsPath)).slice(-8);
    const excerpt = articleExcerpt(article);

    let anyJudgeSucceeded = false;

    for (const candidate of proposeResult.candidates) {
      const judgeResult = await judgeFn({
        articleExcerpt: excerpt,
        candidateText: candidate.text,
        candidateQuote: candidate.quote,
        existingClaims: existingClaims.map((c) => ({
          id: c.id,
          text: c.text,
          claimType: c.claimType,
        })),
      });

      if (!judgeResult.ok) {
        result.failed += 1;
        continue;
      }

      anyJudgeSucceeded = true;
      result.judged += 1;

      if (isClearNonAssertable(judgeResult.answers.isAssertable.noul)) {
        continue;
      }

      const stance = normalizeEvidenceStance(judgeResult.answers.evidenceStance.choice);
      if (!stance) {
        result.failed += 1;
        continue;
      }

      const alignment = judgeResult.answers.claimAlignment.choice.trim();
      let claimId: string;

      if (alignment === 'new') {
        const claimType = normalizeClaimType(judgeResult.answers.claimType.choice);
        const claim = await upsertClaimFn(
          {
            text: candidate.text,
            claimType,
            entities: [],
          },
          claimsPath,
        );
        claimId = claim.id;
        result.persistedClaims += 1;
      } else {
        const existing = existingClaims.find((c) => c.id === alignment);
        if (!existing) {
          result.failed += 1;
          continue;
        }
        claimId = existing.id;
      }

      const link = await upsertEvidenceLinkFn(
        {
          claimId,
          articleId: article.id,
          url: article.canonicalUrl,
          stance,
          sourceTier: 'sensor',
          confidence: evidenceConfidence(judgeResult),
          scores: evidenceScores(judgeResult),
        },
        evidencePath,
        claimsPath,
      );

      if (!link) {
        result.failed += 1;
        continue;
      }

      result.evidence.push(link);
      result.persistedEvidence += 1;

      const persistedClaim = await getClaimById(claimId, claimsPath);
      if (persistedClaim) {
        const alreadyInResponse = result.claims.some((c) => c.id === claimId);
        if (!alreadyInResponse) {
          result.claims.push(persistedClaim);
        }
      }

      if (judgeResult.needsReview) {
        result.needsReview += 1;
        const entry: ClaimReviewQueueEntry = {
          id: randomUUID(),
          claimId,
          evidenceLinkId: link.id,
          articleId: article.id,
          reviewReasons: judgeResult.reviewReasons,
          candidateText: candidate.text,
          createdAt: new Date().toISOString(),
        };
        const queued = await enqueueReviewFn(entry, queuePath);
        const added = queued.entries.find(
          (e) =>
            e.articleId === entry.articleId &&
            e.claimId === entry.claimId &&
            e.evidenceLinkId === entry.evidenceLinkId,
        );
        if (added) {
          result.reviewQueued.push(added);
        }
      }
    }

    const shouldMarkProcessed =
      proposeResult.candidates.length === 0 || anyJudgeSucceeded;
    if (shouldMarkProcessed) {
      await markProcessedFn([article.id]);
      result.articlesProcessed += 1;
    }
  }

  return result;
}
