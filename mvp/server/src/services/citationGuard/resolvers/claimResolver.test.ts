import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CitationCheckResult, CitationSourceRecord } from '../../../types/citationGuard.js';
import { resolveClaimCitation } from './claimResolver.js';

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

function assertNoBadgeFields(result: CitationCheckResult): void {
  const keys = Object.keys(result);
  assert.ok(!keys.includes('badge'), 'result must not include badge');
  assert.ok(!keys.includes('verdict'), 'result must not include verdict');
  assert.ok(!keys.includes('debunked'), 'result must not include debunked');
  assert.ok(!keys.includes('verified'), 'result must not include verified');
  assert.ok(!keys.includes('false'), 'result must not include false');
}

test('resolveClaimCitation: missing refutingUrl → missing-source + unconfirmed', () => {
  const sources = [
    source({ url: 'https://publisher.example/refute', runId: 'run-a' }),
  ];
  for (const refutingUrl of [undefined, null, '', '   '] as const) {
    const result = resolveClaimCitation(refutingUrl, sources);
    assert.equal(result.kind, 'claim');
    assert.equal(result.status, 'missing-source');
    assert.equal(result.display, 'unconfirmed');
    assertNoBadgeFields(result);
  }
});

test('resolveClaimCitation: unresolved Google News refutingUrl → unconfirmed', () => {
  const sources = [
    source({ url: 'https://publisher.example/refute', runId: 'run-a' }),
  ];
  const gn = 'https://news.google.com/rss/articles/CBMiXyz';
  const result = resolveClaimCitation(gn, sources, {
    id: 'claim-1',
    claimText: 'The draft was rejected.',
  });
  assert.deepEqual(result, {
    kind: 'claim',
    status: 'missing-source',
    display: 'unconfirmed',
    refutingUrl: gn,
    claimText: 'The draft was rejected.',
    id: 'claim-1',
  });
  assertNoBadgeFields(result);
});

test('resolveClaimCitation: refutingUrl in run source set → match / ok', () => {
  const sources = [
    source({ url: 'https://publisher.example/refute', runId: 'run-a' }),
  ];
  const result = resolveClaimCitation('https://publisher.example/refute', sources, {
    id: 'claim-ok',
    claimText: 'The measure failed.',
  });
  assert.deepEqual(result, {
    kind: 'claim',
    status: 'match',
    display: 'ok',
    refutingUrl: 'https://publisher.example/refute',
    claimText: 'The measure failed.',
    id: 'claim-ok',
  });
  assertNoBadgeFields(result);
});

test('resolveClaimCitation: refutingUrl match ignores surrounding whitespace', () => {
  const sources = [
    source({ url: 'https://publisher.example/refute', runId: 'run-a' }),
  ];
  const result = resolveClaimCitation('  https://publisher.example/refute  ', sources);
  assert.equal(result.status, 'match');
  assert.equal(result.display, 'ok');
});

test('resolveClaimCitation: refutingUrl not in sources → missing-source + unconfirmed', () => {
  const sources = [
    source({ url: 'https://publisher.example/other', runId: 'run-a' }),
  ];
  const result = resolveClaimCitation('https://publisher.example/refute', sources);
  assert.equal(result.kind, 'claim');
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unconfirmed');
  assert.equal(result.refutingUrl, 'https://publisher.example/refute');
  assertNoBadgeFields(result);
});
