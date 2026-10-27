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

test('extractCitationItems pulls a reporter cite from summary text', () => {
  const items = extractCitationItems({
    summaryText:
      'The Court held in 598 U.S. 651 that the program fell. See https://publisher.example/a',
  });
  const court = items.filter((i) => i.kind === 'court');
  assert.equal(court.length, 1);
  assert.equal(court[0]!.citation, '598 U.S. 651');
  assert.equal(court[0]!.volume, '598');
  assert.equal(court[0]!.reporter, 'U.S.');
  assert.equal(court[0]!.page, '651');
  assert.equal(items.filter((i) => i.kind === 'claim').length, 0);
  const urls = items.filter((i) => i.kind === 'url');
  assert.deepEqual(urls.map((i) => i.url), ['https://publisher.example/a']);
});

test('extractCitationItems matches F.3d and F. Supp. 2d cites and dedupes whitespace', () => {
  const items = extractCitationItems({
    summaryText: 'See 123 F.3d 456, 78 F. Supp. 2d 910, 576 U.S. 644 and 576  U.S.  644.',
  });
  assert.deepEqual(
    items.filter((i) => i.kind === 'court').map((i) => [i.citation, i.reporter]),
    [
      ['123 F.3d 456', 'F.3d'],
      ['78 F. Supp. 2d 910', 'F. Supp. 2d'],
      ['576 U.S. 644', 'U.S.'],
    ],
  );
});

test('extractCitationItems ignores case names without a reporter cite', () => {
  const items = extractCitationItems({
    summaryText: 'Students for Fair Admissions v. Harvard',
  });
  assert.equal(items.filter((i) => i.kind === 'court').length, 0);
});

test('extractCitationItems treats CourtListener docket/opinion/recap URLs as court items', () => {
  const docket =
    'https://www.courtlistener.com/docket/67590963/students-for-fair-admissions-v-harvard/';
  const opinion = 'https://www.courtlistener.com/opinion/2812209/obergefell-v-hodges/';
  const recap = 'https://courtlistener.com/recap/gov.uscourts.mad.1/';
  const items = extractCitationItems({
    summaryText: `See ${docket}. Also ${opinion} and ${recap} but not https://example.com/docket/1`,
  });
  assert.deepEqual(
    items.filter((i) => i.kind === 'court').map((i) => i.url),
    [docket, opinion, recap],
  );
  const urls = items.filter((i) => i.kind === 'url').map((i) => i.url);
  assert.ok(urls.includes(docket));
  assert.ok(urls.includes('https://example.com/docket/1'));
});

test('extractCitationItems scans court cites in every full-story surface', () => {
  const items = extractCitationItems({
    fullStory: {
      enrichment: {
        talking_points: ['Ruling at 10 F.4th 20.'],
        timeline: [{ content: 'Filed under 5 Cal. App. 99.' }],
        suggested_qna: [],
      },
      deterministic: {
        quote: { quote: 'x', quote_source_url: null },
        perspectives: [{ text: 'Cited 7 So. 2d 8.', sources: [] }],
      },
      changeSummary: 'Now cites 1 N.Y.3d 2.',
    },
  });
  assert.deepEqual(
    items.filter((i) => i.kind === 'court').map((i) => i.citation),
    ['7 So. 2d 8', '10 F.4th 20', '5 Cal. App. 99', '1 N.Y.3d 2'],
  );
});

test('extractCitationItems yields no court item for non-court text', () => {
  const items = extractCitationItems({
    summaryText: 'Talks resumed in 2024 at https://publisher.example/x with 12 delegates.',
  });
  assert.equal(items.filter((i) => i.kind === 'court').length, 0);
});
