import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { scrapePublisherUrl } from './publisherScrape.js';
import { USER_AGENT } from './userAgent.js';

const CFP_HTML = `<!doctype html>
<html>
<body>
  <article>
    <p>Aggregator blurb</p>
    <a href="https://publisher.example.com/story">Original</a>
  </article>
</body>
</html>`;

test('scrapePublisherUrl returns the first external link in article content', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(CFP_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const found = await scrapePublisherUrl(`http://127.0.0.1:${port}/cfp`, '127.0.0.1');
    assert.equal(found, 'https://publisher.example.com/story');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('scrapePublisherUrl sends the shared InformedNews User-Agent', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let seenUa: string | null = null;
  const server = createServer((req, res) => {
    seenUa = req.headers['user-agent'] ?? null;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(CFP_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await scrapePublisherUrl(`http://127.0.0.1:${port}/cfp`, '127.0.0.1');
    assert.equal(seenUa, USER_AGENT);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('scrapePublisherUrl: a server that never responds returns null within timeoutMs, with one request', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let requests = 0;
  const server = createServer(() => {
    requests += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  let guard: NodeJS.Timeout | undefined;
  const started = Date.now();
  try {
    const result = await Promise.race([
      scrapePublisherUrl(`http://127.0.0.1:${port}/hangs`, '127.0.0.1', {
        timeoutMs: 150,
      }),
      new Promise<'guard'>((resolve) => {
        guard = setTimeout(() => resolve('guard'), 2_000);
      }),
    ]);
    const elapsed = Date.now() - started;
    assert.notEqual(result, 'guard', 'scrape hung past the 2 s guard');
    assert.equal(result, null);
    assert.ok(elapsed < 1_000, `settled in ${elapsed} ms`);
    assert.equal(requests, 1);
  } finally {
    clearTimeout(guard);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('scrapePublisherUrl: a body that stalls after the headers returns null within timeoutMs, with one request', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let requests = 0;
  const server = createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write('<html><body><p>Partial');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  let guard: NodeJS.Timeout | undefined;
  const started = Date.now();
  try {
    const result = await Promise.race([
      scrapePublisherUrl(`http://127.0.0.1:${port}/stalls`, '127.0.0.1', {
        timeoutMs: 150,
      }),
      new Promise<'guard'>((resolve) => {
        guard = setTimeout(() => resolve('guard'), 2_000);
      }),
    ]);
    const elapsed = Date.now() - started;
    assert.notEqual(result, 'guard', 'scrape hung past the 2 s guard');
    assert.equal(result, null);
    assert.ok(elapsed < 1_000, `settled in ${elapsed} ms`);
    assert.equal(requests, 1);
  } finally {
    clearTimeout(guard);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
