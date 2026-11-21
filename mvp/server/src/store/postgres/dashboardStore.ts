import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import {
  DashboardStoreError,
  asCalendarDate,
  asInstant,
  asJsonObject,
  inTransaction,
  optionalInstant,
  pgErrorCode,
  optionalText,
  requiredText,
  utcMidnight,
  type JsonObject,
} from './storeSupport.js';
import {
  cfpStatus,
  entryLabel,
  entryPrecision,
  morningKind,
  storyRole,
  storyStatus,
  type BreakingLabel,
  type CfpStatus,
  type EntryLabel,
  type EntryPrecision,
  type MorningKind,
  type StoryRole,
  type StoryStatus,
} from './vocabulary.js';

export { DashboardStoreError } from './storeSupport.js';
export type { JsonObject, JsonValue } from './storeSupport.js';
export type {
  BreakingLabel,
  CfpStatus,
  EntryLabel,
  EntryPrecision,
  MorningKind,
  StoryRole,
  StoryStatus,
} from './vocabulary.js';

export type StoryRecord = {
  id: string;
  role: StoryRole;
  hubId: string | null;
  title: string;
  status: StoryStatus;
  nowSummary: string | null;
  nowUpdatedAt: string | null;
  /** Free text, for example "twice daily, 9 AM and 9 PM". */
  cadence: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  unchangedNote: string | null;
  earlierSummary: string | null;
  sourcesNote: string | null;
  threadUrl: string | null;
  /** The user a private story belongs to; null means shared. */
  ownerUserId: string | null;
};

export type StoryInput = {
  role: StoryRole;
  hubId: string | null;
  title: string;
  status: StoryStatus;
  nowSummary?: string | null;
  nowUpdatedAt?: string | null;
  cadence?: string | null;
  lastCheckedAt?: string | null;
  nextCheckAt?: string | null;
  unchangedNote?: string | null;
  earlierSummary?: string | null;
  sourcesNote?: string | null;
  threadUrl?: string | null;
  /**
   * Makes the story private to this user. Missing or null means shared. Until
   * the open branch questions are decided, only a hub may be private, and a
   * branch may not sit under a private hub.
   */
  ownerUserId?: string | null;
};

export type EntrySourceRecord = {
  id: string;
  url: string;
  label: string;
  /** The story_sources row this citation points at, when there is one. */
  sourceId: string | null;
};

export type StoryEntryRecord = {
  id: string;
  storyId: string;
  /** UTC. For a 'day' entry this is 00:00 UTC of its calendar day. */
  occurredAt: string;
  /** UTC end of a range, or null. For a 'day' entry, 00:00 UTC of the last day. */
  occurredUntil: string | null;
  precision: EntryPrecision;
  headline: string;
  label: EntryLabel;
  body: string;
  changes: string[];
  sources: EntrySourceRecord[];
};

export type StoryEntryInput = {
  storyId: string;
  /**
   * With precision 'time': a timestamp with a zone offset.
   * With precision 'day': a calendar date, YYYY-MM-DD.
   */
  occurredAt: string;
  /** Same form as occurredAt. The last moment or the last day of a range. */
  occurredUntil?: string | null;
  precision: EntryPrecision;
  headline: string;
  label: EntryLabel;
  body: string;
  changes?: string[];
  sources: Array<{ url: string; label: string; sourceId?: string | null }>;
};

export type MorningItemRecord = {
  id: string;
  kind: MorningKind;
  body: string;
  link: string | null;
  postedAt: string;
  /** Structured content such as the weather grid or market figures. */
  data: JsonObject | null;
};

export type CfpRoundupItemRecord = {
  id: string;
  roundupAt: string;
  title: string;
  url: string | null;
  topic: string | null;
  sourceName: string | null;
  status: CfpStatus | null;
};

export type BreakingItemRecord = {
  id: string;
  occurredAt: string;
  headline: string;
  label: BreakingLabel;
  sourceName: string | null;
  via: string | null;
  url: string | null;
  storyId: string | null;
  entryId: string | null;
};

export type CfpDayNoteRecord = {
  /** Calendar date, YYYY-MM-DD. */
  day: string;
  stillWorking: string | null;
  dropped: string | null;
};

