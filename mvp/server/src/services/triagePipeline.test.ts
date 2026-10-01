import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MuteRule } from '../store/muteRulesStore.js';
import type { Article, StoreMeta } from '../types/article.js';
import type { Topic } from '../types/topic.js';
import type { TriageRecord, TriageStore } from '../types/triage.js';
import { routeTriageAnswers, type judgeTriage, type TriageJevAnswers } from './triageJev.js';
import { runTriage, type TriageDeps } from './triagePipeline.js';
import type { SurvivorResult } from './triageSurvivor.js';

const NOW = new Date('2026-09-30T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function topic(id: string, over: Partial<Topic> = {}): Topic {
  return {
    id,
    name: id,
    kind: 'desired',
    level: 'core',
    description: `${id} coverage`,
    keywords: [],
    searchQuery: '',
    sections: [],
    notes: '',
    createdAt: hoursAgo(100),
    updatedAt: hoursAgo(100),
    ...over,
  };
}

const TARIFFS = topic('tariffs', { name: 'Tariffs', keywords: ['tariff'] });
const IRAN = topic('iran', { name: 'Iran', keywords: ['Tehran'] });

function article(id: string, title: string, over: Partial<Article> = {}): Article {
  const url = `https://${id}.example.com/story`;
  return {
    id,
    title,
    sourceKind: 'rss',
    sourceTier: 'sensor',
    canonicalUrl: url,
    citations: [{ label: `Outlet ${id}`, url }],
    publisherUrl: url,
    publisherDomain: `${id}.example.com`,
    handle: null,
    publishedAt: hoursAgo(1),
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: null,
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: hoursAgo(1),
    classification: null,
    classifiedAt: null,
    classifyError: null,
    ...over,
  };
}

function keptRecord(articleId: string, over: Partial<TriageRecord> = {}): TriageRecord {
  return {
    articleId,
    status: 'kept',
    reason: null,
    stage: 'headline',
    final: true,
    topicIds: ['tariffs'],
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: 1,
    significance: 2,
    bodyChecked: false,
    jevCalls: 1,
    triagedAt: hoursAgo(2),
    ...over,
  };
}

type StageScript = Partial<Omit<TriageJevAnswers, 'relevance' | 'undesired'>> & {
  relevance?: number;
  undesired?: number;
};
type Script = Record<string, { headline?: StageScript | 'fail'; body?: StageScript | 'fail' }>;

type HarnessOptions = {
  topics: Topic[];
  articles: Article[];
  rules?: MuteRule[];
  records?: Record<string, TriageRecord>;
  script?: Script;
  prepare?: (article: Article) => SurvivorResult;
  jevAvailable?: boolean;
  overrides?: Partial<TriageDeps>;
};

/** In-memory stores, a scripted Jev that uses the real routing, and spies. */
function harness(opts: HarnessOptions) {
  const state = {
    store: { records: { ...(opts.records ?? {}) }, updatedAt: null } as TriageStore,
    meta: [] as Partial<StoreMeta>[],
    upserts: [] as Article[][],
    judgeCalls: [] as Array<{ stage: 'headline' | 'body'; id: string }>,
    prepareCalls: [] as string[],
  };
  const script = opts.script ?? {};

  const judge: typeof judgeTriage = async (stage, a, ctx) => {
    state.judgeCalls.push({ stage, id: a.id });
    const s = script[a.id]?.[stage];
    if (s === 'fail') return { ok: false, error: 'jev down' };
    const answers: TriageJevAnswers = {
      relevance: Object.fromEntries(ctx.candidates.map((t) => [t.id, s?.relevance ?? 1])),
      undesired: Object.fromEntries(ctx.undesired.map((t) => [t.id, s?.undesired ?? 0])),
      quality: s?.quality ?? { choice: 'news', confidence: 0.9 },
      significance: s?.significance ?? 2,
    };
    return { ok: true, answers, verdict: routeTriageAnswers(answers, ctx), model: 'fake' };
  };

  const deps: TriageDeps = {
    readTopics: async () => ({ topics: opts.topics }),
    readMuteRules: async () => ({ rules: opts.rules ?? [] }),
    readArticles: async () => opts.articles,
    readTriage: async () => structuredClone(state.store),
    writeTriage: async (store) => {
      state.store = structuredClone(store);
    },
    upsertArticles: async (rows) => {
      state.upserts.push(rows as Article[]);
      return rows as Article[];
    },
    updateMeta: async (patch) => {
      state.meta.push(patch);
    },
    judge,
    jevAvailable: () => opts.jevAvailable ?? true,
    prepareSurvivor: async (a) => {
      state.prepareCalls.push(a.id);
      return opts.prepare ? opts.prepare(a) : { article: a, changed: false, dateIssue: null };
    },
    ...opts.overrides,
  };
  return { deps, state };
}

