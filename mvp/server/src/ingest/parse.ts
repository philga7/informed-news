import type { Pool } from 'pg';
import {
  INGEST_KINDS,
  putBreakingItem,
  putCfpDayNote,
  putCfpItem,
  putEntry,
  putMorningItem,
  putStory,
  type IngestKind,
  type PutResult,
} from '../store/postgres/ingestStore.js';
import type { JsonObject } from '../store/postgres/storeSupport.js';
import type {
  CfpStatus,
  EntryLabel,
  EntryPrecision,
  MorningKind,
  StoryRole,
  StoryStatus,
} from '../store/postgres/vocabulary.js';

/**
 * Reads one posted item (NEWS-228): checks its kind, the JSON types of its
 * fields and the contract's limits, and turns it into a store put. The store
 * then checks values (labels, times, ids, shapes). Unknown fields are refused
 * so a typo in Grok Bot's skill shows up as an error, not as a silent drop.
 * The contract is documented in docs/INGEST.md.
 */

export const LIMITS = {
  headline: 200,
  changes: 10,
  change: 280,
  entryTags: 20,
  batch: 100,
  /** All rows one request may write, nested rows included. */
  requestRows: 2000,
} as const;

export class IngestInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestInputError';
  }
}

export type ParsedItem = {
  kind: IngestKind;
  /** Rows the item writes, nested rows included: the batch total is capped. */
  rows: number;
  /** The id the result reports: the item's id, or the day of a CFP footer note. */
  id: string;
  put: (pool: Pool) => Promise<PutResult>;
};

type Fields = Record<string, unknown>;

class Reader {
  constructor(
    private readonly fields: Fields,
    private readonly where: string,
  ) {}

  private fail(message: string): never {
    throw new IngestInputError(`${this.where}: ${message}`);
  }

  only(allowed: readonly string[]): void {
    for (const key of Object.keys(this.fields)) {
      if (!allowed.includes(key)) this.fail(`unknown field ${key}`);
    }
  }

  text(key: string): string {
    const value = this.fields[key];
    if (typeof value !== 'string') this.fail(`${key} must be a string`);
    return value;
  }

