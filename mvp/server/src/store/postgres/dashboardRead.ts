import type { Pool } from 'pg';
import { DashboardStoreError, type JsonObject } from './storeSupport.js';
import {
  entryPrecision,
  followState,
  morningKind,
  storyRole,
  storyStatus,
  type EntryPrecision,
  type MorningKind,
  type StoryRole,
  type StoryStatus,
} from './vocabulary.js';

/**
 * The home dashboard (NEWS-225): stories the viewer may see, split into
 * developing, quiet, and hidden, plus category counts, trackers, and the
 * latest Morning card of each kind.
 */

export type DashboardViewer = { userId: string | null; admin: boolean };

export type DashboardStoryRow = {
  id: string;
  title: string;
  role: StoryRole;
  status: StoryStatus;
  nowSummary: string | null;
  /** ISO time of the latest entry, or null when the story has none. */
  latestEntryAt: string | null;
  latestEntryPrecision: EntryPrecision | null;
  newCount: number;
  /** The viewer's story marker, or null when they have none. */
  readUpTo: string | null;
  categories: { id: string; name: string }[];
  /** `"follow"` when this viewer follows the story. A hide is not a row. */
  followState: 'follow' | null;
  /** The hub title for a branch, otherwise null. */
  hubTitle: string | null;
  /** True when the story has an owner. */
  private: boolean;
};

export type MorningCard = {
  id: string;
  postedAt: string;
  body: string;
  link: string | null;
  data: JsonObject | null;
};

export type DashboardRead = {
  developing: DashboardStoryRow[];
  quiet: DashboardStoryRow[];
  hidden: { id: string; title: string }[];
  categories: { id: string; name: string; count: number }[];
  trackers: {
    stories: { id: string; title: string; newCount: number }[];
    weather: { newCount: 1 } | null;
  };
  morning: Record<MorningKind, MorningCard | null>;
};

type StorySqlRow = {
  id: string;
  title: string;
  role: string;
  status: string;
  now_summary: string | null;
  owner_user_id: string | null;
  hub_title: string | null;
  latest_entry_at: Date | string | null;
  latest_entry_precision: string | null;
  read_up_to: Date | string | null;
  has_marker: boolean;
  new_count: number | string;
  follow_state: string | null;
};

type CategorySqlRow = {
  id: string;
  name: string;
  story_id: string | null;
};

type MorningSqlRow = {
  id: string;
  kind: string;
  body: string;
  link: string | null;
  posted_at: Date | string;
  data: JsonObject | null;
};

const STORY_SQL = `WITH visible AS (
  SELECT s.id, s.title, s.role, s.status, s.now_summary, s.owner_user_id, s.hub_id
  FROM stories s
  WHERE $1::boolean OR s.owner_user_id IS NULL OR s.owner_user_id = $2::text
),
latest AS (
  SELECT DISTINCT ON (story_id) story_id, occurred_at, occurred_precision
  FROM story_entries
  ORDER BY story_id, occurred_at DESC, id DESC
),
entry_counts AS (
  SELECT story_id, COUNT(*)::int AS total
  FROM story_entries
  GROUP BY story_id
),
markers AS (
  SELECT tracker_id AS story_id, read_up_to
  FROM read_markers
  WHERE user_id = $2::text AND tracker_kind = 'story'
),
newer AS (
  SELECT e.story_id, COUNT(*)::int AS newer
  FROM story_entries e
  JOIN markers m ON m.story_id = e.story_id
  WHERE m.read_up_to IS NOT NULL AND e.occurred_at > m.read_up_to
  GROUP BY e.story_id
)
SELECT
  v.id,
  v.title,
  v.role,
  v.status,
  v.now_summary,
  v.owner_user_id,
  hub.title AS hub_title,
  l.occurred_at AS latest_entry_at,
  l.occurred_precision AS latest_entry_precision,
  m.read_up_to,
  (m.read_up_to IS NOT NULL) AS has_marker,
  CASE
    WHEN m.read_up_to IS NULL THEN COALESCE(c.total, 0)
    ELSE COALESCE(n.newer, 0)
  END AS new_count,
  f.state AS follow_state
FROM visible v
LEFT JOIN stories hub ON hub.id = v.hub_id
LEFT JOIN latest l ON l.story_id = v.id
LEFT JOIN entry_counts c ON c.story_id = v.id
LEFT JOIN markers m ON m.story_id = v.id
LEFT JOIN newer n ON n.story_id = v.id
LEFT JOIN user_follows f ON f.story_id = v.id AND f.user_id = $2::text`;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DashboardStoreError('a dashboard time is not a timestamp');
  }
  return parsed.toISOString();
}

function wholeCount(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new DashboardStoreError('newCount is not a whole number');
  }
  return parsed;
}