const ENV = { TRIAGE_JEV_BUDGET: '100' };
const run = (deps: TriageDeps, env: NodeJS.ProcessEnv = ENV) =>
  runTriage({ now: NOW, env }, deps);

test('acceptance: off-topic, muted, and trash never reach survivor prep; only allowed Jev calls', async () => {
  const rule: MuteRule = { id: 'r1', keyword: 'celebrity', source: null, createdAt: hoursAgo(50) };
  const sports = topic('sports', { name: 'Sports', kind: 'undesired', level: null, keywords: ['NFL'] });
  const articles = [
    article('muted', 'Celebrity tariff feud erupts'),
    article('undesired', 'NFL owners fight tariff on stadium steel'),
    article('offtopic', 'Local bakery wins regional prize'),
    article('trash', 'You will not believe this tariff twist'),
    article('good', 'Commerce Department sets new tariff schedule'),
  ];
  const { deps, state } = harness({
    topics: [TARIFFS, sports],
    rules: [rule],
    articles,
    script: { trash: { headline: { quality: { choice: 'clickbait', confidence: 0.9 } } } },
  });

  const result = await run(deps);

  assert.deepEqual(state.prepareCalls, ['good']);
  assert.deepEqual(
    state.judgeCalls.map((c) => c.id).sort(),
    ['good', 'trash'],
  );
  const records = state.store.records;
  assert.equal(records.muted!.reason, 'muted:r1');
  assert.equal(records.undesired!.reason, 'muted:sports');
  assert.equal(records.offtopic!.reason, 'off_topic');
  assert.equal(records.trash!.reason, 'clickbait');
  assert.equal(records.trash!.stage, 'headline');
  assert.equal(records.good!.status, 'kept');
  assert.deepEqual(result.keptIds, ['good']);
  assert.deepEqual(result.byReason, { muted: 2, off_topic: 1, clickbait: 1 });
});

test('acceptance: every candidate ends kept or dropped with a reason; old, manual, and pruned rows get no record', async () => {
  const articles = [
    article('a', 'Tariff deal reached with Canada'),
    article('b', 'Tariff deal reached with Canada', { sourceTier: 'primary' }),
    article('c', 'Weather turns cold in Ohio'),
    article('d', 'Tariff refunds begin for importers'),
    article('old', 'Tariff history lesson', { publishedAt: hoursAgo(72), fetchedAt: hoursAgo(72) }),
    article('manual', 'Operator tariff seed', { sourceKind: 'manual' }),
  ];
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles,
    records: { gone: keptRecord('gone') },
    script: { d: { headline: { quality: { choice: 'opinion', confidence: 0.9 } } } },
  });

  const result = await run(deps);

  const ids = Object.keys(state.store.records).sort();
  assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
  for (const rec of Object.values(state.store.records)) {
    assert.ok(rec.status === 'kept' || rec.status === 'dropped');
    assert.equal(rec.status === 'kept', rec.reason === null);
  }
  assert.equal(result.candidates, 4);
  assert.equal(result.kept + result.dropped, 4);
  assert.equal(state.store.records.b!.status, 'kept');
  assert.equal(state.store.records.a!.reason, 'duplicate');
  assert.equal(state.store.records.a!.duplicateOf, 'b');
  assert.deepEqual(state.store.records.b!.memberIds, ['a']);
});

