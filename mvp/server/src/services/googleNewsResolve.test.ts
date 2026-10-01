import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import {
  getCachedGoogleNewsUrl,
  putCachedGoogleNewsUrl,
  readGoogleNewsUrlCache,
} from '../store/googleNewsUrlCacheStore.js';
import { resolveGoogleNewsUrl } from './googleNewsResolve.js';
import { GOOGLE_RESOLVE_TIMEOUT_MS } from './topicSearchConfig.js';

const ARTICLE_ID = 'CBMiAbc123_def';
const GOOGLE_URL = `https://news.google.com/rss/articles/${ARTICLE_ID}?oc=5`;
const RESOLVED = 'https://www.reuters.com/world/iran-nuclear-talks-resume-2026-09-29/';

const ARTICLE_HTML = `<!doctype html><html><body>
<c-wiz jsrenderer="x"><div jscontroller="y" data-n-a-id="${ARTICLE_ID}" data-n-a-sg="SIG" data-n-a-ts="1700000000"></div></c-wiz>
</body></html>`;

function batchResponse(url: string): string {
  const inner = JSON.stringify(['garturlres', url, 1]);
  const envelopes = [
    ['wrb.fr', 'Fbv4je', inner, null, null, null, 'generic'],
    ['di', 42],
    ['af.httprm', 42, '-6379125391434133046', 1],
  ];
  return `)]}'\n\n${JSON.stringify(envelopes)}`;
}

type Call = { url: string; init?: RequestInit };

function fakeFetch(
  articleResponse: () => Response,
  batchResponseFn: () => Response,
): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('/_/DotsSplashUi/data/batchexecute')) return batchResponseFn();
    return articleResponse();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

function tempCachePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'google-news-resolve-'));
  return path.join(dir, 'google-news-url-cache.json');
}

function silenceWarn(t: TestContext): void {
  t.mock.method(console, 'warn', () => {});
}

test('resolveGoogleNewsUrl decodes via article page + batchexecute and caches the result', async (t) => {
  const timeoutMock = t.mock.method(AbortSignal, 'timeout');
  const cachePath = tempCachePath();
  const { calls, fetchImpl } = fakeFetch(
    () => new Response(ARTICLE_HTML, { status: 200 }),
    () => new Response(batchResponse(RESOLVED), { status: 200 }),
  );

  const url = await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl });

  assert.equal(url, RESOLVED);
  assert.equal(await getCachedGoogleNewsUrl(ARTICLE_ID, cachePath), RESOLVED);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, `https://news.google.com/articles/${ARTICLE_ID}`);
  assert.equal(
    new Headers(calls[0]?.init?.headers).get('user-agent'),
    'Mozilla/5.0 (compatible; InformedNews/1.0)',
  );

  assert.equal(calls[1]?.url, 'https://news.google.com/_/DotsSplashUi/data/batchexecute');
  assert.equal(calls[1]?.init?.method, 'POST');
  assert.equal(
    new Headers(calls[1]?.init?.headers).get('content-type'),
    'application/x-www-form-urlencoded;charset=UTF-8',
  );
  const body = String(calls[1]?.init?.body);
  assert.ok(body.startsWith('f.req='));
  const freq = decodeURIComponent(body.slice('f.req='.length));
  assert.ok(freq.includes('Fbv4je'));
  assert.ok(freq.includes('garturlreq'));
  assert.ok(freq.includes(ARTICLE_ID));
  assert.ok(freq.includes('1700000000'));
  assert.ok(freq.includes('SIG'));

  const [[[rpcId, inner, , mode]]] = JSON.parse(freq) as [[[string, string, null, string]]];
  assert.equal(rpcId, 'Fbv4je');
  assert.equal(mode, 'generic');
  assert.equal(
    inner,
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${ARTICLE_ID}",1700000000,"SIG"]`,
  );

  assert.equal(timeoutMock.mock.callCount(), 2);
  for (const call of timeoutMock.mock.calls) {
    assert.deepEqual(call.arguments, [GOOGLE_RESOLVE_TIMEOUT_MS]);
  }
});

test('resolveGoogleNewsUrl still returns the resolved URL when the cache write fails', async (t) => {
  if (process.getuid?.() === 0) {
    t.skip('root ignores directory permissions');
    return;
  }
  const warn = t.mock.method(console, 'warn', () => {});
  const cachePath = tempCachePath();
  const dir = path.dirname(cachePath);
  chmodSync(dir, 0o500);
  t.after(() => chmodSync(dir, 0o700));
  const { fetchImpl } = fakeFetch(
    () => new Response(ARTICLE_HTML, { status: 200 }),
    () => new Response(batchResponse(RESOLVED), { status: 200 }),
  );

  assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), RESOLVED);
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
  assert.equal(warn.mock.callCount(), 1);
  assert.match(String(warn.mock.calls[0]!.arguments[0]), /cache write failed/);
});

