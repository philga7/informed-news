import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  pruneArticles,
  readArticles,
  updateArticles,
  upsertArticle,
  upsertArticles,
} from '../store/index.js';
import type { Article, FramingAnalysis } from '../types/article.js';
import {
  classifyArticleById,
  classifyUnclassifiedArticles,
  selectClassifyBatchCandidates,
  type ClassifyDeps,
} from './classifyArticles.js';
import { writeBackSurvivors } from './triageSurvivor.js';

function article(overrides: Partial<Article> & Pick<Article, 'id'>): Article {
  return {
    sourceKind: 'cfp',
    title: `Title ${overrides.id}`,
    canonicalUrl: `https://citizenfreepress.com/${overrides.id}`,
    citations: [{ label: 'CFP', url: `https://citizenfreepress.com/${overrides.id}` }],
    publisherUrl: null,
    publisherDomain: null,
    handle: null,
    publishedAt: '2026-09-12T12:00:00.000Z',
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-09-12T12:05:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

test('selectClassifyBatchCandidates skips untriaged search and manual rows', () => {
  const search = article({
    id: 'search-1',
    sourceKind: 'search',
    sourceTier: 'sensor',
    publishedAt: '2026-09-13T12:00:00.000Z',
  });
  const manual = article({
    id: 'manual-1',
    sourceKind: 'manual',
    publishedAt: '2026-09-13T11:00:00.000Z',
  });
  const cfp = article({ id: 'cfp-1' });

  const selected = selectClassifyBatchCandidates([search, manual, cfp], 10);

  assert.deepEqual(
    selected.map((a) => a.id),
    ['cfp-1'],
  );
});

test('classifyUnclassifiedArticles keeps article writes made while it waits on the model', async () => {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'classify-')), 'articles.json');
  await upsertArticles(
    [
      article({ id: 'a', title: 'A', publishedAt: '2026-09-12T12:00:00.000Z' }),
      article({ id: 'c', title: 'C', publishedAt: '2026-09-11T12:00:00.000Z' }),
    ],
    articlesPath,
  );

  const result = await classifyUnclassifiedArticles(
    {},
    {
      articlesPath,
      classifyFraming: async (input) => {
        if (input.title === 'A') {
          await upsertArticle(article({ id: 'b', title: 'B' }), articlesPath);
          await pruneArticles((all) => all.filter((x) => x.title !== 'C'), articlesPath);
        }
        return { ok: false, error: 'offline', model: null, rawText: null };
      },
    },
  );

  const stored = await readArticles(articlesPath);
  assert.deepEqual(stored.map((x) => x.title).sort(), ['A', 'B']);
  assert.equal(stored.find((x) => x.title === 'A')?.classifyError, 'offline');
  assert.equal(result.attempted, 2);
});

function framing(framingSummary: string): FramingAnalysis {
  return {
    genre: 'news_blurb',
    headlineDevices: [],
    dimensions: {
      loadedLanguage: 0.1,
      emotionalAppeal: 0.1,
      certaintyClaiming: 0.1,
      omissionOrSelectionRisk: 0.1,
      attributionClarity: 0.9,
    },
    framingSummary,
    evidenceQuotes: [],
    openQuestions: [],
    confidence: 0.8,
  };
}

/** Stub model whose summary says which input it framed. */
function recordingClassify(onCall?: (call: number) => Promise<void>) {
  const bodies: Array<string | null | undefined> = [];
  const classifyFraming: ClassifyDeps['classifyFraming'] = async (input) => {
    bodies.push(input.bodyText);
    await onCall?.(bodies.length);
    const summary = input.bodyText ? `From the body: ${input.bodyText}` : 'From the headline';
    return { ok: true, analysis: framing(summary), model: 'stub', rawText: '' };
  };
  return { bodies, classifyFraming };
}

/**
 * A stored pending row and a stub model; triage's write-back lands 'Full body.' on the row
 * during the first model call.
 */
