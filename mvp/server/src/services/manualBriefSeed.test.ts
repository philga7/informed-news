import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import { articleIdFromCanonicalUrl } from '../store/articleId.js';
import {
  buildManualSeedArticle,
  createManualSeed,
  ManualSeedConflictError,
  ManualSeedValidationError,
  parseManualSeedBody,
  removeManualSeed,
  type CreateManualSeedDeps,
  type ManualSeedInput,
} from './manualBriefSeed.js';
import type { PublisherBodyResult } from './publisherBodyScrape.js';
import { composeTopicBrief } from './topicBrief.js';

const FIXED_NOW = '2026-09-21T12:00:00.000Z';
const FIXED_UUID = '11111111-2222-4333-8444-555555555555';
const SEED_ID = articleIdFromCanonicalUrl(`manual://seed/${FIXED_UUID}`);
const HOURS_BEFORE_NOW = (h: number) =>
  new Date(Date.parse(FIXED_NOW) - h * 3_600_000).toISOString();

test('buildManualSeedArticle requires non-empty title', () => {
  assert.throws(
    () => buildManualSeedArticle({ title: '   ' }, FIXED_NOW, FIXED_UUID),
    (err: unknown) =>
      err instanceof ManualSeedValidationError && err.message === 'title is required',
  );
});

test('buildManualSeedArticle maps note to snippet', () => {
  const article = buildManualSeedArticle(
    { title: 'Test story', note: '  Operator note  ' },
    FIXED_NOW,
    FIXED_UUID,
  );

  assert.equal(article.snippet, 'Operator note');
});

test('buildManualSeedArticle uses empty snippet when note is omitted', () => {
  const article = buildManualSeedArticle({ title: 'Test story' }, FIXED_NOW, FIXED_UUID);

  assert.equal(article.snippet, '');
});

test('buildManualSeedArticle maps urls to citations and publisherUrl', () => {
  const article = buildManualSeedArticle(
    {
      title: 'Test story',
      urls: [' https://example.com/a ', 'https://news.test/b'],
    },
    FIXED_NOW,
    FIXED_UUID,
  );

  assert.deepEqual(article.citations, [
    { label: 'Source', url: 'https://example.com/a' },
    { label: 'Source', url: 'https://news.test/b' },
  ]);
  assert.equal(article.publisherUrl, 'https://example.com/a');
  assert.equal(article.publisherDomain, 'example.com');
});

test('buildManualSeedArticle sets clusterId equal to id', () => {
  const article = buildManualSeedArticle({ title: 'Test story' }, FIXED_NOW, FIXED_UUID);
  const expectedId = articleIdFromCanonicalUrl(`manual://seed/${FIXED_UUID}`);

  assert.equal(article.id, expectedId);
  assert.equal(article.clusterId, expectedId);
  assert.equal(article.sourceKind, 'manual');
  assert.equal(article.bodyText, null);
  assert.equal(article.bodyStatus, 'not_applicable');
});

test('buildManualSeedArticle rejects invalid urls', () => {
  assert.throws(
    () =>
      buildManualSeedArticle(
        { title: 'Test story', urls: ['ftp://files.example.com/x'] },
        FIXED_NOW,
        FIXED_UUID,
      ),
    (err: unknown) =>
      err instanceof ManualSeedValidationError &&
      err.message === 'urls must be valid http or https URLs',
  );
});

function assertValidation(body: unknown, message: string): void {
  assert.throws(
    () => parseManualSeedBody(body),
    (err: unknown) => err instanceof ManualSeedValidationError && err.message === message,
  );
}

test('parseManualSeedBody rejects missing title', () => {
  assertValidation({}, 'title is required');
});

test('parseManualSeedBody requires a string topicId', () => {
  assertValidation({ title: 'x', urls: ['https://example.com/a'] }, 'topicId is required');
  assertValidation(
    { title: 'x', topicId: 7, urls: ['https://example.com/a'] },
    'topicId is required',
  );
});

test('parseManualSeedBody requires at least one URL', () => {
  assertValidation({ title: 'x', topicId: 't1' }, 'at least one URL is required');
  assertValidation({ title: 'x', topicId: 't1', urls: [] }, 'at least one URL is required');
});

test('parseManualSeedBody rejects non-string urls entries', () => {
  assertValidation(
    { title: 'x', topicId: 't1', urls: ['https://example.com', 123] },
    'urls must be an array of strings',
  );
});

