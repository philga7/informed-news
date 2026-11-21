import type { Pool } from 'pg';
import { DashboardStoreError, asInstant, pgErrorCode, requiredText } from './storeSupport.js';
import { trackerKind, type TrackerKind } from './vocabulary.js';

/**
 * Per-user read markers (NEWS-254): how far a user has read on each tracker,
 * and when they last opened it. A story tracker names its story; CFP and
 * Weather are one tracker each per user. read_up_to only moves forward.
 */

export type Tracker =
  | { kind: 'story'; storyId: string }
  | { kind: 'cfp' }
  | { kind: 'weather' };

export type ReadMarkerRecord = {
  userId: string;
  tracker: Tracker;
  /** UTC ISO time of the newest item read, or null. */
  readUpTo: string | null;
  /** UTC ISO time, or null. */
  lastOpenedAt: string | null;
};

type MarkerRow = {
  user_id: string;
  tracker_kind: string;
  tracker_id: string | null;
  read_up_to: Date | null;
  last_opened_at: Date | null;
};

const FOREIGN_KEY_VIOLATION = '23503';
const MARKER_COLUMNS = 'user_id, tracker_kind, tracker_id, read_up_to, last_opened_at';

function trackerKey(tracker: Tracker): { kind: TrackerKind; id: string | null } {
  const kind = trackerKind(tracker.kind);
  switch (kind) {
    case 'story':
      if (tracker.kind !== 'story') throw new DashboardStoreError('unexpected tracker');
      return { kind, id: requiredText(tracker.storyId, 'storyId') };
    case 'cfp':
    case 'weather':
      if ('storyId' in tracker) {
        throw new DashboardStoreError(`a ${kind} tracker has no story id`);
      }
      return { kind, id: null };
    default: {
      const unexpected: never = kind;
      throw new DashboardStoreError(`unexpected tracker kind ${String(unexpected)}`);
    }
  }
}

function toTracker(kind: TrackerKind, id: string | null): Tracker {
  switch (kind) {
    case 'story':
      if (id === null) throw new DashboardStoreError('a story marker has no story id');
      return { kind, storyId: id };
    case 'cfp':
    case 'weather':
      return { kind };
    default: {
      const unexpected: never = kind;
      throw new DashboardStoreError(`unexpected tracker kind ${String(unexpected)}`);
    }
  }
}

function toRecord(row: MarkerRow): ReadMarkerRecord {
  return {
    userId: row.user_id,
    tracker: toTracker(trackerKind(row.tracker_kind), row.tracker_id),
    readUpTo: row.read_up_to === null ? null : row.read_up_to.toISOString(),
    lastOpenedAt: row.last_opened_at === null ? null : row.last_opened_at.toISOString(),
  };
}

async function upsert(
  pool: Pool,
  userId: string,
  tracker: Tracker,
  column: 'read_up_to' | 'last_opened_at',
  at: string,
  label: string,
): Promise<ReadMarkerRecord> {
  const user = requiredText(userId, 'userId');
  const key = trackerKey(tracker);
  const when = asInstant(at, label);
  try {
    // GREATEST ignores NULL, so the first write sets the value and a later,
    // earlier time leaves it where it is.
    const result = await pool.query<MarkerRow>(
      `INSERT INTO read_markers (user_id, tracker_kind, tracker_id, ${column})
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, tracker_kind, tracker_id)
       DO UPDATE SET ${column} = GREATEST(read_markers.${column}, EXCLUDED.${column})
       RETURNING ${MARKER_COLUMNS}`,
      [user, key.kind, key.id, when],
    );
    const row = result.rows[0];
    if (!row) throw new DashboardStoreError('read marker was not written');
    return toRecord(row);
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new DashboardStoreError('read marker refers to a missing user or story', {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Record that the user has read the tracker up to `readUpTo` (the time of the
 * newest item read). A time earlier than the stored one changes nothing.
 */
export function markRead(
  pool: Pool,
  userId: string,
  tracker: Tracker,
  readUpTo: string,
): Promise<ReadMarkerRecord> {
  return upsert(pool, userId, tracker, 'read_up_to', readUpTo, 'readUpTo');
}

/** Record that the user opened the tracker. An earlier time changes nothing. */
export function markOpened(
  pool: Pool,
  userId: string,
  tracker: Tracker,
  openedAt: string,
): Promise<ReadMarkerRecord> {
  return upsert(pool, userId, tracker, 'last_opened_at', openedAt, 'openedAt');
}

export async function readMarker(
  pool: Pool,
  userId: string,
  tracker: Tracker,
): Promise<ReadMarkerRecord | null> {
  const key = trackerKey(tracker);
  const result = await pool.query<MarkerRow>(
    `SELECT ${MARKER_COLUMNS} FROM read_markers
     WHERE user_id = $1 AND tracker_kind = $2 AND tracker_id IS NOT DISTINCT FROM $3`,
    [requiredText(userId, 'userId'), key.kind, key.id],
  );
  const row = result.rows[0];
  return row ? toRecord(row) : null;
}

/** Every marker the user has, stories first by id, then CFP, then Weather. */
export async function listReadMarkers(pool: Pool, userId: string): Promise<ReadMarkerRecord[]> {
  const result = await pool.query<MarkerRow>(
    `SELECT ${MARKER_COLUMNS} FROM read_markers WHERE user_id = $1
     ORDER BY array_position(ARRAY['story', 'cfp', 'weather'], tracker_kind), tracker_id`,
    [requiredText(userId, 'userId')],
  );
  return result.rows.map(toRecord);
}
