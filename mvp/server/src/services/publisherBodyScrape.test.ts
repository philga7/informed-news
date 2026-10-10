import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import {
  extractPublisherBodyFromHtml,
  isBlockedPublisherHost,
  scrapePublisherBody,
  type PublisherBodyResult,
} from './publisherBodyScrape.js';

const ARTICLE_HTML = `<!doctype html>
<html>
<head>
  <meta property="og:title" content="Publisher Story Title" />
  <title>Ignored Title</title>
</head>
<body>
  <nav>Home Politics Sports</nav>
  <article>
    <h1>Publisher Story Title</h1>
    <p>${'The committee voted after a long debate about the measure. '.repeat(8)}</p>
    <p>${'Supporters said the bill would expand access while critics warned of costs. '.repeat(6)}</p>
  </article>
  <footer>Copyright 2026</footer>
</body>
</html>`;

const PAYWALL_HTML = `<!doctype html>
<html>
<head><title>Exclusive Report</title></head>
<body>
  <main>
    <p>Subscribe to continue reading this article.</p>
    <p>Already a subscriber? Sign in to read.</p>
  </main>
</body>
</html>`;

const EMPTY_HTML = `<!doctype html>
<html><head><title>Empty</title></head>
<body><main><p>Hi</p></main></body></html>`;

test('extracts og:title and article body text', () => {
  const result = extractPublisherBodyFromHtml(ARTICLE_HTML);
  assert.equal(result.bodyStatus, 'ok');
  assert.equal(result.publisherTitle, 'Publisher Story Title');
  assert.ok(result.bodyText && result.bodyText.length >= 200);
  assert.match(result.bodyText!, /committee voted/);
  assert.doesNotMatch(result.bodyText!, /Home Politics Sports/);
  assert.equal(result.imageUrl, null);
  assert.equal(result.imageCaption, null);
  assert.equal(result.imageCredit, null);
});

test('marks short paywall pages as blocked', () => {
  const result = extractPublisherBodyFromHtml(PAYWALL_HTML);
  assert.equal(result.bodyStatus, 'blocked');
  assert.equal(result.bodyText, null);
  assert.equal(result.publisherTitle, 'Exclusive Report');
  assert.equal(result.imageUrl, null);
});

test('marks empty/boilerplate pages as unavailable', () => {
  const result = extractPublisherBodyFromHtml(EMPTY_HTML);
  assert.equal(result.bodyStatus, 'unavailable');
  assert.equal(result.bodyText, null);
  assert.equal(result.imageUrl, null);
});

test('extracts og:image + og:image:alt', () => {
  const html = `<!doctype html>
  <html>
  <head>
    <meta property="og:title" content="Story" />
    <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
    <meta property="og:image:alt" content="A hero image" />
  </head>
  <body>
    <article><p>${'Text '.repeat(300)}</p></article>
  </body>
  </html>`;

  const result = extractPublisherBodyFromHtml(html, 'https://publisher.example.com/story');
  assert.equal(result.bodyStatus, 'ok');
  assert.equal(result.imageUrl, 'https://cdn.example.com/hero.jpg');
  assert.equal(result.imageCaption, 'A hero image');
  assert.equal(result.imageCredit, 'publisher.example.com');
});

test('does not infer image credit from image host without baseUrl', () => {
  const html = `<!doctype html>
  <html>
  <head>
    <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
  </head>
  <body>
    <article><p>${'Text '.repeat(300)}</p></article>
  </body>
  </html>`;

  const result = extractPublisherBodyFromHtml(html);
  assert.equal(result.imageUrl, 'https://cdn.example.com/hero.jpg');
  assert.equal(result.imageCredit, null);
});

