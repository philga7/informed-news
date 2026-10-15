import assert from 'node:assert/strict';
import { test } from 'node:test';
import { usableBodyText } from './article.js';

test('a scraped body or tweet-as-body is usable for framing, trimmed', () => {
  assert.equal(usableBodyText({ bodyStatus: 'ok', bodyText: '  Full body.  ' }), 'Full body.');
  assert.equal(usableBodyText({ bodyStatus: 'not_applicable', bodyText: 'Tweet text.' }), 'Tweet text.');
});

test('a blank or missing body is not usable for framing', () => {
  assert.equal(usableBodyText({ bodyStatus: 'ok', bodyText: '   ' }), null);
  assert.equal(usableBodyText({ bodyStatus: 'not_applicable', bodyText: null }), null);
});

test('a body that is pending, unavailable or blocked is not usable for framing', () => {
  for (const bodyStatus of ['pending', 'unavailable', 'blocked'] as const) {
    assert.equal(usableBodyText({ bodyStatus, bodyText: 'Leftover text.' }), null, bodyStatus);
  }
});
