import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import {
  groupCandidates,
  outletCount,
  storiesAreDuplicates,
  type DedupeCandidate,
} from './triageDedupe.js';

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'Untitled',
    sourceKind: 'search',
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

/** Distinct URL per id/domain so `articlesAreRelated` does not link by URL by accident. */
function cand(
  id: string,
  domain: string,
  title: string,
  topicIds: string[] = ['t-iran'],
  overrides: Partial<Article> = {},
): DedupeCandidate {
  const url = `https://${domain}/${id}`;
  return {
    article: makeArticle({
      id,
      title,
      canonicalUrl: url,
      publisherUrl: url,
      publisherDomain: domain,
      ...overrides,
    }),
    topicIds,
  };
}

const SYNDICATED = 'Senate passes sweeping border security package after marathon vote';

test('storiesAreDuplicates: syndicated headline on different outlets', () => {
  const msn = cand('m1', 'msn.com', SYNDICATED, ['t-a']);
  const yahoo = cand('y1', 'yahoo.com', `${SYNDICATED}!`, ['t-b']);
  assert.equal(storiesAreDuplicates(msn, yahoo), true);
});

test('storiesAreDuplicates: empty normalized titles are not syndication', () => {
  const a = cand('a', 'one.com', '---', ['t-a']);
  const b = cand('b', 'two.com', '!!!', ['t-b']);
  assert.equal(storiesAreDuplicates(a, b), false);
});

test('storiesAreDuplicates: shared URL via articlesAreRelated', () => {
  const a = cand('a', 'one.com', 'Totally different words here', ['t-a']);
  const b = cand('b', 'two.com', 'Nothing alike whatsoever now', ['t-b'], {
    publisherUrl: 'https://one.com/a',
  });
  assert.equal(storiesAreDuplicates(a, b), true);
});

test('storiesAreDuplicates: cross-outlet similar titles need a shared topic', () => {
  const a = cand('a', 'reuters.com', 'Iran sanctions expanded by Treasury over drone program');
  const b = cand('b', 'apnews.com', 'Treasury expands Iran sanctions over drone program');
  assert.equal(storiesAreDuplicates(a, b), true);

  const noShared = { ...b, topicIds: ['t-other'] };
  assert.equal(storiesAreDuplicates(a, noShared), false);
});

test('storiesAreDuplicates: distinct stories on the same topic stay separate', () => {
  const sanctions = cand('a', 'reuters.com', 'Iran sanctions expanded by Treasury over drone program');
  const election = cand('b', 'apnews.com', 'Iran election turnout falls as reformists boycott vote');
  assert.equal(storiesAreDuplicates(sanctions, election), false);
});

test('groupCandidates: syndication collapses msn/yahoo; outlet breadth counts distinct headlines', () => {
  const msn = cand('m1', 'msn.com', SYNDICATED);
  const yahoo = cand('y1', 'yahoo.com', SYNDICATED);
  const other = cand('o1', 'nytimes.com', 'A different headline about the vote', ['t-iran'], {
    publisherUrl: 'https://msn.com/m1',
  });

  const groups = groupCandidates([msn, yahoo], []);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0]!.ordered.map((c) => c.article.id).sort(),
    ['m1', 'y1'],
  );
  assert.equal(outletCount(groups[0]!.ordered.map((c) => c.article)), 1);

  const withOther = groupCandidates([msn, yahoo, other], []);
  assert.equal(withOther.length, 1);
  assert.equal(withOther[0]!.ordered.length, 3);
  assert.equal(outletCount(withOther[0]!.ordered.map((c) => c.article)), 2);
});

test('groupCandidates: similar titles group only with a shared topic', () => {
  const a = cand('a', 'reuters.com', 'Iran sanctions expanded by Treasury over drone program', ['t-iran']);
  const b = cand('b', 'apnews.com', 'Treasury expands Iran sanctions over drone program', ['t-iran']);
  assert.equal(groupCandidates([a, b], []).length, 1);

  const c = cand('c', 'apnews.com', 'Treasury expands Iran sanctions over drone program', ['t-treasury']);
  assert.equal(groupCandidates([a, c], []).length, 2);
});

test('groupCandidates: topicIds is the union of member candidate topics', () => {
  const msn = cand('m1', 'msn.com', SYNDICATED, ['t-a', 't-b']);
  const yahoo = cand('y1', 'yahoo.com', SYNDICATED, ['t-b', 't-c']);
  const [group] = groupCandidates([msn, yahoo], []);
  assert.deepEqual([...group!.topicIds].sort(), ['t-a', 't-b', 't-c']);
});