type StoryRow = {
  id: string;
  role: string;
  hub_id: string | null;
  title: string;
  status: string;
  now_summary: string | null;
  now_updated_at: Date | null;
  cadence: string | null;
  last_checked_at: Date | null;
  next_check_at: Date | null;
  unchanged_note: string | null;
  earlier_summary: string | null;
  sources_note: string | null;
  thread_url: string | null;
  owner_user_id: string | null;
};

type EntryRow = {
  id: string;
  story_id: string;
  occurred_at: Date;
  occurred_until: Date | null;
  occurred_precision: string;
  headline: string;
  label: string;
  body: string;
  changes: string[];
};

type SourceRow = {
  id: string;
  url: string;
  label: string;
  source_id: string | null;
};

type MorningRow = {
  id: string;
  kind: string;
  body: string;
  link: string | null;
  posted_at: Date;
  data: JsonObject | null;
};

type CfpRow = {
  id: string;
  roundup_at: Date;
  title: string;
  url: string | null;
  topic: string | null;
  source_name: string | null;
  status: string | null;
};

type BreakingRow = {
  id: string;
  occurred_at: Date;
  headline: string;
  label: string;
  source_name: string | null;
  via: string | null;
  url: string | null;
  story_id: string | null;
  entry_id: string | null;
};

type CfpDayNoteRow = {
  day: string;
  still_working: string | null;
  dropped: string | null;
};

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function dashboardSchemaSql(): string {
  return readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
}

/** Any fixed number: it only has to be the same for every caller. */
const SCHEMA_LOCK_KEY = 240_224;
const NOT_NULL_VIOLATION = '23502';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * The version schema.sql brings a database to. NEWS-224 was 1, schema v2
 * (NEWS-240) was 2, accounts and read markers (NEWS-254) are 3. Bump it in the
 * same change as any edit to schema.sql: a database whose version row is
 * current runs nothing, so an edit without a bump never reaches it. A test
 * pins the file's hash to this number.
 */
export const DASHBOARD_SCHEMA_VERSION = 3;

/**
 * The version a database records, or 0 when it has no version row yet (an
 * empty database, or one built before NEWS-254).
 */
async function appliedSchemaVersion(client: PoolClient): Promise<number> {
  const table = await client.query<{ present: boolean }>(
    `SELECT to_regclass('dashboard_schema_version') IS NOT NULL AS present`,
  );
  if (table.rows[0]?.present !== true) return 0;
  const row = await client.query<{ version: number }>(
    'SELECT version FROM dashboard_schema_version WHERE id',
  );
  return row.rows[0]?.version ?? 0;
}

/**
 * Create or widen the dashboard tables and record DASHBOARD_SCHEMA_VERSION.
 * Safe to run again: once the version row is current it changes and locks
 * nothing. It runs in one transaction, so a
 * failure leaves the database as it was. Rows written under
 * the NEWS-224 schema lack the fields v2 requires, and no value is invented
 * for them: applying v2 over such rows fails.
 */
export async function ensureDashboardSchema(pool: Pool): Promise<void> {
  try {
    await inTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [SCHEMA_LOCK_KEY]);
      if ((await appliedSchemaVersion(client)) >= DASHBOARD_SCHEMA_VERSION) return;
      await client.query(dashboardSchemaSql());
      await client.query(
        `INSERT INTO dashboard_schema_version (id, version) VALUES (true, $1)
         ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version`,
        [DASHBOARD_SCHEMA_VERSION],
      );
    });
  } catch (error) {
    if (pgErrorCode(error) === NOT_NULL_VIOLATION) {
      throw new DashboardStoreError(
        'schema v2 cannot be applied: a NEWS-224 table holds rows without the fields v2 requires',
        { cause: error },
      );
    }
    throw error;
  }
}

const STORY_COLUMNS = `id, role, hub_id, title, status, now_summary, now_updated_at, cadence,
  last_checked_at, next_check_at, unchanged_note, earlier_summary, sources_note, thread_url,
  owner_user_id`;