async function pendingRowWithLateBody() {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'classify-late-body-')), 'articles.json');
  await updateArticles(() => [article({ id: 'late-body' })], articlesPath);
  const [pending] = await readArticles(articlesPath);
  const { bodies, classifyFraming } = recordingClassify(async (call) => {
    if (call === 1) {
      await writeBackSurvivors([{ ...pending!, bodyText: 'Full body.', bodyStatus: 'ok' }], articlesPath);
    }
  });
  return { articlesPath, id: pending!.id, bodies, classifyFraming };
}

test('NEWS-156: a headline-only result that lands after triage wrote the body is redone with the body', async () => {
  const { articlesPath, bodies, classifyFraming } = await pendingRowWithLateBody();

  const result = await classifyUnclassifiedArticles({}, { articlesPath, classifyFraming });

  const [stored] = await readArticles(articlesPath);
  assert.deepEqual(bodies, [null, 'Full body.']);
  assert.equal(stored!.bodyText, 'Full body.');
  assert.equal(stored!.classification?.framingSummary, 'From the body: Full body.');
  assert.deepEqual(result.articles, [stored]);
  assert.deepEqual(
    { attempted: result.attempted, succeeded: result.succeeded, failed: result.failed },
    { attempted: 1, succeeded: 1, failed: 0 },
  );
});

test('NEWS-156: reclassifying one article redoes a headline-only result when the body lands meanwhile', async () => {
  const { articlesPath, id, bodies, classifyFraming } = await pendingRowWithLateBody();

  const result = await classifyArticleById(id, { articlesPath, classifyFraming });

  const [stored] = await readArticles(articlesPath);
  assert.deepEqual(bodies, [null, 'Full body.']);
  assert.equal(stored!.classification?.framingSummary, 'From the body: Full body.');
  assert.deepEqual(result, { article: stored, ok: true, error: undefined });
});

test('NEWS-156: a result made with the body in hand stands when the body changes while the model runs', async () => {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'classify-body-in-hand-')), 'articles.json');
  const withBody = article({ id: 'with-body', bodyText: 'First scrape.', bodyStatus: 'ok' });
  await updateArticles(() => [withBody], articlesPath);
  const { bodies, classifyFraming } = recordingClassify(async () => {
    await updateArticles(
      (rows) => rows.map((row) => ({ ...row, bodyText: 'Second scrape.' })),
      articlesPath,
    );
  });

  await classifyUnclassifiedArticles({}, { articlesPath, classifyFraming });

  const [stored] = await readArticles(articlesPath);
  assert.deepEqual(bodies, ['First scrape.']);
  assert.equal(stored!.classification?.framingSummary, 'From the body: First scrape.');
});

test('NEWS-161: overlapping batch classify makes one model call per unclassified row', async () => {
  const articlesPath = path.join(mkdtempSync(path.join(tmpdir(), 'classify-single-flight-')), 'articles.json');
  await upsertArticles(
    [
      article({ id: 'a', title: 'A', publishedAt: '2026-09-12T12:00:00.000Z' }),
      article({ id: 'b', title: 'B', publishedAt: '2026-09-11T12:00:00.000Z' }),
    ],
    articlesPath,
  );

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const classifyFraming: ClassifyDeps['classifyFraming'] = async (input) => {
    calls += 1;
    await gate;
    return { ok: true, analysis: framing(`Framed ${input.title}`), model: 'stub', rawText: '' };
  };

  // Lock is set synchronously on the first call, so the second joins before any model await.
  const first = classifyUnclassifiedArticles({}, { articlesPath, classifyFraming });
  const second = classifyUnclassifiedArticles({}, { articlesPath, classifyFraming });
  release();

  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 2);
  assert.equal(a.joined, false);
  assert.equal(b.joined, true);
  assert.equal(a.attempted, 2);
  assert.equal(b.attempted, 2);
  assert.deepEqual(
    a.articles.map((row) => row.id).sort(),
    b.articles.map((row) => row.id).sort(),
  );
});
