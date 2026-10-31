/**
 * Advisory triage verdict layer (NEWS-167): prose reason + confidence + criteria
 * reference alongside the machine keep/drop record. AI-assisted text is advisory,
 * not ground truth.
 */
import type { Topic } from '../types/topic.js';
import type { TriageAdvisoryVerdict, TriageReason } from '../types/triage.js';
import type { TriageJevAnswers, TriageVerdict } from './triageJev.js';

export const REASON_TEXT_MAX = 300;

export type TriageAdvisory = {
  verdict: TriageAdvisoryVerdict;
  confidence: number;
  reasonText: string;
  criteriaRef: string;
};

const VERDICTS: ReadonlySet<string> = new Set<TriageAdvisoryVerdict>(['approved', 'filtered']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function truncateReasonText(text: string): string {
  return text.length <= REASON_TEXT_MAX ? text : text.slice(0, REASON_TEXT_MAX);
}

const UNPARSEABLE: TriageAdvisory = {
  verdict: 'filtered',
  confidence: 0,
  reasonText: 'unparseable',
  criteriaRef: 'global',
};

/**
 * Coerce a raw advisory object. Malformed input never throws — falls back to
 * filtered / unparseable.
 */
export function parseAdvisoryVerdict(raw: unknown): TriageAdvisory {
  if (!isRecord(raw)) return { ...UNPARSEABLE };
  const { verdict, confidence, reasonText, criteriaRef } = raw;
  if (typeof verdict !== 'string' || !VERDICTS.has(verdict)) return { ...UNPARSEABLE };
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ...UNPARSEABLE };
  }
  if (typeof reasonText !== 'string') return { ...UNPARSEABLE };
  if (typeof criteriaRef !== 'string' || criteriaRef.length === 0) return { ...UNPARSEABLE };
  return {
    verdict: verdict as TriageAdvisoryVerdict,
    confidence,
    reasonText: truncateReasonText(reasonText),
    criteriaRef,
  };
}

export function advisoryForNonAiDrop(input: {
  criteriaRef: string;
  reasonText: string;
}): TriageAdvisory {
  return {
    verdict: 'filtered',
    confidence: 1,
    reasonText: truncateReasonText(input.reasonText),
    criteriaRef: input.criteriaRef,
  };
}

export function advisoryForKeep(input: {
  confidence: number;
  reasonText: string;
  criteriaRef: string;
}): TriageAdvisory {
  const confidence = Number.isFinite(input.confidence)
    ? Math.min(1, Math.max(0, input.confidence))
    : 0;
  return {
    verdict: 'approved',
    confidence,
    reasonText: truncateReasonText(input.reasonText),
    criteriaRef: input.criteriaRef,
  };
}

/** Non-AI / keyword / budget / date drops: confidence 1, one rule id in criteriaRef. */
export function advisoryFromMachineDrop(reason: TriageReason): TriageAdvisory {
  if (reason.startsWith('muted:')) {
    const id = reason.slice('muted:'.length);
    return advisoryForNonAiDrop({
      criteriaRef: `rule:mute:${id}`,
      reasonText: `Muted by rule or undesired topic ${id}.`,
    });
  }
  if (reason.startsWith('blocklist:')) {
    const term = reason.slice('blocklist:'.length);
    return advisoryForNonAiDrop({
      criteriaRef: `rule:blocklist:${term}`,
      reasonText: `Blocked by config term ${term}.`,
    });
  }
  switch (reason) {
    case 'duplicate':
      return advisoryForNonAiDrop({
        criteriaRef: 'rule:duplicate',
        reasonText: 'Duplicate of another story already kept in this window.',
      });
    case 'not_scored_budget':
      return advisoryForNonAiDrop({
        criteriaRef: 'rule:budget',
        reasonText: 'Not scored: this refresh’s Jev budget ran out.',
      });
    case 'not_scored_error':
      return advisoryForNonAiDrop({
        criteriaRef: 'global',
        reasonText: 'Not scored: Jev was unavailable or the call failed.',
      });
    case 'off_topic':
      return advisoryForNonAiDrop({
        criteriaRef: 'global',
        reasonText: 'Off-topic: no desired topic matched.',
      });
    case 'undated':
      return advisoryForNonAiDrop({
        criteriaRef: 'global',
        reasonText: 'Topic search story had no usable date.',
      });
    case 'stale':
      return advisoryForNonAiDrop({
        criteriaRef: 'global',
        reasonText: 'Page date is older than the 48-hour triage window.',
      });
    case 'clickbait':
    case 'opinion':
    case 'rewrite':
    case 'sponsored':
    case 'not_significant':
      return advisoryForNonAiDrop({
        criteriaRef: 'global',
        reasonText: `Filtered as ${reason.replace(/_/g, ' ')}.`,
      });
    default:
      // `muted:*` and `blocklist:*` handled above; keep a safe fallback for future static reasons.
      return advisoryForNonAiDrop({
        criteriaRef: 'global',
        reasonText: `Filtered (${reason}).`,
      });
  }
}

