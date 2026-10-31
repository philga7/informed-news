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
): Promise<void> {
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
): Promise<{ setCookie: string; cookie: string; body: unknown }> {
  const resp = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extra },
    body: JSON.stringify({ password: 'pw' }),
  });
  assert.equal(resp.status, 200);
  const cookies = resp.headers.getSetCookie();
  const setCookie = cookies.find((c) => c.startsWith('mvp_session=')) ?? '';
  const cookie = cookies.map((c) => c.split(';')[0]!).join('; ');
  return { setCookie, cookie, body: await resp.json() };
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
    assert.match(setCookie, /;\s*httponly/i);
    assert.doesNotMatch(setCookie, /;\s*secure/i);
    const topics = await fetch(`${baseUrl}/api/topics`, { headers: { cookie } });
    assert.notEqual(topics.status, 401);
  });
});
