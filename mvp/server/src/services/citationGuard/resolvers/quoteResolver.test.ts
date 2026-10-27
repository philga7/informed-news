import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CitationSourceRecord } from '../../../types/citationGuard.js';
import { resolveQuoteCitation } from './quoteResolver.js';

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

test('resolveQuoteCitation: match when quote is in a source body', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'Leaders signed the accord in Geneva this morning.',
    }),
  ];
  const quote = 'signed the accord in Geneva';
  const result = resolveQuoteCitation(quote, sources, { id: 'q-1' });
  assert.deepEqual(result, {
    kind: 'quote',
    status: 'match',
    display: 'ok',
    quote,
    id: 'q-1',
  });
});

test('resolveQuoteCitation: mismatch when quote is not in any source', () => {
  const sources = [
    source({
      runId: 'run-a',
      text: 'Leaders signed the accord in Geneva this morning.',
    }),
  ];
  const quote = 'Leaders rejected the accord in Geneva';
  const result = resolveQuoteCitation(quote, sources);
  assert.equal(result.kind, 'quote');
  assert.equal(result.status, 'mismatch');
  assert.equal(result.display, 'unverified');
  assert.equal(result.quote, quote);
});

test('resolveQuoteCitation: missing-source when no usable source text', () => {
  const quote = 'anything at all';
  const result = resolveQuoteCitation(quote, []);
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unverified');
  assert.equal(result.kind, 'quote');
  assert.equal(result.quote, quote);
});

test('resolveQuoteCitation: preserves null quote on the result', () => {
  const result = resolveQuoteCitation(null, [
    source({ runId: 'run-a', text: 'Some body.' }),
  ]);
  assert.equal(result.kind, 'quote');
  assert.equal(result.quote, null);
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unverified');
});
