import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { checkPanelPayload } from './jsonShapes.js';
import { writerParams, type Writer } from './writer.js';
import {
  DashboardStoreError,
  asCalendarDate,
  asInteger,
  asJsonObject,
  idOrNew,
  optionalCalendarDate,
  optionalText,
  requiredText,
  storeErrorFrom,
  type JsonObject,
} from './storeSupport.js';

/**
 * The parts of a story besides its entries: categories, tags, sources, next
 * dates, panels, and links to related stories (schema v2, NEWS-240).
 */

export type CategoryRecord = { id: string; name: string; sort: number };

export type StoryTagRecord = { id: string; storyId: string; slug: string; name: string };

/** One cited article. Per-outlet counts are derived, not stored. */
export type StorySourceRecord = {
  id: string;
  storyId: string;
  outlet: string;
  title: string | null;
  url: string | null;
  /** Calendar date, YYYY-MM-DD. */
  publishedOn: string | null;
  /** Where it was read when not at the outlet itself, for example "DNYUZ". */
  via: string | null;
  /** Free-text heading the story groups it under, for example "Israeli outlets". */
  groupLabel: string | null;
  note: string | null;
};

/** A "Next dates" row. Dates are calendar dates, YYYY-MM-DD. */
export type StoryDateRecord = {
  id: string;
  storyId: string;
  startsOn: string;
  endsOn: string | null;
  label: string;
};

/** A block such as Seats. `kind` is free text, so a one-off block needs no schema change. */
export type StoryPanelRecord = {
  id: string;
  storyId: string;
  kind: string;
  title: string;
  payload: JsonObject;
  sort: number;
};

export type StoryLinkRecord = { fromStoryId: string; toStoryId: string; note: string };

const TAG_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function createCategory(
  pool: Pool,
  input: { name: string; sort?: number },
): Promise<CategoryRecord> {
  const record: CategoryRecord = {
    id: randomUUID(),
    name: requiredText(input.name, 'name'),
    sort: asInteger(input.sort ?? 0, 'sort'),
  };
  await pool.query('INSERT INTO categories (id, name, sort) VALUES ($1, $2, $3)', [
    record.id,
    record.name,
    record.sort,
  ]);
  return record;
}

