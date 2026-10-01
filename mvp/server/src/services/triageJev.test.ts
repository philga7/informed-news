import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Questions, SystemOneRequest } from '@typesafe-ai/sdk';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import { BODY_EXCERPT_MAX_CHARS, HEADLINE_SNIPPET_MAX_CHARS } from './triageConfig.js';
import {
  QUALITY_LABELS,
  buildBodyState,
  buildHeadlineState,
  buildTriageQuestions,
  judgeTriage,
  routeTriageAnswers,
  type TriageJevAnswers,
  type TriageJevContext,
} from './triageJev.js';
import type { systemOne } from './typesafeClient.js';

function makeTopic(id: string, name: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    name,
    kind: 'desired',
    level: 'core',
    description: `${name} description`,
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
    title: 'Port strike enters second week',
    sourceKind: 'search',
    canonicalUrl: 'https://example.com/story',
    citations: [{ label: 'Example News', url: 'https://example.com/story' }],
    publisherUrl: 'https://example.com/story',
    publisherDomain: 'example.com',
    handle: null,
    publishedAt: '2026-09-30T12:00:00.000Z',
    snippet: 'Dockworkers stayed off the job.',
    bodyText: 'Full body text.',
    bodyStatus: 'ok',
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

const core = makeTopic('t-core', 'Ports');
const watch = makeTopic('t-watch', 'Shipping rates', { level: 'watch' });
const core2 = makeTopic('t-core2', 'Labor', { level: null });
const muteA = makeTopic('u-a', 'Celebrity gossip', { kind: 'undesired', level: null });
const muteB = makeTopic('u-b', 'Sports', { kind: 'undesired', level: null });

const ctx: TriageJevContext = { candidates: [core, watch, core2], undesired: [muteA, muteB] };

function answers(overrides: Partial<TriageJevAnswers> = {}): TriageJevAnswers {
  return {
    relevance: { 't-core': 0.9, 't-watch': 0.9, 't-core2': 0.1 },
    undesired: { 'u-a': 0.1, 'u-b': 0.1 },
    quality: { choice: 'news', confidence: 0.9 },
    significance: 1.8,
    ...overrides,
  };
}

test('buildTriageQuestions keys topics, undesired, quality, significance in order', () => {
  const qs = buildTriageQuestions(ctx);
  assert.deepEqual(Object.keys(qs), [
    'topic_0',
    'topic_1',
    'topic_2',
    'undesired_0',
    'undesired_1',
    'quality',
    'significance',
  ]);

  const topic0 = qs.topic_0;
  assert.equal(topic0?.type, 'noul');
  assert.equal(topic0?.instructions, 'Is this story substantively about Ports?');
  assert.deepEqual(topic0?.type === 'noul' ? topic0.criteria : null, {
    true: 'Ports description',
    false: 'Not about this topic, or only a passing mention.',
  });

  const undesired1 = qs.undesired_1;
  assert.equal(undesired1?.type, 'noul');
  assert.equal(
    undesired1?.instructions,
    'Is this story about Sports (a subject the reader excluded)?',
  );
  assert.deepEqual(undesired1?.type === 'noul' ? undesired1.criteria : null, {
    true: 'Sports description',
  });

  const quality = qs.quality;
  assert.equal(quality?.type, 'choice');
  assert.deepEqual(
    quality?.type === 'choice' ? Object.keys(quality.criteria) : null,
    [...QUALITY_LABELS],
  );
  if (quality?.type === 'choice') {
    for (const label of QUALITY_LABELS) {
      assert.equal(typeof quality.criteria[label], 'string');
    }
  }

  const significance = qs.significance;
  assert.equal(significance?.type, 'score');
  assert.equal(
    significance?.instructions,
    'How significant is this development for someone following the topic(s) this story is about?',
  );
  assert.deepEqual(significance?.type === 'score' ? significance.criteria : null, [
    'Routine or minor update',
    'Notable but incremental development',
    'Significant development a follower of this topic must know',
  ]);
});

test('buildTriageQuestions with no undesired topics omits undesired keys', () => {
  const qs = buildTriageQuestions({ candidates: [core], undesired: [] });
  assert.deepEqual(Object.keys(qs), ['topic_0', 'quality', 'significance']);
});

test('buildTriageQuestions leaves a blank description undescribed', () => {
  const qs = buildTriageQuestions({
    candidates: [makeTopic('t', 'Blank', { description: '  ' })],
    undesired: [],
  });
  const q = qs.topic_0;
  assert.deepEqual(q?.type === 'noul' ? q.criteria : null, {
    true: null,
    false: 'Not about this topic, or only a passing mention.',
  });
});

test('route: undesired match beats relevance (first undesired in ctx order)', () => {
  const v = routeTriageAnswers(answers({ undesired: { 'u-a': 0.7, 'u-b': 0.95 } }), ctx);
  assert.equal(v.decision, 'drop');
  assert.equal(v.decision === 'drop' ? v.reason : null, 'muted:u-a');
});

test('route: undesired just below floor does not mute', () => {
  const v = routeTriageAnswers(answers({ undesired: { 'u-a': 0.59, 'u-b': 0 } }), ctx);
  assert.equal(v.decision, 'keep');
});

test('route: no relevant candidate → off_topic', () => {
  const v = routeTriageAnswers(
    answers({ relevance: { 't-core': 0.49, 't-watch': 0.2, 't-core2': 0 } }),
    ctx,
  );
  assert.equal(v.decision, 'drop');
  assert.equal(v.decision === 'drop' ? v.reason : null, 'off_topic');
  assert.deepEqual(v.topicIds, ['t-core', 't-watch', 't-core2']);
});

for (const reason of ['clickbait', 'opinion', 'rewrite', 'sponsored'] as const) {
  test(`route: confident ${reason} → drop ${reason}`, () => {
    const v = routeTriageAnswers(answers({ quality: { choice: reason, confidence: 0.6 } }), ctx);
    assert.equal(v.decision, 'drop');
    assert.equal(v.decision === 'drop' ? v.reason : null, reason);
  });
}

test('route: low-confidence clickbait is kept', () => {
  const v = routeTriageAnswers(
    answers({ quality: { choice: 'clickbait', confidence: 0.59 } }),
    ctx,
  );
  assert.equal(v.decision, 'keep');
  assert.deepEqual(v.decision === 'keep' ? v.labels : null, []);
});

test('route: confident official → kept with official label', () => {
  const v = routeTriageAnswers(answers({ quality: { choice: 'official', confidence: 0.8 } }), ctx);
  assert.equal(v.decision, 'keep');
  assert.deepEqual(v.decision === 'keep' ? v.labels : null, ['official']);
});

test('route: low-confidence official gets no label', () => {
  const v = routeTriageAnswers(answers({ quality: { choice: 'official', confidence: 0.5 } }), ctx);
  assert.deepEqual(v.decision === 'keep' ? v.labels : null, []);
});

test('route: official still respects off_topic', () => {
  const v = routeTriageAnswers(
    answers({
      relevance: { 't-core': 0, 't-watch': 0, 't-core2': 0 },
      quality: { choice: 'official', confidence: 0.99 },
    }),
    ctx,
  );
  assert.equal(v.decision === 'drop' ? v.reason : null, 'off_topic');
});

test('route: watch topic dropped below significance while core kept', () => {
  const v = routeTriageAnswers(answers({ significance: 1.39 }), ctx);
  assert.equal(v.decision, 'keep');
  assert.deepEqual(v.topicIds, ['t-core']);
  assert.equal(v.significance, 1.39);
});

test('route: watch topic kept at significance threshold', () => {
  const v = routeTriageAnswers(answers({ significance: 1.4 }), ctx);
  assert.deepEqual(v.topicIds, ['t-core', 't-watch']);
});

test('route: all-watch relevant below significance → not_significant', () => {
  const v = routeTriageAnswers(
    answers({ relevance: { 't-core': 0.1, 't-watch': 0.9, 't-core2': 0.2 }, significance: 0.5 }),
    ctx,
  );
  assert.equal(v.decision, 'drop');
  assert.equal(v.decision === 'drop' ? v.reason : null, 'not_significant');
  assert.equal(v.significance, 0.5);
});

test('route: keep returns relevant topic ids in ctx order', () => {
  const v = routeTriageAnswers(
    answers({ relevance: { 't-core2': 0.9, 't-watch': 0.9, 't-core': 0.5 } }),
    ctx,
  );
  assert.deepEqual(v.topicIds, ['t-core', 't-watch', 't-core2']);
});

test('buildHeadlineState uses first citation label and truncates snippet', () => {
  const long = 'x'.repeat(HEADLINE_SNIPPET_MAX_CHARS + 50);
  const state = buildHeadlineState(makeArticle({ snippet: long }));
  assert.deepEqual(Object.keys(state), ['headline', 'publisher', 'snippet', 'publishedAt']);
  assert.equal(state.headline, 'Port strike enters second week');
  assert.equal(state.publisher, 'Example News');
  assert.equal((state.snippet as string).length, HEADLINE_SNIPPET_MAX_CHARS);
  assert.equal(state.publishedAt, '2026-09-30T12:00:00.000Z');
});

test('buildHeadlineState publisher falls back to domain, then null', () => {
  assert.equal(
    buildHeadlineState(makeArticle({ citations: [] })).publisher,
    'example.com',
  );
  assert.equal(
    buildHeadlineState(makeArticle({ citations: [], publisherDomain: null })).publisher,
    null,
  );
});

test('buildHeadlineState CFP row uses publisher domain, not the CFP label', () => {
  const state = buildHeadlineState(
    makeArticle({
      sourceKind: 'cfp',
      citations: [
        { label: 'CFP', url: 'https://citizenfreepress.com/x' },
        { label: 'Original', url: 'https://www.reuters.com/world/story' },
      ],
      publisherDomain: 'reuters.com',
    }),
  );
  assert.equal(state.publisher, 'reuters.com');
});

test('buildHeadlineState xcancel row uses @handle', () => {
  const state = buildHeadlineState(
    makeArticle({
      sourceKind: 'xcancel',
      citations: [
        { label: 'xcancel', url: 'https://xcancel.com/WhiteHouse/status/1' },
        { label: 'X', url: 'https://x.com/WhiteHouse/status/1' },
      ],
      publisherUrl: null,
      publisherDomain: null,
      handle: 'WhiteHouse',
    }),
  );
  assert.equal(state.publisher, '@WhiteHouse');
});

test('buildHeadlineState search row uses the outlet citation label', () => {
  const state = buildHeadlineState(
    makeArticle({
      citations: [
        { label: 'Reuters', url: 'https://www.reuters.com/world/story' },
        { label: 'Google News', url: 'https://news.google.com/rss/articles/abc' },
      ],
      publisherDomain: 'reuters.com',
    }),
  );
  assert.equal(state.publisher, 'Reuters');
});

test('buildHeadlineState with only aggregator labels and no domain → null', () => {
  const state = buildHeadlineState(
    makeArticle({
      citations: [
        { label: 'google news', url: 'https://news.google.com/rss/articles/abc' },
        { label: 'Publisher', url: 'https://example.com/story' },
      ],
      publisherDomain: null,
    }),
  );
  assert.equal(state.publisher, null);
});

test('buildBodyState adds truncated bodyExcerpt', () => {
  const body = 'b'.repeat(BODY_EXCERPT_MAX_CHARS + 100);
  const state = buildBodyState(makeArticle({ bodyText: body }));
  assert.deepEqual(Object.keys(state), [
    'headline',
    'publisher',
    'snippet',
    'publishedAt',
    'bodyExcerpt',
  ]);
  assert.equal((state.bodyExcerpt as string).length, BODY_EXCERPT_MAX_CHARS);
  assert.equal(buildBodyState(makeArticle({ bodyText: null })).bodyExcerpt, '');
});

type FakeAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; legend: Record<string, unknown>; probabilities: Record<string, number> };

