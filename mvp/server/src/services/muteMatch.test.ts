import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MuteRule } from '../store/muteRulesStore.js';
import { articleMatchesMute, claimMatchesMute, clusterMatchesMute } from './muteMatch.js';

function rule(overrides: Partial<MuteRule>): MuteRule {
  return {
    id: 'r1',
    keyword: 'crypto',
    source: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('articleMatchesMute matches keyword case-insensitive substring across text fields', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'Apple' })];
  const article = {
    title: 'Something else',
    snippet: 'an APPLE a day',
    bodyText: null,
    publisherTitle: null,
    publisherDomain: 'example.com',
    canonicalUrl: 'https://example.com/story',
    citationLabel: 'Example',
  };

  assert.equal(articleMatchesMute(article, rules), true);
});

test('articleMatchesMute requires source match when rule.source is set', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'crypto', source: 'nytimes.com' })];

  const noSourceMatch = {
    title: 'Crypto markets move',
    publisherDomain: 'example.com',
    canonicalUrl: 'https://example.com/crypto',
    citationLabel: 'Example',
  };
  assert.equal(articleMatchesMute(noSourceMatch, rules), false);

  const sourceMatch = {
    title: 'Crypto markets move',
    publisherDomain: 'NYTimes.com',
    canonicalUrl: 'https://example.com/crypto',
    citationLabel: 'Example',
  };
  assert.equal(articleMatchesMute(sourceMatch, rules), true);
});

test('articleMatchesMute source match is case-insensitive substring over label/domain/hostname', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'crypto', source: 'nyt' })];

  const article = {
    title: 'Crypto markets move',
    publisherDomain: 'example.com',
    canonicalUrl: 'https://www.nytimes.com/2026/09/22/business/crypto.html',
    citationLabel: 'New York Times',
  };

  assert.equal(articleMatchesMute(article, rules), true);
});

test('clusterMatchesMute is true when any member matches', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'apple' })];

  const cluster = {
    headlines: [
      { title: 'Unrelated headline', publisherDomain: 'example.com' },
      { title: 'APPLE announces something', publisherDomain: 'example.com' },
    ],
  };

  assert.equal(clusterMatchesMute(cluster, rules), true);
});

test('clusterMatchesMute supports articles/members arrays', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'alpha' })];

  assert.equal(
    clusterMatchesMute({ articles: [{ title: 'Alpha release' }] }, rules),
    true,
  );
  assert.equal(
    clusterMatchesMute({ members: [{ title: 'Alpha release' }] }, rules),
    true,
  );
});

test('clusterMatchesMute considers all present member arrays (mixed-shape)', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'alpha' })];

  const cluster = {
    headlines: [],
    articles: [{ title: 'Alpha release' }],
  };

  assert.equal(clusterMatchesMute(cluster, rules), true);
});

test('claimMatchesMute matches keyword in claim text', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'Apple' })];
  const claim = { text: 'apple announces something' };
  assert.equal(claimMatchesMute(claim, [], rules), true);
});

test('claimMatchesMute matches keyword in linked headline title/snippet', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'alpha' })];
  const claim = { text: 'unrelated' };
  const linked = [{ title: 'Alpha release', snippet: null, publisherDomain: 'example.com' }];
  assert.equal(claimMatchesMute(claim, linked, rules), true);
});

test('claimMatchesMute requires source match when rule.source is set', async () => {
  const rules: MuteRule[] = [rule({ keyword: 'crypto', source: 'nytimes.com' })];

  const claim = { text: 'crypto moves' };
  const linkedNoSource = [{ title: 'Crypto markets move', publisherDomain: 'example.com' }];
  assert.equal(claimMatchesMute(claim, linkedNoSource, rules), false);

  const linkedSource = [
    {
      title: 'Crypto markets move',
      publisherDomain: 'NYTimes.com',
      canonicalUrl: 'https://www.nytimes.com/2026/09/22/business/crypto.html',
      citationLabel: 'New York Times',
    },
  ];
  assert.equal(claimMatchesMute(claim, linkedSource, rules), true);
});