export async function createStory(pool: Pool, input: StoryInput): Promise<StoryRecord> {
  const title = requiredText(input.title, 'title');
  const role = storyRole(input.role);
  const status = storyStatus(input.status);
  let hubId: string | null;
  switch (role) {
    case 'hub':
      if (input.hubId !== null) throw new DashboardStoreError('a hub has no hub');
      hubId = null;
      break;
    case 'branch': {
      const linked = input.hubId?.trim() ?? '';
      if (!linked) throw new DashboardStoreError('a branch requires a hub');
      hubId = linked;
      break;
    }
    default: {
      const unexpected: never = role;
      throw new DashboardStoreError(`unexpected story role ${String(unexpected)}`);
    }
  }
  const record: StoryRecord = {
    id: randomUUID(),
    role,
    hubId,
    title,
    status,
    nowSummary: optionalText(input.nowSummary),
    nowUpdatedAt: optionalInstant(input.nowUpdatedAt, 'nowUpdatedAt'),
    cadence: optionalText(input.cadence),
    lastCheckedAt: optionalInstant(input.lastCheckedAt, 'lastCheckedAt'),
    nextCheckAt: optionalInstant(input.nextCheckAt, 'nextCheckAt'),
    unchangedNote: optionalText(input.unchangedNote),
    earlierSummary: optionalText(input.earlierSummary),
    sourcesNote: optionalText(input.sourcesNote),
    threadUrl: optionalText(input.threadUrl),
    ownerUserId: optionalText(input.ownerUserId),
  };
  if (record.role === 'branch' && record.ownerUserId !== null) {
    throw new DashboardStoreError('a branch cannot be private yet');
  }
  await inTransaction(pool, async (client) => {
    if (record.hubId !== null) {
      // Lock the hub so it cannot change between this check and the insert.
      const hub = await client.query<{ owner_user_id: string | null }>(
        'SELECT owner_user_id FROM stories WHERE id = $1 FOR SHARE',
        [record.hubId],
      );
      if (hub.rows[0]?.owner_user_id != null) {
        throw new DashboardStoreError('a branch cannot sit under a private hub yet');
      }
    }
    await insertStory(client, record);
  }).catch((error: unknown) => {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new DashboardStoreError('story refers to a missing hub or owner', { cause: error });
    }
    throw error;
  });
  return record;
}

async function insertStory(client: PoolClient, record: StoryRecord): Promise<void> {
  await client.query(
    `INSERT INTO stories (${STORY_COLUMNS})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      record.id,
      record.role,
      record.hubId,
      record.title,
      record.status,
      record.nowSummary,
      record.nowUpdatedAt,
      record.cadence,
      record.lastCheckedAt,
      record.nextCheckAt,
      record.unchangedNote,
      record.earlierSummary,
      record.sourcesNote,
      record.threadUrl,
      record.ownerUserId,
    ],
  );
}

export async function readStory(pool: Pool, id: string): Promise<StoryRecord | null> {
  const result = await pool.query<StoryRow>(
    `SELECT ${STORY_COLUMNS} FROM stories WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    role: storyRole(row.role),
    hubId: row.hub_id,
    title: row.title,
    status: storyStatus(row.status),
    nowSummary: row.now_summary,
    nowUpdatedAt: isoOrNull(row.now_updated_at),
    cadence: row.cadence,
    lastCheckedAt: isoOrNull(row.last_checked_at),
    nextCheckAt: isoOrNull(row.next_check_at),
    unchangedNote: row.unchanged_note,
    earlierSummary: row.earlier_summary,
    sourcesNote: row.sources_note,
    threadUrl: row.thread_url,
    ownerUserId: row.owner_user_id,
  };
}

function entryMoment(value: string, precision: EntryPrecision, label: string): string {
  switch (precision) {
    case 'time':
      return asInstant(value, label);
    case 'day':
      return utcMidnight(asCalendarDate(value, label));
    default: {
      const unexpected: never = precision;
      throw new DashboardStoreError(`unexpected entry precision ${String(unexpected)}`);
    }
  }
}

