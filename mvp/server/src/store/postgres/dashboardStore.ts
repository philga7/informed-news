import { randomUUID } from 'node:crypto';
import { checkMorningData } from './jsonShapes.js';
import { writerParams, type Writer } from './writer.js';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import {
  DashboardStoreError,
  asCalendarDate,
  asInstant,
  asJsonObject,
  idOrNew,
  inTransaction,
  optionalInstant,
  pgErrorCode,
  storeErrorFrom,
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
  /** Empty only when the cited story source row has no URL. */
  url: string | null;
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
  /** Optional since NEWS-228: the headline and change bullets carry an update. */
  body: string | null;
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
  body?: string | null;
  changes?: string[];
  /**
   * A citation with a `sourceId` may leave out `url` and `label`: they are
   * copied from that story source row (its URL and its outlet).
   */
  sources: Array<{ url?: string | null; label?: string | null; sourceId?: string | null }>;
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
  body: string | null;
  changes: string[];
};

type SourceRow = {
  id: string;
  url: string | null;
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
 * (NEWS-240) was 2, accounts and read markers (NEWS-254) were 3, the ingest
 * contract (NEWS-228) was 4, and agents with written_by (NEWS-263) are 5. Bump it in the
 * same change as any edit to schema.sql: a database whose version row is
 * current runs nothing, so an edit without a bump never reaches it. A test
 * pins the file's hash to this number.
 */
export const DASHBOARD_SCHEMA_VERSION = 5;

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

/** A pool, or one client inside a transaction: both can run a query. */
export type Queryable = Pool | PoolClient;

/**
 * Check a story input and build its record. `id` is the caller's id when one
 * is given (NEWS-228), otherwise a new one. Writes nothing.
 */
export function prepareStory(input: StoryInput & { id?: string | null }): StoryRecord {
  const title = requiredText(input.title, 'title');
  const role = storyRole(input.role);
  const status = storyStatus(input.status);
  let hubId: string | null;
  switch (role) {
    case 'hub':
      if (input.hubId !== null && input.hubId !== undefined) {
        throw new DashboardStoreError('a hub has no hub');
      }
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
    id: idOrNew(input.id, 'id'),
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
  return record;
}

/**
 * The private-story rules that need the database, checked inside the write's
 * transaction: a branch cannot sit under a private hub, and a hub that has
 * branches cannot be private. The hub row is locked so it cannot change
 * between this check and the write.
 */
export async function checkPrivateStoryRules(client: PoolClient, record: StoryRecord): Promise<void> {
  if (record.hubId !== null) {
    const hub = await client.query<{ owner_user_id: string | null }>(
      'SELECT owner_user_id FROM stories WHERE id = $1 FOR SHARE',
      [record.hubId],
    );
    if (hub.rows[0]?.owner_user_id != null) {
      throw new DashboardStoreError('a branch cannot sit under a private hub yet');
    }
  }
  if (record.role === 'hub' && record.ownerUserId !== null) {
    const branches = await client.query('SELECT 1 FROM stories WHERE hub_id = $1 LIMIT 1', [
      record.id,
    ]);
    if (branches.rowCount !== 0) {
      throw new DashboardStoreError('a hub that has branches cannot be private yet');
    }
  }
}

export async function createStory(
  pool: Pool,
  writer: Writer,
  input: StoryInput & { id?: string | null },
): Promise<StoryRecord> {
  const record = prepareStory(input);
  await inTransaction(pool, async (client) => {
    await checkPrivateStoryRules(client, record);
    await insertStory(client, record, writer);
  }).catch((error: unknown) => {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new DashboardStoreError('story refers to a missing hub or owner', {
        cause: error,
        reason: 'missing',
      });
    }
    throw storeErrorFrom(error);
  });
  return record;
}

/**
 * A new story records its writer as both its creator and its last writer
 * (NEWS-263). An upsert's update leaves the creator as it was.
 */
export const STORY_INSERT_SQL = `INSERT INTO stories (${STORY_COLUMNS},
       created_by_agent_id, created_by_user_id, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $16, $17)`;

export function storyParams(record: StoryRecord, writer: Writer): unknown[] {
  return [
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
    ...writerParams(writer),
  ];
}

async function insertStory(client: PoolClient, record: StoryRecord, writer: Writer): Promise<void> {
  await client.query(STORY_INSERT_SQL, storyParams(record, writer));
}

export async function readStory(db: Queryable, id: string): Promise<StoryRecord | null> {
  const result = await db.query<StoryRow>(
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

/** A checked entry, before cited sources are filled in from their rows. */
export type EntryDraft = Omit<StoryEntryRecord, 'sources'> & {
  sources: Array<{ url: string | null; label: string | null; sourceId: string | null }>;
};

/** Check an entry input. Writes nothing and reads nothing. */
export function prepareEntry(input: StoryEntryInput & { id?: string | null }): EntryDraft {
  const storyId = requiredText(input.storyId, 'storyId');
  const headline = requiredText(input.headline, 'headline');
  const body = optionalText(input.body);
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
  const sources = input.sources.map((source) => {
    const sourceId = optionalText(source.sourceId);
    if (sourceId === null) {
      // A citation with no story source row carries its own URL and label.
      return {
        url: requiredText(source.url ?? '', 'source url'),
        label: requiredText(source.label ?? '', 'source label'),
        sourceId,
      };
    }
    return { url: optionalText(source.url), label: optionalText(source.label), sourceId };
  });
  return {
    id: idOrNew(input.id, 'id'),
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

/**
 * Write a checked entry and its citations inside the caller's transaction. A
 * citation that points at a story source row and leaves out its URL or label
 * takes them from that row: the URL (which may be empty) and the outlet.
 */
export async function insertEntry(
  client: PoolClient,
  draft: EntryDraft,
  writer: Writer,
): Promise<StoryEntryRecord> {
  await client.query(
    `INSERT INTO story_entries
       (id, story_id, occurred_at, occurred_until, occurred_precision, headline, label, body, changes,
        written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      draft.id,
      draft.storyId,
      draft.occurredAt,
      draft.occurredUntil,
      draft.precision,
      draft.headline,
      draft.label,
      draft.body,
      draft.changes,
      ...writerParams(writer),
    ],
  );
  const sources: EntrySourceRecord[] = [];
  for (const [position, source] of draft.sources.entries()) {
    let url = source.url;
    let label = source.label;
    if (source.sourceId !== null) {
      const cited = await client.query<{ story_id: string; url: string | null; outlet: string }>(
        'SELECT story_id, url, outlet FROM story_sources WHERE id = $1',
        [source.sourceId],
      );
      const row = cited.rows[0];
      if (row?.story_id !== draft.storyId) {
        throw new DashboardStoreError(
          row === undefined
            ? `sourceId ${source.sourceId} does not exist`
            : 'an entry can only cite a source from its own story',
          { reason: row === undefined ? 'missing' : 'invalid' },
        );
      }
      url ??= row.url;
      label ??= row.outlet;
    }
    const record: EntrySourceRecord = {
      id: randomUUID(),
      url,
      label: label ?? '',
      sourceId: source.sourceId,
    };
    await client.query(
      `INSERT INTO story_entry_sources (id, entry_id, url, label, source_id, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.id, draft.id, record.url, record.label, record.sourceId, position],
    );
    sources.push(record);
  }
  return { ...draft, sources };
}

export async function createStoryEntry(
  pool: Pool,
  writer: Writer,
  input: StoryEntryInput & { id?: string | null },
): Promise<StoryEntryRecord> {
  const draft = prepareEntry(input);
  return inTransaction(pool, (client) => insertEntry(client, draft, writer)).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
}

export async function readStoryEntry(db: Queryable, id: string): Promise<StoryEntryRecord | null> {
  const entry = await db.query<EntryRow>(
    `SELECT id, story_id, occurred_at, occurred_until, occurred_precision, headline, label, body, changes
     FROM story_entries WHERE id = $1`,
    [id],
  );
  const row = entry.rows[0];
  if (!row) return null;
  const sources = await db.query<SourceRow>(
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

export type MorningItemInput = {
  id?: string | null;
  kind: MorningKind;
  body: string;
  link: string | null;
  postedAt: string;
  data?: JsonObject | null;
};

/** Check a Morning item, including the shape of its data for its kind. */
export function prepareMorningItem(input: MorningItemInput): MorningItemRecord {
  const kind = morningKind(input.kind);
  const data =
    input.data === null || input.data === undefined ? null : asJsonObject(input.data, 'data');
  checkMorningData(kind, data);
  return {
    id: idOrNew(input.id, 'id'),
    kind,
    body: requiredText(input.body, 'body'),
    link: input.link === null || input.link === undefined ? null : requiredText(input.link, 'link'),
    postedAt: asInstant(input.postedAt, 'postedAt'),
    data,
  };
}

export async function insertMorningItem(
  db: Queryable,
  record: MorningItemRecord,
  writer: Writer,
): Promise<void> {
  await db.query(
    `INSERT INTO morning_items (id, kind, body, link, posted_at, data, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [
      record.id,
      record.kind,
      record.body,
      record.link,
      record.postedAt,
      record.data === null ? null : JSON.stringify(record.data),
      ...writerParams(writer),
    ],
  );
}

export async function createMorningItem(
  pool: Pool,
  writer: Writer,
  input: MorningItemInput,
): Promise<MorningItemRecord> {
  const record = prepareMorningItem(input);
  await insertMorningItem(pool, record, writer).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
  return record;
}

export async function readMorningItem(db: Queryable, id: string): Promise<MorningItemRecord | null> {
  const result = await db.query<MorningRow>(
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

export type CfpRoundupItemInput = {
  id?: string | null;
  roundupAt: string;
  title: string;
  url: string | null;
  topic?: string | null;
  sourceName?: string | null;
  status?: CfpStatus | null;
};

export function prepareCfpRoundupItem(input: CfpRoundupItemInput): CfpRoundupItemRecord {
  return {
    id: idOrNew(input.id, 'id'),
    roundupAt: asInstant(input.roundupAt, 'roundupAt'),
    title: requiredText(input.title, 'title'),
    url: input.url === null || input.url === undefined ? null : requiredText(input.url, 'url'),
    topic: optionalText(input.topic),
    sourceName: optionalText(input.sourceName),
    status: input.status === null || input.status === undefined ? null : cfpStatus(input.status),
  };
}

export async function insertCfpRoundupItem(
  db: Queryable,
  record: CfpRoundupItemRecord,
  writer: Writer,
): Promise<void> {
  await db.query(
    `INSERT INTO cfp_roundup_items
       (id, roundup_at, title, url, topic, source_name, status, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      record.id,
      record.roundupAt,
      record.title,
      record.url,
      record.topic,
      record.sourceName,
      record.status,
      ...writerParams(writer),
    ],
  );
}

export async function createCfpRoundupItem(
  pool: Pool,
  writer: Writer,
  input: CfpRoundupItemInput,
): Promise<CfpRoundupItemRecord> {
  const record = prepareCfpRoundupItem(input);
  await insertCfpRoundupItem(pool, record, writer).catch((error: unknown) => {
    throw storeErrorFrom(error);
  });
  return record;
}

export async function readCfpRoundupItem(
  db: Queryable,
  id: string,
): Promise<CfpRoundupItemRecord | null> {
  const result = await db.query<CfpRow>(
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

export type BreakingItemInput = {
  id?: string | null;
  occurredAt: string;
  headline: string;
  label: BreakingLabel;
  sourceName?: string | null;
  via?: string | null;
  url?: string | null;
  storyId?: string | null;
  entryId?: string | null;
};

export function prepareBreakingItem(input: BreakingItemInput): BreakingItemRecord {
  const record: BreakingItemRecord = {
    id: idOrNew(input.id, 'id'),
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
  return record;
}

/**
 * Write a checked Breaking item inside the caller's transaction. It may point
 * at a story, and at one entry of that story, so a ping can open the story at
 * that entry. A private story is accepted; who sees the item is the UI's rule.
 */
export async function insertBreakingItem(
  client: PoolClient,
  record: BreakingItemRecord,
  writer: Writer,
): Promise<void> {
  if (record.entryId !== null) {
    const entry = await client.query<{ story_id: string }>(
      'SELECT story_id FROM story_entries WHERE id = $1',
      [record.entryId],
    );
    const row = entry.rows[0];
    if (row?.story_id !== record.storyId) {
      throw new DashboardStoreError(
        row === undefined
          ? `entryId ${record.entryId} does not exist`
          : 'a Breaking item can only point at an entry of its own story',
        { reason: row === undefined ? 'missing' : 'invalid' },
      );
    }
  }
  await client.query(
    `INSERT INTO breaking_items
       (id, occurred_at, headline, label, source_name, via, url, story_id, entry_id,
        written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
      ...writerParams(writer),
    ],
  );
}

export async function createBreakingItem(
  pool: Pool,
  writer: Writer,
  input: BreakingItemInput,
): Promise<BreakingItemRecord> {
  const record = prepareBreakingItem(input);
  await inTransaction(pool, (client) => insertBreakingItem(client, record, writer)).catch(
    (error: unknown) => {
      throw storeErrorFrom(error);
    },
  );
  return record;
}

export async function readBreakingItem(
  db: Queryable,
  id: string,
): Promise<BreakingItemRecord | null> {
  const result = await db.query<BreakingRow>(
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

export function prepareCfpDayNote(input: {
  day: string;
  stillWorking: string | null;
  dropped: string | null;
}): CfpDayNoteRecord {
  return {
    day: asCalendarDate(input.day, 'day'),
    stillWorking: optionalText(input.stillWorking),
    dropped: optionalText(input.dropped),
  };
}

/**
 * The CFP footer for one day. Setting a day again replaces its note. Returns
 * whether a row was written: false when the day already held the same note.
 */
export async function writeCfpDayNote(
  db: Queryable,
  record: CfpDayNoteRecord,
  writer: Writer,
): Promise<boolean> {
  // The writer changes only with the note: the same note again keeps its writer.
  const result = await db.query(
    `INSERT INTO cfp_day_notes (day, still_working, dropped, written_by_agent_id, written_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (day) DO UPDATE
       SET still_working = EXCLUDED.still_working, dropped = EXCLUDED.dropped,
           written_by_agent_id = EXCLUDED.written_by_agent_id,
           written_by_user_id = EXCLUDED.written_by_user_id
       WHERE (cfp_day_notes.still_working, cfp_day_notes.dropped)
         IS DISTINCT FROM (EXCLUDED.still_working, EXCLUDED.dropped)`,
    [record.day, record.stillWorking, record.dropped, ...writerParams(writer)],
  );
  return result.rowCount === 1;
}

/** The CFP footer for one day. Setting a day again replaces its note. */
export async function setCfpDayNote(
  pool: Pool,
  writer: Writer,
  input: { day: string; stillWorking: string | null; dropped: string | null },
): Promise<CfpDayNoteRecord> {
  const record = prepareCfpDayNote(input);
  await writeCfpDayNote(pool, record, writer);
  return record;
}

export async function readCfpDayNote(db: Queryable, day: string): Promise<CfpDayNoteRecord | null> {
  const wanted = asCalendarDate(day, 'day');
  const result = await db.query<CfpDayNoteRow>(
    'SELECT day::text AS day, still_working, dropped FROM cfp_day_notes WHERE day = $1',
    [wanted],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { day: row.day, stillWorking: row.still_working, dropped: row.dropped };
}