test('falls back to twitter:image when og:image missing', () => {
  const html = `<!doctype html>
  <html>
  <head>
    <meta name="twitter:image" content="https://images.example.com/tw.jpg" />
    <meta name="twitter:image:alt" content="Twitter alt" />
  </head>
  <body>
    <main><p>${'Text '.repeat(300)}</p></main>
  </body>
  </html>`;

  const result = extractPublisherBodyFromHtml(html, 'https://publisher.example.com/story');
  assert.equal(result.imageUrl, 'https://images.example.com/tw.jpg');
  assert.equal(result.imageCaption, 'Twitter alt');
  assert.equal(result.imageCredit, 'publisher.example.com');
});

test('resolves relative image URLs when baseUrl provided', () => {
  const html = `<!doctype html>
  <html>
  <head>
    <meta property="og:image" content="/img/hero.jpg" />
  </head>
  <body>
    <article><p>${'Text '.repeat(300)}</p></article>
  </body>
  </html>`;

  const result = extractPublisherBodyFromHtml(html, 'https://publisher.example.com/story/page');
  assert.equal(result.imageUrl, 'https://publisher.example.com/img/hero.jpg');
  assert.equal(result.imageCredit, 'publisher.example.com');
});

test('drops relative image URLs when baseUrl missing', () => {
  const html = `<!doctype html>
  <html>
  <head>
    <meta property="og:image" content="/img/hero.jpg" />
  </head>
  <body>
    <article><p>${'Text '.repeat(300)}</p></article>
  </body>
  </html>`;

  const result = extractPublisherBodyFromHtml(html);
  assert.equal(result.imageUrl, null);
  assert.equal(result.imageCaption, null);
  assert.equal(result.imageCredit, null);
});

test('extracts image meta even when page is paywalled/blocked', () => {
  const html = `<!doctype html>
  <html>
  <head>
    <title>Exclusive Report</title>
    <meta property="og:image" content="https://cdn.example.com/paywall.jpg" />
  </head>
  <body>
    <main>
      <p>Subscribe to continue reading this article.</p>
      <p>Already a subscriber? Sign in to read.</p>
    </main>
  </body>
  </html>`;

  const result = extractPublisherBodyFromHtml(html, 'https://publisher.example.com/exclusive');
  assert.equal(result.bodyStatus, 'blocked');
  assert.equal(result.bodyText, null);
  assert.equal(result.imageUrl, 'https://cdn.example.com/paywall.jpg');
  assert.equal(result.imageCredit, 'publisher.example.com');
});

test('scrapePublisherBody extracts image meta on blocked HTTP responses', async () => {
  const prev = globalThis.fetch;
  try {
    const html = `<!doctype html>
    <html>
    <head>
      <meta property="og:image" content="https://cdn.example.com/blocked.jpg" />
      <meta property="og:image:alt" content="Blocked alt" />
      <title>Blocked Page</title>
    </head>
    <body><main><p>Please sign in</p></main></body>
    </html>`;

    globalThis.fetch = (async () =>
      ({
        status: 403,
        ok: false,
        text: async () => html,
      }) as unknown as Response) as typeof fetch;

    const result = await scrapePublisherBody('https://publisher.example.com/blocked');
    assert.equal(result.bodyStatus, 'blocked');
    assert.equal(result.bodyText, null);
    assert.equal(result.imageUrl, 'https://cdn.example.com/blocked.jpg');
    assert.equal(result.imageCaption, 'Blocked alt');
    assert.equal(result.imageCredit, 'publisher.example.com');
    assert.equal(result.publisherTitle, 'Blocked Page');
    assert.equal(result.publishedAt, null);
  } finally {
    globalThis.fetch = prev;
  }
});