export async function createStoryEntry(
  pool: Pool,
  input: StoryEntryInput,
): Promise<StoryEntryRecord> {
  const storyId = requiredText(input.storyId, 'storyId');
  const headline = requiredText(input.headline, 'headline');
  const body = requiredText(input.body, 'body');
  const label = entryLabel(input.label);
  const precision = entryPrecision(input.precision);
  const occurredAt = entryMoment(input.occurredAt, precision, 'occurredAt');
  const occurredUntil =
    input.occurredUntil === null || input.occurredUntil === undefined
      ? null
      : entryMoment(input.occurredUntil, precision, 'occurredUntil');
  if (occurredUntil !== null && Date.parse(occurredUntil) < Date.parse(occurredAt)) {
    throw new DashboardStoreError('occurredUntil is before occurredAt');
  }
  const changes = (input.changes ?? []).map((change) => requiredText(change, 'change'));
  const sources: EntrySourceRecord[] = input.sources.map((source) => ({
    id: randomUUID(),
    url: requiredText(source.url, 'source url'),
    label: requiredText(source.label, 'source label'),
    sourceId: optionalText(source.sourceId),
  }));
  const id = randomUUID();
  await inTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO story_entries
         (id, story_id, occurred_at, occurred_until, occurred_precision, headline, label, body, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, storyId, occurredAt, occurredUntil, precision, headline, label, body, changes],
    );
    for (const [position, source] of sources.entries()) {
      if (source.sourceId !== null) {
        const cited = await client.query<{ story_id: string }>(
          'SELECT story_id FROM story_sources WHERE id = $1',
          [source.sourceId],
        );
        if (cited.rows[0]?.story_id !== storyId) {
          throw new DashboardStoreError('an entry can only cite a source from its own story');
        }
      }
      await client.query(
        `INSERT INTO story_entry_sources (id, entry_id, url, label, source_id, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [source.id, id, source.url, source.label, source.sourceId, position],
      );
    }
  });
  return {
    id,
    storyId,
    occurredAt,
    occurredUntil,
    precision,
    headline,
    label,
    body,
    changes,
    sources,
  };
}

export async function readStoryEntry(pool: Pool, id: string): Promise<StoryEntryRecord | null> {
  const entry = await pool.query<EntryRow>(
    `SELECT id, story_id, occurred_at, occurred_until, occurred_precision, headline, label, body, changes
     FROM story_entries WHERE id = $1`,
    [id],
  );
  const row = entry.rows[0];
  if (!row) return null;
  const sources = await pool.query<SourceRow>(
    'SELECT id, url, label, source_id FROM story_entry_sources WHERE entry_id = $1 ORDER BY position, id',
    [id],
  );
  return {
    id: row.id,
    storyId: row.story_id,
    occurredAt: row.occurred_at.toISOString(),
    occurredUntil: isoOrNull(row.occurred_until),
    precision: entryPrecision(row.occurred_precision),
    headline: row.headline,
    label: entryLabel(row.label),
    body: row.body,
    changes: row.changes,
    sources: sources.rows.map((source) => ({
      id: source.id,
      url: source.url,
      label: source.label,
      sourceId: source.source_id,
    })),
  };
}

export async function createMorningItem(
  pool: Pool,
  input: {
    kind: MorningKind;
    body: string;
    link: string | null;
    postedAt: string;
    data?: JsonObject | null;
  },
): Promise<MorningItemRecord> {
  const kind = morningKind(input.kind);
  const body = requiredText(input.body, 'body');
  const postedAt = asInstant(input.postedAt, 'postedAt');
  const link = input.link === null ? null : requiredText(input.link, 'link');
  const data =
    input.data === null || input.data === undefined ? null : asJsonObject(input.data, 'data');
  const id = randomUUID();
  await pool.query(
    'INSERT INTO morning_items (id, kind, body, link, posted_at, data) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [id, kind, body, link, postedAt, data === null ? null : JSON.stringify(data)],
  );
  return { id, kind, body, link, postedAt, data };
}

export async function readMorningItem(pool: Pool, id: string): Promise<MorningItemRecord | null> {
  const result = await pool.query<MorningRow>(
    'SELECT id, kind, body, link, posted_at, data FROM morning_items WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    kind: morningKind(row.kind),
    body: row.body,
    link: row.link,
    postedAt: row.posted_at.toISOString(),
    data: row.data,
  };
}

export async function createCfpRoundupItem(
  pool: Pool,
  input: {
    roundupAt: string;
    title: string;
    url: string | null;
    topic?: string | null;
    sourceName?: string | null;
    status?: CfpStatus | null;
  },
): Promise<CfpRoundupItemRecord> {
  const record: CfpRoundupItemRecord = {
    id: randomUUID(),
    roundupAt: asInstant(input.roundupAt, 'roundupAt'),
    title: requiredText(input.title, 'title'),
    url: input.url === null ? null : requiredText(input.url, 'url'),
    topic: optionalText(input.topic),
    sourceName: optionalText(input.sourceName),
    status: input.status === null || input.status === undefined ? null : cfpStatus(input.status),
  };
  await pool.query(
    `INSERT INTO cfp_roundup_items (id, roundup_at, title, url, topic, source_name, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      record.id,
      record.roundupAt,
      record.title,
      record.url,
      record.topic,
      record.sourceName,
      record.status,
    ],
  );
  return record;
}

