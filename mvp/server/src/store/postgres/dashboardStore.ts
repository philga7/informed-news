import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

export type StoryRole = 'hub' | 'branch';

export type StoryRecord = {
  id: string;
  role: StoryRole;
  hubId: string | null;
  title: string;
};

export type EntrySourceRecord = {
  id: string;
  url: string;
  label: string;
};

export type StoryEntryRecord = {
  id: string;
  storyId: string;
  occurredAt: string;
  body: string;
  sources: EntrySourceRecord[];
};

export type MorningKind = 'bluf' | 'weather' | 'market' | 'osint';

export type MorningItemRecord = {
  id: string;
  kind: MorningKind;
  body: string;
  link: string | null;
  postedAt: string;
};

export type CfpRoundupItemRecord = {
  id: string;
  roundupAt: string;
  title: string;
  url: string;
};

export class DashboardStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DashboardStoreError';
  }
}

type StoryRow = {
  id: string;
  role: string;
  hub_id: string | null;
  title: string;
};

type EntryRow = {
  id: string;
  story_id: string;
  occurred_at: Date;
  body: string;
};

type SourceRow = {
  id: string;
  url: string;
  label: string;
};

type MorningRow = {
  id: string;
  kind: string;
  body: string;
  link: string | null;
  posted_at: Date;
};

type CfpRow = {
  id: string;
  roundup_at: Date;
  title: string;
  url: string;
};

function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new DashboardStoreError(`${label} is required`);
  return trimmed;
}

function asInstant(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new DashboardStoreError(`${label} must be a timestamp`);
  return new Date(parsed).toISOString();
}

function mapStoryRole(role: StoryRole): StoryRole {
  switch (role) {
    case 'hub':
      return 'hub';
    case 'branch':
      return 'branch';
    default: {
      const unexpected: never = role;
      throw new DashboardStoreError(`unexpected story role ${String(unexpected)}`);
    }
  }
}

function storyRole(value: string): StoryRole {
  switch (value) {
    case 'hub':
    case 'branch':
      return mapStoryRole(value);
    default:
      throw new DashboardStoreError(`unexpected story role ${value}`);
  }
}

function morningKind(value: string): MorningKind {
  switch (value) {
    case 'bluf':
    case 'weather':
    case 'market':
    case 'osint':
      return assertMorningKind(value);
    default:
      throw new DashboardStoreError(`unexpected morning kind ${value}`);
  }
}

function assertMorningKind(kind: MorningKind): MorningKind {
  switch (kind) {
    case 'bluf':
    case 'weather':
    case 'market':
    case 'osint':
      return kind;
    default: {
      const unexpected: never = kind;
      throw new DashboardStoreError(`unexpected morning kind ${String(unexpected)}`);
    }
  }
}

function dashboardSchemaSql(): string {
  return readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
}

export async function ensureDashboardSchema(pool: Pool): Promise<void> {
  await pool.query(dashboardSchemaSql());
}

export async function createStory(
  pool: Pool,
  input: { role: StoryRole; hubId: string | null; title: string },
): Promise<StoryRecord> {
  const title = requiredText(input.title, 'title');
  const role = mapStoryRole(input.role);
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
  const id = randomUUID();
  await pool.query('INSERT INTO stories (id, role, hub_id, title) VALUES ($1, $2, $3, $4)', [
    id,
    role,
    hubId,
    title,
  ]);
  return { id, role, hubId, title };
}

export async function readStory(pool: Pool, id: string): Promise<StoryRecord | null> {
  const result = await pool.query<StoryRow>(
    'SELECT id, role, hub_id, title FROM stories WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    role: storyRole(row.role),
    hubId: row.hub_id,
    title: row.title,
  };
}

export async function createStoryEntry(
  pool: Pool,
  input: {
    storyId: string;
    occurredAt: string;
    body: string;
    sources: Array<{ url: string; label: string }>;
  },
): Promise<StoryEntryRecord> {
  const storyId = requiredText(input.storyId, 'storyId');
  const body = requiredText(input.body, 'body');
  const occurredAt = asInstant(input.occurredAt, 'occurredAt');
  const sources = input.sources.map((source) => ({
    id: randomUUID(),
    url: requiredText(source.url, 'source url'),
    label: requiredText(source.label, 'source label'),
  }));
  const id = randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO story_entries (id, story_id, occurred_at, body) VALUES ($1, $2, $3, $4)',
      [id, storyId, occurredAt, body],
    );
    for (const source of sources) {
      await client.query(
        'INSERT INTO story_entry_sources (id, entry_id, url, label) VALUES ($1, $2, $3, $4)',
        [source.id, id, source.url, source.label],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { id, storyId, occurredAt, body, sources };
}

export async function readStoryEntry(pool: Pool, id: string): Promise<StoryEntryRecord | null> {
  const entry = await pool.query<EntryRow>(
    'SELECT id, story_id, occurred_at, body FROM story_entries WHERE id = $1',
    [id],
  );
  const row = entry.rows[0];
  if (!row) return null;
  const sources = await pool.query<SourceRow>(
    'SELECT id, url, label FROM story_entry_sources WHERE entry_id = $1 ORDER BY id',
    [id],
  );
  return {
    id: row.id,
    storyId: row.story_id,
    occurredAt: row.occurred_at.toISOString(),
    body: row.body,
    sources: sources.rows.map((source) => ({
      id: source.id,
      url: source.url,
      label: source.label,
    })),
  };
}

export async function createMorningItem(
  pool: Pool,
  input: { kind: MorningKind; body: string; link: string | null; postedAt: string },
): Promise<MorningItemRecord> {
  const kind = assertMorningKind(input.kind);
  const body = requiredText(input.body, 'body');
  const postedAt = asInstant(input.postedAt, 'postedAt');
  const link = input.link === null ? null : requiredText(input.link, 'link');
  const id = randomUUID();
  await pool.query(
    'INSERT INTO morning_items (id, kind, body, link, posted_at) VALUES ($1, $2, $3, $4, $5)',
    [id, kind, body, link, postedAt],
  );
  return { id, kind, body, link, postedAt };
}

export async function readMorningItem(pool: Pool, id: string): Promise<MorningItemRecord | null> {
  const result = await pool.query<MorningRow>(
    'SELECT id, kind, body, link, posted_at FROM morning_items WHERE id = $1',
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
  };
}

export async function createCfpRoundupItem(
  pool: Pool,
  input: { roundupAt: string; title: string; url: string },
): Promise<CfpRoundupItemRecord> {
  const title = requiredText(input.title, 'title');
  const url = requiredText(input.url, 'url');
  const roundupAt = asInstant(input.roundupAt, 'roundupAt');
  const id = randomUUID();
  await pool.query(
    'INSERT INTO cfp_roundup_items (id, roundup_at, title, url) VALUES ($1, $2, $3, $4)',
    [id, roundupAt, title, url],
  );
  return { id, roundupAt, title, url };
}

export async function readCfpRoundupItem(
  pool: Pool,
  id: string,
): Promise<CfpRoundupItemRecord | null> {
  const result = await pool.query<CfpRow>(
    'SELECT id, roundup_at, title, url FROM cfp_roundup_items WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    roundupAt: row.roundup_at.toISOString(),
    title: row.title,
    url: row.url,
  };
}
