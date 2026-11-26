import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import {
  STORY_INSERT_SQL,
  checkPrivateStoryRules,
  insertBreakingItem,
  insertCfpRoundupItem,
  insertEntry,
  insertMorningItem,
  prepareBreakingItem,
  prepareCfpDayNote,
  prepareCfpRoundupItem,
  prepareEntry,
  prepareMorningItem,
  prepareStory,
  readBreakingItem,
  readCfpDayNote,
  readCfpRoundupItem,
  readMorningItem,
  readStory,
  readStoryEntry,
  storyParams,
  writeCfpDayNote,
  type BreakingItemInput,
  type BreakingItemRecord,
  type CfpDayNoteRecord,
  type CfpRoundupItemInput,
  type CfpRoundupItemRecord,
  type EntryDraft,
  type MorningItemInput,
  type MorningItemRecord,
  type Queryable,
  type StoryEntryInput,
  type StoryEntryRecord,
  type StoryInput,
  type StoryRecord,
} from './dashboardStore.js';
import {
  DashboardStoreError,
  asId,
  inTransaction,
  pgErrorCode,
  requiredText,
  storeErrorFrom,
  type JsonObject,
} from './storeSupport.js';
import {
  prepareStoryDate,
  prepareStoryLink,
  prepareStoryPanel,
  prepareStorySource,
  prepareStoryTag,
  type StoryDateInput,
  type StoryDateRecord,
  type StoryLinkRecord,
  type StoryPanelInput,
  type StoryPanelRecord,
  type StorySourceInput,
  type StorySourceRecord,
  type StoryTagRecord,
} from './storyDetailStore.js';
import { writerName, writerParams, type Writer, type WriterName } from './writer.js';

/**
 * Retry-safe writes for the ingest contract (NEWS-228). Every post carries its
 * own id, and each put runs in one transaction:
 *
 * - A story is created, or its own fields are replaced. Its nested rows are
 *   created or updated by their own ids, and nothing is deleted by leaving it
 *   out. Its role and hub cannot change.
 * - Entries, Breaking items, CFP items and Morning items are fixed once
 *   written: the same id with the same content changes nothing, and with
 *   different content it is a conflict.
 * - A CFP footer note is keyed by its day, and a new note replaces the old.
 *
 * Every put records its writer (NEWS-263) on each row it writes or changes.
 * A row that a post leaves as it was keeps the writer it had, so the same
 * fixed item posted again by another agent is `unchanged` and keeps its
 * first writer. A story keeps its creator; its last writer moves whenever a
 * post changes it or one of its nested rows.
 */

export type PutOutcome = 'created' | 'updated' | 'unchanged';
export type PutResult = { outcome: PutOutcome; id: string };

type Nested<T> = Omit<T, 'storyId' | 'id'> & { id: string };

export type StoryPost = Omit<StoryInput, 'hubId'> & {
  id: string;
  hubId?: string | null;
  sources?: Array<Nested<StorySourceInput>>;
  tags?: Array<{ slug: string; name: string }>;
  categoryIds?: string[];
  dates?: Array<Nested<StoryDateInput>>;
  panels?: Array<Nested<StoryPanelInput>>;
  links?: Array<{ toStoryId: string; note: string }>;
};

export type EntryPost = StoryEntryInput & {
  id: string;
  tags?: Array<{ slug: string; name: string }>;
};

const UNIQUE_VIOLATION = '23505';

/** A changed nested row takes the post's writer; an unchanged one keeps its own. */
const WRITER_FROM_EXCLUDED =
  'written_by_agent_id = EXCLUDED.written_by_agent_id, written_by_user_id = EXCLUDED.written_by_user_id';

type WriterValues = [string | null, string | null];

type StoryGuardRow = {
  role: string;
  hub_id: string | null;
  owner_user_id: string | null;
  created_by_agent_id: string | null;
  created_by_user_id: string | null;
};

const STORY_GUARD_SQL =
  'SELECT role, hub_id, owner_user_id, created_by_agent_id, created_by_user_id FROM stories WHERE id = $1';

