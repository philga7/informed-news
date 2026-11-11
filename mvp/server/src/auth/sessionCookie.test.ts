import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import type { IncomingMessage, Server } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';

import { DATA_DIR } from '../store/paths.js';
import { sessionCookieShouldBeSecure } from './sessionCookie.js';

function fakeReq(remoteAddress: string, proto?: string): IncomingMessage {
  return {
    socket: { remoteAddress },
    headers: proto === undefined ? {} : { 'x-forwarded-proto': proto },
  } as unknown as IncomingMessage;
}

test('sessionCookieShouldBeSecure: public peer is never trusted', () => {
  assert.equal(sessionCookieShouldBeSecure(fakeReq('203.0.113.5', 'https')), false);
});

test('sessionCookieShouldBeSecure: private peer with https is secure', () => {
  assert.equal(sessionCookieShouldBeSecure(fakeReq('172.18.0.2', 'https')), true);
  assert.equal(sessionCookieShouldBeSecure(fakeReq('::ffff:172.18.0.2', 'https')), true);
  assert.equal(sessionCookieShouldBeSecure(fakeReq('fd12::1', 'https')), true);
  assert.equal(sessionCookieShouldBeSecure(fakeReq('::1', 'https')), true);
});

test('sessionCookieShouldBeSecure: no header is not secure', () => {
  assert.equal(sessionCookieShouldBeSecure(fakeReq('172.18.0.2')), false);
});

test('sessionCookieShouldBeSecure: only the first token counts', () => {
  assert.equal(sessionCookieShouldBeSecure(fakeReq('172.18.0.2', 'http, https')), false);
});

test('sessionCookieShouldBeSecure: case-insensitive https', () => {
  assert.equal(sessionCookieShouldBeSecure(fakeReq('172.18.0.2', 'HTTPS')), true);
});

async function withApp(
  run: (baseUrl: string) => Promise<void>,
  options?: { cookieName?: string },
): Promise<void> {
  const previousCookieName = process.env.SESSION_COOKIE_NAME;
  if (options?.cookieName === undefined) delete process.env.SESSION_COOKIE_NAME;
  else process.env.SESSION_COOKIE_NAME = options.cookieName;
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;
  const { createApp } = await import('../app.js');
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    if (previousCookieName === undefined) delete process.env.SESSION_COOKIE_NAME;
    else process.env.SESSION_COOKIE_NAME = previousCookieName;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    // GET /api/topics seeds topics.json on first read. The temp-dir net fails the run if it remains.
    await rm(path.join(DATA_DIR, 'topics.json'), { force: true });
  }
}

async function login(
  baseUrl: string,
  extra: Record<string, string>,
  cookieName = 'mvp_session',
): Promise<{ setCookie: string; cookie: string; body: unknown }> {
  const resp = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extra },
    body: JSON.stringify({ password: 'pw' }),
  });
  assert.equal(resp.status, 200);
  const cookies = resp.headers.getSetCookie();
  const setCookie = cookies.find((c) => c.startsWith(`${cookieName}=`)) ?? '';
  const cookie = cookies.map((c) => c.split(';')[0]!).join('; ');
  return { setCookie, cookie, body: await resp.json() };
}

async function topicsStatus(baseUrl: string, cookie: string): Promise<number> {
  const resp = await fetch(`${baseUrl}/api/topics`, { headers: { cookie } });
  return resp.status;
}

test('login behind https proxy sets a Secure HttpOnly cookie that authenticates', async () => {
  await withApp(async (baseUrl) => {
    const { setCookie, cookie, body } = await login(baseUrl, { 'x-forwarded-proto': 'https' });
    assert.deepEqual(body, { ok: true });
    assert.match(setCookie, /;\s*secure/i);
    assert.match(setCookie, /;\s*httponly/i);
    const topics = await fetch(`${baseUrl}/api/topics`, { headers: { cookie } });
    assert.notEqual(topics.status, 401);
    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
    const fetchResp = await fetch(`${baseUrl}/api/fetch`, { method: 'POST' });
    assert.equal(fetchResp.status, 401);
  });
});

test('plain http login sets HttpOnly cookie without Secure', async () => {
  await withApp(async (baseUrl) => {
    const { setCookie, cookie } = await login(baseUrl, {});
    assert.match(setCookie, /^mvp_session=/);
    assert.match(setCookie, /;\s*httponly/i);
    assert.doesNotMatch(setCookie, /;\s*secure/i);
    const topics = await fetch(`${baseUrl}/api/topics`, { headers: { cookie } });
    assert.notEqual(topics.status, 401);
  });
});

test('blank SESSION_COOKIE_NAME still uses mvp_session', async () => {
  await withApp(async (baseUrl) => {
    const { setCookie } = await login(baseUrl, {});
    assert.match(setCookie, /^mvp_session=/);
  }, { cookieName: '   ' });
});

test('login with a custom session cookie name authenticates', async () => {
  await withApp(async (baseUrl) => {
    const { setCookie, cookie, body } = await login(baseUrl, {}, 'mvp_qa_session');
    assert.deepEqual(body, { ok: true });
    assert.match(setCookie, /^mvp_qa_session=/);
    assert.doesNotMatch(setCookie, /^mvp_session=/);
    assert.notEqual(await topicsStatus(baseUrl, cookie), 401);
  }, { cookieName: 'mvp_qa_session' });
});

test('login on one cookie name leaves the other instance signed in', async () => {
  await withApp(async (liveUrl) => {
    await withApp(async (qaUrl) => {
      const live = await login(liveUrl, {}, 'mvp_session');
      const qa = await login(qaUrl, {}, 'mvp_qa_session');
      assert.match(live.setCookie, /^mvp_session=/);
      assert.match(qa.setCookie, /^mvp_qa_session=/);

      assert.notEqual(await topicsStatus(liveUrl, live.cookie), 401);
      assert.notEqual(await topicsStatus(qaUrl, qa.cookie), 401);
      assert.equal(await topicsStatus(qaUrl, live.cookie), 401);
      assert.equal(await topicsStatus(liveUrl, qa.cookie), 401);

      const liveAgain = await login(liveUrl, {}, 'mvp_session');
      assert.notEqual(await topicsStatus(qaUrl, qa.cookie), 401);
      assert.notEqual(await topicsStatus(liveUrl, liveAgain.cookie), 401);
      const qaAgain = await login(qaUrl, {}, 'mvp_qa_session');
      assert.notEqual(await topicsStatus(liveUrl, liveAgain.cookie), 401);
      assert.notEqual(await topicsStatus(qaUrl, qaAgain.cookie), 401);
    }, { cookieName: 'mvp_qa_session' });
  });
});
