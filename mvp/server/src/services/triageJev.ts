/**
 * Triage Jev checks (NEWS-87): one `systemOne` call per article and stage asks
 * topic relevance, undesired-topic matches, story quality, and significance.
 * Answers are AI-assisted judgments, not ground truth.
 */
import type { Questions } from '@typesafe-ai/sdk';
import { choice, noul, score } from '@typesafe-ai/sdk';
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
export type TriageJevContext = { candidates: Topic[]; undesired: Topic[] };

export type TriageJevAnswers = {
  /** topicId → noul */
  relevance: Record<string, number>;
  /** topicId → noul */
  undesired: Record<string, number>;
  quality: { choice: QualityLabel; confidence: number };
  /** Expected score 0–2 */
  significance: number;
};

export type TriageVerdict =
  | { decision: 'keep'; topicIds: string[]; labels: TriageLabel[]; significance: number }
  | { decision: 'drop'; reason: TriageReason; topicIds: string[]; significance: number };

export type TriageHeadlineState = {
  headline: string;
  publisher: string | null;
  snippet: string;
  publishedAt: string | null;
};

export type TriageBodyState = TriageHeadlineState & { bodyExcerpt: string };

export type TriageJudgeResult =
  | { ok: true; answers: TriageJevAnswers; verdict: TriageVerdict; model: string }
  | { ok: false; error: string };

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
  questions.quality = choice('What kind of story is this?', QUALITY_CRITERIA);
  questions.significance = score(
    'How significant is this development for someone following this topic?',
    SIGNIFICANCE_RUBRIC,
  );
  return questions;
}

function publisherLabel(article: Article): string | null {
  return article.citations[0]?.label || article.publisherDomain || null;
}

export function buildHeadlineState(article: Article): TriageHeadlineState {
  return {
    headline: article.title,
    publisher: publisherLabel(article),
    snippet: article.snippet.trim().slice(0, HEADLINE_SNIPPET_MAX_CHARS),
    publishedAt: article.publishedAt,
  };
}

export function buildBodyState(article: Article): TriageBodyState {
  return {
    ...buildHeadlineState(article),
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

function readNoul(raw: RawAnswers, key: string): number {
  const a = raw[key] as { noul?: unknown } | undefined;
  if (typeof a?.noul !== 'number') {
    throw new Error(`Malformed Jev answer: ${key}`);
  }
  return a.noul;
}

function readQuality(raw: RawAnswers): TriageJevAnswers['quality'] {
  const a = raw.quality as { choice?: unknown; confidence?: unknown } | undefined;
  if (
    typeof a?.confidence !== 'number' ||
    !(QUALITY_LABELS as readonly unknown[]).includes(a.choice)
  ) {
    throw new Error('Malformed Jev answer: quality');
  }
  return { choice: a.choice as QualityLabel, confidence: a.confidence };
}

function readSignificance(raw: RawAnswers): number {
  const a = raw.significance as { score?: unknown } | undefined;
  if (typeof a?.score !== 'number') {
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
  return {
    relevance,
    undesired,
    quality: readQuality(raw),
    significance: readSignificance(raw),
  };
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
    const state = stage === 'body' ? buildBodyState(article) : buildHeadlineState(article);
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
