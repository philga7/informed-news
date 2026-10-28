import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CitationSourceRecord } from '../../../types/citationGuard.js';
import { filterCitationSourcesForRun } from '../registry.js';
import { displayForUrlStatus, normalizeCitationUrl, resolveUrlCitation } from './urlResolver.js';

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

test('normalizeCitationUrl: trailing slash, http/https and utm_* collapse; other query kept', () => {
  const key = 'https://publisher.example/story';
  assert.equal(normalizeCitationUrl('https://publisher.example/story/'), key);
  assert.equal(normalizeCitationUrl('http://publisher.example/story?utm_source=brief'), key);
  assert.equal(normalizeCitationUrl('https://publisher.example/story?UTM_Medium=x'), key);
  assert.notEqual(normalizeCitationUrl('https://publisher.example/story?id=1'), key);
  assert.equal(normalizeCitationUrl('https://publisher.example/'), 'https://publisher.example/');
  assert.equal(normalizeCitationUrl('  not a url '), 'not a url');
});

test('resolveUrlCitation: matches despite slash, scheme and utm differences', () => {
  const sources = [source({ url: 'https://publisher.example/story/', runId: 'run-a' })];
  const result = resolveUrlCitation('http://publisher.example/story?utm_source=brief', sources);
  assert.equal(result.status, 'match');
  const other = resolveUrlCitation('https://publisher.example/story?id=2', sources);
  assert.equal(other.status, 'missing-source');
});

test('displayForUrlStatus maps mismatch and missing-source to unverified', () => {
  assert.equal(displayForUrlStatus('match'), 'ok');
  assert.equal(displayForUrlStatus('mismatch'), 'unverified');
  assert.equal(displayForUrlStatus('missing-source'), 'unverified');
});

test('normalizeCitationUrl keeps the fragment', () => {
  assert.notEqual(
    normalizeCitationUrl('https://publisher.example/story#section'),
    normalizeCitationUrl('https://publisher.example/story'),
  );
  assert.equal(
    normalizeCitationUrl('https://publisher.example/story#section'),
    'https://publisher.example/story#section',
  );
});
