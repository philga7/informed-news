import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { EvidenceLink } from '../types/claim.js';
import {
  buildClaimArticleLookup,
  buildClaimLinkedHeadlines,
  resolveClaimLinkedArticles,
} from './claimEvidenceJoin.js';

function article(overrides: Partial<Article> & Pick<Article, 'id' | 'title'>): Article {
  return {
    sourceKind: 'cfp',
    canonicalUrl: `https://example.com/${overrides.id}`,
    citations: [{ label: 'Primary', url: `https://example.com/${overrides.id}` }],
    publisherUrl: `https://publisher.com/${overrides.id}`,
    publisherDomain: 'publisher.com',
    handle: null,
    publishedAt: '2026-09-10T12:00:00.000Z',
    snippet: 'Snippet',
    bodyText: null,
    bodyStatus: 'ok',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-09-10T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  } as Article;
}

function link(
  overrides: Partial<EvidenceLink> &
    Pick<EvidenceLink, 'id' | 'claimId' | 'stance' | 'sourceTier' | 'confidence'>,
): EvidenceLink {
  return {
    id: overrides.id,
    claimId: overrides.claimId,
    articleId: overrides.articleId ?? null,
    url: overrides.url ?? null,
    stance: overrides.stance,
    sourceTier: overrides.sourceTier,
    confidence: overrides.confidence,
    scores: overrides.scores ?? null,
    createdAt: overrides.createdAt ?? '2026-09-21T01:00:00.000Z',
  };
}

test('claim join helpers resolve linked articles and build deduped sorted capped headlines', () => {
  const articles: Article[] = [
    article({ id: 'a1', title: 'Oldest', clusterId: 'cluster-1', publishedAt: '2026-09-10T00:00:00.000Z' }),
    article({ id: 'a2', title: 'Newest by fetchedAt', publishedAt: null, fetchedAt: '2026-09-22T00:00:00.000Z' }),
    article({ id: 'a3', title: 'Resolved by canonical url', publishedAt: '2026-09-20T00:00:00.000Z' }),
    article({ id: 'a4', title: 'Extra 4' }),
    article({ id: 'a5', title: 'Extra 5' }),
    article({ id: 'a6', title: 'Extra 6' }),
    article({ id: 'a7', title: 'Extra 7' }),
    article({ id: 'a8', title: 'Extra 8' }),
    article({ id: 'a9', title: 'Extra 9' }),
  ];

  const links: EvidenceLink[] = [
    link({ id: 'l1', claimId: 'claim-1', articleId: 'a1', stance: 'supports', sourceTier: 'primary', confidence: 0.2 }),
    link({ id: 'l2', claimId: 'claim-1', articleId: 'a2', stance: 'mentions', sourceTier: 'sensor', confidence: 0.9 }),
    link({ id: 'l3', claimId: 'claim-1', url: 'https://example.com/a3', stance: 'supports', sourceTier: 'primary', confidence: 0.4 }),
    link({ id: 'l4', claimId: 'claim-1', articleId: 'a4', stance: 'mentions', sourceTier: 'sensor', confidence: 0.1 }),
    link({ id: 'l4-newer', claimId: 'claim-1', articleId: 'a4', stance: 'contradicts', sourceTier: 'primary', confidence: 0.4, createdAt: '2026-09-21T02:00:00.000Z' }),
    link({ id: 'l5', claimId: 'claim-1', articleId: 'a5', stance: 'supports', sourceTier: 'sensor', confidence: 0.3 }),
    link({ id: 'l6', claimId: 'claim-1', articleId: 'a6', stance: 'supports', sourceTier: 'sensor', confidence: 0.05 }),
    link({ id: 'l7', claimId: 'claim-1', articleId: 'a7', stance: 'mentions', sourceTier: 'sensor', confidence: 0.12 }),
    link({ id: 'l8', claimId: 'claim-1', articleId: 'a8', stance: 'mentions', sourceTier: 'sensor', confidence: 0.11 }),
    link({ id: 'l9', claimId: 'claim-1', articleId: 'a9', stance: 'mentions', sourceTier: 'sensor', confidence: 0.2 }),
  ];

  const lookup = buildClaimArticleLookup(articles);
  const linkedArticles = resolveClaimLinkedArticles(links, lookup);
  const linkedHeadlines = buildClaimLinkedHeadlines(links, lookup);

  assert.equal(linkedArticles.length, links.length);
  assert.equal(linkedHeadlines.length, 8);
  assert.equal(linkedHeadlines[0]!.id, 'a2');
  assert.equal(linkedHeadlines.at(-1)!.id, 'a9');
  assert.equal(linkedHeadlines.find((headline) => headline.id === 'a4')!.stance, 'contradicts');
  assert.equal(linkedHeadlines.some((headline) => headline.id === 'a1'), false);
  assert.ok(linkedHeadlines.some((headline) => headline.id === 'a3'));
});
