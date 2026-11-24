import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PANEL_PAYLOAD_MAX_BYTES, checkMorningData, checkPanelPayload } from './jsonShapes.js';
import type { JsonObject } from './storeSupport.js';

/** The Weather card from the Round 2 mockup, as Grok Bot would send it. */
const WEATHER: JsonObject = {
  unit: 'F',
  issuedAt: '2026-11-20T11:32:00Z',
  alertsAt: '2026-11-20T02:59:00Z',
  days: ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'],
  locations: [
    {
      name: 'Jefferson',
      now: { temp: 52, conditions: 'clear', rainChancePct: 7 },
      days: [
        { high: 64, low: 54 },
        { high: 55, low: 42 },
        { high: 55, low: 38 },
        { high: 54, low: 32 },
      ],
      note: 'Fri night 35, patchy frost (NWS)',
    },
    {
      name: 'Dahlonega',
      now: { temp: 53, conditions: 'clear', rainChancePct: 16 },
      days: [
        { high: 57, low: 51 },
        { high: 51, low: 40 },
        { high: 50, low: 39 },
        { high: 53, low: 27 },
      ],
      alert: 'Freeze Watch: lows to 29, 2-8 AM Sat',
    },
  ],
};

const MARKET: JsonObject = {
  quotes: [
    { label: 'S&P', value: 7520.93, changePct: -0.38 },
    { label: 'Nasdaq', value: 0, changePct: -0.74 },
    { label: 'VIX', value: 18.65 },
  ],
  notes: ['Needs attention: SPG, RSI 79.6, trim candidate.'],
};

function withField(base: JsonObject, path: (copy: any) => void): JsonObject {
  const copy = structuredClone(base);
  path(copy);
  return copy;
}

test('the mockup Weather, Market and OSINT cards pass, and data may be left out', () => {
  checkMorningData('weather', WEATHER);
  checkMorningData('market', MARKET);
  checkMorningData('osint', { watch: 'Whether US aircraft return to UK bases.' });
  checkMorningData('osint', {});
  for (const kind of ['bluf', 'weather', 'market', 'osint'] as const) checkMorningData(kind, null);
});

test('a broken Weather grid is refused with the path that is wrong', () => {
  const cases: Array<[(copy: any) => void, RegExp]> = [
    [(c) => (c.unit = 'K'), /data.unit must be F or C/],
    [(c) => delete c.issuedAt, /data.issuedAt must be text/],
    [(c) => (c.issuedAt = '2026-11-20 06:32'), /data.issuedAt must be a timestamp/],
    [(c) => (c.days = []), /data.days must hold 1 to 10/],
    [(c) => (c.days[1] = 'Fri'), /data.days\[1\] must be a date/],
    [(c) => c.locations[0].days.pop(), /data.locations\[0\].days must hold 4 to 4/],
    [(c) => (c.locations[0].days[2].low = 99), /data.locations\[0\].days\[2\].low is above its high/],
    [(c) => (c.locations[1].now.rainChancePct = 140), /rainChancePct must be between 0 and 100/],
    [(c) => (c.locations[1].now.temp = '53'), /now.temp must be a number/],
    [(c) => (c.locations[0].wind = 3), /data.locations\[0\] has an unknown field wind/],
    [(c) => (c.grid = []), /data has an unknown field grid/],
  ];
  for (const [change, message] of cases) {
    assert.throws(() => checkMorningData('weather', withField(WEATHER, change)), message);
  }
});

test('a broken Market card, OSINT card or any BLUF data is refused', () => {
  assert.throws(() => checkMorningData('market', { quotes: [] }), /data.quotes must hold 1 to 20/);
  assert.throws(
    () => checkMorningData('market', withField(MARKET, (c) => (c.quotes[0].value = null))),
    /quotes\[0\].value must be a number/,
  );
  assert.throws(
    () => checkMorningData('market', withField(MARKET, (c) => (c.notes = ['a', 'b', 'c', 'd', 'e', 'f', 'g']))),
    /data.notes must hold 0 to 6/,
  );
  assert.throws(() => checkMorningData('osint', { watch: '' }), /data.watch must be text/);
  assert.throws(() => checkMorningData('osint', { body: 'x' }), /unknown field body/);
  assert.throws(() => checkMorningData('bluf', { a: 1 }), /a BLUF item carries no data/);
  assert.throws(
    () => checkMorningData('market', { quotes: [{ label: 'x'.repeat(40_000), value: 1 }] }),
    /larger than/,
  );
});

test('a Seats panel is checked; other panel kinds only have a size cap', () => {
  const seats = {
    segments: [
      { name: 'Bloc A', value: 58 },
      { name: 'Bloc B', value: 52 },
    ],
    threshold: 61,
    note: 'Ten seats undecided',
  };
  checkPanelPayload('seats', seats);
  assert.throws(() => checkPanelPayload('seats', { segments: [] }), /payload.segments must hold 1 to 20/);
  assert.throws(
    () => checkPanelPayload('seats', { segments: [{ name: 'A', value: -1 }] }),
    /value must be between 0/,
  );
  assert.throws(() => checkPanelPayload('seats', { ...seats, extra: true }), /unknown field extra/);

  checkPanelPayload('polls', { anything: ['goes', 1, { nested: true }] });
  assert.throws(
    () => checkPanelPayload('polls', { blob: 'x'.repeat(PANEL_PAYLOAD_MAX_BYTES) }),
    /payload is larger than/,
  );
});