function fakeSystemOne(
  build: (request: SystemOneRequest<Questions>) => Record<string, FakeAnswer>,
  calls: Array<SystemOneRequest<Questions>> = [],
): typeof systemOne {
  const fake = async (request: SystemOneRequest<Questions>) => {
    calls.push(request);
    return {
      ok: true as const,
      result: {
        model: 'jev-test',
        answers: build(request),
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    };
  };
  return fake as unknown as typeof systemOne;
}

const noulA = (noul: number): FakeAnswer => ({ type: 'noul', noul });

test('judgeTriage maps answers back to topic ids and routes', async () => {
  const calls: Array<SystemOneRequest<Questions>> = [];
  const res = await judgeTriage('headline', makeArticle(), ctx, {
    systemOne: fakeSystemOne(
      () => ({
        topic_0: noulA(0.2),
        topic_1: noulA(0.8),
        topic_2: noulA(0.7),
        undesired_0: noulA(0.1),
        undesired_1: noulA(0.3),
        quality: {
          type: 'choice',
          choice: 'official',
          confidence: 0.75,
          probabilities: { official: 0.75, news: 0.25 },
        },
        significance: {
          type: 'score',
          score: 1.6,
          confidence: 0.7,
          legend: {},
          probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 },
        },
      }),
      calls,
    ),
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.model, 'jev-test');
  assert.deepEqual(res.answers, {
    relevance: { 't-core': 0.2, 't-watch': 0.8, 't-core2': 0.7 },
    undesired: { 'u-a': 0.1, 'u-b': 0.3 },
    quality: { choice: 'official', confidence: 0.75 },
    significance: 1.6,
  });
  assert.deepEqual(res.verdict, {
    decision: 'keep',
    topicIds: ['t-watch', 't-core2'],
    labels: ['official'],
    significance: 1.6,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.state, buildHeadlineState(makeArticle()));
  assert.deepEqual(Object.keys(calls[0]?.questions ?? {}), Object.keys(buildTriageQuestions(ctx)));
});

test('judgeTriage body stage sends body state', async () => {
  const calls: Array<SystemOneRequest<Questions>> = [];
  const article = makeArticle({ bodyText: 'Body here.' });
  await judgeTriage('body', article, { candidates: [core], undesired: [] }, {
    systemOne: fakeSystemOne(
      () => ({
        topic_0: noulA(0.9),
        quality: { type: 'choice', choice: 'news', confidence: 0.9, probabilities: {} },
        significance: { type: 'score', score: 1, confidence: 0.9, legend: {}, probabilities: {} },
      }),
      calls,
    ),
  });
  assert.deepEqual(calls[0]?.state, buildBodyState(article));
});

test('judgeTriage passes failures through', async () => {
  const failing = (async () => ({
    ok: false as const,
    error: 'TypeSafe service not available — TYPESAFE_API_KEY not configured',
    model: null,
  })) as unknown as typeof systemOne;
  const res = await judgeTriage('headline', makeArticle(), ctx, { systemOne: failing });
  assert.deepEqual(res, {
    ok: false,
    error: 'TypeSafe service not available — TYPESAFE_API_KEY not configured',
  });
});

test('judgeTriage never throws on a thrown or malformed response', async () => {
  const throwing = (async () => {
    throw new Error('boom');
  }) as unknown as typeof systemOne;
  const thrown = await judgeTriage('headline', makeArticle(), ctx, { systemOne: throwing });
  assert.deepEqual(thrown, { ok: false, error: 'boom' });

  const malformed = await judgeTriage('headline', makeArticle(), ctx, {
    systemOne: fakeSystemOne(() => ({ topic_0: noulA(0.9) })),
  });
  assert.equal(malformed.ok, false);
  assert.match(malformed.ok ? '' : malformed.error, /topic_1/);
});

test('judgeTriage rejects non-finite noul, confidence, and score', async () => {
  const one = { candidates: [core], undesired: [] };
  const valid = (): Record<string, FakeAnswer> => ({
    topic_0: noulA(0.9),
    quality: { type: 'choice', choice: 'news', confidence: 0.9, probabilities: {} },
    significance: { type: 'score', score: 1, confidence: 0.9, legend: {}, probabilities: {} },
  });
  const cases: Array<[string, (a: Record<string, FakeAnswer>) => void]> = [
    ['topic_0', (a) => { a.topic_0 = noulA(Number.NaN); }],
    ['quality', (a) => {
      a.quality = { type: 'choice', choice: 'news', confidence: Infinity, probabilities: {} };
    }],
    ['significance', (a) => {
      a.significance = { type: 'score', score: Number.NaN, confidence: 0.9, legend: {}, probabilities: {} };
    }],
  ];
  for (const [key, mutate] of cases) {
    const res = await judgeTriage('headline', makeArticle(), one, {
      systemOne: fakeSystemOne(() => {
        const a = valid();
        mutate(a);
        return a;
      }),
    });
    assert.equal(res.ok, false, key);
    assert.match(res.ok ? '' : res.error, new RegExp(key));
  }
});

test('judgeTriage rejects an unknown quality label', async () => {
  const res = await judgeTriage('headline', makeArticle(), { candidates: [core], undesired: [] }, {
    systemOne: fakeSystemOne(() => ({
      topic_0: noulA(0.9),
      quality: { type: 'choice', choice: 'satire', confidence: 0.9, probabilities: {} },
      significance: { type: 'score', score: 1, confidence: 0.9, legend: {}, probabilities: {} },
    })),
  });
  assert.equal(res.ok, false);
  assert.match(res.ok ? '' : res.error, /quality/);
});