function createdBy(row: StoryGuardRow, writer: Writer): boolean {
  const [agentId, userId] = writerParams(writer);
  return agentId !== null ? row.created_by_agent_id === agentId : row.created_by_user_id === userId;
}

/**
 * A private story belongs to the agent that created it (NEWS-263): any other
 * writer is refused. A story with no creator (written before agents and not
 * claimed) has no one it belongs to, so a private one is refused for all.
 */
function privateToAnother(row: StoryGuardRow, writer: Writer): boolean {
  return row.owner_user_id !== null && !createdBy(row, writer);
}

/**
 * An entry or Breaking item may point only at a story its writer may see. A
 * private story of another agent gets the answer a missing story gets.
 */
async function checkStoryVisible(db: Queryable, storyId: string, writer: Writer): Promise<void> {
  const row = (await db.query<StoryGuardRow>(STORY_GUARD_SQL, [storyId])).rows[0];
  if (row !== undefined && privateToAnother(row, writer)) {
    throw new DashboardStoreError(`storyId ${storyId} does not exist`, { reason: 'missing' });
  }
}

function conflict(message: string): DashboardStoreError {
  return new DashboardStoreError(message, { reason: 'conflict' });
}

function noRepeats(ids: string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new DashboardStoreError(`${what} ${id} is listed twice`);
    seen.add(id);
  }
}

