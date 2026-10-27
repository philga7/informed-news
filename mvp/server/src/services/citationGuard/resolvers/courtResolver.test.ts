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

test('resolveCourtCitation: resolved attachment → match / ok with record url and procedural', () => {
  const result = resolveCourtCitation(
    {
      kind: 'court',
      id: 'court-1',
      url: 'https://www.courtlistener.com/docket/1/x/',
      citation: '576 U.S. 644',
      courtAttachment: {
        status: 'resolved',
        courtRecordUrl: 'https://www.courtlistener.com/opinion/1/x/',
        procedural: true,
      },
    },
    [],
  );
  assert.equal(result.status, 'match');
  assert.equal(result.display, 'ok');
  assert.equal(result.courtRecordUrl, 'https://www.courtlistener.com/opinion/1/x/');
  assert.equal(result.procedural, true);
  assert.equal(result.url, 'https://www.courtlistener.com/docket/1/x/');
  assert.equal(result.id, 'court-1');
  assert.equal(result.citation, '576 U.S. 644');
});

test('resolveCourtCitation: unresolved or missing attachment → missing-source / unverified', () => {
  for (const courtAttachment of [
    undefined,
    { status: 'unresolved' as const, courtRecordUrl: null, procedural: false },
  ]) {
    const result = resolveCourtCitation(
      { kind: 'court', citation: '1 U.S. 200', ...(courtAttachment ? { courtAttachment } : {}) },
      [source({ url: 'https://x.example', runId: 'r' })],
    );
    assert.equal(result.status, 'missing-source');
    assert.equal(result.display, 'unverified');
    assert.notEqual(result.procedural, true);
    assert.equal(result.courtRecordUrl, undefined);
  }
});
