import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalizeSearchUrl, normalizeTitleForMatch } from './searchUrl.js';

test('canonicalizeSearchUrl drops tracking params and keeps others', () => {
  assert.equal(
    canonicalizeSearchUrl(
      'https://example.com/story?id=7&utm_source=x&UTM_Medium=y&fbclid=a&gclid=b&ocid=c&cmpid=d&oc=5&page=2',
    ),
    'https://example.com/story?id=7&page=2',
  );
  assert.equal(
    canonicalizeSearchUrl('https://example.com/s?q=a%20b&utm_source=x&tag=c+d'),
    'https://example.com/s?q=a%20b&tag=c+d',
  );
});

test('canonicalizeSearchUrl drops the fragment and a bare trailing ?', () => {
  assert.equal(
    canonicalizeSearchUrl('https://example.com/story?utm_campaign=z#section-2'),
    'https://example.com/story',
  );
});

test('canonicalizeSearchUrl lowercases hostname but keeps path case', () => {
  assert.equal(
    canonicalizeSearchUrl('https://WWW.Example.COM/News/Story-ABC'),
    'https://www.example.com/News/Story-ABC',
  );
});

test('canonicalizeSearchUrl rejects non-http and invalid URLs', () => {
  assert.equal(canonicalizeSearchUrl('ftp://example.com/a'), null);
  assert.equal(canonicalizeSearchUrl('javascript:alert(1)'), null);
  assert.equal(canonicalizeSearchUrl('not a url'), null);
  assert.equal(canonicalizeSearchUrl(''), null);
});

test('canonicalizeSearchUrl strips oc from Google News article links', () => {
  assert.equal(
    canonicalizeSearchUrl('https://news.google.com/rss/articles/CBMiXyz?oc=5'),
    'https://news.google.com/rss/articles/CBMiXyz',
  );
});

test('normalizeTitleForMatch collapses punctuation, case, and accents', () => {
  assert.equal(
    normalizeTitleForMatch('Iran’s Nuclear Deal — Update!'),
    'iran s nuclear deal update',
  );
  assert.equal(normalizeTitleForMatch('  Café  Résumé  '), 'cafe resume');
  assert.equal(normalizeTitleForMatch('!!!'), '');
});