/**
 * Build advisory fields from a Jev keep/drop decision. Uses the driving topic or
 * global criteria; when a source id is passed, criteriaRef is `source:<id>`.
 * Confidence comes from the quality answer (or relevance floor).
 */
export function advisoryFromJev(
  verdict: TriageVerdict,
  answers: TriageJevAnswers,
  topicsById: ReadonlyMap<string, Topic>,
  sourceId?: string,
): TriageAdvisory {
  const advisory = advisoryFromJevTopics(verdict, answers, topicsById);
  if (sourceId === undefined) return advisory;
  return { ...advisory, criteriaRef: `source:${sourceId}` };
}

function advisoryFromJevTopics(
  verdict: TriageVerdict,
  answers: TriageJevAnswers,
  topicsById: ReadonlyMap<string, Topic>,
): TriageAdvisory {
  if (verdict.decision === 'drop') {
    const reason = verdict.reason;
    if (reason.startsWith('muted:')) {
      const id = reason.slice('muted:'.length);
      const name = topicsById.get(id)?.name ?? id;
      return {
        verdict: 'filtered',
        confidence: Math.min(1, Math.max(0, answers.undesired[id] ?? answers.quality.confidence)),
        reasonText: truncateReasonText(`Matched undesired topic ${name}.`),
        criteriaRef: `topic:${id}`,
      };
    }
    if (reason === 'off_topic') {
      return {
        verdict: 'filtered',
        confidence: Math.min(1, Math.max(0, 1 - Math.max(0, ...Object.values(answers.relevance), 0))),
        reasonText: 'Jev found the story is not substantively about any candidate topic.',
        criteriaRef: 'global',
      };
    }
    if (reason === 'not_significant') {
      return {
        verdict: 'filtered',
        confidence: Math.min(1, Math.max(0, answers.quality.confidence)),
        reasonText: 'Only matched watch topics and was not significant enough.',
        criteriaRef: 'global',
      };
    }
    // Quality drops: clickbait / opinion / rewrite / sponsored
    return {
      verdict: 'filtered',
      confidence: Math.min(1, Math.max(0, answers.quality.confidence)),
      reasonText: truncateReasonText(`Story kind judged as ${reason}.`),
      criteriaRef: 'global',
    };
  }

  const primaryTopicId = verdict.topicIds[0];
  const primaryName = primaryTopicId
    ? (topicsById.get(primaryTopicId)?.name ?? primaryTopicId)
    : 'your topics';
  const criteriaRef = primaryTopicId ? `topic:${primaryTopicId}` : 'global';
  const topicList = verdict.topicIds
    .map((id) => topicsById.get(id)?.name ?? id)
    .join(', ');
  return advisoryForKeep({
    confidence: Math.min(1, Math.max(0, answers.quality.confidence)),
    reasonText: `Kept for ${topicList || primaryName}.`,
    criteriaRef,
  });
}
