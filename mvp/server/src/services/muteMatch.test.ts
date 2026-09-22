import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MuteRule } from '../store/muteRulesStore.js';
import { articleMatchesMute, clusterMatchesMute } from './muteMatch.js';

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

