import type { BriefFullStoryRecord } from '../types/briefFullStory.js';
import {
  FULL_STORY_AUTO_MAX_PER_REFRESH,
  FULL_STORY_AUTO_MAX_PER_TOPIC,
  FULL_STORY_AUTO_MIN_SIGNIFICANCE,
  FULL_STORY_MIN_OUTLETS_AUTO,
} from './briefConfig.js';
import { isSignificantlyUpdated, type BriefStory, type TopicBrief } from './topicBrief.js';

export type AutoFullStoryOptions = {
  maxPerRefresh?: number;
  maxPerTopic?: number;
  minOutlets?: number;
  minSignificance?: number;
  /**
   * The selector only has composed Brief cards, not each member's source
   * text. A caller that can calculate a current source hash may opt in here.
   */
  sourceHashChanged?: (story: BriefStory, record: BriefFullStoryRecord) => boolean;
};

type Candidate = { story: BriefStory; topicLevel: 'core' | 'watch' };

function articleTime(story: BriefStory): number {
  const time = Date.parse(story.publishedAt ?? story.fetchedAt);
  return Number.isNaN(time) ? 0 : time;
}

function isAutomaticCandidate(
  candidate: Candidate,
  existing: BriefFullStoryRecord | undefined,
  options: Required<Omit<AutoFullStoryOptions, 'sourceHashChanged'>> &
    Pick<AutoFullStoryOptions, 'sourceHashChanged'>,
): boolean {
  const { story, topicLevel } = candidate;
  if (topicLevel === 'core' && (story.significance === null || story.significance < options.minSignificance)) {
    return false;
  }
  if (story.outletCount < options.minOutlets && !story.labels.includes('official')) return false;
  if (existing?.status !== 'ok') return true;
  if (options.sourceHashChanged?.(story, existing)) return true;
  return existing.autoSnapshot !== undefined && isSignificantlyUpdated(story, existing.autoSnapshot);
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const sigA = a.story.significance ?? Number.NEGATIVE_INFINITY;
  const sigB = b.story.significance ?? Number.NEGATIVE_INFINITY;
  if (sigA !== sigB) return sigB - sigA;
  if (a.story.outletCount !== b.story.outletCount) return b.story.outletCount - a.story.outletCount;
  const time = articleTime(b.story) - articleTime(a.story);
  if (time !== 0) return time;
  return a.story.articleId.localeCompare(b.story.articleId);
}

/**
 * Select automatic full-story work from the visible Brief. Existing successful
 * records must have materially changed triage values (or a supplied source-hash
 * change) before they are selected again.
 */
export function selectAutoFullStoryTargets(
  brief: TopicBrief,
  existingRecords: Readonly<Record<string, BriefFullStoryRecord>>,
  opts: AutoFullStoryOptions = {},
): string[] {
  const options = {
    maxPerRefresh: opts.maxPerRefresh ?? FULL_STORY_AUTO_MAX_PER_REFRESH,
    maxPerTopic: opts.maxPerTopic ?? FULL_STORY_AUTO_MAX_PER_TOPIC,
    minOutlets: opts.minOutlets ?? FULL_STORY_MIN_OUTLETS_AUTO,
    minSignificance: opts.minSignificance ?? FULL_STORY_AUTO_MIN_SIGNIFICANCE,
    sourceHashChanged: opts.sourceHashChanged,
  };
  const candidates: Candidate[] = [];

  for (const section of brief.sections) {
    const eligible = section.stories
      .map((story) => ({ story, topicLevel: section.topic.level }))
      .filter((candidate) => isAutomaticCandidate(candidate, existingRecords[candidate.story.articleId], options))
      .sort(compareCandidates)
      .slice(0, options.maxPerTopic);
    candidates.push(...eligible);
  }

  return candidates.sort(compareCandidates).slice(0, options.maxPerRefresh).map(({ story }) => story.articleId);
}
