import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { CreateAppDeps } from './app.js';
import {
  createFeedback,
  readFeedback,
  removeFeedback,
  updateFeedback,
} from './store/feedbackStore.js';
import { readMuteRules } from './store/muteRulesStore.js';
import type { Article } from './types/article.js';
import type { TriageRecord, TriageStore } from './types/triage.js';

function tempFeedbackPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'feedback-routes-'));
  return path.join(dir, 'feedback.json');
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    title: 'Senate advances the bill',
    sourceKind: 'rss',
    canonicalUrl: 'https://news.example/senate',
    citations: [],
    publisherUrl: 'https://reuters.com/senate-bill',
    publisherDomain: 'www.Reuters.com',
    handle: null,
    publishedAt: '2026-11-01T12:00:00.000Z',
    snippet: '',
    bodyText: null,
    bodyStatus: 'pending',
    publisherTitle: 'Publisher headline',
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    clusterId: null,
    fetchedAt: '2026-11-01T12:00:00.000Z',
    classification: null,
    classifiedAt: null,
    classifyError: null,
    topicIds: ['search-topic'],
    ...overrides,
  };
}

function triageRecord(articleId: string, topicIds: string[]): TriageRecord {
  return {
    articleId,
    status: 'kept',
    reason: null,
    stage: 'body',
    final: true,
    topicIds,
    labels: [],
    duplicateOf: null,
    memberIds: [],
    outletCount: 1,
    significance: null,
    bodyChecked: true,
    jevCalls: 1,
    triagedAt: '2026-11-01T12:00:00.000Z',
  };
}

async function startServer(app: { listen: (...args: any[]) => Server }): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object' && typeof address.port === 'number');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function login(baseUrl: string): Promise<string> {
  const resp = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'pw' }),
  });
  assert.equal(resp.status, 200);
  const anyHeaders = resp.headers as unknown as {
    getSetCookie?: () => string[];
    get: (key: string) => string | null;
  };
  const setCookies =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : (() => {
          const single = anyHeaders.get('set-cookie');
          return single ? [single] : [];
        })();
  assert.ok(setCookies.length >= 1);
  return setCookies.map((cookie) => cookie.split(';')[0]!).join('; ');
}

type FeedbackBody = {
  ok: boolean;
  error?: string;
  replaced?: boolean;
  entry?: {
    id: string;
    itemId: string;
    signal: string;
    comment: string;
    ts: string;
    snapshot: {
      headline: string;
      source: string;
      url: string;
      topics: Array<{ id: string; name: string }>;
    };
  };
  entries?: Array<{ id: string; itemId: string; signal: string; ts: string }>;
  updatedAt?: string | null;
  removed?: boolean;
};

async function startFeedbackApp(options: {
  articles?: Article[];
  topicIdsByArticle?: Record<string, string[]>;
  topicNames?: ReadonlyMap<string, string>;
} = {}): Promise<{ baseUrl: string; close: () => Promise<void>; feedbackPath: string }> {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const feedbackPath = tempFeedbackPath();
  const articles = options.articles ?? [article()];
  const byId = new Map(articles.map((item) => [item.id, item]));
  const topicIdsByArticle = options.topicIdsByArticle ?? { 'article-1': ['congress'] };
  const topicNames = options.topicNames ?? new Map([['congress', 'Congress']]);
  const triage: TriageStore = {
    records: Object.fromEntries(
      Object.entries(topicIdsByArticle).map(([articleId, topicIds]) => [
        articleId,
        triageRecord(articleId, topicIds),
      ]),
    ),
    updatedAt: null,
  };

  const deps: CreateAppDeps = {
    getArticleById: async (id) => byId.get(id) ?? null,
    readTriage: async () => triage,
    readFeedback: async () => readFeedback(feedbackPath),
    createFeedback: async (input) => createFeedback(input, feedbackPath),
    updateFeedback: async (id, patch) => updateFeedback(id, patch, feedbackPath),
    removeFeedback: async (id) => removeFeedback(id, feedbackPath),
    feedbackTopicNames: async (ids) => {
      const names = new Map<string, string>();
      for (const id of ids) {
        const name = topicNames.get(id);
        if (name) names.set(id, name);
      }
      return names;
    },
    readMuteRules: async () => readMuteRules(path.join(path.dirname(feedbackPath), 'mute-rules.json')),
  };

  const { createApp } = await import('./app.js');
  const started = await startServer(createApp(deps));
  return { ...started, feedbackPath };
}

