import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { LoadedRadarSourcesFile } from '../types/radarSource.js';
import { matchBlocklist } from './triageBlocklist.js';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'Untitled',
    sourceKind: 'rss',
    canonicalUrl: 'https://example.com/story',
    citations: [],
    publisherUrl: 'https://example.com/story',
    publisherDomain: 'example.com',
    handle: null,
    publishedAt: '2026-09-30T12:00:00.000Z',
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-09-30T12:00:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

function config(overrides: Partial<LoadedRadarSourcesFile> = {}): LoadedRadarSourcesFile {
  return {
    blocklist: [],
    sources: [],
    ...overrides,
  };
}

test('Horoscope matches Weekly HOROSCOPE for May and misses unhoroscope', () => {
  const cfg = config({ blocklist: [{ term: 'Horoscope', substring: false }] });
  assert.deepEqual(matchBlocklist(makeArticle({ title: 'Weekly HOROSCOPE for May' }), cfg), {
    term: 'Horoscope',
  });
  assert.equal(matchBlocklist(makeArticle({ title: 'unhoroscope daily' }), cfg), null);
});

test('sponsored: substring matches in snippet; word boundary misses unsponsored and hits Sponsored', () => {
  const substringCfg = config({ blocklist: [{ term: 'sponsored', substring: true }] });
  assert.deepEqual(
    matchBlocklist(makeArticle({ title: 'News', snippet: 'a sponsored note' }), substringCfg),
    { term: 'sponsored' },
  );

  const boundaryCfg = config({ blocklist: [{ term: 'sponsored', substring: false }] });
  assert.equal(
    matchBlocklist(makeArticle({ title: 'unsponsored content', snippet: '' }), boundaryCfg),
    null,
  );
  assert.deepEqual(
    matchBlocklist(makeArticle({ title: 'Sponsored', snippet: '' }), boundaryCfg),
    { term: 'sponsored' },
  );
});

test('raid does not match raids', () => {
  const cfg = config({ blocklist: [{ term: 'raid', substring: false }] });
  assert.equal(matchBlocklist(makeArticle({ title: 'ICE raids continue', snippet: '' }), cfg), null);
});

test('empty snippet uses title only; publisherTitle and bodyText are ignored', () => {
  const cfg = config({ blocklist: [{ term: 'hidden', substring: false }] });
  assert.deepEqual(matchBlocklist(makeArticle({ title: 'hidden gem', snippet: '' }), cfg), {
    term: 'hidden',
  });
  assert.equal(
    matchBlocklist(
      makeArticle({
        title: 'Clean headline',
        snippet: '',
        publisherTitle: 'hidden publisher title',
        bodyText: 'hidden body',
      }),
      cfg,
    ),
    null,
  );
});

test('global term wins over a later per-source term on the same title', () => {
  const cfg = config({
    blocklist: [{ term: 'global-hit', substring: false }],
    sources: [
      {
        id: 'src1',
        name: 'Example',
        domain: 'example.com',
        feedUrl: 'https://example.com/rss',
        blocklist: [{ term: 'global-hit', substring: false }],
      },
    ],
  });
  assert.deepEqual(matchBlocklist(makeArticle({ title: 'A global-hit story' }), cfg), {
    term: 'global-hit',
  });
});

test('per-source term matches rss on matching domain; search and cfp ignore per-source', () => {
  const cfg = config({
    blocklist: [],
    sources: [
      {
        id: 'src1',
        name: 'Example',
        domain: 'example.com',
        feedUrl: 'https://example.com/rss',
        blocklist: [{ term: 'local-ban', substring: false }],
      },
    ],
  });
  const rssHit = makeArticle({
    sourceKind: 'rss',
    publisherDomain: 'www.example.com',
    title: 'local-ban headline',
  });
  assert.deepEqual(matchBlocklist(rssHit, cfg), { term: 'local-ban' });

  const searchMiss = makeArticle({
    sourceKind: 'search',
    publisherDomain: 'www.example.com',
    title: 'local-ban headline',
  });
  assert.equal(matchBlocklist(searchMiss, cfg), null);

  const cfpMiss = makeArticle({
    sourceKind: 'cfp',
    publisherDomain: 'www.example.com',
    title: 'local-ban headline',
  });
  assert.equal(matchBlocklist(cfpMiss, cfg), null);
});

test('no match returns null', () => {
  const cfg = config({ blocklist: [{ term: 'nope', substring: false }] });
  assert.equal(matchBlocklist(makeArticle({ title: 'Fine headline' }), cfg), null);
});

test('first global term wins when two global terms both match', () => {
  const cfg = config({
    blocklist: [
      { term: 'alpha', substring: false },
      { term: 'beta', substring: false },
    ],
  });
  assert.deepEqual(matchBlocklist(makeArticle({ title: 'alpha and beta' }), cfg), {
    term: 'alpha',
  });
});
