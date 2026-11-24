import { DashboardStoreError, asCalendarDate, asInstant, type JsonObject, type JsonValue } from './storeSupport.js';
import type { MorningKind } from './vocabulary.js';

/**
 * Deep checks for the JSON the store keeps (NEWS-228): Morning `data` by kind,
 * and story panel `payload` by kind. The shapes follow the Round 2 mockup's
 * Morning cards and the proposal's Seats panel. The tables keep jsonb; these
 * checks are what stops a post the UI could not draw.
 */

/** Any panel kind without a shape of its own: an object up to this size. */
export const PANEL_PAYLOAD_MAX_BYTES = 32 * 1024;
/** Weather and Market data are small cards; anything larger is a mistake. */
const MORNING_DATA_MAX_BYTES = 32 * 1024;
const TEXT_MAX = 500;

class Shape {
  constructor(private readonly where: string) {}

  fail(message: string): never {
    throw new DashboardStoreError(`${this.where}: ${message}`);
  }

  object(value: JsonValue | undefined, path: string): JsonObject {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      this.fail(`${path} must be an object`);
    }
    return value;
  }

  only(value: JsonObject, path: string, allowed: readonly string[]): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.fail(`${path} has an unknown field ${key}`);
    }
  }

  array(value: JsonValue | undefined, path: string, min: number, max: number): JsonValue[] {
    if (!Array.isArray(value)) this.fail(`${path} must be a list`);
    if (value.length < min || value.length > max) {
      this.fail(`${path} must hold ${min} to ${max} items`);
    }
    return value;
  }

  text(value: JsonValue | undefined, path: string): string {
    if (typeof value !== 'string' || value.trim() === '') this.fail(`${path} must be text`);
    if (value.length > TEXT_MAX) this.fail(`${path} is longer than ${TEXT_MAX} characters`);
    return value;
  }

  optionalText(value: JsonValue | undefined, path: string): void {
    if (value !== undefined && value !== null) this.text(value, path);
  }

  number(value: JsonValue | undefined, path: string, min = -Infinity, max = Infinity): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) this.fail(`${path} must be a number`);
    if (value < min || value > max) this.fail(`${path} must be between ${min} and ${max}`);
    return value;
  }

  optionalNumber(value: JsonValue | undefined, path: string, min = -Infinity, max = Infinity): void {
    if (value !== undefined && value !== null) this.number(value, path, min, max);
  }

  run<T>(label: string, check: () => T): T {
    try {
      return check();
    } catch (error) {
      if (error instanceof DashboardStoreError && !error.message.startsWith(this.where)) {
        this.fail(`${label} ${error.message.replace(/^\S+ /, '')}`);
      }
      throw error;
    }
  }
}

function sizeOf(value: JsonObject): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

/**
 * Weather: the grid on the mockup's Weather card. `days` are the column dates
 * (the card shows their weekday); each location has a high and low per day,
 * an optional "now" line, an optional note (such as an NWS frost line) and an
 * optional alert (such as a Freeze Watch).
 */
function checkWeather(data: JsonObject): void {
  const s = new Shape('weather data');
  s.only(data, 'data', ['unit', 'issuedAt', 'alertsAt', 'days', 'locations']);
  if (data.unit !== 'F' && data.unit !== 'C') s.fail('data.unit must be F or C');
  s.run('data.issuedAt', () => asInstant(s.text(data.issuedAt, 'data.issuedAt'), 'issuedAt'));
  if (data.alertsAt !== undefined && data.alertsAt !== null) {
    s.run('data.alertsAt', () => asInstant(s.text(data.alertsAt, 'data.alertsAt'), 'alertsAt'));
  }
  const days = s.array(data.days, 'data.days', 1, 10);
  days.forEach((day, i) =>
    s.run(`data.days[${i}]`, () => asCalendarDate(s.text(day, `data.days[${i}]`), 'day')),
  );
  const locations = s.array(data.locations, 'data.locations', 1, 12);
  locations.forEach((raw, i) => {
    const path = `data.locations[${i}]`;
    const location = s.object(raw, path);
    s.only(location, path, ['name', 'now', 'days', 'note', 'alert']);
    s.text(location.name, `${path}.name`);
    if (location.now !== undefined && location.now !== null) {
      const now = s.object(location.now, `${path}.now`);
      s.only(now, `${path}.now`, ['temp', 'conditions', 'rainChancePct']);
      s.number(now.temp, `${path}.now.temp`);
      s.optionalText(now.conditions, `${path}.now.conditions`);
      s.optionalNumber(now.rainChancePct, `${path}.now.rainChancePct`, 0, 100);
    }
    const perDay = s.array(location.days, `${path}.days`, days.length, days.length);
    perDay.forEach((cell, d) => {
      const cellPath = `${path}.days[${d}]`;
      const values = s.object(cell, cellPath);
      s.only(values, cellPath, ['high', 'low']);
      const high = s.number(values.high, `${cellPath}.high`);
      const low = s.number(values.low, `${cellPath}.low`);
      if (low > high) s.fail(`${cellPath}.low is above its high`);
    });
    s.optionalText(location.note, `${path}.note`);
    s.optionalText(location.alert, `${path}.alert`);
  });
}

