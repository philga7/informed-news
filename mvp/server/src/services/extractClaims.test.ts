import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Article } from '../types/article.js';
import type { Claim } from '../types/claim.js';
import { readClaimReviewQueue } from '../store/claimReviewQueueStore.js';
import { isArticleExtractProcessed, readClaimExtractProcessed } from '../store/claimExtractProcessedStore.js';
import { readClaims } from '../store/claimStore.js';
import { readEvidenceLinks } from '../store/evidenceLinkStore.js';
import { writeClaims } from '../store/claimStore.js';
import { extractClaimsFromArticles } from './extractClaims.js';
import type { ClaimJudgeAnswers, ClaimJudgeResult, ClaimJudgeState } from './typesafeClaimQuestions.js';
import type { ProposeClaimsInput, ProposeClaimsResult } from './ollamaProposeClaims.js';

function tempStorePaths() {
  const dir = mkdtempSync(path.join(tmpdir(), 'extract-claims-'));
  return {
    claimsPath: path.join(dir, 'claims.json'),
    evidencePath: path.join(dir, 'evidence-links.json'),
    queuePath: path.join(dir, 'claim-review-queue.json'),
    processedPath: path.join(dir, 'claim-extract-processed.json'),
  };
}

function sampleArticle(overrides: Partial<Article> & Pick<Article, 'id'>): Article {
  return {
    sourceKind: 'cfp',
    title: 'Incident reported near border',
    snippet: 'Officials said troops moved overnight.',
    canonicalUrl: `https://example.com/${overrides.id}`,
    citations: [{ label: 'Primary', url: `https://example.com/${overrides.id}` }],
    publisherUrl: 'https://publisher.com/story',
    publisherDomain: 'publisher.com',
    handle: null,
    publishedAt: '2026-09-10T12:00:00.000Z',
    fetchedAt: '2026-09-10T12:05:00.000Z',
    bodyText: null,
    bodyStatus: 'ok',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: 'c1',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  } as Article;
}

function highConfidenceAnswers(overrides: Partial<ClaimJudgeAnswers> = {}): ClaimJudgeAnswers {
  return {
    isAssertable: { noul: 0.9 },
    claimType: {
      choice: 'event_occurrence',
      confidence: 0.95,
      probabilities: { event_occurrence: 0.95 },
    },
    claimAlignment: {
      choice: 'new',
      confidence: 0.95,
      probabilities: { new: 0.95 },
    },
    evidenceStance: {
      choice: 'supports',
      confidence: 0.95,
      probabilities: { supports: 0.95 },
    },
    sourceUtility: { score: 2, confidence: 0.95 },
    ...overrides,
  };
}

function mockJudgeResult(
  answers: ClaimJudgeAnswers,
  needsReview = false,
  reviewReasons: string[] = [],
): ClaimJudgeResult {
  return {
    ok: true,
    needsReview,
    reviewReasons,
    answers,
    model: 'mock-judge',
  };
}

test('extractClaims: new claim high-confidence persists claim+evidence without review queue', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-1' });

  const proposeFn = async (_input: ProposeClaimsInput): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [{ text: 'Troops crossed the border overnight.', claimTypeGuess: null, quote: null }],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (_state: ClaimJudgeState): Promise<ClaimJudgeResult> =>
    mockJudgeResult(highConfidenceAnswers());

  const result = await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  assert.equal(result.ok, true);
  assert.equal(result.persistedClaims, 1);
  assert.equal(result.persistedEvidence, 1);
  assert.equal(result.needsReview, 0);
  assert.equal(result.reviewQueued.length, 0);
  assert.equal(result.claims.length, 1);
  assert.equal(result.claims[0]!.status, 'reported');

  const claims = await readClaims(paths.claimsPath);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]!.text, 'Troops crossed the border overnight.');
  assert.equal(claims[0]!.status, 'reported');

  const links = await readEvidenceLinks(paths.evidencePath);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.claimId, claims[0]!.id);
  assert.equal(links[0]!.sourceTier, 'sensor');
});

test('extractClaims: primary support yields supported_by_primary + primary evidence tier', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-primary-1', sourceTier: 'primary' });

  const proposeFn = async (_input: ProposeClaimsInput): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [{ text: 'Troops crossed the border overnight.', claimTypeGuess: null, quote: null }],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (_state: ClaimJudgeState): Promise<ClaimJudgeResult> =>
    mockJudgeResult(highConfidenceAnswers());

  const result = await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  assert.equal(result.ok, true);
  assert.equal(result.persistedClaims, 1);
  assert.equal(result.persistedEvidence, 1);
  assert.equal(result.claims.length, 1);
  assert.equal(result.claims[0]!.status, 'supported_by_primary');

  const claims = await readClaims(paths.claimsPath);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]!.status, 'supported_by_primary');

  const links = await readEvidenceLinks(paths.evidencePath);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.claimId, claims[0]!.id);
  assert.equal(links[0]!.sourceTier, 'primary');
});

