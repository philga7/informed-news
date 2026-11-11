import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';

import { createApp } from './app.js';
import { scrapePublisherBody } from './services/publisherBodyScrape.js';
import { scrapePublisherUrl } from './services/publisherScrape.js';

/** Docker healthcheck allows 5s; we require far less so a slow host still passes. */
const HEALTH_BUDGET_MS = 1_500;

/** Oversized, markup-heavy page: a synchronous parse of all of it blocks the event loop. */
function hugeHtml(): string {
  const para =
    '<p>Lorem ipsum dolor sit amet <a href="https://example.org/x">link</a> consectetur adipiscing elit.</p>';
  return `<html><head><title>t</title></head><body><article>${para.repeat(150_000)}</article></body></html>`;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      assert.ok(addr && typeof addr === 'object');
      resolve(addr.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

async function maxHealthLatencyDuring(
  work: () => Promise<unknown>,
): Promise<{ maxMs: number; statuses: number[] }> {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.MVP_PASSWORD = 'pw';
  delete process.env.MVP_PASSWORD_HASH;

  const api = createApp({
    refreshRunner: {
      isRunning: () => false,
      run: async (): Promise<never> => {
        throw new Error('unused');
      },
    },
  });
  const apiServer = api.listen(0, '127.0.0.1') as Server;
  await new Promise<void>((r) => apiServer.once('listening', () => r()));
  const apiAddr = apiServer.address();
  assert.ok(apiAddr && typeof apiAddr === 'object');

  let done = false;
  let maxMs = 0;
  const statuses: number[] = [];
  const poller = (async () => {
    while (!done) {
      const started = Date.now();
      const res = await fetch(`http://127.0.0.1:${apiAddr.port}/healthz`);
      statuses.push(res.status);
      await res.text();
      maxMs = Math.max(maxMs, Date.now() - started);
      await new Promise((r) => setTimeout(r, 10));
    }
  })();

  try {
    await new Promise((r) => setTimeout(r, 50));
    await work();
  } finally {
    done = true;
    await poller;
    await close(apiServer);
  }
  return { maxMs, statuses };
}

async function withHugePage<T>(run: (url: string) => Promise<T>): Promise<T> {
  const html = hugeHtml();
  const fixture = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  const port = await listen(fixture);
  try {
    return await run(`http://127.0.0.1:${port}/a`);
  } finally {
    await close(fixture);
  }
}

test('healthz stays responsive while scrapePublisherBody parses a huge page', async () => {
  await withHugePage(async (url) => {
    const { maxMs, statuses } = await maxHealthLatencyDuring(() =>
      scrapePublisherBody(url, { timeoutMs: 60_000 }),
    );
    assert.ok(statuses.length > 0);
    assert.ok(statuses.every((s) => s === 200));
    assert.ok(maxMs < HEALTH_BUDGET_MS, `health latency ${maxMs}ms >= ${HEALTH_BUDGET_MS}ms`);
  });
});

test('healthz stays responsive while scrapePublisherUrl parses a huge page', async () => {
  await withHugePage(async (url) => {
    const { maxMs, statuses } = await maxHealthLatencyDuring(() =>
      scrapePublisherUrl(url, 'citizenfreepress.com', { timeoutMs: 60_000 }),
    );
    assert.ok(statuses.length > 0);
    assert.ok(statuses.every((s) => s === 200));
    assert.ok(maxMs < HEALTH_BUDGET_MS, `health latency ${maxMs}ms >= ${HEALTH_BUDGET_MS}ms`);
  });
});