async function postFeedback(baseUrl: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/feedback`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST/GET/PATCH/DELETE /api/feedback creates, lists newest first, edits, and deletes', async () => {
  const older = article({ id: 'older', title: 'Older headline', publisherDomain: 'apnews.com' });
  const newer = article({ id: 'newer', title: 'Newer headline' });
  const { baseUrl, close } = await startFeedbackApp({
    articles: [older, newer],
    topicIdsByArticle: { older: ['congress'], newer: ['congress', 'congress'] },
  });
  try {
    const cookie = await login(baseUrl);
    const first = await postFeedback(baseUrl, cookie, {
      itemId: 'older',
      signal: 'like',
      comment: '  keep this  ',
    });
    assert.equal(first.status, 201);
    const firstBody = (await first.json()) as FeedbackBody;
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.replaced, false);
    assert.equal(firstBody.entry?.itemId, 'older');
    assert.equal(firstBody.entry?.signal, 'like');
    assert.equal(firstBody.entry?.comment, 'keep this');
    assert.equal(firstBody.entry?.snapshot.headline, 'Older headline');
    assert.equal(firstBody.entry?.snapshot.source, 'apnews.com');
    assert.equal(firstBody.entry?.snapshot.url, 'https://reuters.com/senate-bill');
    assert.deepEqual(firstBody.entry?.snapshot.topics, [{ id: 'congress', name: 'Congress' }]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await postFeedback(baseUrl, cookie, {
      itemId: 'newer',
      signal: 'not_relevant',
    });
    assert.equal(second.status, 201);
    const secondBody = (await second.json()) as FeedbackBody;
    assert.equal(secondBody.entry?.comment, '');
    assert.equal(secondBody.entry?.snapshot.headline, 'Newer headline');
    assert.equal(secondBody.entry?.snapshot.source, 'reuters.com');
    assert.deepEqual(secondBody.entry?.snapshot.topics, [{ id: 'congress', name: 'Congress' }]);

    const list = await fetch(`${baseUrl}/api/feedback`, { headers: { cookie } });
    assert.equal(list.status, 200);
    const listed = (await list.json()) as FeedbackBody;
    assert.deepEqual(
      listed.entries?.map((entry) => entry.itemId),
      ['newer', 'older'],
    );

    const edited = await fetch(`${baseUrl}/api/feedback/${firstBody.entry?.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        signal: 'not_relevant',
        comment: 'soft no',
        itemId: 'newer',
      }),
    });
    assert.equal(edited.status, 200);
    const editedBody = (await edited.json()) as FeedbackBody;
    assert.equal(editedBody.entry?.id, firstBody.entry?.id);
    assert.equal(editedBody.entry?.itemId, 'older');
    assert.equal(editedBody.entry?.signal, 'not_relevant');
    assert.equal(editedBody.entry?.comment, 'soft no');
    assert.equal(editedBody.entry?.ts, firstBody.entry?.ts);
    assert.equal(editedBody.entry?.snapshot.headline, 'Older headline');

    const deleted = await fetch(`${baseUrl}/api/feedback/${secondBody.entry?.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    assert.equal(deleted.status, 200);
    const deletedBody = (await deleted.json()) as FeedbackBody;
    assert.equal(deletedBody.removed, true);
    assert.deepEqual(
      deletedBody.entries?.map((entry) => entry.itemId),
      ['older'],
    );
  } finally {
    await close();
  }
});

test('POST /api/feedback returns 400 for a bad signal or a comment over 500 characters', async () => {
  const { baseUrl, close } = await startFeedbackApp();
  try {
    const cookie = await login(baseUrl);
    const badSignal = await postFeedback(baseUrl, cookie, { itemId: 'article-1', signal: 'mute' });
    assert.equal(badSignal.status, 400);
    const badSignalBody = (await badSignal.json()) as FeedbackBody;
    assert.equal(badSignalBody.ok, false);
    assert.match(badSignalBody.error ?? '', /signal/);

    const tooLong = await postFeedback(baseUrl, cookie, {
      itemId: 'article-1',
      signal: 'like',
      comment: 'x'.repeat(501),
    });
    assert.equal(tooLong.status, 400);
    assert.match(((await tooLong.json()) as FeedbackBody).error ?? '', /500/);

    const max = await postFeedback(baseUrl, cookie, {
      itemId: 'article-1',
      signal: 'like',
      comment: 'y'.repeat(500),
    });
    assert.equal(max.status, 201);
    const maxBody = (await max.json()) as FeedbackBody;
    assert.equal(maxBody.entry?.comment.length, 500);

    const patched = await fetch(`${baseUrl}/api/feedback/${maxBody.entry?.id}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ comment: 'z'.repeat(501) }),
    });
    assert.equal(patched.status, 400);
    assert.match(((await patched.json()) as FeedbackBody).error ?? '', /500/);

    const missing = await postFeedback(baseUrl, cookie, { signal: 'like' });
    assert.equal(missing.status, 400);
  } finally {
    await close();
  }
});

