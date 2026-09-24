import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Article } from '../types/article.js';
import type { Claim, EvidenceLink } from '../types/claim.js';
import type { ClaimReviewQueueEntry } from '../store/claimReviewQueueStore.js';
import type { MuteRulesStore } from '../store/muteRulesStore.js';
import { buildClaimsRadarFeed } from './claimsRadar.js';

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

function claim(overrides: Partial<Claim> & Pick<Claim, 'id' | 'text' | 'claimType'>): Claim {
  return {
    id: overrides.id,
    text: overrides.text,
    claimType: overrides.claimType,
    status: overrides.status ?? 'insufficient_evidence',
    entities: overrides.entities ?? [],
    createdAt: overrides.createdAt ?? '2026-09-21T00:00:00.000Z',
    domain: 'conflict',
  };
}

function link(
  overrides: Partial<EvidenceLink> & Pick<EvidenceLink, 'id' | 'claimId' | 'stance' | 'sourceTier' | 'confidence'>,
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

const emptyMutes = (): MuteRulesStore => ({ rules: [], updatedAt: null });

test('buildClaimsRadarFeed builds counts + max confidence + clusterKeys + linked headlines (cap 8)', () => {
  const c1 = claim({
    id: 'claim-1',
    text: 'Claim text',
    claimType: 'event_occurrence',
    status: 'reported',
    createdAt: '2026-09-21T00:00:00.000Z',
  });

  const articles: Article[] = [
    article({ id: 'a1', title: 'Oldest', clusterId: 'cluster-1', publishedAt: '2026-09-10T00:00:00.000Z' }),
    article({ id: 'a2', title: 'Newest by fetchedAt', clusterId: 'cluster-1', publishedAt: null, fetchedAt: '2026-09-22T00:00:00.000Z' }),
    article({ id: 'a3', title: 'Mid', clusterId: null, publishedAt: '2026-09-20T00:00:00.000Z' }),
    article({ id: 'a4', title: 'Extra 4' }),
    article({ id: 'a5', title: 'Extra 5' }),
    article({ id: 'a6', title: 'Extra 6' }),
    article({ id: 'a7', title: 'Extra 7' }),
    article({ id: 'a8', title: 'Extra 8' }),
    article({ id: 'a9', title: 'Extra 9' }),
  ];

  const evidenceLinks: EvidenceLink[] = [
    link({ id: 'l1', claimId: c1.id, articleId: 'a1', stance: 'supports', sourceTier: 'primary', confidence: 0.2 }),
    link({ id: 'l2', claimId: c1.id, articleId: 'a2', stance: 'mentions', sourceTier: 'sensor', confidence: 0.9 }),
    // url-only link should resolve via canonicalUrl match
    link({ id: 'l3', claimId: c1.id, articleId: null, url: 'https://example.com/a3', stance: 'contradicts', sourceTier: 'primary', confidence: 0.4 }),
    link({ id: 'l4', claimId: c1.id, articleId: 'a4', stance: 'mentions', sourceTier: 'sensor', confidence: 0.1 }),
    link({ id: 'l5', claimId: c1.id, articleId: 'a5', stance: 'supports', sourceTier: 'sensor', confidence: 0.3 }),
    link({ id: 'l6', claimId: c1.id, articleId: 'a6', stance: 'supports', sourceTier: 'sensor', confidence: 0.05 }),
    link({ id: 'l7', claimId: c1.id, articleId: 'a7', stance: 'mentions', sourceTier: 'sensor', confidence: 0.12 }),
    link({ id: 'l8', claimId: c1.id, articleId: 'a8', stance: 'mentions', sourceTier: 'sensor', confidence: 0.11 }),
    link({ id: 'l9', claimId: c1.id, articleId: 'a9', stance: 'mentions', sourceTier: 'sensor', confidence: 0.2 }),
  ];

  const out = buildClaimsRadarFeed({
    claims: [c1],
    evidenceLinks,
    articles,
    muteRules: emptyMutes(),
    reviewQueue: [],
  });

  assert.equal(out.hiddenMutedCount, 0);
  assert.equal(out.needsReview.length, 0);
  assert.equal(out.claims.length, 1);

  const item = out.claims[0]!;
  assert.equal(item.claimId, c1.id);
  assert.equal(item.confidence, 0.9);
  assert.deepEqual(item.evidence, {
    total: 9,
    supports: 3,
    contradicts: 1,
    mentions: 5,
    primary: 2,
    sensor: 7,
  });

  // Unique briefClusterKey outputs (cluster id + solo ids), sorted.
  assert.deepEqual(item.clusterKeys, ['cluster-1', 'solo:a3', 'solo:a4', 'solo:a5', 'solo:a6', 'solo:a7', 'solo:a8', 'solo:a9'].sort());

  // linked headlines capped at 8 and newest first.
  assert.equal(item.linkedHeadlines.length, 8);
  assert.equal(item.linkedHeadlines[0]!.id, 'a2');
});

test('buildClaimsRadarFeed omits muted claim and increments hiddenMutedCount', () => {
  const c1 = claim({
    id: 'claim-muted',
    text: 'This should be muted: Alpha',
    claimType: 'event_occurrence',
    createdAt: '2026-09-21T00:00:00.000Z',
  });

  const out = buildClaimsRadarFeed({
    claims: [c1],
    evidenceLinks: [],
    articles: [],
    muteRules: {
      rules: [{ id: 'm1', keyword: 'alpha', source: null, createdAt: '2026-09-22T00:00:00.000Z' }],
      updatedAt: '2026-09-22T00:00:00.000Z',
    },
    reviewQueue: [],
  });

  assert.equal(out.hiddenMutedCount, 1);
  assert.deepEqual(out.claims, []);
  assert.deepEqual(out.needsReview, []);
});

test('buildClaimsRadarFeed partitions needsReview and uses newest queue reasons', () => {
  const queued = claim({
    id: 'claim-q',
    text: 'Queued claim',
    claimType: 'attribution',
    createdAt: '2026-09-20T00:00:00.000Z',
  });
  const normal = claim({
    id: 'claim-n',
    text: 'Normal claim',
    claimType: 'official_statement',
    createdAt: '2026-09-21T00:00:00.000Z',
  });

  const reviewQueue: ClaimReviewQueueEntry[] = [
    {
      id: 'q1',
      claimId: queued.id,
      evidenceLinkId: 'e1',
      articleId: 'a1',
      reviewReasons: ['older reason'],
      candidateText: 'x',
      createdAt: '2026-09-21T00:00:00.000Z',
    },
    {
      id: 'q2',
      claimId: queued.id,
      evidenceLinkId: 'e2',
      articleId: 'a2',
      reviewReasons: ['newest reason', 'second'],
      candidateText: 'x',
      createdAt: '2026-09-22T00:00:00.000Z',
    },
  ];

  const out = buildClaimsRadarFeed({
    claims: [queued, normal],
    evidenceLinks: [],
    articles: [],
    muteRules: emptyMutes(),
    reviewQueue,
  });

  assert.equal(out.claims.length, 1);
  assert.equal(out.claims[0]!.claimId, normal.id);
  assert.equal(out.claims[0]!.needsReview, false);
  assert.deepEqual(out.claims[0]!.reviewReasons, []);

  assert.equal(out.needsReview.length, 1);
  assert.equal(out.needsReview[0]!.claimId, queued.id);
  assert.equal(out.needsReview[0]!.needsReview, true);
  assert.deepEqual(out.needsReview[0]!.reviewReasons, ['newest reason', 'second']);
});

test('buildClaimsRadarFeed sorts each partition by createdAt desc', () => {
  const c1 = claim({
    id: 'c1',
    text: 'Older',
    claimType: 'event_occurrence',
    createdAt: '2026-09-20T00:00:00.000Z',
  });
  const c2 = claim({
    id: 'c2',
    text: 'Newer',
    claimType: 'event_occurrence',
    createdAt: '2026-09-22T00:00:00.000Z',
  });

  const q1 = claim({
    id: 'q1',
    text: 'Queued older',
    claimType: 'attribution',
    createdAt: '2026-09-19T00:00:00.000Z',
  });
  const q2 = claim({
    id: 'q2',
    text: 'Queued newer',
    claimType: 'attribution',
    createdAt: '2026-09-23T00:00:00.000Z',
  });

  const out = buildClaimsRadarFeed({
    claims: [c1, c2, q1, q2],
    evidenceLinks: [],
    articles: [],
    muteRules: emptyMutes(),
    reviewQueue: [
      {
        id: 'queue-q1',
        claimId: q1.id,
        evidenceLinkId: 'e1',
        articleId: 'a1',
        reviewReasons: ['x'],
        candidateText: 'x',
        createdAt: '2026-09-21T00:00:00.000Z',
      },
      {
        id: 'queue-q2',
        claimId: q2.id,
        evidenceLinkId: 'e2',
        articleId: 'a2',
        reviewReasons: ['y'],
        candidateText: 'y',
        createdAt: '2026-09-22T00:00:00.000Z',
      },
    ],
  });

  assert.deepEqual(out.claims.map((c) => c.claimId), ['c2', 'c1']);
  assert.deepEqual(out.needsReview.map((c) => c.claimId), ['q2', 'q1']);
});