/** Refuse nested ids that already belong to another story. */
async function ownNestedIds(
  client: PoolClient,
  table: 'story_sources' | 'story_dates' | 'story_panels',
  storyId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const taken = await client.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ANY($1::text[]) AND story_id <> $2 ORDER BY id LIMIT 1`,
    [ids, storyId],
  );
  const first = taken.rows[0];
  if (first) throw conflict(`${first.id} belongs to another story`);
}

/** Rows a statement wrote; 0 when an upsert found the row already the same. */
async function changed(client: PoolClient, sql: string, params: unknown[]): Promise<number> {
  return (await client.query(sql, params)).rowCount ?? 0;
}

const STORY_UPDATABLE = [
  'title',
  'status',
  'now_summary',
  'now_updated_at',
  'cadence',
  'last_checked_at',
  'next_check_at',
  'unchanged_note',
  'earlier_summary',
  'sources_note',
  'thread_url',
  'owner_user_id',
] as const;

const STORY_UPSERT_SQL = `${STORY_INSERT_SQL}
  ON CONFLICT (id) DO UPDATE SET ${STORY_UPDATABLE.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}
  WHERE (${STORY_UPDATABLE.map((c) => `stories.${c}`).join(', ')})
    IS DISTINCT FROM (${STORY_UPDATABLE.map((c) => `EXCLUDED.${c}`).join(', ')})
  RETURNING (xmax = 0) AS inserted`;

export async function putStory(pool: Pool, writer: Writer, post: StoryPost): Promise<PutResult> {
  const id = asId(post.id, 'id');
  const record = prepareStory({ ...post, id, hubId: post.hubId ?? null });
  const sources = (post.sources ?? []).map((source) =>
    prepareStorySource({ ...source, id: asId(source.id, 'source id'), storyId: id }),
  );
  const dates = (post.dates ?? []).map((date) =>
    prepareStoryDate({ ...date, id: asId(date.id, 'date id'), storyId: id }),
  );
  const panels = (post.panels ?? []).map((panel) =>
    prepareStoryPanel({ ...panel, id: asId(panel.id, 'panel id'), storyId: id }),
  );
  const tags = (post.tags ?? []).map((tag) => prepareStoryTag({ ...tag, storyId: id }));
  const categoryIds = (post.categoryIds ?? []).map((categoryId) =>
    requiredText(categoryId, 'category id'),
  );
  const links = (post.links ?? []).map((link) =>
    prepareStoryLink({ fromStoryId: id, toStoryId: link.toStoryId, note: link.note }),
  );
  noRepeats(sources.map((row) => row.id), 'source');
  noRepeats(dates.map((row) => row.id), 'date');
  noRepeats(panels.map((row) => row.id), 'panel');
  noRepeats(tags.map((row) => row.slug), 'tag');
  noRepeats(categoryIds, 'category');
  noRepeats(links.map((row) => row.toStoryId), 'link to');

  try {
    return await inTransaction(pool, async (client) => {
      const existing = await client.query<StoryGuardRow>(`${STORY_GUARD_SQL} FOR UPDATE`, [id]);
      const before = existing.rows[0];
      // Another agent's private story: the id is taken, and nothing else is said about it.
      if (before && privateToAnother(before, writer)) throw conflict(`story id ${id} is taken`);
      if (before && (before.role !== record.role || before.hub_id !== record.hubId)) {
        throw conflict("a story's role and hub cannot change");
      }
      // Who can see a story is its creator's call: another agent may re-post a shared story,
      // but not make it private, move it to another owner, or share it.
      if (before && before.owner_user_id !== record.ownerUserId && !createdBy(before, writer)) {
        throw conflict("only the story's creator can change who can see it");
      }
      await checkPrivateStoryRules(client, record);
      const story = await client.query<{ inserted: boolean }>(STORY_UPSERT_SQL, storyParams(record, writer));
      let writes = story.rowCount ?? 0;
      const created = story.rows[0]?.inserted === true;
      if (!created) {
        // A first post that raced another first post of the same id finds the
        // row only now: check its role and hub again against what is stored.
        const stored = await client.query<StoryGuardRow>(STORY_GUARD_SQL, [id]);
        const row = stored.rows[0];
        // Our update has already landed on that row, so its owner can no longer be
        // compared: refuse when another writer created it, and the retry is checked
        // against the stored row like any re-post.
        if (before === undefined && row && !createdBy(row, writer)) {
          throw conflict(`story id ${id} was just created by another writer; retry`);
        }
        if (row && (row.role !== record.role || row.hub_id !== record.hubId)) {
          throw conflict("a story's role and hub cannot change");
        }
      }

      const nested = [
        ['story_sources', sources.map((row) => row.id)],
        ['story_dates', dates.map((row) => row.id)],
        ['story_panels', panels.map((row) => row.id)],
      ] as const;
      for (const [table, ids] of nested) await ownNestedIds(client, table, id, ids);
      const by = writerParams(writer);
      for (const source of sources) writes += await upsertSource(client, source, by);
      for (const date of dates) writes += await upsertDate(client, date, by);
      for (const panel of panels) writes += await upsertPanel(client, panel, by);
      // The upserts only touch rows of this story; a row another story wrote
      // in the meantime is caught here.
      for (const [table, ids] of nested) await ownNestedIds(client, table, id, ids);
      for (const tag of tags) {
        writes += await changed(
          client,
          `INSERT INTO story_tags (id, story_id, slug, name, written_by_agent_id, written_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (story_id, slug) DO UPDATE SET name = EXCLUDED.name,
             ${WRITER_FROM_EXCLUDED}
           WHERE story_tags.name IS DISTINCT FROM EXCLUDED.name`,
          [tag.id, tag.storyId, tag.slug, tag.name, ...by],
        );
      }
      for (const categoryId of categoryIds) {
        writes += await changed(
          client,
          `INSERT INTO story_categories (story_id, category_id, written_by_agent_id, written_by_user_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [id, categoryId, ...by],
        );
      }
      for (const link of links) {
        writes += await changed(
          client,
          `INSERT INTO story_links (from_story_id, to_story_id, note, written_by_agent_id, written_by_user_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (from_story_id, to_story_id) DO UPDATE SET note = EXCLUDED.note,
             ${WRITER_FROM_EXCLUDED}
           WHERE story_links.note IS DISTINCT FROM EXCLUDED.note`,
          [link.fromStoryId, link.toStoryId, link.note, ...by],
        );
      }
      if (!created && writes > 0) {
        const stored = (await client.query<StoryGuardRow>(STORY_GUARD_SQL, [id])).rows[0];
        if (stored && stored.created_by_agent_id === null && stored.created_by_user_id === null) {
          // Written before agents and not claimed: nothing is changed until the operator claims it.
          throw conflict(
            `story ${id} was written before agents and is not claimed; the operator claims it with npm run agents`,
          );
        }
        // The story or one of its nested rows changed: this writer is its last writer.
        await client.query(
          'UPDATE stories SET written_by_agent_id = $2, written_by_user_id = $3 WHERE id = $1',
          [id, ...by],
        );
      }
      return { id, outcome: created ? 'created' : writes > 0 ? 'updated' : 'unchanged' };
    });
  } catch (error) {
    throw storeErrorFrom(error);
  }
}

