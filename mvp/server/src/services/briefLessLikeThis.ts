/**
 * "Less like this" on a Brief card (NEWS-90): writes an undesired topic for the
 * story's subject, or an outlet block for its publisher. Takes effect next refresh.
 */

import type { Article } from '../types/article.js';
import type { Topic, TopicFields } from '../types/topic.js';
import { parseTopicCreate, TOPIC_TEXT_MAX } from './topicInput.js';
import { isOutletKeyword, normalizeOutletDomain, topicBlocksOutlet } from './triageKeywords.js';

export const LESS_LIKE_THIS_KIND_ERROR = 'kind must be outlet or subject';
export const OUTLET_BLOCK_DESCRIPTION = 'Outlet blocked from the Brief.';

const NOTES_PREFIX = 'Added with Less like this on: ';
const NOTES_NO_HEADLINE = 'Added with Less like this.';

export type LessLikeThisDeps = {
  getArticle: (id: string) => Promise<Article | null>;
  readTopics: () => Promise<{ topics: Topic[] }>;
  createTopic: (fields: TopicFields) => Promise<{ topic: Topic; topics: Topic[] }>;
};

/** Topic validation (`TopicValidationError`) and store errors throw. */
export type LessLikeThisResult =
  | { ok: true; created: boolean; topic: Topic; topics: Topic[] }
  | { ok: false; status: 400 | 404; error: string };

type LessLikeThisRequest =
  | { kind: 'outlet' }
  | { kind: 'subject'; name: unknown; keywords: unknown; description: unknown };

function parseRequest(body: unknown): LessLikeThisRequest | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.kind === 'outlet') return { kind: 'outlet' };
  if (record.kind === 'subject') {
    return {
      kind: 'subject',
      name: record.name,
      keywords: record.keywords ?? [],
      description: record.description ?? '',
    };
  }
  return null;
}

/** `Added with Less like this on: <headline>`, headline cut with `…` to fit TOPIC_TEXT_MAX. */
export function lessLikeThisNotes(title: string | null | undefined): string {
  const headline = title?.trim();
  if (!headline) return NOTES_NO_HEADLINE;
  const room = TOPIC_TEXT_MAX - NOTES_PREFIX.length;
  if (headline.length <= room) return `${NOTES_PREFIX}${headline}`;
  return `${NOTES_PREFIX}${headline.slice(0, room - 1).trimEnd()}…`;
}

export async function lessLikeThis(
  articleId: string,
  body: unknown,
  deps: LessLikeThisDeps,
): Promise<LessLikeThisResult> {
  const request = parseRequest(body);
  if (!request) return { ok: false, status: 400, error: LESS_LIKE_THIS_KIND_ERROR };

  const article = await deps.getArticle(articleId);
  if (!article) return { ok: false, status: 404, error: 'story_not_found' };
  const notes = lessLikeThisNotes(article.title);

  if (request.kind === 'subject') {
    const fields = parseTopicCreate({
      kind: 'undesired',
      name: request.name,
      keywords: request.keywords,
      description: request.description,
      notes,
    });
    return { ok: true, created: true, ...(await deps.createTopic(fields)) };
  }

  const domain = normalizeOutletDomain(article.publisherDomain);
  if (!domain || !isOutletKeyword(domain)) return { ok: false, status: 400, error: 'no_outlet' };

  const { topics } = await deps.readTopics();
  const existing = topics.find((t) => t.kind === 'undesired' && topicBlocksOutlet(t, domain));
  if (existing) return { ok: true, created: false, topic: existing, topics };

  const fields = parseTopicCreate({
    kind: 'undesired',
    name: domain,
    keywords: [domain],
    description: OUTLET_BLOCK_DESCRIPTION,
    notes,
  });
  return { ok: true, created: true, ...(await deps.createTopic(fields)) };
}
