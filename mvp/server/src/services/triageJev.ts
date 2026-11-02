/**
 * Triage Jev checks (NEWS-87): one `systemOne` call per article and stage asks
 * topic relevance, undesired-topic matches, story quality, and significance.
 * Answers are AI-assisted judgments, not ground truth.
 */
import type { Questions } from '@typesafe-ai/sdk';
import { choice, noul, score } from '@typesafe-ai/sdk';
import type { FeedbackEntry } from '../store/feedbackStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import type { TriageLabel, TriageReason } from '../types/triage.js';
import {
  BODY_EXCERPT_MAX_CHARS,
  HEADLINE_SNIPPET_MAX_CHARS,
  QUALITY_CONFIDENCE_MIN,
  RELEVANCE_MIN,
  UNDESIRED_MIN,
  WATCH_SIGNIFICANCE_MIN,
} from './triageConfig.js';
import { toPromptFeedback, type PromptFeedback } from './triageFeedback.js';
import { systemOne } from './typesafeClient.js';

export const QUALITY_LABELS = [
  'news',
  'official',
  'clickbait',
  'opinion',
  'rewrite',
  'sponsored',
] as const;
export type QualityLabel = (typeof QUALITY_LABELS)[number];

const QUALITY_CRITERIA: Record<QualityLabel, string> = {
  news: 'Straight news report with new information.',
  official:
    'An official or primary statement (government, court, company filing, press release), or reporting that is mainly that statement.',
  clickbait:
    'Clickbait or rage bait: withholds or exaggerates information to provoke clicks or anger.',
  opinion: 'Opinion, editorial, or commentary presented as news.',
  rewrite:
    'Rewrite, aggregation, or "what to know" roundup with no new reporting.',
  sponsored: 'Sponsored content, deals, shopping, stock tips, or listicles.',
};

const QUALITY_DROP_LABELS: ReadonlySet<QualityLabel> = new Set<QualityLabel>([
  'clickbait',
  'opinion',
  'rewrite',
  'sponsored',
]);

const SIGNIFICANCE_RUBRIC = [
  'Routine or minor update',
  'Notable but incremental development',
  'Significant development a follower of this topic must know',
] as const;

const TOPIC_FALSE_CRITERION = 'Not about this topic, or only a passing mention.';

/** Already capped by the caller. */
export type TriageJevContext = {
  candidates: Topic[];
  undesired: Topic[];
  sourceCriteria?: { sourceId: string; text: string };
  /** NEWS-190: reader feedback already selected and capped by the caller. Soft signal only. */
  feedback?: FeedbackEntry[];
};

export type TriageJevAnswers = {
  /** topicId → noul */
  relevance: Record<string, number>;
  /** topicId → noul */
  undesired: Record<string, number>;
  quality: { choice: QualityLabel; confidence: number };
  /** Expected score 0–2 */
  significance: number;
  /** Id of the feedback entry Jev says drove its judgment (NEWS-190); absent when none did. */
  feedbackRef?: string;
};

export type TriageVerdict =
  | { decision: 'keep'; topicIds: string[]; labels: TriageLabel[]; significance: number }
  | { decision: 'drop'; reason: TriageReason; topicIds: string[]; significance: number };

export type TriageHeadlineState = {
  headline: string;
  publisher: string | null;
  snippet: string;
  publishedAt: string | null;
  sourceCriteria?: string;
  /** Present only when feedback was selected. */
  feedbackNote?: string;
  feedback?: PromptFeedback[];
};

export type TriageBodyState = TriageHeadlineState & { bodyExcerpt: string };

export type TriageJudgeResult =
  | { ok: true; answers: TriageJevAnswers; verdict: TriageVerdict; model: string }
  | { ok: false; error: string };

const FEEDBACK_NONE = 'none';
const SIGNAL_LABEL = { like: 'Like', not_relevant: 'Not relevant' } as const;
const FEEDBACK_NOTE =
  'Reader feedback on earlier stories (Like / Not relevant, newest or most similar first). Use it as a soft hint about what this reader wants; it never excludes a story by itself.';

const topicKey = (i: number) => `topic_${i}`;
const undesiredKey = (i: number) => `undesired_${i}`;