test('acceptance: budget cap respected and reported; over-budget items are non-final and retried next run', async () => {
  const articles = [
    article('t1', 'Tariff ruling hits steel imports', { publishedAt: hoursAgo(1) }),
    article('t2', 'Senate debates tariff relief for farmers', { publishedAt: hoursAgo(2) }),
    article('t3', 'Port operators brace for tariff backlog', { publishedAt: hoursAgo(3) }),
    article('t4', 'Automakers lobby against tariff expansion', { publishedAt: hoursAgo(4) }),
  ];
  const { deps, state } = harness({ topics: [TARIFFS], articles });

  const first = await run(deps, { TRIAGE_JEV_BUDGET: '2' });

  assert.equal(first.jev.budget, 2);
  assert.equal(first.jev.used, 2);
  assert.ok(state.judgeCalls.length <= 2);
  assert.deepEqual(first.keptIds.sort(), ['t1', 't2']);
  for (const id of ['t3', 't4']) {
    const rec = state.store.records[id]!;
    assert.equal(rec.reason, 'not_scored_budget');
    assert.equal(rec.stage, 'budget');
    assert.equal(rec.final, false);
    assert.equal(rec.jevCalls, 0);
  }
  assert.equal(first.byReason.not_scored_budget, 2);
  assert.equal(state.meta.at(-1)!.triage!.jev.used, 2);

  state.judgeCalls.length = 0;
  const second = await run(deps, { TRIAGE_JEV_BUDGET: '10' });

  assert.equal(second.candidates, 2);
  assert.deepEqual(state.judgeCalls.map((c) => c.id).sort(), ['t3', 't4']);
  assert.deepEqual(second.keptIds.sort(), ['t3', 't4']);
  assert.equal(state.store.records.t1!.status, 'kept');
});

test('budget 0 marks every Jev-stage item not_scored_budget without calls', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('a', 'Tariff ruling hits steel imports')],
  });
  const result = await run(deps, { TRIAGE_JEV_BUDGET: '0' });
  assert.equal(state.judgeCalls.length, 0);
  assert.equal(state.store.records.a!.reason, 'not_scored_budget');
  assert.equal(result.jev.used, 0);
});

test('non-search row with no keyword hit is off_topic without Jev; search row reaches Jev via its topicIds', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [
      article('rss', 'Trade officials meet in Geneva'),
      article('search', 'Trade officials meet in Brussels', { sourceKind: 'search', topicIds: ['tariffs'] }),
    ],
  });
  await run(deps);
  assert.equal(state.store.records.rss!.reason, 'off_topic');
  assert.equal(state.store.records.rss!.stage, 'keyword');
  assert.deepEqual(state.judgeCalls, [{ stage: 'headline', id: 'search' }]);
  assert.equal(state.store.records.search!.status, 'kept');
});

test('a new article in the group of a prior kept story becomes its duplicate and bumps outletCount', async () => {
  const kept = article('k1', 'Supreme Court strikes down steel tariff plan', {
    publishedAt: hoursAgo(5),
  });
  const fresh = article('n1', 'Supreme Court strikes down steel tariff plan, officials say');
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [kept, fresh],
    records: { k1: keptRecord('k1') },
  });

  const result = await run(deps);

  assert.equal(state.judgeCalls.length, 0);
  const dup = state.store.records.n1!;
  assert.equal(dup.reason, 'duplicate');
  assert.equal(dup.stage, 'dedupe');
  assert.equal(dup.duplicateOf, 'k1');
  assert.equal(dup.final, true);
  assert.deepEqual(state.store.records.k1!.memberIds, ['n1']);
  assert.equal(state.store.records.k1!.outletCount, 2);
  assert.equal(state.store.records.k1!.triagedAt, hoursAgo(2));
  assert.deepEqual(result.byReason, { duplicate: 1 });
  assert.equal(result.kept, 0);
});

