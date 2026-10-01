import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import {
  candidateTopicIds,
  desiredTopicHits,
  keywordMatches,
  muteReason,
} from './triageKeywords.js';

function makeTopic(id: string, name: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    name,
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: name,
    sections: [],
    notes: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

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

function rule(id: string, keyword: string, source: string | null = null): MuteRule {
  return { id, keyword, source, createdAt: '2026-09-01T00:00:00.000Z' };
}

const IMMIGRATION = makeTopic('ice-enforcement', 'ICE enforcement', {
  keywords: [
    'Immigration and Customs Enforcement',
    'ICE raid',
    'ICE detention',
    'deportation',
    'Border Patrol',
    'CBP',
  ],
});
const TARIFFS = makeTopic('tariffs', 'Tariffs and trade', {
  keywords: ['tariff', 'tariffs', 'trade war'],
});
const SUPER_DUTY = makeTopic('super-duty', 'Ford Super Duty', {
  level: 'watch',
  keywords: ['Super Duty', 'F-250', 'F-350'],
});
const CONTRACTS = makeTopic('contracts', 'Federal contracting', {
  keywords: ['federal contract', '8(a)', 'GWAC'],
});
const DOGE = makeTopic('doge', 'DOGE', {
  keywords: ['Department of Government Efficiency', 'DOGE'],
});
const DESIRED: Topic[] = [IMMIGRATION, TARIFFS, SUPER_DUTY, CONTRACTS, DOGE];

test('keywordMatches: all-caps keyword is case-sensitive (ICE vs ice cream)', () => {
  assert.equal(keywordMatches('Local shop sells ice cream', 'ICE'), false);
  assert.equal(keywordMatches('Ice storm hits Midwest', 'ICE'), false);
  assert.equal(keywordMatches('ICE raids in Chicago', 'ICE'), true);
  assert.equal(keywordMatches('ICE raid in Chicago', 'ICE raid'), true);
  assert.equal(keywordMatches('ICE raids in Chicago', 'ICE raid'), true);
});

test('keywordMatches: keyword ending in a letter allows an inflection suffix', () => {
  assert.equal(keywordMatches('Deportations surge', 'deportation'), true);
  assert.equal(keywordMatches('Israeli military', 'Israel'), true);
  assert.equal(keywordMatches('Iranian missiles', 'Iran'), true);
  assert.equal(keywordMatches('Venezuelan opposition', 'Venezuela'), true);
  assert.equal(keywordMatches('furloughs mount', 'furlough'), true);
  assert.equal(keywordMatches('New federal contracts awarded', 'federal contract'), true);
  assert.equal(keywordMatches('Tariffs rise', 'tariff'), true);
  assert.equal(keywordMatches('Irate voters', 'Iran'), false);
});

test('keywordMatches: default endings accept plural demonyms', () => {
  assert.equal(keywordMatches('Iranians protest', 'Iran'), true);
  assert.equal(keywordMatches('Israelis rally', 'Israel'), true);
  assert.equal(keywordMatches('Gazans flee south', 'Gaza'), true);
  assert.equal(keywordMatches('Iranianism debated', 'Iran'), false);
});

test('keywordMatches: plural endings option allows only s / es', () => {
  const plural = { endings: 'plural' } as const;
  assert.equal(keywordMatches('ICE raids in Chicago', 'raid', plural), true);
  assert.equal(keywordMatches('Taxes rise', 'tax', plural), true);
  assert.equal(keywordMatches('Iran talks', 'Ira', plural), false);
  assert.equal(keywordMatches('Israeli military', 'Israel', plural), false);
  assert.equal(keywordMatches('Iranians protest', 'Iran', plural), false);
  assert.equal(keywordMatches('Local shop sells ice cream', 'ICE', plural), false);
  assert.equal(keywordMatches('Ford recalls F-250s', 'F-250', plural), false);
});

test('keywordMatches: suffix does not loosen all-caps or non-letter-ending keywords', () => {
  assert.equal(keywordMatches('Local shop sells ice cream', 'ICE'), false);
  assert.equal(keywordMatches('Dogecoin rallies', 'DOGE'), false);
  assert.equal(keywordMatches('DOGECOIN rallies', 'DOGE'), false);
  assert.equal(keywordMatches('DOGEs cuts', 'DOGE'), true);
  assert.equal(keywordMatches('Ford recalls F-2500 pickups', 'F-250'), false);
  assert.equal(keywordMatches('Ford recalls F-250s', 'F-250'), false);
  assert.equal(keywordMatches('SBA changes 8(a)s rules', '8(a)'), false);
});

test('keywordMatches: keyword with lowercase letters is case-insensitive', () => {
  assert.equal(keywordMatches('New TARIFFS announced', 'tariffs'), true);
  assert.equal(keywordMatches('Tariffs rise again', 'tariffs'), true);
  assert.equal(keywordMatches('A trade War looms', 'trade war'), true);
});

test('keywordMatches: word boundaries are alphanumeric', () => {
  assert.equal(keywordMatches('Ford recalls F-250 pickups', 'F-250'), true);
  assert.equal(keywordMatches('Ford recalls F-2500 pickups', 'F-250'), false);
  assert.equal(keywordMatches('XF-250 prototype', 'F-250'), false);
  assert.equal(keywordMatches('(F-250) recall', 'F-250'), true);
  assert.equal(keywordMatches('Tariffing rises', 'tariff'), false);
  assert.equal(keywordMatches('DOGE cuts', 'DOGE'), true);
  assert.equal(keywordMatches('Dogecoin rallies', 'DOGE'), false);
  assert.equal(keywordMatches('DOGECOIN rallies', 'DOGE'), false);
});

test('keywordMatches: regex specials are literal', () => {
  assert.equal(keywordMatches('SBA changes 8(a) program rules', '8(a)'), true);
  assert.equal(keywordMatches('SBA changes 8a program rules', '8(a)'), false);
  assert.equal(keywordMatches('Costs rose 8% in Q3', '8.'), false);
});

test('keywordMatches: trimmed; empty keyword never matches', () => {
  assert.equal(keywordMatches('ICE raids', '  ICE  '), true);
  assert.equal(keywordMatches('anything', ''), false);
  assert.equal(keywordMatches('anything', '   '), false);
});

test('desiredTopicHits matches name or keyword across title, publisherTitle, snippet in topic order', () => {
  const article = makeArticle({
    title: 'Ford recalls F-350 trucks',
    publisherTitle: null,
    snippet: 'The recall follows new tariffs on steel.',
  });
  assert.deepEqual(desiredTopicHits(article, DESIRED), ['tariffs', 'super-duty']);

  const byPublisherTitle = makeArticle({
    title: 'Contracting news',
    publisherTitle: 'SBA tightens 8(a) program',
  });
  assert.deepEqual(desiredTopicHits(byPublisherTitle, DESIRED), ['contracts']);

  const byName = makeArticle({ title: 'What Federal Contracting means now' });
  assert.deepEqual(desiredTopicHits(byName, DESIRED), ['contracts']);
});

test('desiredTopicHits ignores body text and avoids ICE / ice cream trap', () => {
  const article = makeArticle({
    title: 'Best ice cream in town',
    bodyText: 'ICE raid nearby',
  });
  assert.deepEqual(desiredTopicHits(article, DESIRED), []);
});

test('candidateTopicIds: search row unions valid topicIds with hits, ignores stale ids, keeps topic order', () => {
  const article = makeArticle({
    sourceKind: 'search',
    title: 'DOGE audit targets GWAC vehicles',
    topicIds: ['deleted-topic', 'doge', 'tariffs'],
  });
  assert.deepEqual(candidateTopicIds(article, DESIRED), ['tariffs', 'contracts', 'doge']);
});

test('candidateTopicIds: search row with only stale ids and no hit is empty', () => {
  const article = makeArticle({
    sourceKind: 'search',
    title: 'Unrelated story',
    topicIds: ['deleted-topic'],
  });
  assert.deepEqual(candidateTopicIds(article, DESIRED), []);
});

test('candidateTopicIds: non-search row uses hits only; no hit → []', () => {
  const noHit = makeArticle({ sourceKind: 'cfp', title: 'Local weather update' });
  assert.deepEqual(candidateTopicIds(noHit, DESIRED), []);

  const ignoredTopicIds = makeArticle({
    sourceKind: 'rss',
    title: 'Local weather update',
    topicIds: ['tariffs'],
  });
  assert.deepEqual(candidateTopicIds(ignoredTopicIds, DESIRED), []);

  const hit = makeArticle({ sourceKind: 'rss', title: 'ICE raid in Denver' });
  assert.deepEqual(candidateTopicIds(hit, DESIRED), ['ice-enforcement']);
});

test('desiredTopicHits: inflected headlines hit seed keywords', () => {
  const seedLike: Topic[] = [
    makeTopic('iran', 'Iran', { keywords: ['Iran', 'Tehran', 'IRGC', 'Iranian government'] }),
    makeTopic('israel', 'Israel', { keywords: ['Israel', 'Netanyahu', 'IDF', 'Gaza'] }),
    IMMIGRATION,
    makeTopic('venezuela', 'Venezuela', { keywords: ['Venezuela', 'Maduro', 'Caracas'] }),
    makeTopic('government-shutdown', 'Government shutdown', {
      keywords: ['government shutdown', 'continuing resolution', 'appropriations', 'furlough'],
    }),
    makeTopic('federal-contracting', 'Federal contracting', {
      keywords: ['federal contract', 'federal contractors', 'GSA contract', '8(a)', 'GWAC'],
    }),
  ];
  const hits = (title: string) => desiredTopicHits(makeArticle({ title }), seedLike);

  assert.deepEqual(hits('ICE raids sweep Chicago suburbs'), ['ice-enforcement']);
  assert.deepEqual(hits('Deportations surge at the border'), ['ice-enforcement']);
  assert.deepEqual(hits('Israeli military expands operation'), ['israel']);
  assert.deepEqual(hits('Iranian missiles intercepted'), ['iran']);
  assert.deepEqual(hits('Venezuelan opposition calls strike'), ['venezuela']);
  assert.deepEqual(hits('Shutdown furloughs mount'), ['government-shutdown']);
  assert.deepEqual(hits('Agency cancels federal contracts'), ['federal-contracting']);
  assert.deepEqual(hits('Ice cream sales rise in heat wave'), []);
});

test('muteReason: mute rule wins over undesired topic', () => {
  const undesired = [makeTopic('sports', 'Sports', { kind: 'undesired', level: null, keywords: ['hockey'] })];
  const article = makeArticle({ title: 'Hockey team visits crypto exchange' });
  assert.equal(muteReason(article, [rule('r-crypto', 'crypto')], undesired), 'muted:r-crypto');
});

test('muteReason: first matching rule in rule order', () => {
  const article = makeArticle({ title: 'Crypto and celebrity gossip' });
  const rules = [rule('r-none', 'football'), rule('r-gossip', 'gossip'), rule('r-crypto', 'crypto')];
  assert.equal(muteReason(article, rules, []), 'muted:r-gossip');
});

test('muteReason: rule with source respects articleMatchesMute source check', () => {
  const rules = [rule('r-src', 'crypto', 'nytimes.com')];
  const other = makeArticle({ title: 'Crypto markets move', publisherDomain: 'example.com' });
  assert.equal(muteReason(other, rules, []), null);

  const nyt = makeArticle({
    title: 'Crypto markets move',
    publisherDomain: 'nytimes.com',
    publisherUrl: 'https://www.nytimes.com/crypto',
  });
  assert.equal(muteReason(nyt, rules, []), 'muted:r-src');
});

test('muteReason: undesired topic keyword or name in headline haystack', () => {
  const undesired = [
    makeTopic('celebs', 'Celebrity gossip', { kind: 'undesired', level: null, keywords: ['Kardashian'] }),
    makeTopic('sports', 'Sports', { kind: 'undesired', level: null, keywords: ['NHL', 'hockey'] }),
  ];
  assert.equal(muteReason(makeArticle({ title: 'NHL trade deadline' }), [], undesired), 'muted:sports');
  assert.equal(
    muteReason(makeArticle({ title: 'Story', snippet: 'More celebrity gossip today' }), [], undesired),
    'muted:celebs',
  );
  assert.equal(muteReason(makeArticle({ title: 'Kardashian and NHL' }), [], undesired), 'muted:celebs');
  assert.equal(muteReason(makeArticle({ title: 'Senate passes budget' }), [], undesired), null);
});

test('muteReason: undesired keywords match plural endings only', () => {
  const undesired = [
    makeTopic('ira', 'Irish republicanism', { kind: 'undesired', level: null, keywords: ['Ira'] }),
    makeTopic('raids', 'Police raids', { kind: 'undesired', level: null, keywords: ['raid'] }),
  ];
  assert.equal(muteReason(makeArticle({ title: 'Iran nuclear talks resume' }), [], undesired), null);
  assert.equal(muteReason(makeArticle({ title: 'Dawn raids in Leeds' }), [], undesired), 'muted:raids');
});

test('muteReason: dotted keyword is an outlet block on publisherDomain (equal or subdomain)', () => {
  const undesired = [
    makeTopic('tabloids', 'Tabloids', { kind: 'undesired', level: null, keywords: ['dailymail.co.uk'] }),
  ];
  const title = 'Senate passes budget';
  assert.equal(
    muteReason(makeArticle({ title, publisherDomain: 'dailymail.co.uk' }), [], undesired),
    'muted:tabloids',
  );
  assert.equal(
    muteReason(makeArticle({ title, publisherDomain: 'us.dailymail.co.uk' }), [], undesired),
    'muted:tabloids',
  );
  assert.equal(
    muteReason(makeArticle({ title, publisherDomain: 'notdailymail.co.uk' }), [], undesired),
    null,
  );
  assert.equal(muteReason(makeArticle({ title, publisherDomain: null }), [], undesired), null);
});

test('muteReason: outlet block keyword with leading www. matches www-stripped domain', () => {
  const undesired = [
    makeTopic('tabloids', 'Tabloids', { kind: 'undesired', level: null, keywords: ['www.dailymail.co.uk'] }),
  ];
  const title = 'Senate passes budget';
  assert.equal(
    muteReason(makeArticle({ title, publisherDomain: 'dailymail.co.uk' }), [], undesired),
    'muted:tabloids',
  );
  assert.equal(
    muteReason(makeArticle({ title, publisherDomain: 'us.dailymail.co.uk' }), [], undesired),
    'muted:tabloids',
  );
  assert.equal(
    muteReason(makeArticle({ title, publisherDomain: 'notdailymail.co.uk' }), [], undesired),
    null,
  );
});

test('muteReason: keyword with spaces is not an outlet block', () => {
  const undesired = [
    makeTopic('x', 'X', { kind: 'undesired', level: null, keywords: ['example.com story'] }),
  ];
  assert.equal(
    muteReason(makeArticle({ title: 'Senate', publisherDomain: 'example.com' }), [], undesired),
    null,
  );
});

test('muteReason: no rules, no undesired → null', () => {
  assert.equal(muteReason(makeArticle({ title: 'Anything' }), [], []), null);
});
