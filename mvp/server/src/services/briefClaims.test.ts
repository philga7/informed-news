import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { Claim, EvidenceLink } from '../types/claim.js';
import type { MuteRulesStore } from '../store/muteRulesStore.js';
import { buildBriefClaimsFeed, loadBriefClaims } from './briefClaims.js';

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
    status: overrides.status ?? 'reported',
    entities: overrides.entities ?? [],
    createdAt: overrides.createdAt ?? '2026-09-21T00:00:00.000Z',
    domain: 'conflict',
  };
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

const emptyMutes = (): MuteRulesStore => ({ rules: [], updatedAt: null });

test('buildBriefClaimsFeed returns accepted claims with enrichment and linked headlines', () => {
  const accepted = claim({
    id: 'claim-1',
    text: 'Claim text',
    claimType: 'event_occurrence',
    status: 'supported_by_primary',
    createdAt: '2026-09-22T00:00:00.000Z',
  });
  const unaccepted = claim({
    id: 'claim-2',
    text: 'Should not appear',
    claimType: 'official_statement',
  });

  const articles: Article[] = [
    article({ id: 'a1', title: 'Older headline', clusterId: 'cluster-1', publishedAt: '2026-09-20T00:00:00.000Z' }),
    article({ id: 'a2', title: 'Newest headline', publishedAt: null, fetchedAt: '2026-09-23T00:00:00.000Z' }),
  ];

  const out = buildBriefClaimsFeed({
    claims: [accepted, unaccepted],
    evidenceLinks: [
      link({
        id: 'l1',
        claimId: accepted.id,
        articleId: 'a1',
        stance: 'supports',
        sourceTier: 'primary',
        confidence: 0.6,
      }),
      link({
        id: 'l2',
        claimId: accepted.id,
        articleId: 'a2',
        stance: 'mentions',
        sourceTier: 'sensor',
        confidence: 0.9,
      }),
    ],
    articles,
    membership: { acceptedClaimIds: [accepted.id], updatedAt: '2026-09-24T00:00:00.000Z' },
    muteRules: emptyMutes(),
    enrichments: new Map([
      [
        accepted.id,
        {
          short_summary: 'AI-assisted summary.',
          talking_points: ['Point A'],
        },
      ],
    ]),
  });

  assert.equal(out.claims.length, 1);
  const item = out.claims[0]!;
  assert.equal(item.claimId, accepted.id);
  assert.equal(item.confidence, 0.9);
  assert.deepEqual(item.clusterKeys, ['cluster-1', 'solo:a2']);
  assert.equal(item.linkedHeadlines[0]!.id, 'a2');
  assert.deepEqual(item.verbiage, {
    short_summary: 'AI-assisted summary.',
    talking_points: ['Point A'],
  });
});

test('buildBriefClaimsFeed omits muted accepted claims and sorts newest first', () => {
  const muted = claim({
    id: 'claim-muted',
    text: 'Alpha report',
    claimType: 'event_occurrence',
    createdAt: '2026-09-21T00:00:00.000Z',
  });
  const visible = claim({
    id: 'claim-visible',
    text: 'Beta report',
    claimType: 'event_occurrence',
    createdAt: '2026-09-23T00:00:00.000Z',
  });
  const olderVisible = claim({
    id: 'claim-older',
    text: 'Gamma report',
    claimType: 'event_occurrence',
    createdAt: '2026-09-20T00:00:00.000Z',
  });

  const out = buildBriefClaimsFeed({
    claims: [olderVisible, muted, visible],
    evidenceLinks: [],
    articles: [],
    membership: {
      acceptedClaimIds: [muted.id, visible.id, olderVisible.id],
      updatedAt: '2026-09-24T00:00:00.000Z',
    },
    muteRules: {
      rules: [{ id: 'm1', keyword: 'alpha', source: null, createdAt: '2026-09-24T00:00:00.000Z' }],
      updatedAt: '2026-09-24T00:00:00.000Z',
    },
    enrichments: new Map(),
  });

  assert.deepEqual(out.claims.map((item) => item.claimId), ['claim-visible', 'claim-older']);
});

test('loadBriefClaims returns empty list when no claims are accepted', async () => {
  const out = await loadBriefClaims({
    readClaims: async () => [
      claim({ id: 'claim-1', text: 'Claim text', claimType: 'event_occurrence' }),
    ],
    readEvidenceLinks: async () => [],
    readArticles: async () => [],
    readMuteRules: async () => emptyMutes(),
    readClaimMembership: async () => ({ acceptedClaimIds: [], updatedAt: null }),
    readClaimEnrichments: async () => [],
  });

  assert.deepEqual(out, { claims: [] });
});