test('extractClaims: sensor tier evidence stays sensor', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-sensor-1', sourceTier: 'sensor' });

  const proposeFn = async (): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [{ text: 'Troops crossed the border overnight.', claimTypeGuess: null, quote: null }],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (): Promise<ClaimJudgeResult> =>
    mockJudgeResult(highConfidenceAnswers());

  await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  const links = await readEvidenceLinks(paths.evidencePath);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.sourceTier, 'sensor');
});

test('extractClaims: low confidence persists and enqueues review', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-low' });

  const proposeFn = async (): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [{ text: 'Maybe something happened.', claimTypeGuess: null, quote: null }],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (): Promise<ClaimJudgeResult> =>
    mockJudgeResult(
      highConfidenceAnswers({
        claimType: {
          choice: 'event_occurrence',
          confidence: 0.5,
          probabilities: { event_occurrence: 0.5 },
        },
      }),
      true,
      ['low_confidence:claimType'],
    );

  const result = await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  assert.equal(result.persistedClaims, 1);
  assert.equal(result.persistedEvidence, 1);
  assert.equal(result.needsReview, 1);
  assert.equal(result.reviewQueued.length, 1);
  assert.deepEqual(result.reviewQueued[0]!.reviewReasons, ['low_confidence:claimType']);

  const queue = await readClaimReviewQueue(paths.queuePath);
  assert.equal(queue.length, 1);
});

test('extractClaims: clear non-assertable skips persistence', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-opinion' });

  const proposeFn = async (): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [{ text: 'This war is terrible.', claimTypeGuess: null, quote: null }],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (): Promise<ClaimJudgeResult> =>
    mockJudgeResult(highConfidenceAnswers({ isAssertable: { noul: 0.2 } }));

  const result = await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  assert.equal(result.judged, 1);
  assert.equal(result.persistedClaims, 0);
  assert.equal(result.persistedEvidence, 0);
  assert.equal((await readClaims(paths.claimsPath)).length, 0);
  assert.equal((await readEvidenceLinks(paths.evidencePath)).length, 0);
});

test('extractClaims: alignment to existing id adds evidence only', async () => {
  const paths = tempStorePaths();
  const existing: Claim = {
    id: 'existing-1',
    text: 'Prior claim about border movement.',
    claimType: 'event_occurrence',
    status: 'insufficient_evidence',
    entities: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    domain: 'conflict',
  };
  await writeClaims([existing], paths.claimsPath);

  const article = sampleArticle({ id: 'art-align' });

  const proposeFn = async (): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [{ text: 'More detail on border movement.', claimTypeGuess: null, quote: null }],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (): Promise<ClaimJudgeResult> =>
    mockJudgeResult(
      highConfidenceAnswers({
        claimAlignment: {
          choice: 'existing-1',
          confidence: 0.92,
          probabilities: { 'existing-1': 0.92 },
        },
      }),
    );

  const result = await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  assert.equal(result.persistedClaims, 0);
  assert.equal(result.persistedEvidence, 1);

  const claims = await readClaims(paths.claimsPath);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]!.id, 'existing-1');

  const links = await readEvidenceLinks(paths.evidencePath);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.claimId, 'existing-1');
});

test('extractClaims: already-processed skipped unless force', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-done' });

  const { markArticlesExtractProcessed } = await import('../store/claimExtractProcessedStore.js');
  await markArticlesExtractProcessed([article.id], paths.processedPath);

  let proposeCalls = 0;
  const proposeFn = async (): Promise<ProposeClaimsResult> => {
    proposeCalls += 1;
    return {
      ok: true,
      candidates: [],
      model: 'mock-propose',
      rawText: '{}',
    };
  };

  const skipped = await extractClaimsFromArticles({
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn: async () => mockJudgeResult(highConfidenceAnswers()),
    ...paths,
  });

  assert.equal(skipped.attempted, 0);
  assert.equal(proposeCalls, 0);

  const forced = await extractClaimsFromArticles({
    force: true,
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn: async () => mockJudgeResult(highConfidenceAnswers()),
    ...paths,
  });

  assert.equal(forced.attempted, 1);
  assert.equal(proposeCalls, 1);
  assert.equal(await isArticleExtractProcessed(article.id, paths.processedPath), true);

  const processed = await readClaimExtractProcessed(paths.processedPath);
  assert.ok(processed.articleIds.includes(article.id));
});

