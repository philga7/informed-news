import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CitationSourceRecord } from '../../types/citationGuard.js';
import { matchQuoteInSources } from './matchQuote.js';
import { normalizeQuote } from './normalizeQuote.js';

function source(
  overrides: Partial<CitationSourceRecord> & Pick<CitationSourceRecord, 'runId'>,
): CitationSourceRecord {
  const contentHash = overrides.contentHash ?? 'hash000000000001';
  const runId = overrides.runId;
  return {
    id: overrides.id ?? `${contentHash}:${runId}`,
    url: overrides.url ?? 'https://publisher.example/story',
    text: overrides.text ?? 'Body text.',
    fetchedAt: overrides.fetchedAt ?? '2026-10-27T12:00:00.000Z',
    runId,
    contentHash,
    articleId: overrides.articleId ?? 'art-1',
  };
}

test('normalizeQuote: collapse whitespace and map curly quotes; keep case', () => {
  assert.equal(
    normalizeQuote('  He said  “hello”\nand  ‘bye’  '),
    'He said "hello" and \'bye\'',
  );
  assert.equal(normalizeQuote('AbC'), 'AbC');
});

test('matchQuoteInSources: exact match passes', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'The committee voted to approve the measure today.',
    }),
  ];
  const result = matchQuoteInSources(
    'The committee voted to approve the measure today.',
    sources,
  );
  assert.equal(result.status, 'match');
  assert.equal(result.display, 'ok');
});

test('matchQuoteInSources: whitespace / curly-vs-straight differences pass', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'She called it “a breakthrough” for the region.',
    }),
  ];
  const result = matchQuoteInSources(
    'She  called it  "a breakthrough"  for the region.',
    sources,
  );
  assert.equal(result.status, 'match');
  assert.equal(result.display, 'ok');
});

test('matchQuoteInSources: one-word change fails (mismatch)', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'The committee voted to approve the measure today.',
    }),
  ];
  const result = matchQuoteInSources(
    'The committee voted to reject the measure today.',
    sources,
  );
  assert.equal(result.status, 'mismatch');
  assert.equal(result.display, 'unverified');
});

test('matchQuoteInSources: paraphrase-as-quote fails (mismatch)', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'Officials said the bridge would reopen next week after repairs.',
    }),
  ];
  const result = matchQuoteInSources(
    'Officials indicated the span may open again shortly once fixed.',
    sources,
  );
  assert.equal(result.status, 'mismatch');
  assert.equal(result.display, 'unverified');
});

test('matchQuoteInSources: no fetched source → missing-source', () => {
  const empty = matchQuoteInSources('any quote text', []);
  assert.equal(empty.status, 'missing-source');
  assert.equal(empty.display, 'unverified');

  const noText = matchQuoteInSources('any quote text', [
    source({ runId: 'run-a', text: '   ' }),
  ]);
  assert.equal(noText.status, 'missing-source');
  assert.equal(noText.display, 'unverified');
});

test('matchQuoteInSources: case difference fails (mismatch)', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'The Agency confirmed the finding.',
    }),
  ];
  const result = matchQuoteInSources('the agency confirmed the finding.', sources);
  assert.equal(result.status, 'mismatch');
  assert.equal(result.display, 'unverified');
});

test('matchQuoteInSources: ellipsis and [bracketed] not in source → mismatch', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'We will finish the review and announce results on Friday.',
    }),
  ];
  const withEllipsis = matchQuoteInSources(
    'We will finish the review… and announce results on Friday.',
    sources,
  );
  assert.equal(withEllipsis.status, 'mismatch');

  const withBracket = matchQuoteInSources(
    'We will finish the [internal] review and announce results on Friday.',
    sources,
  );
  assert.equal(withBracket.status, 'mismatch');
});