test('groupCandidates: joins a recent kept story (smallest kept id), ordered is candidates only', () => {
  const keptB = cand('k-b', 'reuters.com', SYNDICATED);
  const keptA = cand('k-a', 'bbc.co.uk', SYNDICATED);
  const fresh = cand('n1', 'yahoo.com', SYNDICATED, ['t-new']);
  const unrelatedKept = cand('k-0', 'cnn.com', 'Unrelated hurricane landfall coverage tonight');

  const groups = groupCandidates([fresh], [keptB, keptA, unrelatedKept]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.existingKeptId, 'k-a');
  assert.deepEqual(groups[0]!.ordered.map((c) => c.article.id), ['n1']);
  assert.deepEqual(groups[0]!.topicIds, ['t-new']);
});

test('groupCandidates: groups with only kept members are discarded; new groups have null existingKeptId', () => {
  const keptA = cand('k-a', 'reuters.com', SYNDICATED);
  const keptB = cand('k-b', 'bbc.co.uk', SYNDICATED);
  const fresh = cand('n1', 'cnn.com', 'Unrelated hurricane landfall coverage tonight');

  const groups = groupCandidates([fresh], [keptA, keptB]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.existingKeptId, null);
  assert.deepEqual(groups[0]!.ordered.map((c) => c.article.id), ['n1']);
});

test('groupCandidates: representative order', () => {
  const primary = cand('z-primary', 'whitehouse.gov', SYNDICATED, ['t-iran'], {
    sourceTier: 'primary',
    publisherUrl: null,
  });
  const noUrl = cand('a-nourl', 'news.google.com', SYNDICATED, ['t-iran'], {
    publisherUrl: null,
    bodyStatus: 'ok',
    snippet: 'x'.repeat(500),
  });
  const bodyOk = cand('y-bodyok', 'one.com', SYNDICATED, ['t-iran'], { bodyStatus: 'ok' });
  const longSnippet = cand('x-long', 'two.com', SYNDICATED, ['t-iran'], { snippet: 'long snippet text' });
  const earlier = cand('w-earlier', 'three.com', SYNDICATED, ['t-iran'], {
    publishedAt: '2026-09-30T08:00:00.000Z',
  });
  const later = cand('v-later', 'four.com', SYNDICATED, ['t-iran'], {
    publishedAt: '2026-09-30T10:00:00.000Z',
  });
  const undatedB = cand('u-undated-b', 'five.com', SYNDICATED, ['t-iran'], { publishedAt: null });
  const undatedA = cand('t-undated-a', 'six.com', SYNDICATED, ['t-iran'], { publishedAt: null });

  const shuffled = [undatedB, later, noUrl, earlier, longSnippet, undatedA, bodyOk, primary];
  const [group] = groupCandidates(shuffled, []);
  assert.deepEqual(
    group!.ordered.map((c) => c.article.id),
    [
      'z-primary',
      'y-bodyok',
      'x-long',
      'w-earlier',
      'v-later',
      't-undated-a',
      'u-undated-b',
      'a-nourl',
    ],
  );
});

test('groupCandidates: deterministic output regardless of input order', () => {
  const g1a = cand('b1', 'msn.com', SYNDICATED);
  const g1b = cand('b2', 'yahoo.com', SYNDICATED);
  const g2 = cand('a1', 'cnn.com', 'Unrelated hurricane landfall coverage tonight');
  const g3 = cand('c1', 'bbc.co.uk', 'Central bank holds rates steady amid inflation worries');

  const ids = (cands: DedupeCandidate[]) =>
    groupCandidates(cands, []).map((g) => g.ordered.map((c) => c.article.id));

  const forward = ids([g1a, g1b, g2, g3]);
  const reverse = ids([g3, g2, g1b, g1a]);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward, [['a1'], ['b1', 'b2'], ['c1']]);
});

test('outletCount: collapses domains that share a normalized headline', () => {
  const art = (id: string, domain: string | null, title: string) =>
    makeArticle({ id, title, publisherDomain: domain });

  assert.equal(outletCount([art('1', 'msn.com', SYNDICATED), art('2', 'yahoo.com', SYNDICATED)]), 1);
  assert.equal(
    outletCount([
      art('1', 'msn.com', SYNDICATED),
      art('2', 'yahoo.com', SYNDICATED.toUpperCase()),
      art('3', 'nytimes.com', 'Different headline'),
    ]),
    2,
  );
  assert.equal(
    outletCount([art('1', 'reuters.com', 'One'), art('2', 'reuters.com', 'Two')]),
    1,
  );
  assert.equal(
    outletCount([art('1', 'www.Reuters.com', 'One'), art('2', 'reuters.com', 'Two')]),
    1,
  );
  assert.equal(
    outletCount([
      art('1', 'a.com', 'X story'),
      art('2', 'b.com', 'X story'),
      art('3', 'b.com', 'Y story'),
      art('4', 'c.com', 'Y story'),
    ]),
    1,
  );
  assert.equal(outletCount([art('1', null, 'One'), art('2', null, 'Two')]), 1);
  assert.equal(
    outletCount([art('1', null, 'One'), art('2', 'a.com', 'Two'), art('3', 'b.com', 'Three')]),
    2,
  );
  assert.equal(outletCount([]), 1);
});
