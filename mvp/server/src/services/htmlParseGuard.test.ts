import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PARSE_HTML_CHARS, prepareHtmlForParse } from './htmlParseGuard.js';
import { extractPublisherBodyFromHtml } from './publisherBodyScrape.js';

const BODY = `<article><h1>Story</h1><p>${'The committee voted after a long debate about the measure. '.repeat(8)}</p></article>`;

function pageWithHeadScript(scriptChars: number): string {
  const json = 'x'.repeat(scriptChars);
  return `<!doctype html><html><head><title>t</title><script id="__NEXT_DATA__" type="application/json">${json}</script><style>${'a{}'.repeat(10)}</style></head><body>${BODY}</body></html>`;
}

test('caps oversized markup at MAX_PARSE_HTML_CHARS', async () => {
  assert.equal(MAX_PARSE_HTML_CHARS, 1_000_000);
  const html = `<html><body><p>${'a'.repeat(MAX_PARSE_HTML_CHARS * 2)}</p></body></html>`;
  const out = await prepareHtmlForParse(html);
  assert.equal(out.length, MAX_PARSE_HTML_CHARS);
});

test('leaves small markup unchanged', async () => {
  const html = '<html><body><p>hi</p></body></html>';
  assert.equal(await prepareHtmlForParse(html), html);
});

test('strips script and style contents before capping', async () => {
  const html = pageWithHeadScript(MAX_PARSE_HTML_CHARS + 50_000);
  assert.ok(html.length > MAX_PARSE_HTML_CHARS);
  const out = await prepareHtmlForParse(html);
  assert.ok(out.length <= MAX_PARSE_HTML_CHARS);
  assert.match(out, /committee voted/);
  assert.doesNotMatch(out, /xxxx/);
});

test('page with >1MB head script still extracts body after the guard', async () => {
  const html = pageWithHeadScript(MAX_PARSE_HTML_CHARS + 50_000);
  // Without the strip, a raw slice loses the article.
  const raw = extractPublisherBodyFromHtml(html.slice(0, MAX_PARSE_HTML_CHARS));
  assert.notEqual(raw.bodyStatus, 'ok');
  const guarded = extractPublisherBodyFromHtml(await prepareHtmlForParse(html));
  assert.equal(guarded.bodyStatus, 'ok');
  assert.match(guarded.bodyText ?? '', /committee voted/);
});
