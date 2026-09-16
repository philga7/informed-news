import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractPublisherBodyFromHtml,
  isBlockedPublisherHost,
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

test('blocks x.com and twitter hosts', () => {
  assert.equal(isBlockedPublisherHost('https://x.com/user/status/1'), true);
  assert.equal(isBlockedPublisherHost('https://twitter.com/user/status/1'), true);
  assert.equal(isBlockedPublisherHost('https://www.example.com/story'), false);
});