test('feedback routes return 404 for an unknown itemId or feedback id', async () => {
  const { baseUrl, close } = await startFeedbackApp();
  try {
    const cookie = await login(baseUrl);
    const missingItem = await postFeedback(baseUrl, cookie, {
      itemId: 'missing',
      signal: 'like',
    });
    assert.equal(missingItem.status, 404);
    const missingItemBody = (await missingItem.json()) as FeedbackBody;
    assert.equal(missingItemBody.ok, false);
    assert.match(missingItemBody.error ?? '', /item/);

    const created = await postFeedback(baseUrl, cookie, { itemId: 'article-1', signal: 'like' });
    assert.equal(created.status, 201);

    const patch = await fetch(`${baseUrl}/api/feedback/missing`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ comment: 'nope' }),
    });
    assert.equal(patch.status, 404);

    const deleted = await fetch(`${baseUrl}/api/feedback/missing`, {
      method: 'DELETE',
      headers: { cookie },
    });
    assert.equal(deleted.status, 404);
  } finally {
    await close();
  }
});

test('a second POST for the same item replaces the stored entry', async () => {
  const { baseUrl, close } = await startFeedbackApp();
  try {
    const cookie = await login(baseUrl);
    const first = await postFeedback(baseUrl, cookie, { itemId: 'article-1', signal: 'like' });
    const firstBody = (await first.json()) as FeedbackBody;
    const second = await postFeedback(baseUrl, cookie, {
      itemId: 'article-1',
      signal: 'not_relevant',
      comment: 'no',
    });
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as FeedbackBody;
    assert.equal(secondBody.replaced, true);
    assert.notEqual(secondBody.entry?.id, firstBody.entry?.id);
    assert.equal(secondBody.entries?.length, 1);
    assert.equal(secondBody.entries?.[0]?.signal, 'not_relevant');
  } finally {
    await close();
  }
});

test('Not relevant does not create a mute rule', async () => {
  const { baseUrl, close, feedbackPath } = await startFeedbackApp();
  try {
    const cookie = await login(baseUrl);
    const created = await postFeedback(baseUrl, cookie, {
      itemId: 'article-1',
      signal: 'not_relevant',
      comment: 'not this story',
    });
    assert.equal(created.status, 201);
    const mutes = await fetch(`${baseUrl}/api/brief/mutes`, { headers: { cookie } });
    assert.equal(mutes.status, 200);
    const muteBody = (await mutes.json()) as { ok: true; rules: unknown[] };
    assert.deepEqual(muteBody.rules, []);
    const stored = await readFeedback(feedbackPath);
    assert.equal(stored.entries[0]?.signal, 'not_relevant');
  } finally {
    await close();
  }
});

test('feedback routes require a session', async () => {
  const { baseUrl, close } = await startFeedbackApp();
  try {
    const resp = await fetch(`${baseUrl}/api/feedback`);
    assert.equal(resp.status, 401);
  } finally {
    await close();
  }
});

test('a story with no triage record snapshots its article topics and source kind', async () => {
  const bare = article({
    id: 'bare',
    title: '  ',
    publisherTitle: 'Fallback headline',
    publisherDomain: null,
    publisherUrl: null,
    sourceKind: 'manual',
    topicIds: ['search-topic'],
  });
  const { baseUrl, close } = await startFeedbackApp({
    articles: [bare],
    topicIdsByArticle: {},
    topicNames: new Map([['search-topic', 'Search topic']]),
  });
  try {
    const cookie = await login(baseUrl);
    const created = await postFeedback(baseUrl, cookie, { itemId: 'bare', signal: 'like' });
    assert.equal(created.status, 201);
    const body = (await created.json()) as FeedbackBody;
    assert.equal(body.entry?.snapshot.headline, 'Fallback headline');
    assert.equal(body.entry?.snapshot.source, 'manual');
    assert.equal(body.entry?.snapshot.url, 'https://news.example/senate');
    assert.deepEqual(body.entry?.snapshot.topics, [{ id: 'search-topic', name: 'Search topic' }]);
  } finally {
    await close();
  }
});