async function upsertSource(client: PoolClient, row: StorySourceRecord, by: WriterValues): Promise<number> {
  return changed(
    client,
    `INSERT INTO story_sources
       (id, story_id, outlet, title, url, published_on, via, group_label, note, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET outlet = EXCLUDED.outlet, title = EXCLUDED.title,
       url = EXCLUDED.url, published_on = EXCLUDED.published_on, via = EXCLUDED.via,
       group_label = EXCLUDED.group_label, note = EXCLUDED.note, ${WRITER_FROM_EXCLUDED}
     WHERE story_sources.story_id = EXCLUDED.story_id
       AND (story_sources.outlet, story_sources.title, story_sources.url, story_sources.published_on,
            story_sources.via, story_sources.group_label, story_sources.note)
       IS DISTINCT FROM (EXCLUDED.outlet, EXCLUDED.title, EXCLUDED.url, EXCLUDED.published_on,
            EXCLUDED.via, EXCLUDED.group_label, EXCLUDED.note)`,
    [row.id, row.storyId, row.outlet, row.title, row.url, row.publishedOn, row.via, row.groupLabel, row.note, ...by],
  );
}

async function upsertDate(client: PoolClient, row: StoryDateRecord, by: WriterValues): Promise<number> {
  return changed(
    client,
    `INSERT INTO story_dates (id, story_id, starts_on, ends_on, label, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on,
       label = EXCLUDED.label, ${WRITER_FROM_EXCLUDED}
     WHERE story_dates.story_id = EXCLUDED.story_id
       AND (story_dates.starts_on, story_dates.ends_on, story_dates.label)
       IS DISTINCT FROM (EXCLUDED.starts_on, EXCLUDED.ends_on, EXCLUDED.label)`,
    [row.id, row.storyId, row.startsOn, row.endsOn, row.label, ...by],
  );
}

async function upsertPanel(client: PoolClient, row: StoryPanelRecord, by: WriterValues): Promise<number> {
  return changed(
    client,
    `INSERT INTO story_panels (id, story_id, kind, title, payload, sort, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title,
       payload = EXCLUDED.payload, sort = EXCLUDED.sort, ${WRITER_FROM_EXCLUDED}
     WHERE story_panels.story_id = EXCLUDED.story_id
       AND (story_panels.kind, story_panels.title, story_panels.payload, story_panels.sort)
       IS DISTINCT FROM (EXCLUDED.kind, EXCLUDED.title, EXCLUDED.payload, EXCLUDED.sort)`,
    [row.id, row.storyId, row.kind, row.title, JSON.stringify(row.payload), row.sort, ...by],
  );
}

/**
 * Write a fixed item once. An item already stored under the id is compared:
 * the same is `unchanged`, anything else is a conflict. Two posts racing on
 * the same id end the same way: the loser's insert hits the key, and it
 * compares against the winner's row.
 */
async function putFixed<T>(
  pool: Pool,
  id: string,
  read: (db: Queryable) => Promise<T | null>,
  same: (stored: T) => boolean,
  write: (client: PoolClient) => Promise<void>,
  what: string,
): Promise<PutResult> {
  const settle = (stored: T): PutResult => {
    if (same(stored)) return { id, outcome: 'unchanged' };
    throw conflict(`${what} ${id} is already stored with different content`);
  };
  try {
    return await inTransaction(pool, async (client) => {
      const stored = await read(client);
      if (stored !== null) return settle(stored);
      await write(client);
      return { id, outcome: 'created' as const };
    });
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      const stored = await read(pool);
      if (stored !== null) return settle(stored);
    }
    throw storeErrorFrom(error);
  }
}

