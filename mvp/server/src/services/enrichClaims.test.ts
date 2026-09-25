import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { Claim, EvidenceLink } from '../types/claim.js';
import type { ClaimEnrichmentRecord } from '../types/briefClaim.js';
import { enrichAcceptedClaims } from './enrichClaims.js';

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

test('enrichAcceptedClaims enriches only accepted requested claims and skips non-accepted ids', async () => {
  const accepted = claim({
    id: 'claim-accepted',
    text: 'Accepted claim',
    claimType: 'event_occurrence',
    createdAt: '2026-09-23T00:00:00.000Z',
  });
  const other = claim({
    id: 'claim-other',
    text: 'Other claim',
    claimType: 'official_statement',
  });

  const upserted: ClaimEnrichmentRecord[] = [];

  const result = await enrichAcceptedClaims({
    claimIds: ['claim-accepted', 'claim-other'],
    readClaimsFn: async () => [accepted, other],
    readEvidenceLinksFn: async () => [
      link({
        id: 'l1',
        claimId: accepted.id,
        articleId: 'a1',
        stance: 'supports',
        sourceTier: 'primary',
        confidence: 0.8,
      }),
    ],
    readArticlesFn: async () => [article({ id: 'a1', title: 'Headline one' })],
    readClaimMembershipFn: async () => ({
      acceptedClaimIds: [accepted.id],
      updatedAt: '2026-09-24T00:00:00.000Z',
    }),
    getClaimEnrichmentFn: async () => null,
    upsertClaimEnrichmentFn: async (record) => {
      upserted.push(record);
      return record;
    },
    enrichFn: async (input) => {
      assert.equal(input.claimText, accepted.text);
      assert.equal(input.linkedHeadlines.length, 1);
      return {
        ok: true,
        enrichment: {
          short_summary: 'Summary.',
          talking_points: ['Point A'],
        },
        model: 'glm-5.3-flash',
        rawText: '{"short_summary":"Summary.","talking_points":["Point A"]}',
      };
    },
    nowIsoFn: () => '2026-09-24T12:00:00.000Z',
  });

  assert.equal(result.attempted, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.claimIds, ['claim-accepted']);
  assert.deepEqual(result.skippedClaimIds, ['claim-other']);
  assert.equal(upserted[0]!.claimId, 'claim-accepted');
  assert.equal(upserted[0]!.enrichedAt, '2026-09-24T12:00:00.000Z');
});

test('enrichAcceptedClaims skips existing enrichment unless force is true', async () => {
  const accepted = claim({
    id: 'claim-accepted',
    text: 'Accepted claim',
    claimType: 'event_occurrence',
  });

  let enrichCalls = 0;
  const result = await enrichAcceptedClaims({
    readClaimsFn: async () => [accepted],
    readEvidenceLinksFn: async () => [],
    readArticlesFn: async () => [],
    readClaimMembershipFn: async () => ({
      acceptedClaimIds: [accepted.id],
      updatedAt: '2026-09-24T00:00:00.000Z',
    }),
    getClaimEnrichmentFn: async () => ({
      claimId: accepted.id,
      enrichment: {
        short_summary: 'Existing summary.',
        talking_points: ['Existing point'],
      },
      enrichedAt: '2026-09-24T00:00:00.000Z',
      enrichError: null,
      model: 'glm-5.3-flash',
    }),
    upsertClaimEnrichmentFn: async (record) => record,
    enrichFn: async () => {
      enrichCalls += 1;
      return {
        ok: true,
        enrichment: {
          short_summary: 'New summary.',
          talking_points: ['New point'],
        },
        model: 'glm-5.3-flash',
        rawText: '{"short_summary":"New summary.","talking_points":["New point"]}',
      };
    },
  });

  assert.equal(result.attempted, 0);
  assert.equal(enrichCalls, 0);
});
