import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DashboardStoreError, asId, asInstant, idOrNew, storeErrorFrom } from './storeSupport.js';

test('a timestamp may use T, t or a space, and Z, z, ±HH:MM or ±HHMM (NEWS-228)', () => {
  const utc = '2026-11-23T23:45:00.000Z';
  for (const form of [
    '2026-11-23T23:45:00Z',
    '2026-11-23t23:45:00z',
    '2026-11-23 23:45:00Z',
    '2026-11-23T18:45:00-05:00',
    '2026-11-23T18:45:00-0500',
    '2026-11-23 18:45-0500',
    '2026-11-24T00:45:00.000+0100',
  ]) {
    assert.equal(asInstant(form, 'at'), utc, form);
  }
});

test('a timestamp with no zone, or a zone that does not exist, is refused', () => {
  for (const form of [
    '2026-11-23T23:45:00',
    '2026-11-23 23:45',
    '2026-11-23',
    '2026-11-23T23:45:00+05',
    '2026-11-23T23:45:00+05:60',
    '2026-11-23T23:45:00+1900',
    '2026-02-30T10:00:00Z',
    '2026-11-23T23:45:00 Z',
  ]) {
    assert.throws(() => asInstant(form, 'at'), DashboardStoreError, form);
  }
});

test('a caller id is 1 to 200 letters, digits, dot, underscore, colon or hyphen', () => {
  for (const id of ['a', 'grok:story:2026-11-23.1', 'A_b-C', 'x'.repeat(200)]) {
    assert.equal(asId(id, 'id'), id);
  }
  for (const id of ['', ' a', 'a b', 'a/b', 'é', 'x'.repeat(201), 7 as never]) {
    assert.throws(() => asId(id, 'id'), /id must be 1 to 200/);
  }
  assert.match(idOrNew(undefined, 'id'), /^[0-9a-f-]{36}$/);
  assert.equal(idOrNew('given', 'id'), 'given');
});

test('Postgres errors map to one store error each, naming the constraint and no SQL', () => {
  const pg = (code: string) =>
    Object.assign(new Error('insert or update on table "x" violates ... SQL text'), {
      code,
      constraint: 'x_fkey',
    });
  const missing = storeErrorFrom(pg('23503'));
  assert.ok(missing instanceof DashboardStoreError);
  assert.equal(missing.reason, 'missing');
  assert.equal(missing.message, 'refers to a row that does not exist (x_fkey)');

  const duplicate = storeErrorFrom(pg('23505'));
  assert.ok(duplicate instanceof DashboardStoreError);
  assert.equal(duplicate.reason, 'conflict');

  for (const code of ['23502', '23514', '22P02', '22007', '22008']) {
    const invalid = storeErrorFrom(pg(code));
    assert.ok(invalid instanceof DashboardStoreError, code);
    assert.equal(invalid.reason, 'invalid', code);
    assert.doesNotMatch(invalid.message, /SQL|violates/);
  }

  // Not a rule the input broke: left for the caller to treat as a fault.
  const lost = Object.assign(new Error('terminating connection'), { code: '57P01' });
  assert.equal(storeErrorFrom(lost), lost);
  const plain = new Error('plain');
  assert.equal(storeErrorFrom(plain), plain);
  const already = new DashboardStoreError('x', { reason: 'conflict' });
  assert.equal(storeErrorFrom(already), already);
  assert.equal(new DashboardStoreError('x').reason, 'invalid');
});
