export class DashboardStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DashboardStoreError';
  }
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

const ZONED_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * A point in time, returned as a UTC ISO string. The input must say its zone
 * (Z or an offset): a zoneless time would be read in the server's own zone.
 */
export function asInstant(value: string, label: string): string {
  const trimmed = value.trim();
  if (!ZONED_TIMESTAMP.test(trimmed)) {
    throw new DashboardStoreError(`${label} must be a timestamp with a zone offset`);
  }
  const parsed = Date.parse(trimmed);
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