test('an alternate is promoted after the representative is dropped as clickbait', async () => {
  const title = 'Treasury announces sweeping tariff overhaul';
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [
      article('p1', title, { sourceTier: 'primary' }),
      article('a2', title, { snippet: 'A longer snippet that ranks this one second.' }),
      article('a3', title),
    ],
    script: { p1: { headline: { quality: { choice: 'clickbait', confidence: 0.95 } } } },
  });

  const result = await run(deps);

  assert.deepEqual(state.judgeCalls.map((c) => c.id), ['p1', 'a2']);
  assert.equal(state.store.records.p1!.reason, 'clickbait');
  const kept = state.store.records.a2!;
  assert.equal(kept.status, 'kept');
  assert.deepEqual(kept.memberIds, ['p1', 'a3']);
  assert.equal(kept.outletCount, 1);
  assert.equal(state.store.records.a3!.reason, 'duplicate');
  assert.equal(state.store.records.a3!.duplicateOf, 'a2');
  assert.deepEqual(result.keptIds, ['a2']);
});

test('not_significant on the representative stops the group', async () => {
  const watch = topic('chips', { name: 'Chips', level: 'watch', keywords: ['semiconductor'] });
  const title = 'Minor semiconductor supplier updates guidance';
  const { deps, state } = harness({
    topics: [watch],
    articles: [article('r', title, { sourceTier: 'primary' }), article('s', title)],
    script: { r: { headline: { significance: 0.5 } } },
  });

  await run(deps);

  assert.equal(state.judgeCalls.length, 1);
  assert.equal(state.store.records.r!.reason, 'not_significant');
  assert.equal(state.store.records.r!.significance, 0.5);
  assert.equal(state.store.records.s!.reason, 'duplicate');
  assert.equal(state.store.records.s!.duplicateOf, 'r');
});

test('Jev unavailable: Jev-stage items are not_scored_error with zero calls', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('a', 'Tariff ruling hits steel imports'), article('b', 'Weather turns cold')],
    jevAvailable: false,
  });

  const result = await run(deps);

  assert.equal(state.judgeCalls.length, 0);
  assert.equal(state.store.records.a!.reason, 'not_scored_error');
  assert.equal(state.store.records.a!.final, false);
  assert.equal(state.store.records.b!.reason, 'off_topic');
  assert.ok(result.errors.includes('TypeSafe not configured'));
  assert.equal(result.jev.used, 0);
});

test('headline Jev failure is counted and marks the group not_scored_error', async () => {
  const title = 'Tariff talks collapse in Geneva overnight';
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('r', title, { sourceTier: 'primary' }), article('s', title)],
    script: { r: { headline: 'fail' } },
  });

  const result = await run(deps);

  assert.equal(result.jev.errors, 1);
  assert.equal(result.jev.used, 1);
  for (const id of ['r', 's']) {
    assert.equal(state.store.records[id]!.reason, 'not_scored_error');
    assert.equal(state.store.records[id]!.final, false);
  }
  assert.equal(state.store.records.r!.jevCalls, 1);
  assert.ok(result.errors.includes('Jev: jev down'));
});

test('blocked body keeps the headline verdict with bodyChecked false and upserts the changed article', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('a', 'Tariff ruling hits steel imports')],
    prepare: (a) => ({ article: { ...a, bodyStatus: 'blocked' }, changed: true, dateIssue: null }),
  });

  await run(deps);

  assert.deepEqual(state.judgeCalls, [{ stage: 'headline', id: 'a' }]);
  const rec = state.store.records.a!;
  assert.equal(rec.status, 'kept');
  assert.equal(rec.bodyChecked, false);
  assert.equal(rec.stage, 'headline');
  assert.equal(state.upserts.length, 1);
  assert.equal(state.upserts[0]![0]!.bodyStatus, 'blocked');
});