  optionalText(key: string): string | null {
    const value = this.fields[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') this.fail(`${key} must be a string or null`);
    return value;
  }

  number(key: string): number | undefined {
    const value = this.fields[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number') this.fail(`${key} must be a number or null`);
    return value;
  }

  object(key: string): JsonObject | null {
    const value = this.fields[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) this.fail(`${key} must be an object`);
    return value as JsonObject;
  }

  list(key: string, max: number): unknown[] {
    const value = this.fields[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) this.fail(`${key} must be a list`);
    if (value.length > max) this.fail(`${key} holds more than ${max} items`);
    return value;
  }

  records(key: string, max: number): Reader[] {
    return this.list(key, max).map((value, i) => {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        this.fail(`${key}[${i}] must be an object`);
      }
      return new Reader(value as Fields, `${this.where} ${key}[${i}]`);
    });
  }

  texts(key: string, max: number, maxLength?: number): string[] {
    return this.list(key, max).map((value, i) => {
      if (typeof value !== 'string') this.fail(`${key}[${i}] must be a string`);
      if (maxLength !== undefined && value.length > maxLength) {
        this.fail(`${key}[${i}] is longer than ${maxLength} characters`);
      }
      return value;
    });
  }

  headline(): string {
    const value = this.text('headline');
    if (value.trim().length > LIMITS.headline) {
      this.fail(`headline is longer than ${LIMITS.headline} characters`);
    }
    return value;
  }
}

/** Nested lists on a story have no limit of their own beyond this sanity cap. */
const NESTED_MAX = 200;

const STORY_FIELDS = [
  'kind', 'id', 'role', 'hubId', 'title', 'status', 'nowSummary', 'nowUpdatedAt', 'cadence',
  'lastCheckedAt', 'nextCheckAt', 'unchangedNote', 'earlierSummary', 'sourcesNote', 'threadUrl',
  'ownerUserId', 'sources', 'tags', 'categoryIds', 'dates', 'panels', 'links',
] as const;

function tagsOf(r: Reader, max: number): Array<{ slug: string; name: string }> {
  return r.records('tags', max).map((tag) => {
    tag.only(['slug', 'name']);
    return { slug: tag.text('slug'), name: tag.text('name') };
  });
}

function parseStory(r: Reader): ParsedItem {
  r.only(STORY_FIELDS);
  const id = r.text('id');
  const post = {
    id,
    role: r.text('role') as StoryRole,
    hubId: r.optionalText('hubId'),
    title: r.text('title'),
    status: r.text('status') as StoryStatus,
    nowSummary: r.optionalText('nowSummary'),
    nowUpdatedAt: r.optionalText('nowUpdatedAt'),
    cadence: r.optionalText('cadence'),
    lastCheckedAt: r.optionalText('lastCheckedAt'),
    nextCheckAt: r.optionalText('nextCheckAt'),
    unchangedNote: r.optionalText('unchangedNote'),
    earlierSummary: r.optionalText('earlierSummary'),
    sourcesNote: r.optionalText('sourcesNote'),
    threadUrl: r.optionalText('threadUrl'),
    ownerUserId: r.optionalText('ownerUserId'),
    sources: r.records('sources', NESTED_MAX).map((s) => {
      s.only(['id', 'outlet', 'title', 'url', 'publishedOn', 'via', 'groupLabel', 'note']);
      return {
        id: s.text('id'),
        outlet: s.text('outlet'),
        title: s.optionalText('title'),
        url: s.optionalText('url'),
        publishedOn: s.optionalText('publishedOn'),
        via: s.optionalText('via'),
        groupLabel: s.optionalText('groupLabel'),
        note: s.optionalText('note'),
      };
    }),
    tags: tagsOf(r, NESTED_MAX),
    categoryIds: r.texts('categoryIds', NESTED_MAX),
    dates: r.records('dates', NESTED_MAX).map((d) => {
      d.only(['id', 'startsOn', 'endsOn', 'label']);
      return { id: d.text('id'), startsOn: d.text('startsOn'), endsOn: d.optionalText('endsOn'), label: d.text('label') };
    }),
    panels: r.records('panels', NESTED_MAX).map((p) => {
      p.only(['id', 'kind', 'title', 'payload', 'sort']);
      const payload = p.object('payload');
      if (payload === null) throw new IngestInputError(`story panels: payload must be an object`);
      return { id: p.text('id'), kind: p.text('kind'), title: p.text('title'), payload, sort: p.number('sort') };
    }),
    links: r.records('links', NESTED_MAX).map((l) => {
      l.only(['toStoryId', 'note']);
      return { toStoryId: l.text('toStoryId'), note: l.text('note') };
    }),
  };
  const rows =
    1 + post.sources.length + post.tags.length + post.categoryIds.length + post.dates.length +
    post.panels.length + post.links.length;
  return { kind: 'story', id, rows, put: (pool) => putStory(pool, post) };
}

function parseEntry(r: Reader): ParsedItem {
  r.only([
    'kind', 'id', 'storyId', 'occurredAt', 'occurredUntil', 'precision', 'headline', 'label', 'body',
    'changes', 'sources', 'tags',
  ]);
  const id = r.text('id');
  const post = {
    id,
    storyId: r.text('storyId'),
    occurredAt: r.text('occurredAt'),
    occurredUntil: r.optionalText('occurredUntil'),
    precision: r.text('precision') as EntryPrecision,
    headline: r.headline(),
    label: r.text('label') as EntryLabel,
    body: r.optionalText('body'),
    changes: r.texts('changes', LIMITS.changes, LIMITS.change),
    sources: r.records('sources', NESTED_MAX).map((s) => {
      s.only(['sourceId', 'url', 'label']);
      return { sourceId: s.optionalText('sourceId'), url: s.optionalText('url'), label: s.optionalText('label') };
    }),
    tags: tagsOf(r, LIMITS.entryTags),
  };
  const rows = 1 + post.sources.length + post.tags.length;
  return { kind: 'entry', id, rows, put: (pool) => putEntry(pool, post) };
}

function parseBreaking(r: Reader): ParsedItem {
  r.only(['kind', 'id', 'occurredAt', 'headline', 'label', 'sourceName', 'via', 'url', 'storyId', 'entryId']);
  const id = r.text('id');
  const post = {
    id,
    occurredAt: r.text('occurredAt'),
    headline: r.headline(),
    label: r.text('label') as EntryLabel,
    sourceName: r.optionalText('sourceName'),
    via: r.optionalText('via'),
    url: r.optionalText('url'),
    storyId: r.optionalText('storyId'),
    entryId: r.optionalText('entryId'),
  };
  return { kind: 'breaking', id, rows: 1, put: (pool) => putBreakingItem(pool, post) };
}

function parseCfpItem(r: Reader): ParsedItem {
  r.only(['kind', 'id', 'roundupAt', 'title', 'url', 'topic', 'sourceName', 'status']);
  const id = r.text('id');
  const post = {
    id,
    roundupAt: r.text('roundupAt'),
    title: r.text('title'),
    url: r.optionalText('url'),
    topic: r.optionalText('topic'),
    sourceName: r.optionalText('sourceName'),
    status: r.optionalText('status') as CfpStatus | null,
  };
  return { kind: 'cfp_item', id, rows: 1, put: (pool) => putCfpItem(pool, post) };
}

function parseCfpDayNote(r: Reader): ParsedItem {
  r.only(['kind', 'day', 'stillWorking', 'dropped']);
  const post = { day: r.text('day'), stillWorking: r.optionalText('stillWorking'), dropped: r.optionalText('dropped') };
  return { kind: 'cfp_day_note', id: post.day, rows: 1, put: (pool) => putCfpDayNote(pool, post) };
}

function parseMorning(r: Reader): ParsedItem {
  r.only(['kind', 'id', 'card', 'body', 'link', 'postedAt', 'data']);
  const id = r.text('id');
  const post = {
    id,
    kind: r.text('card') as MorningKind,
    body: r.text('body'),
    link: r.optionalText('link'),
    postedAt: r.text('postedAt'),
    data: r.object('data'),
  };
  return { kind: 'morning', id, rows: 1, put: (pool) => putMorningItem(pool, post) };
}

export function isIngestKind(value: unknown): value is IngestKind {
  return typeof value === 'string' && (INGEST_KINDS as readonly string[]).includes(value);
}

/** Read one item. Throws IngestInputError with a reason a bot can act on. */
export function parseItem(value: unknown): ParsedItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new IngestInputError('an item must be an object');
  }
  const fields = value as Fields;
  const kind = fields.kind;
  if (!isIngestKind(kind)) {
    throw new IngestInputError(`kind must be one of ${INGEST_KINDS.join(', ')}`);
  }
  const r = new Reader(fields, kind);
  switch (kind) {
    case 'story':
      return parseStory(r);
    case 'entry':
      return parseEntry(r);
    case 'breaking':
      return parseBreaking(r);
    case 'cfp_item':
      return parseCfpItem(r);
    case 'cfp_day_note':
      return parseCfpDayNote(r);
    case 'morning':
      return parseMorning(r);
    default: {
      const unexpected: never = kind;
      throw new IngestInputError(`unexpected kind ${String(unexpected)}`);
    }
  }
}