test('parseManualSeedBody returns title, topicId, urls and note', () => {
  assert.deepEqual(
    parseManualSeedBody({
      title: 'x',
      topicId: 't1',
      urls: ['https://example.com/a'],
      note: 'why',
    }),
    { title: 'x', topicId: 't1', urls: ['https://example.com/a'], note: 'why' },
  );
});

function makeTopic(id: string, overrides: Partial<Topic> = {}): Topic {
  return {
    id,
    name: `Topic ${id}`,
    kind: 'desired',
    level: 'core',
    description: '',
    keywords: [],
    searchQuery: id,
    sections: [],
    notes: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeArticle(id: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    title: `Headline ${id}`,
    sourceKind: 'search',
    canonicalUrl: `https://${id}.example.org/story`,
    citations: [],
    publisherUrl: `https://${id}.example.org/story`,
    publisherDomain: `${id}.example.org`,
    handle: null,
    publishedAt: HOURS_BEFORE_NOW(3),
    snippet: '',
    bodyText: null,
    bodyStatus: 'unavailable',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: HOURS_BEFORE_NOW(3),
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...overrides,
  };
}

function kept(id: string, topicIds: string[], overrides: Partial<TriageRecord> = {}): TriageRecord {
  return {
    articleId: id,
    status: 'kept',
    reason: null,
    stage: 'headline',
    final: true,
    topicIds,
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: 1,
    significance: 2,
    bodyChecked: false,
    jevCalls: 1,
    triagedAt: HOURS_BEFORE_NOW(3),
    ...overrides,
  };
}

function triageOf(...records: TriageRecord[]): TriageStore {
  return { records: Object.fromEntries(records.map((r) => [r.articleId, r])), updatedAt: null };
}

const UNAVAILABLE_SCRAPE: PublisherBodyResult = {
  bodyText: null,
  bodyStatus: 'unavailable',
  publisherTitle: null,
  imageUrl: null,
  imageCaption: null,
  imageCredit: null,
  publishedAt: null,
};

type HarnessOptions = {
  topics?: Topic[];
  rules?: MuteRule[];
  articles?: Article[];
  triage?: TriageStore;
  scrape?: PublisherBodyResult;
};

/** In-memory stores; records every write and scrape. */
function harness(options: HarnessOptions = {}) {
  const articles = [...(options.articles ?? [])];
  let triage = options.triage ?? triageOf();
  const upserts: Article[] = [];
  const triageWrites: TriageStore[] = [];
  const scrapes: Array<{
    url: string;
    opts: { timeoutMs?: number; retries?: number } | undefined;
  }> = [];
  const deps: CreateManualSeedDeps = {
    now: () => FIXED_NOW,
    uuid: () => FIXED_UUID,
    readTopics: async () => ({ topics: options.topics ?? [makeTopic('t1')] }),
    readMuteRules: async () => ({ rules: options.rules ?? [] }),
    readArticles: async () => articles,
    readTriage: async () => triage,
    upsertArticle: async (article) => {
      upserts.push(article as Article);
      articles.push(article as Article);
      return article as Article;
    },
    updateTriage: async (mutate) => {
      triage = mutate(triage);
      triageWrites.push(triage);
      return triage;
    },
    scrapePublisherBody: async (url, opts) => {
      scrapes.push({ url: url as string, opts });
      return options.scrape ?? UNAVAILABLE_SCRAPE;
    },
  };
  return {
    deps,
    upserts,
    triageWrites,
    scrapes,
    articles: () => articles,
    triage: () => triage,
  };
}

function seedInput(overrides: Partial<ManualSeedInput> = {}): ManualSeedInput {
  return {
    title: 'Port strike halts container traffic',
    topicId: 't1',
    urls: ['https://news.example.com/port-strike'],
    ...overrides,
  };
}

async function assertRefused(
  h: ReturnType<typeof harness>,
  input: ManualSeedInput,
  check: (err: unknown) => boolean,
): Promise<void> {
  await assert.rejects(createManualSeed(input, h.deps), check);
  assert.equal(h.upserts.length, 0);
  assert.equal(h.triageWrites.length, 0);
}

test('createManualSeed refuses an unknown topic before scraping', async () => {
  const h = harness();
  await assertRefused(
    h,
    seedInput({ topicId: 'nope' }),
    (err) =>
      err instanceof ManualSeedValidationError && err.message === 'topic must be a desired topic',
  );
  assert.equal(h.scrapes.length, 0);
});

test('createManualSeed refuses a mute rule keyword found only in the scraped body', async () => {
  const h = harness({
    rules: [{ id: 'rule-1', keyword: 'ice', source: null, createdAt: '2026-09-01T00:00:00.000Z' }],
    scrape: {
      ...UNAVAILABLE_SCRAPE,
      bodyText: 'Local police closed the terminal gates overnight.',
      bodyStatus: 'ok',
    },
  });
  await assertRefused(h, seedInput({ note: 'Operator note' }), (err) => {
    assert.ok(err instanceof ManualSeedConflictError);
    assert.deepEqual(err.body, {
      ok: false,
      code: 'muted',
      error: "This matches your mute rule 'ice', so it wouldn't show.",
    });
    return true;
  });
  assert.equal(h.scrapes.length, 1);
});

test('createManualSeed refuses an undesired topic id', async () => {
  const h = harness({ topics: [makeTopic('t1'), makeTopic('u1', { kind: 'undesired' })] });
  await assertRefused(
    h,
    seedInput({ topicId: 'u1' }),
    (err) =>
      err instanceof ManualSeedValidationError && err.message === 'topic must be a desired topic',
  );
});

test('createManualSeed refuses a mute rule match with the rule keyword', async () => {
  const h = harness({
    rules: [
      {
        id: 'rule-1',
        keyword: 'strike',
        source: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  });
  await assertRefused(h, seedInput(), (err) => {
    assert.ok(err instanceof ManualSeedConflictError);
    assert.deepEqual(err.body, {
      ok: false,
      code: 'muted',
      error: "This matches your mute rule 'strike', so it wouldn't show.",
    });
    return true;
  });
});

test('createManualSeed refuses an undesired topic match with the topic name', async () => {
  const h = harness({
    topics: [
      makeTopic('t1'),
      makeTopic('u1', { kind: 'undesired', level: null, name: 'Labor disputes', keywords: ['strike'] }),
    ],
  });
  await assertRefused(h, seedInput(), (err) => {
    assert.ok(err instanceof ManualSeedConflictError);
    assert.deepEqual(err.body, {
      ok: false,
      code: 'muted',
      error: "This matches your undesired topic 'Labor disputes', so it wouldn't show.",
    });
    return true;
  });
});

test('createManualSeed refuses a kept story sharing a URL, even one already seen', async () => {
  const existing = makeArticle('old', {
    title: 'Dockworkers walk out at the port',
    publisherUrl: 'https://news.example.com/port-strike',
  });
  const h = harness({
    topics: [makeTopic('t1'), makeTopic('t2', { name: 'Shipping' })],
    articles: [existing],
    triage: triageOf(kept('old', ['t2'])),
  });
  await assertRefused(h, seedInput(), (err) => {
    assert.ok(err instanceof ManualSeedConflictError);
    assert.deepEqual(err.body, {
      ok: false,
      code: 'duplicate',
      error: "Already in your Brief: 'Dockworkers walk out at the port' under Shipping.",
      existing: {
        articleId: 'old',
        title: 'Dockworkers walk out at the port',
        topicName: 'Shipping',
      },
    });
    return true;
  });
});

test('createManualSeed refuses a duplicate a refresh kept after the seed first read triage', async () => {
  const existing = makeArticle('old', {
    title: 'Dockworkers walk out at the port',
    publisherUrl: 'https://news.example.com/port-strike',
  });
  const h = harness({ articles: [existing], triage: triageOf(kept('old', ['t1'])) });
  h.deps.readTriage = async () => triageOf();

  await assert.rejects(createManualSeed(seedInput(), h.deps), (err) => {
    assert.ok(err instanceof ManualSeedConflictError);
    assert.equal(err.body.code, 'duplicate');
    return true;
  });
  assert.equal(h.triageWrites.length, 0);
  assert.deepEqual(Object.keys(h.triage().records), ['old']);
});

test('createManualSeed refuses a similar headline kept in the chosen topic', async () => {
  const existing = makeArticle('old', { title: 'Senate passes sweeping drone export bill' });
  const h = harness({
    topics: [makeTopic('t1', { name: 'Defense' })],
    articles: [existing],
    triage: triageOf(kept('old', ['t1'])),
  });
  await assertRefused(
    h,
    seedInput({ title: 'Senate passes sweeping drone export bill tonight' }),
    (err) => {
      assert.ok(err instanceof ManualSeedConflictError);
      assert.equal(
        err.body.error,
        "Already in your Brief: 'Senate passes sweeping drone export bill' under Defense.",
      );
      return true;
    },
  );
});

test('createManualSeed names a deleted topic as another topic', async () => {
  const existing = makeArticle('old', {
    title: 'Dockworkers walk out at the port',
    publisherUrl: 'https://news.example.com/port-strike',
  });
  const h = harness({ articles: [existing], triage: triageOf(kept('old', ['gone'])) });
  await assertRefused(h, seedInput(), (err) => {
    assert.ok(err instanceof ManualSeedConflictError);
    assert.equal(
      err.body.error,
      "Already in your Brief: 'Dockworkers walk out at the port' under another topic.",
    );
    assert.ok(err.body.code === 'duplicate');
    assert.equal(err.body.existing.topicName, 'another topic');
    return true;
  });
});

test('createManualSeed allows a similar headline kept only in another topic', async () => {
  const existing = makeArticle('old', { title: 'Senate passes sweeping drone export bill' });
  const h = harness({
    topics: [makeTopic('t1'), makeTopic('t2')],
    articles: [existing],
    triage: triageOf(kept('old', ['t2'])),
  });
  await createManualSeed(
    seedInput({ title: 'Senate passes sweeping drone export bill tonight' }),
    h.deps,
  );
  assert.equal(h.upserts.length, 1);
});

test('createManualSeed ignores out-of-window and dropped stories with the same URL', async () => {
  const url = 'https://news.example.com/port-strike';
  const h = harness({
    articles: [
      makeArticle('stale', { publisherUrl: url, publishedAt: HOURS_BEFORE_NOW(49) }),
      makeArticle('dropped', { publisherUrl: url }),
    ],
    triage: triageOf(
      kept('stale', ['t1']),
      kept('dropped', ['t1'], { status: 'dropped', reason: 'off_topic' }),
    ),
  });
  await createManualSeed(seedInput(), h.deps);
  assert.equal(h.upserts.length, 1);
});

test('createManualSeed stores the scraped body when the scrape is ok', async () => {
  const h = harness({
    scrape: {
      bodyText: 'Full publisher body text.',
      bodyStatus: 'ok',
      publisherTitle: 'Publisher headline',
      imageUrl: 'https://news.example.com/img.jpg',
      imageCaption: 'Caption',
      imageCredit: 'news.example.com',
      publishedAt: '2026-09-20T08:00:00.000Z',
    },
  });
  const { article } = await createManualSeed(
    seedInput({ urls: ['https://news.example.com/port-strike', 'https://other.example.net/x'] }),
    h.deps,
  );

  assert.deepEqual(h.scrapes, [
    { url: 'https://news.example.com/port-strike', opts: { timeoutMs: 8000, retries: 0 } },
  ]);
  assert.equal(article.bodyText, 'Full publisher body text.');
  assert.equal(article.bodyStatus, 'ok');
  assert.equal(article.publisherTitle, null);
  assert.equal(article.imageUrl, null);
  assert.equal(article.publishedAt, null);
  assert.deepEqual(h.upserts, [article]);
});

test('createManualSeed keeps the note as the summary source when the scrape fails', async () => {
  const h = harness();
  const { article } = await createManualSeed(seedInput({ note: 'Operator note' }), h.deps);
  assert.equal(article.bodyText, null);
  assert.equal(article.bodyStatus, 'not_applicable');
  assert.equal(article.snippet, 'Operator note');
});

test('createManualSeed writes the seed triage record and returns the article and topic', async () => {
  const other = kept('other', ['t1']);
  const h = harness({ articles: [makeArticle('other')], triage: triageOf(other) });
  const result = await createManualSeed(
    seedInput({ urls: ['https://news.example.com/a', 'https://WIRE.example.net/b'] }),
    h.deps,
  );

  assert.deepEqual(Object.keys(result).sort(), ['article', 'topicId']);
  assert.equal(result.topicId, 't1');
  assert.equal(result.article.id, SEED_ID);
  assert.equal(h.triageWrites.length, 1);
  assert.deepEqual(h.triage().records, {
    other,
    [SEED_ID]: {
      articleId: SEED_ID,
      status: 'kept',
      reason: null,
      stage: 'manual',
      final: true,
      topicIds: ['t1'],
      labels: [],
      duplicateOf: null,
      memberIds: [],
      outletCount: 2,
      significance: null,
      bodyChecked: false,
      jevCalls: 0,
      triagedAt: FIXED_NOW,
    },
  });
});

test('createManualSeed counts www. and bare host as one outlet', async () => {
  const h = harness();
  await createManualSeed(
    seedInput({ urls: ['https://www.example.com/a', 'https://example.com/b'] }),
    h.deps,
  );
  assert.equal(h.triage().records[SEED_ID]?.outletCount, 1);
});

test('a saved seed is pinned first in its topic section of the Brief', async () => {
  const h = harness({
    topics: [makeTopic('t1')],
    articles: [makeArticle('top')],
    triage: triageOf(kept('top', ['t1'], { significance: 2, outletCount: 9 })),
  });
  await createManualSeed(seedInput(), h.deps);

  const brief = composeTopicBrief({
    topics: [makeTopic('t1')],
    muteRules: [],
    articles: h.articles(),
    triage: h.triage(),
    seen: { seen: {}, updatedAt: null },
    summaries: { summaries: {}, updatedAt: null },
    refresh: null,
    now: new Date(FIXED_NOW),
  });
  assert.deepEqual(
    brief.sections[0]!.stories.map((s) => [s.articleId, s.manualSeed]),
    [
      [SEED_ID, true],
      ['top', false],
    ],
  );
});

const REMOVE_NOW = '2026-09-21T13:00:00.000Z';

function seedRecord(): TriageRecord {
  return kept(SEED_ID, ['t1'], {
    stage: 'manual',
    significance: null,
    jevCalls: 0,
    triagedAt: FIXED_NOW,
  });
}

function removeDeps(h: ReturnType<typeof harness>) {
  return {
    readArticles: h.deps.readArticles!,
    readTriage: h.deps.readTriage!,
    updateTriage: h.deps.updateTriage!,
    now: () => REMOVE_NOW,
  };
}

test('removeManualSeed 404s an unknown article and writes nothing', async () => {
  const h = harness();
  assert.deepEqual(await removeManualSeed('missing', removeDeps(h)), {
    ok: false,
    status: 404,
    error: 'story_not_found',
  });
  assert.equal(h.triageWrites.length, 0);
});

test('removeManualSeed 409s a non-seed article and writes nothing', async () => {
  const h = harness({ articles: [makeArticle('top')], triage: triageOf(kept('top', ['t1'])) });
  assert.deepEqual(await removeManualSeed('top', removeDeps(h)), {
    ok: false,
    status: 409,
    error: 'not_a_seed',
  });
  assert.equal(h.triageWrites.length, 0);
  assert.ok(h.triage().records.top);
});

test('removeManualSeed 404s a seed without a triage record and writes nothing', async () => {
  const seed = buildManualSeedArticle(
    { title: 'Port strike', urls: ['https://news.example.com/a'] },
    FIXED_NOW,
    FIXED_UUID,
  );
  const h = harness({ articles: [seed] });
  assert.deepEqual(await removeManualSeed(SEED_ID, removeDeps(h)), {
    ok: false,
    status: 404,
    error: 'story_not_found',
  });
  assert.equal(h.triageWrites.length, 0);
});

test('removeManualSeed deletes the seed record and its duplicates, leaving the article', async () => {
  const seed = buildManualSeedArticle(
    { title: 'Port strike halts container traffic', urls: ['https://news.example.com/a'] },
    FIXED_NOW,
    FIXED_UUID,
  );
  const dupOfSeed = kept('dup', ['t1'], {
    status: 'dropped',
    reason: 'duplicate',
    stage: 'dedupe',
    duplicateOf: SEED_ID,
  });
  const unrelatedDrop = kept('other-drop', ['t1'], {
    status: 'dropped',
    reason: 'duplicate',
    stage: 'dedupe',
    duplicateOf: 'top',
  });
  const top = kept('top', ['t1'], { memberIds: ['other-drop'] });
  const h = harness({
    articles: [seed, makeArticle('top'), makeArticle('dup'), makeArticle('other-drop')],
    triage: triageOf(seedRecord(), dupOfSeed, unrelatedDrop, top),
  });

  assert.deepEqual(await removeManualSeed(SEED_ID, removeDeps(h)), { ok: true });

  assert.equal(h.triageWrites.length, 1);
  assert.deepEqual(h.triage(), {
    records: { 'other-drop': unrelatedDrop, top },
    updatedAt: REMOVE_NOW,
  });
  assert.deepEqual(
    h.articles().map((a) => a.id),
    [SEED_ID, 'top', 'dup', 'other-drop'],
  );

  const brief = composeTopicBrief({
    topics: [makeTopic('t1')],
    muteRules: [],
    articles: h.articles(),
    triage: h.triage(),
    seen: { seen: {}, updatedAt: null },
    summaries: { summaries: {}, updatedAt: null },
    refresh: null,
    now: new Date(FIXED_NOW),
  });
  assert.deepEqual(
    brief.sections[0]!.stories.map((s) => s.articleId),
    ['top'],
  );
});