test('resolveGoogleNewsUrl returns a cached URL with no network call', async () => {
  const cachePath = tempCachePath();
  const { calls, fetchImpl } = fakeFetch(
    () => new Response(ARTICLE_HTML, { status: 200 }),
    () => new Response(batchResponse(RESOLVED), { status: 200 }),
  );

  assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), RESOLVED);
  assert.equal(calls.length, 2);

  assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), RESOLVED);
  assert.equal(calls.length, 2);
});

test('resolveGoogleNewsUrl uses a pre-seeded cache entry without fetching', async () => {
  const cachePath = tempCachePath();
  await putCachedGoogleNewsUrl(ARTICLE_ID, 'https://apnews.com/article/seeded', cachePath);
  const { calls, fetchImpl } = fakeFetch(
    () => new Response(ARTICLE_HTML, { status: 200 }),
    () => new Response(batchResponse(RESOLVED), { status: 200 }),
  );

  assert.equal(
    await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }),
    'https://apnews.com/article/seeded',
  );
  assert.equal(calls.length, 0);
});

test('resolveGoogleNewsUrl returns null for a non-Google URL without fetching', async () => {
  const cachePath = tempCachePath();
  const { calls, fetchImpl } = fakeFetch(
    () => new Response(ARTICLE_HTML, { status: 200 }),
    () => new Response(batchResponse(RESOLVED), { status: 200 }),
  );

  assert.equal(
    await resolveGoogleNewsUrl('https://www.reuters.com/world/x', { cachePath }, { fetch: fetchImpl }),
    null,
  );
  assert.equal(calls.length, 0);
});

test('resolveGoogleNewsUrl returns null and caches nothing when signature attributes are missing', async (t) => {
  silenceWarn(t);
  const cachePath = tempCachePath();
  const { calls, fetchImpl } = fakeFetch(
    () => new Response('<html><body><c-wiz><div data-n-a-id="x"></div></c-wiz></body></html>', { status: 200 }),
    () => new Response(batchResponse(RESOLVED), { status: 200 }),
  );

  assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
});

test('resolveGoogleNewsUrl returns null on a non-2xx article page', async (t) => {
  silenceWarn(t);
  const cachePath = tempCachePath();
  const { calls, fetchImpl } = fakeFetch(
    () => new Response('nope', { status: 429 }),
    () => new Response(batchResponse(RESOLVED), { status: 200 }),
  );

  assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), null);
  assert.equal(calls.length, 1);
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
});

test('resolveGoogleNewsUrl returns null on a non-2xx batchexecute response', async (t) => {
  silenceWarn(t);
  const cachePath = tempCachePath();
  const { fetchImpl } = fakeFetch(
    () => new Response(ARTICLE_HTML, { status: 200 }),
    () => new Response('nope', { status: 500 }),
  );

  assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), null);
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
});

test('resolveGoogleNewsUrl returns null on a garbage batchexecute body', async (t) => {
  silenceWarn(t);
  const cachePath = tempCachePath();
  for (const garbage of [
    'totally not json',
    `)]}'\n\n{not json`,
    `)]}'\n\n${JSON.stringify([['di', 42]])}`,
    `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', 'not json either']])}`,
    `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres'])]])}`,
  ]) {
    const { fetchImpl } = fakeFetch(
      () => new Response(ARTICLE_HTML, { status: 200 }),
      () => new Response(garbage, { status: 200 }),
    );
    assert.equal(
      await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }),
      null,
      garbage,
    );
  }
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
});

test('resolveGoogleNewsUrl returns null when fetch rejects', async (t) => {
  silenceWarn(t);
  const cachePath = tempCachePath();
  const fetchImpl = (async () => {
    throw new Error('network down');
  }) as typeof fetch;

  assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), null);
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
});

test('resolveGoogleNewsUrl rejects a resolved news.google.com or non-http URL', async (t) => {
  silenceWarn(t);
  const cachePath = tempCachePath();
  for (const bad of ['https://news.google.com/articles/CBMiLoop', 'javascript:alert(1)']) {
    const { fetchImpl } = fakeFetch(
      () => new Response(ARTICLE_HTML, { status: 200 }),
      () => new Response(batchResponse(bad), { status: 200 }),
    );
    assert.equal(await resolveGoogleNewsUrl(GOOGLE_URL, { cachePath }, { fetch: fetchImpl }), null, bad);
  }
  assert.deepEqual(await readGoogleNewsUrlCache(cachePath), { entries: {} });
});
