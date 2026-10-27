import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractCitationItems } from './extractCitationItems.js';

test('extractCitationItems pulls URLs and quoted spans from summary text', () => {
  const items = extractCitationItems({
    summaryText:
      'Officials said "talks resumed" at https://publisher.example/story and ‘more later’.',
  });

  assert.deepEqual(
    items.filter((i) => i.kind === 'url').map((i) => i.url),
    ['https://publisher.example/story'],
  );
  assert.deepEqual(
    items.filter((i) => i.kind === 'quote').map((i) => i.quote),
    ['talks resumed', 'more later'],
  );
});

test('extractCitationItems covers pull quote, perspectives, talking points, timeline, living update', () => {
  const items = extractCitationItems({
    fullStory: {
      enrichment: {
        talking_points: [
          'See https://tp.example/a for context.',
          'They called it "a breakthrough".',
        ],
        timeline: [{ content: 'Met at https://tl.example/b; called it "day one".' }],
        suggested_qna: [],
      },
      deterministic: {
        quote: {
          quote: 'We will continue.',
          quote_source_url: 'https://quote.example/source',
        },
        perspectives: [
          {
            text: 'Analysts called it "premature".',
            sources: [{ url: 'https://persp.example/op' }],
          },
        ],
      },
      changeSummary: 'Updated; see https://live.example/note and "new outlet".',
    },
  });

  const urls = items.filter((i) => i.kind === 'url').map((i) => i.url).sort();
  const quotes = items.filter((i) => i.kind === 'quote').map((i) => i.quote).sort();

  assert.deepEqual(urls, [
    'https://live.example/note',
    'https://persp.example/op',
    'https://quote.example/source',
    'https://tl.example/b',
    'https://tp.example/a',
  ]);
  assert.deepEqual(quotes, [
    'We will continue.',
    'a breakthrough',
    'day one',
    'new outlet',
    'premature',
  ]);
});

test('extractCitationItems emits claim when refute language pairs with a URL', () => {
  const items = extractCitationItems({
    fullStory: {
      enrichment: {
        talking_points: [
          'The claim was debunked by https://refute.example/evidence.',
        ],
        timeline: [],
        suggested_qna: [
          {
            question: 'Was it refuted?',
            answer: 'Yes — refuted per https://refute.example/qa.',
          },
        ],
      },
    },
  });

  const claims = items.filter((i) => i.kind === 'claim');
  assert.equal(claims.length, 2);
  assert.ok(claims.some((c) => c.refutingUrl === 'https://refute.example/evidence'));
  assert.ok(claims.some((c) => c.refutingUrl === 'https://refute.example/qa'));
});

test('extractCitationItems does not invent claims without a URL', () => {
  const items = extractCitationItems({
    fullStory: {
      enrichment: {
        talking_points: ['The rumor was thoroughly debunked offline.'],
        timeline: [],
        suggested_qna: [],
      },
    },
  });
  assert.equal(items.filter((i) => i.kind === 'claim').length, 0);
});