test('ok body runs the body check: keep, drop, or failure falls back to headline verdict', async () => {
  const withBody = (a: Article): SurvivorResult => ({
    article: { ...a, bodyStatus: 'ok', bodyText: 'Full text.' },
    changed: true,
    dateIssue: null,
  });
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [
      article('keep', 'Tariff ruling hits steel imports'),
      article('drop', 'Senate debates tariff relief for farmers'),
      article('fail', 'Port operators brace for tariff backlog'),
    ],
    prepare: withBody,
    script: {
      drop: { body: { quality: { choice: 'opinion', confidence: 0.9 } } },
      fail: { body: 'fail' },
    },
  });

  const result = await run(deps);

  const recs = state.store.records;
  assert.equal(recs.keep!.status, 'kept');
  assert.equal(recs.keep!.bodyChecked, true);
  assert.equal(recs.keep!.stage, 'body');
  assert.equal(recs.keep!.jevCalls, 2);
  assert.equal(recs.drop!.reason, 'opinion');
  assert.equal(recs.drop!.stage, 'body');
  assert.equal(recs.fail!.status, 'kept');
  assert.equal(recs.fail!.bodyChecked, false);
  assert.equal(result.jev.used, 6);
  assert.equal(result.jev.errors, 1);
});

test('undated search survivor is dropped undated at the survivor stage', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [
      article('u', 'Tariff ruling hits steel imports', {
        sourceKind: 'search',
        topicIds: ['tariffs'],
        publishedAt: null,
      }),
    ],
    prepare: (a) => ({ article: { ...a, bodyStatus: 'unavailable' }, changed: true, dateIssue: 'undated' }),
  });

  await run(deps);

  const rec = state.store.records.u!;
  assert.equal(rec.reason, 'undated');
  assert.equal(rec.stage, 'survivor');
  assert.equal(rec.final, true);
  assert.equal(state.upserts.length, 1);
});

test('final records are not re-triaged; non-final records are, accumulating jevCalls', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [
      article('f', 'Tariff ruling hits steel imports'),
      article('n', 'Senate debates tariff relief for farmers'),
    ],
    records: {
      f: { ...keptRecord('f'), status: 'dropped', reason: 'clickbait', outletCount: null },
      n: {
        ...keptRecord('n'),
        status: 'dropped',
        reason: 'not_scored_error',
        final: false,
        outletCount: null,
      },
    },
  });

  const result = await run(deps);

  assert.equal(result.candidates, 1);
  assert.deepEqual(state.judgeCalls, [{ stage: 'headline', id: 'n' }]);
  assert.equal(state.store.records.f!.reason, 'clickbait');
  assert.equal(state.store.records.n!.status, 'kept');
  assert.equal(state.store.records.n!.jevCalls, 2);
});

test('budget priority round-robins across topics: budget 2 picks one story per topic', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS, IRAN],
    articles: [
      article('a1', 'Tariff ruling hits steel imports', { publishedAt: hoursAgo(3) }),
      article('a2', 'Senate debates tariff relief for farmers', { publishedAt: hoursAgo(2) }),
      article('a3', 'Port operators brace for tariff backlog', { publishedAt: hoursAgo(1) }),
      article('z1', 'Tehran responds to new sanctions', { publishedAt: hoursAgo(10) }),
    ],
  });

  const result = await run(deps, { TRIAGE_JEV_BUDGET: '2' });

  assert.deepEqual(state.judgeCalls.map((c) => c.id), ['a3', 'z1']);
  assert.deepEqual(result.keptIds.sort(), ['a3', 'z1']);
  assert.equal(state.store.records.a1!.reason, 'not_scored_budget');
  assert.equal(state.store.records.a2!.reason, 'not_scored_budget');
});

test('budget priority puts core topics before watch topics within a round', async () => {
  const watch = topic('chips', { name: 'Chips', level: 'watch', keywords: ['semiconductor'] });
  const { deps, state } = harness({
    topics: [watch, TARIFFS],
    articles: [
      article('aw', 'Semiconductor plant opens in Arizona', { publishedAt: hoursAgo(1) }),
      article('zc', 'Tariff ruling hits steel imports', { publishedAt: hoursAgo(5) }),
    ],
  });

  await run(deps, { TRIAGE_JEV_BUDGET: '1' });

  assert.deepEqual(state.judgeCalls.map((c) => c.id), ['zc']);
  assert.equal(state.store.records.aw!.reason, 'not_scored_budget');
});