test('scrapePublisherBody keeps the parsed page date on blocked HTTP responses', async () => {
  const prev = globalThis.fetch;
  try {
    const html = `<!doctype html><html><head><title>Members only</title>
      <meta property="article:published_time" content="2026-09-30T02:00:00Z" /></head>
      <body><main><p>Please sign in</p></main></body></html>`;
    globalThis.fetch = (async () =>
      ({ status: 402, ok: false, text: async () => html }) as unknown as Response) as typeof fetch;
    const result = await scrapePublisherBody('https://publisher.example.com/members');
    assert.equal(result.bodyStatus, 'blocked');
    assert.equal(result.bodyText, null);
    assert.equal(result.publishedAt, '2026-09-30T02:00:00.000Z');
  } finally {
    globalThis.fetch = prev;
  }
});

function pageWithHead(head: string, body = ''): string {
  return `<!doctype html>
  <html>
  <head><title>Dated Story</title>${head}</head>
  <body>${body}<article><p>${'Text '.repeat(300)}</p></article></body>
  </html>`;
}

test('publishedAt is null when the page has no date metadata', () => {
  assert.equal(extractPublisherBodyFromHtml(ARTICLE_HTML).publishedAt, null);
});

test('publishedAt reads article:published_time and normalizes to ISO', () => {
  const html = pageWithHead(
    '<meta property="article:published_time" content="2026-09-30T08:15:00-04:00" />',
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-30T12:15:00.000Z');
});

test('publishedAt reads og:article:published_time', () => {
  const html = pageWithHead(
    '<meta property="og:article:published_time" content="2026-09-29T10:00:00Z" />',
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-29T10:00:00.000Z');
});

test('publishedAt reads meta itemprop datePublished', () => {
  const html = pageWithHead('<meta itemprop="datePublished" content="2026-09-28T09:30:00Z" />');
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-28T09:30:00.000Z');
});

for (const name of ['pubdate', 'publishdate', 'date', 'dc.date', 'DC.date']) {
  test(`publishedAt reads meta name="${name}"`, () => {
    const html = pageWithHead(`<meta name="${name}" content="2026-09-27T07:00:00Z" />`);
    assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-27T07:00:00.000Z');
  });
}

test('publishedAt reads JSON-LD datePublished from an object', () => {
  const html = pageWithHead(
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'NewsArticle',
      datePublished: '2026-09-26T06:00:00Z',
    })}</script>`,
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-26T06:00:00.000Z');
});

test('publishedAt reads JSON-LD datePublished from an array element', () => {
  const html = pageWithHead(
    `<script type="application/ld+json">${JSON.stringify([
      { '@type': 'Organization', name: 'Example' },
      { '@type': 'NewsArticle', datePublished: '2026-09-25T05:00:00Z' },
    ])}</script>`,
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-25T05:00:00.000Z');
});

test('publishedAt reads JSON-LD datePublished from an @graph entry', () => {
  const html = pageWithHead(
    `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage' },
        { '@type': 'NewsArticle', datePublished: '2026-09-24T04:00:00Z' },
      ],
    })}</script>`,
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-24T04:00:00.000Z');
});

test('publishedAt ignores malformed JSON-LD and falls through to later sources', () => {
  const html = pageWithHead(
    `<script type="application/ld+json">{ not json</script>
     <script type="application/ld+json">${JSON.stringify({
       datePublished: '2026-09-23T03:00:00Z',
     })}</script>`,
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-23T03:00:00.000Z');
});

test('publishedAt reads the first time[datetime]', () => {
  const html = pageWithHead(
    '',
    '<header><time datetime="2026-09-22T02:00:00Z">Sep 22</time></header><time datetime="2026-01-01T00:00:00Z">old</time>',
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-22T02:00:00.000Z');
});

test('publishedAt prefers article:published_time over later sources', () => {
  const html = pageWithHead(
    `<meta name="date" content="2026-01-01T00:00:00Z" />
     <meta property="article:published_time" content="2026-09-30T00:00:00Z" />
     <script type="application/ld+json">${JSON.stringify({ datePublished: '2026-02-02T00:00:00Z' })}</script>`,
    '<time datetime="2026-03-03T00:00:00Z">x</time>',
  );
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, '2026-09-30T00:00:00.000Z');
});

test('publishedAt is null when the only date is invalid', () => {
  const html = pageWithHead('<meta property="article:published_time" content="not a date" />');
  assert.equal(extractPublisherBodyFromHtml(html).publishedAt, null);
});

test('publishedAt is still extracted from paywalled pages', () => {
  const html = `<!doctype html><html><head><title>Exclusive</title>
    <meta property="article:published_time" content="2026-09-30T01:00:00Z" /></head>
    <body><main><p>Subscribe to continue reading this article.</p></main></body></html>`;
  const result = extractPublisherBodyFromHtml(html);
  assert.equal(result.bodyStatus, 'blocked');
  assert.equal(result.publishedAt, '2026-09-30T01:00:00.000Z');
});

test('scrapePublisherBody returns publishedAt null without fetching for missing or X urls', async () => {
  const prev = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error('should not fetch');
    }) as typeof fetch;
    assert.deepEqual(await scrapePublisherBody(null), {
      bodyText: null,
      bodyStatus: 'unavailable',
      publisherTitle: null,
      imageUrl: null,
      imageCaption: null,
      imageCredit: null,
      publishedAt: null,
    });
    assert.equal((await scrapePublisherBody('https://x.com/a/status/1')).publishedAt, null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = prev;
  }
});

test('scrapePublisherBody returns publishedAt null on HTTP errors and network failures', async () => {
  const prev = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      ({ status: 500, ok: false, text: async () => '' }) as unknown as Response) as typeof fetch;
    const httpError = await scrapePublisherBody('https://publisher.example.com/a');
    assert.equal(httpError.bodyStatus, 'unavailable');
    assert.equal(httpError.publishedAt, null);

    globalThis.fetch = (async () => {
      throw new Error('boom');
    }) as typeof fetch;
    const failed = await scrapePublisherBody('https://publisher.example.com/b');
    assert.equal(failed.bodyStatus, 'unavailable');
    assert.equal(failed.publishedAt, null);
  } finally {
    globalThis.fetch = prev;
  }
});

test('scrapePublisherBody carries the page date on success', async () => {
  const prev = globalThis.fetch;
  try {
    const html = pageWithHead(
      '<meta property="article:published_time" content="2026-09-30T09:00:00Z" />',
    );
    globalThis.fetch = (async () =>
      ({ status: 200, ok: true, text: async () => html }) as unknown as Response) as typeof fetch;
    const result = await scrapePublisherBody('https://publisher.example.com/dated');
    assert.equal(result.bodyStatus, 'ok');
    assert.equal(result.publishedAt, '2026-09-30T09:00:00.000Z');
  } finally {
    globalThis.fetch = prev;
  }
});

test('scrapePublisherBody honors a timeoutMs override', async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  let guard: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      scrapePublisherBody(`http://127.0.0.1:${port}/hangs`, { timeoutMs: 50 }),
      new Promise<'guard'>((resolve) => {
        guard = setTimeout(() => resolve('guard'), 2_000);
      }),
    ]);
    assert.notEqual(result, 'guard');
    assert.equal((result as PublisherBodyResult).bodyStatus, 'unavailable');
  } finally {
    clearTimeout(guard);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('scrapePublisherBody makes a single attempt with retries: 0', async () => {
  let requests = 0;
  const server = createServer(() => {
    requests += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const result = await scrapePublisherBody(`http://127.0.0.1:${port}/hangs`, {
      timeoutMs: 50,
      retries: 0,
    });
    assert.equal(result.bodyStatus, 'unavailable');
    assert.equal(requests, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('blocks x.com and twitter hosts', () => {
  assert.equal(isBlockedPublisherHost('https://x.com/user/status/1'), true);
  assert.equal(isBlockedPublisherHost('https://twitter.com/user/status/1'), true);
  assert.equal(isBlockedPublisherHost('https://www.example.com/story'), false);
});
