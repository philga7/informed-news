import {
  TOPIC_KINDS,
  TOPIC_LEVELS,
  TOPIC_SECTIONS,
  type TopicFields,
  type TopicKind,
  type TopicLevel,
  type TopicPatch,
  type TopicSection,
} from '../types/topic.js';

export const TOPIC_NAME_MAX = 80;
export const TOPIC_TEXT_MAX = 500;
export const TOPIC_KEYWORDS_MAX = 50;
export const TOPIC_KEYWORD_MAX = 100;

export class TopicValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TopicValidationError';
  }
}

const SECTIONS_ERROR = `sections must be a list of: ${TOPIC_SECTIONS.join(', ')}`;

function parseName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TopicValidationError('name is required');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TopicValidationError('name is required');
  }
  if (trimmed.length > TOPIC_NAME_MAX) {
    throw new TopicValidationError(`name must be at most ${TOPIC_NAME_MAX} characters`);
  }
  return trimmed;
}

function parseKind(value: unknown): TopicKind {
  if (!TOPIC_KINDS.includes(value as TopicKind)) {
    throw new TopicValidationError('kind must be desired or undesired');
  }
  return value as TopicKind;
}

function parseLevel(value: unknown): TopicLevel | null {
  if (value === null) {
    return null;
  }
  if (!TOPIC_LEVELS.includes(value as TopicLevel)) {
    throw new TopicValidationError('level must be core or watch');
  }
  return value as TopicLevel;
}

function parseText(field: 'description' | 'searchQuery' | 'notes', value: unknown): string {
  if (typeof value !== 'string') {
    throw new TopicValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > TOPIC_TEXT_MAX) {
    throw new TopicValidationError(`${field} must be at most ${TOPIC_TEXT_MAX} characters`);
  }
  return trimmed;
}

function parseKeywords(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((keyword) => typeof keyword !== 'string')) {
    throw new TopicValidationError('keywords must be an array of strings');
  }
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of value as string[]) {
    const keyword = raw.trim();
    if (!keyword) {
      continue;
    }
    if (keyword.length > TOPIC_KEYWORD_MAX) {
      throw new TopicValidationError(
        `each keyword must be at most ${TOPIC_KEYWORD_MAX} characters`,
      );
    }
    const key = keyword.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    keywords.push(keyword);
  }
  if (keywords.length > TOPIC_KEYWORDS_MAX) {
    throw new TopicValidationError(`at most ${TOPIC_KEYWORDS_MAX} keywords`);
  }
  return keywords;
}

function parseSections(value: unknown): TopicSection[] {
  if (
    !Array.isArray(value) ||
    value.some((section) => !TOPIC_SECTIONS.includes(section as TopicSection))
  ) {
    throw new TopicValidationError(SECTIONS_ERROR);
  }
  const requested = new Set(value as TopicSection[]);
  return TOPIC_SECTIONS.filter((section) => requested.has(section));
}

/** Validate and normalize only the topic fields present in the body. */
export function parseTopicPatch(body: unknown): TopicPatch {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new TopicValidationError('body must be a JSON object');
  }

  const record = body as Record<string, unknown>;
  const patch: TopicPatch = {};

  if (record.name !== undefined) patch.name = parseName(record.name);
  if (record.kind !== undefined) patch.kind = parseKind(record.kind);
  if (record.level !== undefined) patch.level = parseLevel(record.level);
  if (record.description !== undefined) {
    patch.description = parseText('description', record.description);
  }
  if (record.keywords !== undefined) patch.keywords = parseKeywords(record.keywords);
  if (record.searchQuery !== undefined) {
    patch.searchQuery = parseText('searchQuery', record.searchQuery);
  }
  if (record.sections !== undefined) patch.sections = parseSections(record.sections);
  if (record.notes !== undefined) patch.notes = parseText('notes', record.notes);

  return patch;
}

/** Merge a patch onto existing fields and enforce cross-field rules. */
export function finalizeTopicFields(
  base: Partial<TopicFields>,
  patch: TopicPatch,
): TopicFields {
  const merged = { ...base, ...patch };

  if (!merged.name) {
    throw new TopicValidationError('name is required');
  }
  if (!merged.kind) {
    throw new TopicValidationError('kind is required');
  }

  const undesired = merged.kind === 'undesired';
  const level = undesired ? null : (merged.level ?? null);
  if (merged.kind === 'desired' && level === null) {
    throw new TopicValidationError('level is required for desired topics');
  }

  return {
    name: merged.name,
    kind: merged.kind,
    level,
    description: merged.description ?? '',
    keywords: merged.keywords ?? [],
    searchQuery: undesired ? '' : (merged.searchQuery ?? ''),
    sections: undesired ? [] : (merged.sections ?? []),
    notes: merged.notes ?? '',
  };
}

export function parseTopicCreate(body: unknown): TopicFields {
  return finalizeTopicFields({}, parseTopicPatch(body));
}