function sameEntry(draft: EntryDraft, slugs: string[], stored: StoryEntryRecord, storedSlugs: string[]): boolean {
  const { sources, id: _id, ...fields } = draft;
  const { sources: storedSources, id: _storedId, ...storedFields } = stored;
  if (!isDeepStrictEqual(fields, storedFields)) return false;
  if (sources.length !== storedSources.length) return false;
  const sameSources = sources.every((source, i) => {
    const kept = storedSources[i];
    return (
      kept !== undefined &&
      kept.sourceId === source.sourceId &&
      (source.url === null || source.url === kept.url) &&
      (source.label === null || source.label === kept.label)
    );
  });
  return sameSources && isDeepStrictEqual([...slugs].sort(), [...storedSlugs].sort());
}

async function entryTagSlugs(db: Queryable, entryId: string): Promise<string[]> {
  const result = await db.query<{ slug: string }>(
    `SELECT t.slug FROM entry_tags et JOIN story_tags t ON t.id = et.tag_id
     WHERE et.entry_id = $1 ORDER BY t.slug`,
    [entryId],
  );
  return result.rows.map((row) => row.slug);
}

export async function putEntry(pool: Pool, writer: Writer, post: EntryPost): Promise<PutResult> {
  const id = asId(post.id, 'id');
  const draft = prepareEntry({ ...post, id });
  const tags = (post.tags ?? []).map((tag) => prepareStoryTag({ ...tag, storyId: draft.storyId }));
  noRepeats(tags.map((tag) => tag.slug), 'tag');
  const slugs = tags.map((tag) => tag.slug);
  let storedSlugs: string[] = [];
  await checkStoryVisible(pool, draft.storyId, writer);
  return putFixed(
    pool,
    id,
    async (db) => {
      const stored = await readStoryEntry(db, id);
      if (stored !== null) storedSlugs = await entryTagSlugs(db, id);
      return stored;
    },
    (stored) => sameEntry(draft, slugs, stored, storedSlugs),
    async (client) => {
      await insertEntry(client, draft, writer);
      for (const tag of tags) await tagEntry(client, id, tag, writer);
    },
    'entry',
  );
}

/** Tag an entry, creating the tag on its story when the slug is new. A known slug keeps its name. */
async function tagEntry(client: PoolClient, entryId: string, tag: StoryTagRecord, writer: Writer): Promise<void> {
  await client.query(
    `INSERT INTO story_tags (id, story_id, slug, name, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (story_id, slug) DO NOTHING`,
    [tag.id, tag.storyId, tag.slug, tag.name, ...writerParams(writer)],
  );
  await client.query(
    `INSERT INTO entry_tags (entry_id, tag_id)
     SELECT $1, id FROM story_tags WHERE story_id = $2 AND slug = $3
     ON CONFLICT DO NOTHING`,
    [entryId, tag.storyId, tag.slug],
  );
}

export async function putMorningItem(
  pool: Pool,
  writer: Writer,
  post: MorningItemInput & { id: string },
): Promise<PutResult> {
  const record = prepareMorningItem({ ...post, id: asId(post.id, 'id') });
  return putFixed<MorningItemRecord>(
    pool,
    record.id,
    (db) => readMorningItem(db, record.id),
    (stored) => isDeepStrictEqual(stored, record),
    (client) => insertMorningItem(client, record, writer),
    'Morning item',
  );
}

export async function putCfpItem(
  pool: Pool,
  writer: Writer,
  post: CfpRoundupItemInput & { id: string },
): Promise<PutResult> {
  const record = prepareCfpRoundupItem({ ...post, id: asId(post.id, 'id') });
  return putFixed<CfpRoundupItemRecord>(
    pool,
    record.id,
    (db) => readCfpRoundupItem(db, record.id),
    (stored) => isDeepStrictEqual(stored, record),
    (client) => insertCfpRoundupItem(client, record, writer),
    'CFP item',
  );
}

export async function putBreakingItem(
  pool: Pool,
  writer: Writer,
  post: BreakingItemInput & { id: string },
): Promise<PutResult> {
  const record = prepareBreakingItem({ ...post, id: asId(post.id, 'id') });
  if (record.storyId !== null) await checkStoryVisible(pool, record.storyId, writer);
  return putFixed<BreakingItemRecord>(
    pool,
    record.id,
    (db) => readBreakingItem(db, record.id),
    (stored) => isDeepStrictEqual(stored, record),
    (client) => insertBreakingItem(client, record, writer),
    'Breaking item',
  );
}

