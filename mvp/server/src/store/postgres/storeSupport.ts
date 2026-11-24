import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

/**
 * Why a write was refused: the input is wrong (`invalid`), it names a row that
 * does not exist (`missing`), or it clashes with a row already stored
 * (`conflict`). The ingest route turns these into 422, 422 and 409.
 */
export type StoreErrorReason = 'invalid' | 'missing' | 'conflict';

export class DashboardStoreError extends Error {
  readonly reason: StoreErrorReason;

  constructor(message: string, options?: { cause?: unknown; reason?: StoreErrorReason }) {
    super(message, options);
    this.name = 'DashboardStoreError';
    this.reason = options?.reason ?? 'invalid';
  }
}

const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';
/** Other integrity and data errors: NOT NULL, CHECK, bad text for a type. */
const INVALID_CODES = new Set(['23502', '23514', '23P01']);

/**
 * One mapping from Postgres errors to store errors (NEWS-228). A missing
 * reference is `missing`, a duplicate key is `conflict`, and a broken rule
 * (NOT NULL, CHECK, or a value Postgres cannot read, class 22) is `invalid`.
 * The message names the constraint, never the SQL. Anything else, such as a
 * lost connection, is returned unchanged for the caller to treat as a fault.
 */
export function storeErrorFrom(error: unknown): unknown {
  if (error instanceof DashboardStoreError) return error;
  const code = pgErrorCode(error);
  if (code === null) return error;
  const constraint =
    typeof error === 'object' && error !== null && 'constraint' in error && typeof error.constraint === 'string'
      ? ` (${error.constraint})`
      : '';
  if (code === FOREIGN_KEY_VIOLATION) {
    return new DashboardStoreError(`refers to a row that does not exist${constraint}`, {
      cause: error,
      reason: 'missing',
    });
  }
  if (code === UNIQUE_VIOLATION) {
    return new DashboardStoreError(`a row with this key already exists${constraint}`, {
      cause: error,
      reason: 'conflict',
    });
  }
  if (INVALID_CODES.has(code) || code.startsWith('22')) {
    return new DashboardStoreError(`breaks a rule of the store${constraint}`, {
      cause: error,
      reason: 'invalid',
    });
  }
  return error;
}

const CALLER_ID = /^[A-Za-z0-9._:-]{1,200}$/;

/** An id the caller supplies: 1 to 200 letters, digits, `.`, `_`, `:` or `-`. */
export function asId(value: string, label: string): string {
  if (typeof value !== 'string' || !CALLER_ID.test(value)) {
    throw new DashboardStoreError(
      `${label} must be 1 to 200 letters, digits, '.', '_', ':' or '-'`,
    );
  }
  return value;
}

/** A caller id when given, otherwise a new random one. */
export function idOrNew(value: string | null | undefined, label: string): string {
  return value === null || value === undefined ? randomUUID() : asId(value, label);
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new DashboardStoreError(`${label} is required`);
  return trimmed;
}

/** Optional text: missing, null, or blank all store as NULL. */
export function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

const ZONED_TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|z|[+-]\d{2}:?\d{2})$/;

/**
 * A point in time, returned as a UTC ISO string. The input must say its zone:
 * a zoneless time would be read in the server's own zone. Accepted (NEWS-228):
 * a `T`, `t` or space between date and time, and `Z`, `z`, `±HH:MM` or `±HHMM`.
 */
export function asInstant(value: string, label: string): string {
  const trimmed = value.trim();
  const match = ZONED_TIMESTAMP.exec(trimmed);
  if (!match) {
    throw new DashboardStoreError(`${label} must be a timestamp with a zone offset`);
  }
  const [, date, time, zone] = match as unknown as [string, string, string, string];
  const offset =
    zone === 'Z' || zone === 'z'
      ? 'Z'
      : zone.includes(':')
        ? zone
        : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const offsetMinutes = offset === 'Z' ? 0 : Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4));
  if (offset !== 'Z' && (Number(offset.slice(4)) > 59 || offsetMinutes > 18 * 60)) {
    throw new DashboardStoreError(`${label} has a zone offset that does not exist`);
  }
  const parsed = Date.parse(`${date}T${time}${offset}`);
  // Date.parse rolls Feb 30 over into March. Refuse it, as asCalendarDate does.
  if (Number.isNaN(parsed) || !isRealDate(trimmed.slice(0, 10))) {
    throw new DashboardStoreError(`${label} must be a timestamp`);
  }
  return new Date(parsed).toISOString();
}

export function optionalInstant(value: string | null | undefined, label: string): string | null {
  if (value === null || value === undefined) return null;
  return asInstant(value, label);
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a YYYY-MM-DD that exists on the calendar. */
function isRealDate(date: string): boolean {
  if (!CALENDAR_DATE.test(date)) return false;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
}

/** A calendar date, YYYY-MM-DD, with no time and no zone. */
export function asCalendarDate(value: string, label: string): string {
  const trimmed = value.trim();
  if (!isRealDate(trimmed)) {
    throw new DashboardStoreError(`${label} must be a date (YYYY-MM-DD)`);
  }
  return trimmed;
}

export function optionalCalendarDate(
  value: string | null | undefined,
  label: string,
): string | null {
  if (value === null || value === undefined) return null;
  return asCalendarDate(value, label);
}

/** 00:00 UTC of a calendar date, as a UTC ISO string. */
export function utcMidnight(date: string): string {
  return new Date(`${date}T00:00:00Z`).toISOString();
}

export function asInteger(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new DashboardStoreError(`${label} must be a whole number`);
  return value;
}

export function asJsonObject(value: JsonObject, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DashboardStoreError(`${label} must be a JSON object`);
  }
  return value;
}

export function pgErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

/** Runs work in one transaction on one pooled client. */
export async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Keep the first error. The connection is unusable, so drop it from the pool.
      broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