test('extractClaims: propose ok:false does not mark article processed', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-propose-fail' });

  const proposeFn = async (): Promise<ProposeClaimsResult> => ({
    ok: false,
    error: 'Ollama unavailable',
    model: null,
    rawText: null,
  });

  const result = await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn: async () => mockJudgeResult(highConfidenceAnswers()),
    ...paths,
  });

  assert.equal(result.failed, 1);
  assert.equal(result.articlesProcessed, 0);
  assert.equal(await isArticleExtractProcessed(article.id, paths.processedPath), false);
});

test('extractClaims: all judge failures leave article unprocessed', async () => {
  const paths = tempStorePaths();
  const article = sampleArticle({ id: 'art-judge-fail' });

  const proposeFn = async (): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [
      { text: 'First candidate.', claimTypeGuess: null, quote: null },
      { text: 'Second candidate.', claimTypeGuess: null, quote: null },
    ],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (): Promise<ClaimJudgeResult> => ({
    ok: false,
    error: 'TYPESAFE_API_KEY not configured',
    model: null,
  });

  const result = await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  assert.equal(result.proposed, 2);
  assert.equal(result.failed, 2);
  assert.equal(result.articlesProcessed, 0);
  assert.equal(await isArticleExtractProcessed(article.id, paths.processedPath), false);
});

test('extractClaims: judge receives newest 8 existing claims', async () => {
  const paths = tempStorePaths();
  const seeded: Claim[] = [];
  for (let i = 0; i < 10; i += 1) {
    seeded.push({
      id: `claim-${i}`,
      text: `Seeded claim ${i}.`,
      claimType: 'event_occurrence',
      status: 'insufficient_evidence',
      entities: [],
      createdAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      domain: 'conflict',
    });
  }
  await writeClaims(seeded, paths.claimsPath);

  const article = sampleArticle({ id: 'art-newest-8' });
  let capturedExistingIds: string[] = [];

  const proposeFn = async (): Promise<ProposeClaimsResult> => ({
    ok: true,
    candidates: [{ text: 'New border incident.', claimTypeGuess: null, quote: null }],
    model: 'mock-propose',
    rawText: '{}',
  });

  const judgeFn = async (state: ClaimJudgeState): Promise<ClaimJudgeResult> => {
    capturedExistingIds = state.existingClaims.map((c) => c.id);
    return mockJudgeResult(highConfidenceAnswers());
  };

  await extractClaimsFromArticles({
    articleIds: [article.id],
    readArticlesFn: async () => [article],
    proposeFn,
    judgeFn,
    ...paths,
  });

  assert.equal(capturedExistingIds.length, 8);
  assert.deepEqual(capturedExistingIds, [
    'claim-2',
    'claim-3',
    'claim-4',
    'claim-5',
    'claim-6',
    'claim-7',
    'claim-8',
    'claim-9',
  ]);
});

test('extractClaims: batch selection prefers sensors before primaries', async () => {
  const paths = tempStorePaths();
  const calls: string[] = [];

  const primaryNewer = sampleArticle({
    id: 'art-primary-newer',
    sourceTier: 'primary',
    title: 'primary: newer',
    publishedAt: '2026-09-12T12:00:00.000Z',
  });
  const sensorNewer = sampleArticle({
    id: 'art-sensor-newer',
    sourceTier: 'sensor',
    title: 'sensor: newer',
    publishedAt: '2026-09-11T12:00:00.000Z',
  });
  const sensorOlder = sampleArticle({
    id: 'art-sensor-older',
    title: 'sensor: older (implicit)',
    publishedAt: '2026-09-10T12:00:00.000Z',
  });

  const proposeFn = async (input: ProposeClaimsInput): Promise<ProposeClaimsResult> => {
    calls.push(input.title);
    return { ok: true, candidates: [], model: 'mock-propose', rawText: '{}' };
  };

  await extractClaimsFromArticles({
    limit: 2,
    readArticlesFn: async () => [primaryNewer, sensorNewer, sensorOlder],
    readClaimsFn: async () => [],
    isArticleExtractProcessedFn: async () => false,
    markArticlesExtractProcessedFn: async (ids: string[]) => ({ articleIds: ids }),
    proposeFn,
    judgeFn: async () => mockJudgeResult(highConfidenceAnswers()),
    ...paths,
  });

  assert.deepEqual(calls, ['sensor: newer', 'sensor: older (implicit)']);
});