/** Market: the figures on the mockup's Market brief card, and its short notes. */
function checkMarket(data: JsonObject): void {
  const s = new Shape('market data');
  s.only(data, 'data', ['quotes', 'notes']);
  const quotes = s.array(data.quotes, 'data.quotes', 1, 20);
  quotes.forEach((raw, i) => {
    const path = `data.quotes[${i}]`;
    const quote = s.object(raw, path);
    s.only(quote, path, ['label', 'value', 'changePct']);
    s.text(quote.label, `${path}.label`);
    s.number(quote.value, `${path}.value`);
    s.optionalNumber(quote.changePct, `${path}.changePct`);
  });
  if (data.notes !== undefined && data.notes !== null) {
    s.array(data.notes, 'data.notes', 0, 6).forEach((note, i) => s.text(note, `data.notes[${i}]`));
  }
}

/** OSINT: the card's "Watch:" line. */
function checkOsint(data: JsonObject): void {
  const s = new Shape('osint data');
  s.only(data, 'data', ['watch']);
  s.optionalText(data.watch, 'data.watch');
}

/** Check a Morning item's data for its kind. BLUF carries no data. */
export function checkMorningData(kind: MorningKind, data: JsonObject | null): void {
  if (data === null) return;
  if (sizeOf(data) > MORNING_DATA_MAX_BYTES) {
    throw new DashboardStoreError(`${kind} data is larger than ${MORNING_DATA_MAX_BYTES} bytes`);
  }
  switch (kind) {
    case 'weather':
      return checkWeather(data);
    case 'market':
      return checkMarket(data);
    case 'osint':
      return checkOsint(data);
    case 'bluf':
      throw new DashboardStoreError('bluf data: a BLUF item carries no data');
    default: {
      const unexpected: never = kind;
      throw new DashboardStoreError(`unexpected morning kind ${String(unexpected)}`);
    }
  }
}

/** Seats: the proposal's segments, values, threshold and note. */
function checkSeats(payload: JsonObject): void {
  const s = new Shape('seats payload');
  s.only(payload, 'payload', ['segments', 'threshold', 'note']);
  const segments = s.array(payload.segments, 'payload.segments', 1, 20);
  segments.forEach((raw, i) => {
    const path = `payload.segments[${i}]`;
    const segment = s.object(raw, path);
    s.only(segment, path, ['name', 'value']);
    s.text(segment.name, `${path}.name`);
    s.number(segment.value, `${path}.value`, 0);
  });
  s.optionalNumber(payload.threshold, 'payload.threshold', 0);
  s.optionalText(payload.note, 'payload.note');
}

/** Check a story panel's payload for its kind. Kinds with no shape only have a size cap. */
export function checkPanelPayload(kind: string, payload: JsonObject): void {
  if (sizeOf(payload) > PANEL_PAYLOAD_MAX_BYTES) {
    throw new DashboardStoreError(`payload is larger than ${PANEL_PAYLOAD_MAX_BYTES} bytes`);
  }
  if (kind === 'seats') checkSeats(payload);
}