function describe(topic: Topic): string | null {
  return topic.description.trim() || null;
}

export function buildTriageQuestions(ctx: TriageJevContext): Questions {
  const questions: Questions = {};
  ctx.candidates.forEach((topic, i) => {
    questions[topicKey(i)] = noul(`Is this story substantively about ${topic.name}?`, {
      true: describe(topic),
      false: TOPIC_FALSE_CRITERION,
    });
  });
  ctx.undesired.forEach((topic, i) => {
    questions[undesiredKey(i)] = noul(
      `Is this story about ${topic.name} (a subject the reader excluded)?`,
      { true: describe(topic) },
    );
  });
  const qualityPrompt =
    ctx.sourceCriteria === undefined
      ? 'What kind of story is this?'
      : `What kind of story is this? Source criteria: ${ctx.sourceCriteria.text}`;
  questions.quality = choice(qualityPrompt, QUALITY_CRITERIA);
  questions.significance = score(
    'How significant is this development for someone following the topic(s) this story is about?',
    SIGNIFICANCE_RUBRIC,
  );
  if (ctx.feedback && ctx.feedback.length > 0) {
    const criteria: Record<string, string> = {};
    for (const entry of ctx.feedback) {
      criteria[entry.id] = `The reader marked "${entry.snapshot.headline}" as ${SIGNAL_LABEL[entry.signal]}.`;
    }
    criteria[FEEDBACK_NONE] = 'No feedback entry materially affected the judgment of this story.';
    questions.feedback = choice(
      'Which reader feedback entry, if any, most affected your judgment of this story? Feedback is a soft hint about taste, never a reason to exclude a story on its own.',
      criteria,
    );
  }
  return questions;
}

/** Citation labels that name an aggregator, platform, or placeholder rather than the outlet. */
const AGGREGATOR_LABELS: ReadonlySet<string> = new Set([
  'cfp',
  'xcancel',
  'google news',
  'original',
  'x',
  'publisher',
  'source',
]);

function publisherLabel(article: Article): string | null {
  const handle = article.handle?.trim().replace(/^@/, '');
  if (handle) return `@${handle}`;
  const outlet = article.citations.find(
    (c) => c.label.trim() && !AGGREGATOR_LABELS.has(c.label.trim().toLowerCase()),
  );
  return outlet?.label.trim() || article.publisherDomain || null;
}

export function buildHeadlineState(
  article: Article,
  sourceCriteria?: string,
  feedback?: readonly FeedbackEntry[],
): TriageHeadlineState {
  const state: TriageHeadlineState = {
    headline: article.title,
    publisher: publisherLabel(article),
    snippet: article.snippet.trim().slice(0, HEADLINE_SNIPPET_MAX_CHARS),
    publishedAt: article.publishedAt,
  };
  if (sourceCriteria !== undefined) state.sourceCriteria = sourceCriteria;
  if (feedback && feedback.length > 0) {
    state.feedbackNote = FEEDBACK_NOTE;
    state.feedback = feedback.map(toPromptFeedback);
  }
  return state;
}

export function buildBodyState(
  article: Article,
  sourceCriteria?: string,
  feedback?: readonly FeedbackEntry[],
): TriageBodyState {
  return {
    ...buildHeadlineState(article, sourceCriteria, feedback),
    bodyExcerpt: (article.bodyText ?? '').trim().slice(0, BODY_EXCERPT_MAX_CHARS),
  };
}