/** The CFP footer for one day. Its id is the day; a new note replaces the old. */
export async function putCfpDayNote(
  pool: Pool,
  writer: Writer,
  post: { day: string; stillWorking: string | null; dropped: string | null },
): Promise<PutResult> {
  const record = prepareCfpDayNote(post);
  try {
    return await inTransaction(pool, async (client) => {
      const before = await client.query('SELECT 1 FROM cfp_day_notes WHERE day = $1 FOR UPDATE', [record.day]);
      const wrote = await writeCfpDayNote(client, record, writer);
      const outcome: PutOutcome = before.rowCount === 0 ? 'created' : wrote ? 'updated' : 'unchanged';
      return { id: record.day, outcome };
    });
  } catch (error) {
    throw storeErrorFrom(error);
  }
}

/** A story as an agent sent it: its fields and every nested row it has. */
export type IngestedStory = StoryRecord & {
  sources: StorySourceRecord[];
  tags: Array<{ slug: string; name: string }>;
  categoryIds: string[];
  dates: StoryDateRecord[];
  panels: StoryPanelRecord[];
  links: StoryLinkRecord[];
};

async function readIngestedStory(pool: Pool, id: string): Promise<IngestedStory | null> {
  const story = await readStory(pool, id);
  if (story === null) return null;
  const [sources, tags, categories, dates, panels, links] = await Promise.all([
    pool.query<{
      id: string;
      story_id: string;
      outlet: string;
      title: string | null;
      url: string | null;
      published_on: string | null;
      via: string | null;
      group_label: string | null;
      note: string | null;
    }>(
      `SELECT id, story_id, outlet, title, url, published_on::text AS published_on, via, group_label, note
       FROM story_sources WHERE story_id = $1 ORDER BY id`,
      [id],
    ),
    pool.query<{ slug: string; name: string }>(
      'SELECT slug, name FROM story_tags WHERE story_id = $1 ORDER BY slug',
      [id],
    ),
    pool.query<{ category_id: string }>(
      'SELECT category_id FROM story_categories WHERE story_id = $1 ORDER BY category_id',
      [id],
    ),
    pool.query<{ id: string; story_id: string; starts_on: string; ends_on: string | null; label: string }>(
      `SELECT id, story_id, starts_on::text AS starts_on, ends_on::text AS ends_on, label
       FROM story_dates WHERE story_id = $1 ORDER BY starts_on, id`,
      [id],
    ),
    pool.query<{ id: string; story_id: string; kind: string; title: string; payload: JsonObject; sort: number }>(
      'SELECT id, story_id, kind, title, payload, sort FROM story_panels WHERE story_id = $1 ORDER BY sort, id',
      [id],
    ),
    pool.query<{ to_story_id: string; note: string }>(
      'SELECT to_story_id, note FROM story_links WHERE from_story_id = $1 ORDER BY to_story_id',
      [id],
    ),
  ]);
  return {
    ...story,
    sources: sources.rows.map((row) => ({
      id: row.id,
      storyId: row.story_id,
      outlet: row.outlet,
      title: row.title,
      url: row.url,
      publishedOn: row.published_on,
      via: row.via,
      groupLabel: row.group_label,
      note: row.note,
    })),
    tags: tags.rows,
    categoryIds: categories.rows.map((row) => row.category_id),
    dates: dates.rows.map((row) => ({
      id: row.id,
      storyId: row.story_id,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      label: row.label,
    })),
    panels: panels.rows.map((row) => ({
      id: row.id,
      storyId: row.story_id,
      kind: row.kind,
      title: row.title,
      payload: row.payload,
      sort: row.sort,
    })),
    links: links.rows.map((row) => ({ fromStoryId: id, toStoryId: row.to_story_id, note: row.note })),
  };
}

export const INGEST_KINDS = ['story', 'entry', 'breaking', 'cfp_item', 'cfp_day_note', 'morning'] as const;
export type IngestKind = (typeof INGEST_KINDS)[number];

/** The agent asking for a read-back (NEWS-263). */
export type IngestReader = { agentId: string };

