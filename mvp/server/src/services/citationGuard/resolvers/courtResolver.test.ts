import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CitationSourceRecord } from '../../../types/citationGuard.js';
import { resolveCourtCitation } from './courtResolver.js';

function source(
  overrides: Partial<CitationSourceRecord> & Pick<CitationSourceRecord, 'url' | 'runId'>,
): CitationSourceRecord {
  const contentHash = overrides.contentHash ?? 'hash000000000001';
  const runId = overrides.runId;
  return {
    id: overrides.id ?? `${contentHash}:${runId}`,
    url: overrides.url,
    text: overrides.text ?? 'Body text.',
    fetchedAt: overrides.fetchedAt ?? '2026-10-27T12:00:00.000Z',
    runId,
    contentHash,
    articleId: overrides.articleId ?? 'art-1',
  };
}

test('resolveCourtCitation: stub always returns missing-source + unverified', () => {
  const sources = [
    source({ url: 'https://courtlistener.example/docket/1', runId: 'run-a' }),
  ];
  const result = resolveCourtCitation(
    { kind: 'court', id: 'court-1', url: 'https://courtlistener.example/docket/1' },
    sources,
  );
  assert.equal(result.kind, 'court');
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unverified');
  assert.equal(result.id, 'court-1');
  assert.equal(result.url, 'https://courtlistener.example/docket/1');
});

test('resolveCourtCitation: stub does not throw with empty sources', () => {
  const result = resolveCourtCitation({ kind: 'court' }, []);
  assert.equal(result.kind, 'court');
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unverified');
});