test('disabled triage is skipped without reading stores and still writes meta', async () => {
  const fail = async (): Promise<never> => {
    throw new Error('should not read');
  };
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [],
    overrides: { readTopics: fail, readArticles: fail, readTriage: fail, readMuteRules: fail },
  });

  const result = await run(deps, { TRIAGE_ENABLED: 'off' });

  assert.equal(result.skipped, true);
  assert.deepEqual(result.errors, []);
  assert.equal(state.meta.length, 1);
  assert.equal(state.meta[0]!.triage!.skipped, true);
  assert.equal('keptIds' in state.meta[0]!.triage!, false);
});

test('unreadable topics skip the run with an error; meta is still written', async () => {
  const { deps, state } = harness({
    topics: [],
    articles: [],
    overrides: {
      readTopics: async () => {
        throw new Error('topics.json corrupt');
      },
    },
  });

  const result = await run(deps);

  assert.equal(result.skipped, true);
  assert.deepEqual(result.errors, ['topics.json corrupt']);
  assert.equal(state.meta[0]!.triage!.skipped, true);
});

test('unreadable triage store skips the run: no Jev, no survivor prep, no writes; meta written', async () => {
  let triageWrites = 0;
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('a', 'Tariff ruling hits steel imports')],
    prepare: (a) => ({ article: a, changed: true, dateIssue: null }),
    overrides: {
      readTriage: async () => {
        throw new Error('triage.json corrupt');
      },
      writeTriage: async () => {
        triageWrites += 1;
      },
    },
  });

  const result = await run(deps);

  assert.equal(result.skipped, true);
  assert.deepEqual(result.errors, ['triage store: triage.json corrupt']);
  assert.equal(state.judgeCalls.length, 0);
  assert.equal(state.prepareCalls.length, 0);
  assert.equal(triageWrites, 0);
  assert.equal(state.upserts.length, 0);
  assert.equal(state.meta.length, 1);
  assert.equal(state.meta[0]!.triage!.skipped, true);
  assert.deepEqual(state.meta[0]!.triage!.errors, ['triage store: triage.json corrupt']);
});

test('an unexpected error after the reads is recorded, the run is skipped, and meta is still written', async () => {
  let triageWrites = 0;
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('a', 'Tariff ruling hits steel imports')],
    overrides: {
      jevAvailable: () => {
        throw new Error('client lookup exploded');
      },
      writeTriage: async () => {
        triageWrites += 1;
      },
    },
  });

  const result = await run(deps);

  assert.equal(result.skipped, true);
  assert.deepEqual(result.errors, ['client lookup exploded']);
  assert.equal(result.candidates, 0);
  assert.deepEqual(result.keptIds, []);
  assert.equal(triageWrites, 0);
  assert.equal(state.meta.length, 1);
  assert.equal(state.meta[0]!.triage!.skipped, true);
  assert.deepEqual(state.meta[0]!.triage!.errors, ['client lookup exploded']);
});

test('a throwing judge is treated as a Jev failure: not_scored_error and counted', async () => {
  const title = 'Tariff talks collapse in Geneva overnight';
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('r', title, { sourceTier: 'primary' }), article('s', title)],
    overrides: {
      judge: async () => {
        throw new Error('socket hang up');
      },
    },
  });

  const result = await run(deps);

  assert.equal(result.skipped, false);
  assert.equal(result.jev.used, 1);
  assert.equal(result.jev.errors, 1);
  assert.ok(result.errors.includes('Jev: socket hang up'));
  for (const id of ['r', 's']) {
    assert.equal(state.store.records[id]!.reason, 'not_scored_error');
    assert.equal(state.store.records[id]!.final, false);
  }
  assert.equal(state.store.records.r!.stage, 'headline');
});

