import type { TypeSafeClient } from '@typesafe-ai/sdk';
import { choice, noul, score } from '@typesafe-ai/sdk';
import type { ClaimType, EvidenceStance } from '../types/claim.js';
import { systemOne } from './typesafeClient.js';

export const CHOICE_CONFIDENCE_FLOOR = 0.6;
export const SCORE_CONFIDENCE_FLOOR = 0.6;

const ASSERTABLE_UNCERTAIN_MIN_EXCLUSIVE = 0.4;
const ASSERTABLE_UNCERTAIN_MAX_EXCLUSIVE = 0.6;

const SOURCE_UTILITY_RUBRIC = [
  'Sensor reprint / low novelty',
  'Useful sensor detail',
  'Strong primary-grade evidence',
] as const;

export type ClaimJudgeState = {
  articleExcerpt: string;
  candidateText: string;
  candidateQuote?: string | null;
  existingClaims: Array<{ id: string; text: string; claimType?: string }>;
};

export type ClaimJudgeAnswers = {
  isAssertable: { noul: number };
  claimType: {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
  claimAlignment: {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
  evidenceStance: {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
  sourceUtility: { score: number; confidence: number };
};

export type ClaimJudgeResult =
  | {
      ok: true;
      needsReview: boolean;
      reviewReasons: string[]; // machine-readable tags e.g. 'low_confidence:claimType'
      answers: ClaimJudgeAnswers;
      model: string;
    }
  | {
      ok: false;
      error: string;
      model: string | null;
    };

export function buildClaimJudgeQuestions(existingClaims: ClaimJudgeState['existingClaims']) {
  const claimTypeCriteria: Record<ClaimType, string> = {
    event_occurrence: 'An event happened or did not happen.',
    attribution:
      'A statement about who did what / responsibility / blame / agency.',
    casualty_or_count: 'A numeric quantity: casualties, counts, tallies.',
    official_statement:
      'An official/authoritative statement, announcement, or policy claim.',
    territorial_or_control:
      'Territory, control, occupation, advance/retreat, or who holds what.',
  };

  const stanceCriteria: Record<EvidenceStance, string> = {
    supports:
      'The candidate supports the aligned claim (same direction / corroborates).',
    contradicts:
      'The candidate contradicts the aligned claim (opposite / refutes).',
    mentions:
      'The candidate mentions the topic without clearly supporting or contradicting.',
  };

  // Alignment criteria: existing claim ids (cap 8) plus `new`.
  const alignmentCriteria: Record<string, string | null> = {
    new: 'Not a match to any existing claim; create a new claim.',
  };
  for (const c of existingClaims.slice(0, 8)) {
    alignmentCriteria[c.id] = c.text || null;
  }

  return {
    isAssertable: noul(
      'Is this an assertable factual claim (not opinion/commentary)?',
      {
        true: 'A concrete, testable claim about the world that could be verified or falsified (even if we cannot verify it right now).',
        false: 'Pure opinion, value judgment, rhetoric, speculation without a specific factual assertion, or vague commentary with no testable proposition.',
      },
    ),
    claimType: choice('What type of claim is this?', claimTypeCriteria),
    claimAlignment: choice(
      'Pick the best matching existing claim id, or `new` if none match.',
      alignmentCriteria,
    ),
    evidenceStance: choice(
      'If treated as evidence for the aligned claim, what stance does this candidate take?',
      stanceCriteria,
    ),
    sourceUtility: score(
      'How useful / novel / primary-grade is this candidate as evidence?',
      SOURCE_UTILITY_RUBRIC,
    ),
  } as const;
}

export function routeClaimJudgeAnswers(answers: ClaimJudgeAnswers): {
  needsReview: boolean;
  reviewReasons: string[];
} {
  const reviewReasons: string[] = [];

  if (answers.claimType.confidence < CHOICE_CONFIDENCE_FLOOR) {
    reviewReasons.push('low_confidence:claimType');
  }
  if (answers.claimAlignment.confidence < CHOICE_CONFIDENCE_FLOOR) {
    reviewReasons.push('low_confidence:claimAlignment');
  }
  if (answers.evidenceStance.confidence < CHOICE_CONFIDENCE_FLOOR) {
    reviewReasons.push('low_confidence:evidenceStance');
  }
  if (answers.sourceUtility.confidence < SCORE_CONFIDENCE_FLOOR) {
    reviewReasons.push('low_confidence:sourceUtility');
  }

  const noul = answers.isAssertable.noul;
  if (
    noul > ASSERTABLE_UNCERTAIN_MIN_EXCLUSIVE &&
    noul < ASSERTABLE_UNCERTAIN_MAX_EXCLUSIVE
  ) {
    reviewReasons.push('uncertain:isAssertable');
  }

  return { needsReview: reviewReasons.length > 0, reviewReasons };
}

export async function judgeClaimCandidate(
  state: ClaimJudgeState,
  opts?: { client?: TypeSafeClient | null; model?: string },
): Promise<ClaimJudgeResult> {
  const questions = buildClaimJudgeQuestions(state.existingClaims);

  const res = await systemOne(
    {
      state,
      questions,
      model: opts?.model,
    },
    opts?.client,
  );

  if (!res.ok) {
    return { ok: false, error: res.error, model: res.model };
  }

  const raw = res.result.answers;
  const answers: ClaimJudgeAnswers = {
    isAssertable: { noul: raw.isAssertable.noul },
    claimType: {
      choice: raw.claimType.choice,
      confidence: raw.claimType.confidence,
      probabilities: { ...raw.claimType.probabilities },
    },
    claimAlignment: {
      choice: raw.claimAlignment.choice,
      confidence: raw.claimAlignment.confidence,
      probabilities: { ...raw.claimAlignment.probabilities },
    },
    evidenceStance: {
      choice: raw.evidenceStance.choice,
      confidence: raw.evidenceStance.confidence,
      probabilities: { ...raw.evidenceStance.probabilities },
    },
    sourceUtility: {
      score: raw.sourceUtility.score,
      confidence: raw.sourceUtility.confidence,
    },
  };

  const routed = routeClaimJudgeAnswers(answers);

  return {
    ok: true,
    needsReview: routed.needsReview,
    reviewReasons: routed.reviewReasons,
    answers,
    model: res.result.model,
  };
}

