import { DashboardStoreError } from './storeSupport.js';

/**
 * The fixed values from docs/DECISIONS.md (2026-11-16, "Status labels are a
 * fixed list"), in the lowercase form the database stores. schema.sql repeats
 * them in its CHECK constraints. Tone is UI code and is not stored.
 */
export const ENTRY_LABELS = [
  'official_ruling',
  'official',
  'on_record',
  'reported',
  'working',
  'single_outlet',
  'claim_no_new_evidence',
  'claim_no_evidence_shown',
] as const;
export type EntryLabel = (typeof ENTRY_LABELS)[number];

/** Breaking items use the same eight labels as entries. */
export const BREAKING_LABELS = ENTRY_LABELS;
export type BreakingLabel = EntryLabel;

export const CFP_STATUSES = ['working', 'unconfirmed'] as const;
export type CfpStatus = (typeof CFP_STATUSES)[number];

export const STORY_STATUSES = ['developing', 'active', 'stalled', 'waiting'] as const;
export type StoryStatus = (typeof STORY_STATUSES)[number];

export const STORY_ROLES = ['hub', 'branch'] as const;
export type StoryRole = (typeof STORY_ROLES)[number];

export const MORNING_KINDS = ['bluf', 'weather', 'market', 'osint'] as const;
export type MorningKind = (typeof MORNING_KINDS)[number];

/** 'day' means the entry has a calendar day and no clock time. */
export const ENTRY_PRECISIONS = ['time', 'day'] as const;
export type EntryPrecision = (typeof ENTRY_PRECISIONS)[number];

function oneOf<T extends string>(allowed: readonly T[], value: string, what: string): T {
  const match = allowed.find((item) => item === value);
  if (match === undefined) throw new DashboardStoreError(`unexpected ${what} ${value}`);
  return match;
}

export function entryLabel(value: string): EntryLabel {
  return oneOf(ENTRY_LABELS, value, 'label');
}

export function cfpStatus(value: string): CfpStatus {
  return oneOf(CFP_STATUSES, value, 'CFP status');
}

export function storyStatus(value: string): StoryStatus {
  return oneOf(STORY_STATUSES, value, 'story status');
}

export function storyRole(value: string): StoryRole {
  return oneOf(STORY_ROLES, value, 'story role');
}

export function morningKind(value: string): MorningKind {
  return oneOf(MORNING_KINDS, value, 'morning kind');
}

export function entryPrecision(value: string): EntryPrecision {
  return oneOf(ENTRY_PRECISIONS, value, 'entry precision');
}

/** A read marker's tracker. CFP and Weather are one tracker each per user. */
export const TRACKER_KINDS = ['story', 'cfp', 'weather'] as const;
export type TrackerKind = (typeof TRACKER_KINDS)[number];

/** A user's choice for a story or topic. No row means neither. */
export const FOLLOW_STATES = ['follow', 'hide'] as const;
export type FollowState = (typeof FOLLOW_STATES)[number];

export function trackerKind(value: string): TrackerKind {
  return oneOf(TRACKER_KINDS, value, 'tracker kind');
}

export function followState(value: string): FollowState {
  return oneOf(FOLLOW_STATES, value, 'follow state');
}