test('store-write errors are appended past the 5-error cap', async () => {
  const titles = [
    'Tariff ruling hits steel imports',
    'Senate debates tariff relief for farmers',
    'Port operators brace for tariff backlog',
    'Automakers lobby against tariff expansion',
    'Retailers warn of tariff price spikes',
    'Farm groups sue over tariff retaliation',
  ];
  const { deps } = harness({
    topics: [TARIFFS],
    articles: titles.map((t, i) => article(`t${i}`, t)),
    overrides: {
      judge: async (_stage, a) => ({ ok: false, error: `down ${a.id}` }),
      writeTriage: async () => {
        throw new Error('disk full');
      },
      updateMeta: async () => {
        throw new Error('meta locked');
      },
    },
  });

  const result = await run(deps);

  assert.equal(result.jev.errors, 6);
  assert.equal(result.errors.length, 7);
  assert.equal(result.errors.filter((e) => e.startsWith('Jev: ')).length, 5);
  assert.deepEqual(result.errors.slice(-2), ['triage write: disk full', 'meta write: meta locked']);
});

test('budget spent between headline and body keeps the story with bodyChecked false', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('a', 'Tariff ruling hits steel imports')],
    prepare: (a) => ({
      article: { ...a, bodyStatus: 'ok', bodyText: 'Full text.' },
      changed: true,
      dateIssue: null,
    }),
  });

  const result = await run(deps, { TRIAGE_JEV_BUDGET: '1' });

  assert.deepEqual(state.judgeCalls, [{ stage: 'headline', id: 'a' }]);
  assert.ok(result.jev.used <= result.jev.budget);
  assert.equal(result.jev.used, 1);
  const rec = state.store.records.a!;
  assert.equal(rec.status, 'kept');
  assert.equal(rec.bodyChecked, false);
  assert.equal(rec.stage, 'headline');
  assert.equal(rec.final, true);
});

test('TRIAGE_MAX_PROMOTIONS: after the representative and 2 alternates are clickbait, the 4th member is a duplicate and never judged', async () => {
  const title = 'Treasury announces sweeping tariff overhaul';
  const clickbait = { headline: { quality: { choice: 'clickbait' as const, confidence: 0.95 } } };
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: ['m1', 'm2', 'm3', 'm4'].map((id) => article(id, title)),
    script: { m1: clickbait, m2: clickbait, m3: clickbait },
  });

  const result = await run(deps);

  assert.deepEqual(state.judgeCalls.map((c) => c.id), ['m1', 'm2', 'm3']);
  for (const id of ['m1', 'm2', 'm3']) assert.equal(state.store.records[id]!.reason, 'clickbait');
  const fourth = state.store.records.m4!;
  assert.equal(fourth.reason, 'duplicate');
  assert.equal(fourth.duplicateOf, 'm1');
  assert.equal(fourth.jevCalls, 0);
  assert.equal(result.kept, 0);
  assert.deepEqual(result.byReason, { clickbait: 3, duplicate: 1 });
});

test('store write failures are caught into errors and never throw', async () => {
  const { deps, state } = harness({
    topics: [TARIFFS],
    articles: [article('a', 'Tariff ruling hits steel imports')],
    prepare: (a) => ({ article: a, changed: true, dateIssue: null }),
    overrides: {
      writeTriage: async () => {
        throw new Error('disk full');
      },
      upsertArticles: async () => {
        throw new Error('articles locked');
      },
      readMuteRules: async () => {
        throw new Error('mute rules corrupt');
      },
    },
  });

  const result = await run(deps);

  assert.equal(result.skipped, false);
  assert.deepEqual(result.keptIds, ['a']);
  assert.ok(result.errors.includes('mute rules: mute rules corrupt'));
  assert.ok(result.errors.includes('triage write: disk full'));
  assert.ok(result.errors.includes('article write: articles locked'));
  assert.equal(state.meta.length, 1);
});
