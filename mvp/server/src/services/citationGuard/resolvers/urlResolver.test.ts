import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CitationSourceRecord } from '../../../types/citationGuard.js';
import { filterCitationSourcesForRun } from '../registry.js';
import { normalizeCitationUrl, resolveUrlCitation } from './urlResolver.js';

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

test('resolveUrlCitation: match when URL is in the run source set', () => {
  const sources = [
    source({ url: 'https://publisher.example/story', runId: 'run-a' }),
  ];
  const result = resolveUrlCitation('https://publisher.example/story', sources);
  assert.deepEqual(result, {
    kind: 'url',
    status: 'match',
    display: 'ok',
    url: 'https://publisher.example/story',
  });
});

test('resolveUrlCitation: URL not in store → missing-source + unverified', () => {
  const sources = [
    source({ url: 'https://publisher.example/other', runId: 'run-a' }),
  ];
  const result = resolveUrlCitation('https://publisher.example/missing', sources);
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unverified');
  assert.equal(result.kind, 'url');
  assert.equal(result.url, 'https://publisher.example/missing');
});

test('resolveUrlCitation: unresolved Google News link → missing-source + unverified', () => {
  const sources = [
    source({ url: 'https://publisher.example/story', runId: 'run-a' }),
  ];
  const gn = 'https://news.google.com/rss/articles/CBMiXyz';
  const result = resolveUrlCitation(gn, sources);
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unverified');
  assert.equal(result.kind, 'url');
  assert.equal(result.url, gn);
});

test('resolveUrlCitation: sources from a different runId do not count as a match', () => {
  const mixed = [
    source({
      url: 'https://publisher.example/story',
      runId: 'run-b',
      contentHash: 'hashbbbbbbbbbbbb',
    }),
    source({
      url: 'https://other.example/only-in-a',
      runId: 'run-a',
      contentHash: 'hashaaaaaaaaaaaa',
    }),
  ];
  const sourcesForRunA = filterCitationSourcesForRun(mixed, 'run-a');
  const result = resolveUrlCitation('https://publisher.example/story', sourcesForRunA);
  assert.equal(result.status, 'missing-source');
  assert.equal(result.display, 'unverified');
});

test('normalizeCitationUrl: trim + absolute href; match ignores trailing spaces', () => {
  assert.equal(
    normalizeCitationUrl('  https://publisher.example/story  '),
    'https://publisher.example/story',
  );
  const sources = [
    source({ url: 'https://publisher.example/story', runId: 'run-a' }),
  ];
  const result = resolveUrlCitation('  https://publisher.example/story  ', sources);
  assert.equal(result.status, 'match');
  assert.equal(result.display, 'ok');
});

test('resolveUrlCitation: preserves optional id on the result', () => {
  const sources = [
    source({ url: 'https://publisher.example/story', runId: 'run-a' }),
  ];
  const result = resolveUrlCitation('https://publisher.example/story', sources, {
    id: 'cite-1',
  });
  assert.equal(result.id, 'cite-1');
});