function byLatestThenTitle(a: DashboardStoryRow, b: DashboardStoryRow): number {
  if (a.latestEntryAt !== b.latestEntryAt) {
    if (a.latestEntryAt === null) return 1;
    if (b.latestEntryAt === null) return -1;
    return a.latestEntryAt < b.latestEntryAt ? 1 : -1;
  }
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function byTitleThenId(a: { title: string; id: string }, b: { title: string; id: string }): number {
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function storyFrom(row: StorySqlRow, followed: boolean): DashboardStoryRow {
  const precision =
    row.latest_entry_precision === null ? null : entryPrecision(row.latest_entry_precision);
  return {
    id: row.id,
    title: row.title,
    role: storyRole(row.role),
    status: storyStatus(row.status),
    nowSummary: row.now_summary,
    latestEntryAt: iso(row.latest_entry_at),
    latestEntryPrecision: precision,
    newCount: wholeCount(row.new_count),
    readUpTo: row.has_marker ? iso(row.read_up_to) : null,
    categories: [],
    followState: followed ? 'follow' : null,
    hubTitle: row.hub_title,
    private: row.owner_user_id !== null,
  };
}

/** Latest item of one card: greatest posted_at, then greatest id. */
const MORNING_SQL = `SELECT DISTINCT ON (kind) id, kind, body, link, posted_at, data
FROM morning_items
ORDER BY kind, posted_at DESC, id DESC`;

function cardFrom(row: MorningSqlRow): MorningCard {
  const postedAt = iso(row.posted_at);
  if (postedAt === null) throw new DashboardStoreError('a morning item has no posted time');
  return {
    id: row.id,
    postedAt,
    body: row.body,
    link: row.link,
    data: row.data,
  };
}

/**
 * How far this viewer has read the weather card.
 * `undefined` means no marker. A row whose read_up_to is null counts as no marker.
 */
async function weatherReadUpTo(pool: Pool, userId: string): Promise<string | undefined> {
  const result = await pool.query<{ read_up_to: Date | string | null }>(
    `SELECT read_up_to FROM read_markers WHERE user_id = $1 AND tracker_kind = 'weather'`,
    [userId],
  );
  const row = result.rows[0];
  if (!row || row.read_up_to === null) return undefined;
  return iso(row.read_up_to) ?? undefined;
}

function weatherTracker(
  item: MorningCard | null,
  readUpTo: string | undefined,
): { newCount: 1 } | null {
  if (!item) return null;
  if (readUpTo === undefined) return { newCount: 1 };
  if (item.postedAt > readUpTo) return { newCount: 1 };
  return null;
}

export async function readDashboard(pool: Pool, viewer: DashboardViewer): Promise<DashboardRead> {
  const stories = await pool.query<StorySqlRow>(STORY_SQL, [viewer.admin, viewer.userId]);
  const developing: DashboardStoryRow[] = [];
  const quiet: DashboardStoryRow[] = [];
  const hidden: { id: string; title: string }[] = [];

  for (const row of stories.rows) {
    const state = row.follow_state === null ? null : followState(row.follow_state);
    switch (state) {
      case 'hide':
        hidden.push({ id: row.id, title: row.title });
        break;
      case 'follow':
      case null: {
        const item = storyFrom(row, state === 'follow');
        if (row.has_marker && item.newCount === 0) quiet.push(item);
        else developing.push(item);
        break;
      }
      default: {
        const unexpected: never = state;
        throw new DashboardStoreError(`unexpected follow state ${String(unexpected)}`);
      }
    }
  }

  const shown = new Set([...developing, ...quiet].map((row) => row.id));
  const categories = await pool.query<CategorySqlRow>(
    `SELECT c.id, c.name, sc.story_id
     FROM categories c
     LEFT JOIN story_categories sc ON sc.category_id = c.id
     ORDER BY c.sort, c.name, c.id`,
  );
  const counted: DashboardRead['categories'] = [];
  const onStory = new Map<string, { id: string; name: string }[]>();
  for (const row of categories.rows) {
    const last = counted[counted.length - 1];
    const current = last?.id === row.id ? last : { id: row.id, name: row.name, count: 0 };
    if (current !== last) counted.push(current);
    if (row.story_id !== null && shown.has(row.story_id)) {
      current.count += 1;
      const list = onStory.get(row.story_id) ?? [];
      list.push({ id: row.id, name: row.name });
      onStory.set(row.story_id, list);
    }
  }
  for (const row of [...developing, ...quiet]) {
    row.categories = onStory.get(row.id) ?? [];
  }

  developing.sort(byLatestThenTitle);
  quiet.sort(byLatestThenTitle);
  hidden.sort(byTitleThenId);

  const morningRows = await pool.query<MorningSqlRow>(MORNING_SQL);
  const morning: DashboardRead['morning'] = { bluf: null, weather: null, market: null, osint: null };
  for (const row of morningRows.rows) {
    const kind = morningKind(row.kind);
    const card = cardFrom(row);
    switch (kind) {
      case 'bluf':
      case 'weather':
      case 'market':
      case 'osint':
        morning[kind] = card;
        break;
      default: {
        const unexpected: never = kind;
        throw new DashboardStoreError(`unexpected morning kind ${String(unexpected)}`);
      }
    }
  }

  const weatherMark = viewer.userId === null ? undefined : await weatherReadUpTo(pool, viewer.userId);
  return {
    developing,
    quiet,
    hidden,
    categories: counted,
    trackers: {
      stories: developing
        .filter((row) => row.newCount > 0)
        .map((row) => ({ id: row.id, title: row.title, newCount: row.newCount })),
      weather: weatherTracker(morning.weather, weatherMark),
    },
    morning,
  };
}