export async function readCfpRoundupItem(
  pool: Pool,
  id: string,
): Promise<CfpRoundupItemRecord | null> {
  const result = await pool.query<CfpRow>(
    'SELECT id, roundup_at, title, url, topic, source_name, status FROM cfp_roundup_items WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    roundupAt: row.roundup_at.toISOString(),
    title: row.title,
    url: row.url,
    topic: row.topic,
    sourceName: row.source_name,
    status: row.status === null ? null : cfpStatus(row.status),
  };
}

/**
 * A Breaking item may point at a story, and at one entry of that story, so a
 * ping can open the story at that entry.
 */
export async function createBreakingItem(
  pool: Pool,
  input: {
    occurredAt: string;
    headline: string;
    label: BreakingLabel;
    sourceName?: string | null;
    via?: string | null;
    url?: string | null;
    storyId?: string | null;
    entryId?: string | null;
  },
): Promise<BreakingItemRecord> {
  const record: BreakingItemRecord = {
    id: randomUUID(),
    occurredAt: asInstant(input.occurredAt, 'occurredAt'),
    headline: requiredText(input.headline, 'headline'),
    label: entryLabel(input.label),
    sourceName: optionalText(input.sourceName),
    via: optionalText(input.via),
    url: optionalText(input.url),
    storyId: optionalText(input.storyId),
    entryId: optionalText(input.entryId),
  };
  if (record.entryId !== null && record.storyId === null) {
    throw new DashboardStoreError('a Breaking item with an entry must name its story');
  }
  await inTransaction(pool, async (client) => {
    if (record.entryId !== null) {
      const entry = await client.query<{ story_id: string }>(
        'SELECT story_id FROM story_entries WHERE id = $1',
        [record.entryId],
      );
      if (entry.rows[0]?.story_id !== record.storyId) {
        throw new DashboardStoreError('a Breaking item can only point at an entry of its own story');
      }
    }
    await client.query(
      `INSERT INTO breaking_items
         (id, occurred_at, headline, label, source_name, via, url, story_id, entry_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.occurredAt,
        record.headline,
        record.label,
        record.sourceName,
        record.via,
        record.url,
        record.storyId,
        record.entryId,
      ],
    );
  });
  return record;
}

export async function readBreakingItem(
  pool: Pool,
  id: string,
): Promise<BreakingItemRecord | null> {
  const result = await pool.query<BreakingRow>(
    `SELECT id, occurred_at, headline, label, source_name, via, url, story_id, entry_id
     FROM breaking_items WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    headline: row.headline,
    label: entryLabel(row.label),
    sourceName: row.source_name,
    via: row.via,
    url: row.url,
    storyId: row.story_id,
    entryId: row.entry_id,
  };
}

/** The CFP footer for one day. Setting a day again replaces its note. */
export async function setCfpDayNote(
  pool: Pool,
  input: { day: string; stillWorking: string | null; dropped: string | null },
): Promise<CfpDayNoteRecord> {
  const record: CfpDayNoteRecord = {
    day: asCalendarDate(input.day, 'day'),
    stillWorking: optionalText(input.stillWorking),
    dropped: optionalText(input.dropped),
  };
  await pool.query(
    `INSERT INTO cfp_day_notes (day, still_working, dropped) VALUES ($1, $2, $3)
     ON CONFLICT (day) DO UPDATE
       SET still_working = EXCLUDED.still_working, dropped = EXCLUDED.dropped`,
    [record.day, record.stillWorking, record.dropped],
  );
  return record;
}

export async function readCfpDayNote(pool: Pool, day: string): Promise<CfpDayNoteRecord | null> {
  const wanted = asCalendarDate(day, 'day');
  const result = await pool.query<CfpDayNoteRow>(
    'SELECT day::text AS day, still_working, dropped FROM cfp_day_notes WHERE day = $1',
    [wanted],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { day: row.day, stillWorking: row.still_working, dropped: row.dropped };
}