type WriterRow = { written_by_agent_id: string | null; written_by_user_id: string | null };

const WRITTEN_KEYS = {
  story_entries: 'id',
  breaking_items: 'id',
  cfp_roundup_items: 'id',
  morning_items: 'id',
  cfp_day_notes: 'day',
} as const;

async function writtenBy(pool: Pool, table: keyof typeof WRITTEN_KEYS, key: string): Promise<WriterName> {
  const result = await pool.query<WriterRow>(
    `SELECT written_by_agent_id, written_by_user_id FROM ${table} WHERE ${WRITTEN_KEYS[table]} = $1`,
    [key],
  );
  const row = result.rows[0];
  return row ? writerName(row.written_by_agent_id, row.written_by_user_id) : null;
}

type StoryAccessRow = WriterRow & {
  owner_user_id: string | null;
  created_by_agent_id: string | null;
  created_by_user_id: string | null;
};

async function storyAccess(pool: Pool, storyId: string): Promise<StoryAccessRow | null> {
  const result = await pool.query<StoryAccessRow>(
    `SELECT owner_user_id, created_by_agent_id, created_by_user_id, written_by_agent_id, written_by_user_id
     FROM stories WHERE id = $1`,
    [storyId],
  );
  return result.rows[0] ?? null;
}

/**
 * A private story, and what hangs on it, reads back only for the agent that
 * created the story (NEWS-263). A story written before agents existed has no
 * creator, so no agent reads it back until the operator claims it.
 */
function hiddenFrom(reader: IngestReader, story: StoryAccessRow | null): boolean {
  return story !== null && story.owner_user_id !== null && story.created_by_agent_id !== reader.agentId;
}

/**
 * What the store holds for one posted item, for an agent's read-back, with who
 * wrote it (`writtenBy`, and a story's `createdBy`). Null when there is none,
 * or when the reader may not see it: another agent gets the same answer as
 * for an id that does not exist.
 */
export async function readIngested(
  pool: Pool,
  kind: IngestKind,
  id: string,
  reader: IngestReader,
): Promise<unknown> {
  switch (kind) {
    case 'story': {
      const access = await storyAccess(pool, id);
      if (access === null || hiddenFrom(reader, access)) return null;
      const story = await readIngestedStory(pool, id);
      if (story === null) return null;
      return {
        ...story,
        createdBy: writerName(access.created_by_agent_id, access.created_by_user_id),
        writtenBy: writerName(access.written_by_agent_id, access.written_by_user_id),
      };
    }
    case 'entry': {
      const entry = await readStoryEntry(pool, id);
      if (entry === null || hiddenFrom(reader, await storyAccess(pool, entry.storyId))) return null;
      return {
        ...entry,
        tags: await entryTagSlugs(pool, id),
        writtenBy: await writtenBy(pool, 'story_entries', id),
      };
    }
    case 'breaking': {
      const item = await readBreakingItem(pool, id);
      if (item === null) return null;
      const by = await writtenBy(pool, 'breaking_items', id);
      const ownItem = by !== null && 'agent' in by && by.agent === reader.agentId;
      if (item.storyId !== null && !ownItem && hiddenFrom(reader, await storyAccess(pool, item.storyId))) {
        return null;
      }
      return { ...item, writtenBy: by };
    }
    case 'cfp_item': {
      const item = await readCfpRoundupItem(pool, id);
      return item === null ? null : { ...item, writtenBy: await writtenBy(pool, 'cfp_roundup_items', id) };
    }
    case 'cfp_day_note': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return null;
      const note = await readCfpDayNote(pool, id);
      return note === null ? null : { ...note, writtenBy: await writtenBy(pool, 'cfp_day_notes', note.day) };
    }
    case 'morning': {
      // The post names the card `card`; the read-back says the same (NEWS-272).
      const item = await readMorningItem(pool, id);
      if (item === null) return null;
      const { kind: card, ...rest } = item;
      return { ...rest, card, writtenBy: await writtenBy(pool, 'morning_items', id) };
    }
    default: {
      const unexpected: never = kind;
      throw new DashboardStoreError(`unexpected kind ${String(unexpected)}`);
    }
  }
}

export type { CfpDayNoteRecord };
