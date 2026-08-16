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
});

test('marks short paywall pages as blocked', () => {
  const result = extractPublisherBodyFromHtml(PAYWALL_HTML);
  assert.equal(result.bodyStatus, 'blocked');
  assert.equal(result.bodyText, null);
  assert.equal(result.publisherTitle, 'Exclusive Report');
});

test('marks empty/boilerplate pages as unavailable', () => {
  const result = extractPublisherBodyFromHtml(EMPTY_HTML);
  assert.equal(result.bodyStatus, 'unavailable');
  assert.equal(result.bodyText, null);
});

test('blocks x.com and twitter hosts', () => {
  assert.equal(isBlockedPublisherHost('https://x.com/user/status/1'), true);
  assert.equal(isBlockedPublisherHost('https://twitter.com/user/status/1'), true);
  assert.equal(isBlockedPublisherHost('https://www.example.com/story'), false);
});
