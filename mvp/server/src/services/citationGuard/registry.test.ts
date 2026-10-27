import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CitationSourceRecord } from '../../types/citationGuard.js';
import {
  checkCitationItems,
  citationResolvers,
  filterCitationSourcesForRun,
} from './registry.js';

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

test('citationResolvers registers the url resolver', () => {
  assert.equal(typeof citationResolvers.url, 'function');
  assert.equal(citationResolvers.quote, undefined);
  assert.equal(citationResolvers.claim, undefined);
  assert.equal(citationResolvers.court, undefined);
});

test('checkCitationItems: url items resolve via the registry (match + missing)', () => {
  const sourcesForRun = [
    source({ url: 'https://publisher.example/story', runId: 'run-a' }),
  ];
  const results = checkCitationItems(
    [
      { kind: 'url', url: 'https://publisher.example/story', id: 'ok-1' },
      { kind: 'url', url: 'https://publisher.example/missing', id: 'miss-1' },
    ],
    sourcesForRun,
  );
  assert.deepEqual(results, [
    {
      kind: 'url',
      status: 'match',
      display: 'ok',
      url: 'https://publisher.example/story',
      id: 'ok-1',
    },
    {
      kind: 'url',
      status: 'missing-source',
      display: 'unverified',
      url: 'https://publisher.example/missing',
      id: 'miss-1',
    },
  ]);
});

test('checkCitationItems: non-url kinds without a resolver → missing-source + unverified', () => {
  const results = checkCitationItems(
    [{ kind: 'quote', id: 'q-1' }],
    [source({ url: 'https://publisher.example/story', runId: 'run-a' })],
  );
  assert.equal(results.length, 1);
  assert.equal(results[0]?.kind, 'quote');
  assert.equal(results[0]?.status, 'missing-source');
  assert.equal(results[0]?.display, 'unverified');
  assert.equal(results[0]?.id, 'q-1');
});

test('filterCitationSourcesForRun keeps only the requested runId', () => {
  const mixed = [
    source({ url: 'https://a.example/1', runId: 'run-a', contentHash: 'aaaa' }),
    source({ url: 'https://b.example/1', runId: 'run-b', contentHash: 'bbbb' }),
    source({ url: 'https://a.example/2', runId: 'run-a', contentHash: 'cccc' }),
  ];
  const filtered = filterCitationSourcesForRun(mixed, 'run-a');
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every((s) => s.runId === 'run-a'));
});