export function routeTriageAnswers(
  answers: TriageJevAnswers,
  ctx: TriageJevContext,
): TriageVerdict {
  const { significance } = answers;
  const candidateIds = ctx.candidates.map((t) => t.id);
  const drop = (reason: TriageReason): TriageVerdict => ({
    decision: 'drop',
    reason,
    topicIds: candidateIds,
    significance,
  });

  const muted = ctx.undesired.find((t) => (answers.undesired[t.id] ?? 0) >= UNDESIRED_MIN);
  if (muted) return drop(`muted:${muted.id}`);

  const relevant = ctx.candidates.filter((t) => (answers.relevance[t.id] ?? 0) >= RELEVANCE_MIN);
  if (relevant.length === 0) return drop('off_topic');

  const confident = answers.quality.confidence >= QUALITY_CONFIDENCE_MIN;
  if (confident && QUALITY_DROP_LABELS.has(answers.quality.choice)) {
    return drop(answers.quality.choice as TriageReason);
  }
  const labels: TriageLabel[] =
    confident && answers.quality.choice === 'official' ? ['official'] : [];

  const kept = relevant.filter(
    (t) => t.level !== 'watch' || significance >= WATCH_SIGNIFICANCE_MIN,
  );
  if (kept.length === 0) return drop('not_significant');

  return { decision: 'keep', topicIds: kept.map((t) => t.id), labels, significance };
}

type RawAnswers = { readonly [name: string]: unknown };

const isFiniteNumber = (v: unknown): v is number => Number.isFinite(v);

function readNoul(raw: RawAnswers, key: string): number {
  const a = raw[key] as { noul?: unknown } | undefined;
  if (!isFiniteNumber(a?.noul)) {
    throw new Error(`Malformed Jev answer: ${key}`);
  }
  return a.noul;
}

function readQuality(raw: RawAnswers): TriageJevAnswers['quality'] {
  const a = raw.quality as { choice?: unknown; confidence?: unknown } | undefined;
  if (
    !isFiniteNumber(a?.confidence) ||
    !(QUALITY_LABELS as readonly unknown[]).includes(a.choice)
  ) {
    throw new Error('Malformed Jev answer: quality');
  }
  return { choice: a.choice as QualityLabel, confidence: a.confidence };
}

function readSignificance(raw: RawAnswers): number {
  const a = raw.significance as { score?: unknown } | undefined;
  if (!isFiniteNumber(a?.score)) {
    throw new Error('Malformed Jev answer: significance');
  }
  return a.score;
}

function mapAnswers(raw: RawAnswers, ctx: TriageJevContext): TriageJevAnswers {
  const relevance: Record<string, number> = {};
  ctx.candidates.forEach((t, i) => {
    relevance[t.id] = readNoul(raw, topicKey(i));
  });
  const undesired: Record<string, number> = {};
  ctx.undesired.forEach((t, i) => {
    undesired[t.id] = readNoul(raw, undesiredKey(i));
  });
  const feedbackRef = readFeedbackRef(raw, ctx);
  return {
    relevance,
    undesired,
    quality: readQuality(raw),
    significance: readSignificance(raw),
    ...(feedbackRef !== undefined ? { feedbackRef } : {}),
  };
}

/** Lenient: a missing, malformed, low-confidence, "none" or unknown answer cites nothing. */
function readFeedbackRef(raw: RawAnswers, ctx: TriageJevContext): string | undefined {
  if (!ctx.feedback || ctx.feedback.length === 0) return undefined;
  const a = raw.feedback as { choice?: unknown; confidence?: unknown } | undefined;
  if (typeof a?.choice !== 'string' || !isFiniteNumber(a.confidence)) return undefined;
  if (a.confidence < QUALITY_CONFIDENCE_MIN) return undefined;
  return ctx.feedback.some((e) => e.id === a.choice) ? a.choice : undefined;
}

/** Never throws: call errors and malformed answers come back as `ok: false`. */
export async function judgeTriage(
  stage: 'headline' | 'body',
  article: Article,
  ctx: TriageJevContext,
  deps: { systemOne?: typeof systemOne } = {},
): Promise<TriageJudgeResult> {
  const call = deps.systemOne ?? systemOne;
  try {
    const criteriaText = ctx.sourceCriteria?.text;
    const state =
      stage === 'body'
        ? buildBodyState(article, criteriaText, ctx.feedback)
        : buildHeadlineState(article, criteriaText, ctx.feedback);
    const res = await call<Questions>({
      state,
      questions: buildTriageQuestions(ctx),
    });
    if (!res.ok) return { ok: false, error: res.error };

    const answers = mapAnswers(res.result.answers, ctx);
    return {
      ok: true,
      answers,
      verdict: routeTriageAnswers(answers, ctx),
      model: res.result.model,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