export async function readCategory(pool: Pool, id: string): Promise<CategoryRecord | null> {
  const result = await pool.query<CategoryRecord>(
    'SELECT id, name, sort FROM categories WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}

/** Put a story in a category. A story can sit in several. Repeating it changes nothing. */
export async function addStoryCategory(
  pool: Pool,
  writer: Writer,
  input: { storyId: string; categoryId: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO story_categories (story_id, category_id, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [
      requiredText(input.storyId, 'storyId'),
      requiredText(input.categoryId, 'categoryId'),
      ...writerParams(writer),
    ],
  );
}

export async function listStoryCategories(pool: Pool, storyId: string): Promise<CategoryRecord[]> {
  const result = await pool.query<CategoryRecord>(
    `SELECT c.id, c.name, c.sort
     FROM story_categories sc JOIN categories c ON c.id = sc.category_id
     WHERE sc.story_id = $1
     ORDER BY c.sort, c.name`,
    [storyId],
  );
  return result.rows;
}

/** Check a tag. Its id is new: tags are keyed by story and slug. */
export function prepareStoryTag(input: { storyId: string; slug: string; name: string }): StoryTagRecord {
  const slug = requiredText(input.slug, 'slug');
  if (!TAG_SLUG.test(slug)) {
    throw new DashboardStoreError('slug must be lowercase letters, digits and single hyphens');
  }
  return {
    id: randomUUID(),
    storyId: requiredText(input.storyId, 'storyId'),
    slug,
    name: requiredText(input.name, 'name'),
  };
}

export async function createStoryTag(
  pool: Pool,
  writer: Writer,
  input: { storyId: string; slug: string; name: string },
): Promise<StoryTagRecord> {
  const record = prepareStoryTag(input);
  await pool.query(
    `INSERT INTO story_tags (id, story_id, slug, name, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [record.id, record.storyId, record.slug, record.name, ...writerParams(writer)],
  );
  return record;
}

type TagRow = { id: string; story_id: string; slug: string; name: string };

function tagFromRow(row: TagRow): StoryTagRecord {
  return { id: row.id, storyId: row.story_id, slug: row.slug, name: row.name };
}

export async function readStoryTag(pool: Pool, id: string): Promise<StoryTagRecord | null> {
  const result = await pool.query<TagRow>(
    'SELECT id, story_id, slug, name FROM story_tags WHERE id = $1',
    [id],
  ).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
  const row = result.rows[0];
  return row ? tagFromRow(row) : null;
}

/** Tag an entry. The tag must belong to the entry's story. Repeating it changes nothing. */
export async function addEntryTag(
  pool: Pool,
  input: { entryId: string; tagId: string },
): Promise<void> {
  const entryId = requiredText(input.entryId, 'entryId');
  const tagId = requiredText(input.tagId, 'tagId');
  // One statement, so the same-story rule and the write cannot come apart.
  const result = await pool.query(
    `INSERT INTO entry_tags (entry_id, tag_id)
     SELECT e.id, t.id
     FROM story_entries e JOIN story_tags t ON t.story_id = e.story_id
     WHERE e.id = $1 AND t.id = $2
     ON CONFLICT DO NOTHING
     RETURNING entry_id`,
    [entryId, tagId],
  );
  if (result.rowCount === 1) return;
  const already = await pool.query(
    'SELECT 1 FROM entry_tags WHERE entry_id = $1 AND tag_id = $2',
    [entryId, tagId],
  );
  if (already.rowCount === 1) return;
  throw new DashboardStoreError('an entry can only carry a tag from its own story');
}

export async function listEntryTags(pool: Pool, entryId: string): Promise<StoryTagRecord[]> {
  const result = await pool.query<TagRow>(
    `SELECT t.id, t.story_id, t.slug, t.name
     FROM entry_tags et JOIN story_tags t ON t.id = et.tag_id
     WHERE et.entry_id = $1
     ORDER BY t.slug`,
    [entryId],
  );
  return result.rows.map(tagFromRow);
}

export type StorySourceInput = {
  id?: string | null;
  storyId: string;
  outlet: string;
  title?: string | null;
  url?: string | null;
  publishedOn?: string | null;
  via?: string | null;
  groupLabel?: string | null;
  note?: string | null;
};

export function prepareStorySource(input: StorySourceInput): StorySourceRecord {
  return {
    id: idOrNew(input.id, 'source id'),
    storyId: requiredText(input.storyId, 'storyId'),
    outlet: requiredText(input.outlet, 'outlet'),
    title: optionalText(input.title),
    url: optionalText(input.url),
    publishedOn: optionalCalendarDate(input.publishedOn, 'publishedOn'),
    via: optionalText(input.via),
    groupLabel: optionalText(input.groupLabel),
    note: optionalText(input.note),
  };
}

export async function createStorySource(
  pool: Pool,
  writer: Writer,
  input: StorySourceInput,
): Promise<StorySourceRecord> {
  const record = prepareStorySource(input);
  await pool.query(
    `INSERT INTO story_sources
       (id, story_id, outlet, title, url, published_on, via, group_label, note,
        written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      record.id,
      record.storyId,
      record.outlet,
      record.title,
      record.url,
      record.publishedOn,
      record.via,
      record.groupLabel,
      record.note,
      ...writerParams(writer),
    ],
  ).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
  return record;
}

type StorySourceRow = {
  id: string;
  story_id: string;
  outlet: string;
  title: string | null;
  url: string | null;
  published_on: string | null;
  via: string | null;
  group_label: string | null;
  note: string | null;
};

export async function readStorySource(pool: Pool, id: string): Promise<StorySourceRecord | null> {
  const result = await pool.query<StorySourceRow>(
    `SELECT id, story_id, outlet, title, url, published_on::text AS published_on,
            via, group_label, note
     FROM story_sources WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    storyId: row.story_id,
    outlet: row.outlet,
    title: row.title,
    url: row.url,
    publishedOn: row.published_on,
    via: row.via,
    groupLabel: row.group_label,
    note: row.note,
  };
}

export type StoryDateInput = {
  id?: string | null;
  storyId: string;
  startsOn: string;
  endsOn?: string | null;
  label: string;
};

export function prepareStoryDate(input: StoryDateInput): StoryDateRecord {
  const record: StoryDateRecord = {
    id: idOrNew(input.id, 'date id'),
    storyId: requiredText(input.storyId, 'storyId'),
    startsOn: asCalendarDate(input.startsOn, 'startsOn'),
    endsOn: optionalCalendarDate(input.endsOn, 'endsOn'),
    label: requiredText(input.label, 'label'),
  };
  if (record.endsOn !== null && record.endsOn < record.startsOn) {
    throw new DashboardStoreError('endsOn is before startsOn');
  }
  return record;
}

export async function createStoryDate(
  pool: Pool,
  writer: Writer,
  input: StoryDateInput,
): Promise<StoryDateRecord> {
  const record = prepareStoryDate(input);
  await pool.query(
    `INSERT INTO story_dates (id, story_id, starts_on, ends_on, label, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [record.id, record.storyId, record.startsOn, record.endsOn, record.label, ...writerParams(writer)],
  ).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
  return record;
}

type StoryDateRow = {
  id: string;
  story_id: string;
  starts_on: string;
  ends_on: string | null;
  label: string;
};

export async function readStoryDate(pool: Pool, id: string): Promise<StoryDateRecord | null> {
  const result = await pool.query<StoryDateRow>(
    `SELECT id, story_id, starts_on::text AS starts_on, ends_on::text AS ends_on, label
     FROM story_dates WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    storyId: row.story_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    label: row.label,
  };
}

export type StoryPanelInput = {
  id?: string | null;
  storyId: string;
  kind: string;
  title: string;
  payload: JsonObject;
  sort?: number;
};

/** Check a panel, including its payload's shape for its kind (NEWS-228). */
export function prepareStoryPanel(input: StoryPanelInput): StoryPanelRecord {
  const record: StoryPanelRecord = {
    id: idOrNew(input.id, 'panel id'),
    storyId: requiredText(input.storyId, 'storyId'),
    kind: requiredText(input.kind, 'kind'),
    title: requiredText(input.title, 'title'),
    payload: asJsonObject(input.payload, 'payload'),
    sort: asInteger(input.sort ?? 0, 'sort'),
  };
  checkPanelPayload(record.kind, record.payload);
  return record;
}

export async function createStoryPanel(
  pool: Pool,
  writer: Writer,
  input: StoryPanelInput,
): Promise<StoryPanelRecord> {
  const record = prepareStoryPanel(input);
  await pool.query(
    `INSERT INTO story_panels (id, story_id, kind, title, payload, sort, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
    [
      record.id,
      record.storyId,
      record.kind,
      record.title,
      JSON.stringify(record.payload),
      record.sort,
      ...writerParams(writer),
    ],
  ).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
  return record;
}

type StoryPanelRow = {
  id: string;
  story_id: string;
  kind: string;
  title: string;
  payload: JsonObject;
  sort: number;
};

export async function readStoryPanel(pool: Pool, id: string): Promise<StoryPanelRecord | null> {
  const result = await pool.query<StoryPanelRow>(
    'SELECT id, story_id, kind, title, payload, sort FROM story_panels WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    storyId: row.story_id,
    kind: row.kind,
    title: row.title,
    payload: row.payload,
    sort: row.sort,
  };
}

/** Relate one story to another, with a one-line reason. The link has a direction. */
export function prepareStoryLink(input: {
  fromStoryId: string;
  toStoryId: string;
  note: string;
}): StoryLinkRecord {
  const record: StoryLinkRecord = {
    fromStoryId: requiredText(input.fromStoryId, 'fromStoryId'),
    toStoryId: requiredText(input.toStoryId, 'toStoryId'),
    note: requiredText(input.note, 'note'),
  };
  if (record.fromStoryId === record.toStoryId) {
    throw new DashboardStoreError('a story cannot link to itself');
  }
  return record;
}

export async function createStoryLink(
  pool: Pool,
  writer: Writer,
  input: { fromStoryId: string; toStoryId: string; note: string },
): Promise<StoryLinkRecord> {
  const record = prepareStoryLink(input);
  await pool.query(
    `INSERT INTO story_links (from_story_id, to_story_id, note, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [record.fromStoryId, record.toStoryId, record.note, ...writerParams(writer)],
  ).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
  return record;
}

export async function readStoryLink(
  pool: Pool,
  fromStoryId: string,
  toStoryId: string,
): Promise<StoryLinkRecord | null> {
  const result = await pool.query<{ from_story_id: string; to_story_id: string; note: string }>(
    'SELECT from_story_id, to_story_id, note FROM story_links WHERE from_story_id = $1 AND to_story_id = $2',
    [fromStoryId, toStoryId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { fromStoryId: row.from_story_id, toStoryId: row.to_story_id, note: row.note };
}
