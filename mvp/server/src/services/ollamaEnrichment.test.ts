import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildEnrichmentPrompt,
  parseEnrichmentResponse,
} from './ollamaEnrichment.js';

test('buildEnrichmentPrompt includes AI-assisted and not ground truth', () => {
  const prompt = buildEnrichmentPrompt([
    {
      title: 'Headline',
      snippet: 'Snippet text',
      publisherDomain: 'example.com',
      publishedAt: '2026-09-12T12:00:00.000Z',
      framingSummary: 'Framing summary',
    },
  ]);

  assert.match(prompt, /AI-assisted/);
  assert.match(prompt, /not ground truth/);
});

test('parseEnrichmentResponse parses valid JSON payload', () => {
  const raw = JSON.stringify(
    {
      talking_points: [' Point A ', '', 'Point B'],
      timeline: [
        { date: 'Sep 12', content: 'Something happened' },
        { date: ' ', content: 'Missing date should drop' },
        { date: 'Sep 13', content: 'Follow-up', date_iso: '2026-09-13' },
      ],
      suggested_qna: [
        { question: 'What is confirmed?', answer: 'Only what members say.' },
        { question: '', answer: 'Drop this' },
      ],
      short_summary: ' 1-2 sentence summary. ',
    },
    null,
    2,
  );

  const parsed = parseEnrichmentResponse(raw);
  assert.deepEqual(parsed.talking_points, ['Point A', 'Point B']);
  assert.deepEqual(parsed.timeline, [
    { date: 'Sep 12', content: 'Something happened' },
    { date: 'Sep 13', content: 'Follow-up', date_iso: '2026-09-13' },
  ]);
  assert.deepEqual(parsed.suggested_qna, [
    { question: 'What is confirmed?', answer: 'Only what members say.' },
  ]);
  assert.equal(parsed.short_summary, '1-2 sentence summary.');
});

test('parseEnrichmentResponse throws on non-JSON garbage', () => {
  assert.throws(
    () => parseEnrichmentResponse('definitely not json'),
    /Could not parse JSON from model response/,
  );
});

test('parseEnrichmentResponse throws on all-empty enrichment', () => {
  const raw = JSON.stringify({
    talking_points: [],
    timeline: [],
    suggested_qna: [],
  });

  assert.throws(
    () => parseEnrichmentResponse(raw),
    /Enrichment payload was empty after validation/,
  );
});

