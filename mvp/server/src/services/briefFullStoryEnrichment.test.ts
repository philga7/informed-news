import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FULL_STORY_BODY_MAX_CHARS } from './briefConfig.js';
import {
  buildFullStoryEnrichmentPrompt,
  enrichFullStory,
  parseFullStoryEnrichmentResponse,
} from './briefFullStoryEnrichment.js';

const baseMember = {
  title: 'Test headline',
  publisherDomain: 'example.com',
  publishedAt: '2026-09-12T12:00:00.000Z',
  bodyOrSnippet: 'Unique body excerpt for prompt test.',
  framingSummary: 'Prior framing',
};

test('buildFullStoryEnrichmentPrompt includes requested sections and body excerpt', () => {
  const prompt = buildFullStoryEnrichmentPrompt({
    members: [baseMember],
    requestedSections: ['business', 'technical'],
  });

  assert.match(prompt, /Unique body excerpt for prompt test/);
  assert.match(prompt, /Optional topic sections requested: business, technical/);
  assert.match(prompt, /business_angle_text/);
  assert.match(prompt, /technical_details/);
  assert.match(prompt, /verify or what remains unknown/);
  assert.match(prompt, /not ground truth/);
  assert.doesNotMatch(prompt, /"map"/);
  assert.match(prompt, /Never include map/);
});

test('buildFullStoryEnrichmentPrompt truncates member body to FULL_STORY_BODY_MAX_CHARS', () => {
  const longBody = 'x'.repeat(FULL_STORY_BODY_MAX_CHARS + 50);
  const prompt = buildFullStoryEnrichmentPrompt({
    members: [{ ...baseMember, bodyOrSnippet: longBody }],
    requestedSections: [],
  });

  const excerptLine = prompt
    .split('\n')
    .find((line) => line.startsWith('Body excerpt:'));
  assert.ok(excerptLine);
  const excerpt = excerptLine!.replace('Body excerpt: ', '');
  assert.equal(excerpt.length, FULL_STORY_BODY_MAX_CHARS);
  assert.ok(excerpt.endsWith('…'));
});

test('buildFullStoryEnrichmentPrompt with no optional sections omits business fields from shape', () => {
  const prompt = buildFullStoryEnrichmentPrompt({
    members: [baseMember],
    requestedSections: [],
  });

  assert.match(prompt, /No optional topic sections were requested/);
  assert.doesNotMatch(prompt, /business_angle_text/);
  assert.doesNotMatch(prompt, /"map"/);
});

test('parseFullStoryEnrichmentResponse strips unrequested business fields', () => {
  const raw = JSON.stringify({
    talking_points: ['One'],
    timeline: [],
    suggested_qna: [{ question: 'What to verify?', answer: 'Source documents.' }],
    business_angle_text: 'Should drop',
    business_angle_points: ['Drop'],
    technical_details: ['Keep only if requested'],
  });

  const parsed = parseFullStoryEnrichmentResponse(raw, []);
  assert.deepEqual(parsed.talking_points, ['One']);
  assert.equal(parsed.business_angle_text, undefined);
  assert.equal(parsed.business_angle_points, undefined);
  assert.equal(parsed.technical_details, undefined);
});

test('parseFullStoryEnrichmentResponse keeps requested optional sections and drops empty', () => {
  const raw = JSON.stringify({
    talking_points: ['A'],
    timeline: [{ date: 'Sep 1', content: 'Event' }],
    suggested_qna: [],
    business_angle_text: '  ',
    business_angle_points: ['', '  Point  '],
    technical_details: [],
    user_action_items: ['Check primary source'],
    historical_background: '',
  });

  const parsed = parseFullStoryEnrichmentResponse(raw, [
    'business',
    'technical',
    'action',
    'history',
  ]);
  assert.equal(parsed.business_angle_text, undefined);
  assert.deepEqual(parsed.business_angle_points, ['Point']);
  assert.equal(parsed.technical_details, undefined);
  assert.deepEqual(parsed.user_action_items, ['Check primary source']);
  assert.equal(parsed.historical_background, undefined);
});

test('parseFullStoryEnrichmentResponse throws on empty core payload', () => {
  const raw = JSON.stringify({
    talking_points: [],
    timeline: [],
    suggested_qna: [],
    business_angle_text: 'orphan section',
  });

  assert.throws(
    () => parseFullStoryEnrichmentResponse(raw, ['business']),
    /empty after validation/,
  );
});

test('enrichFullStory uses injected chat and returns parsed fields', async () => {
  const fakeResponse = JSON.stringify({
    talking_points: ['TP'],
    timeline: [{ date: 'Today', content: 'Happened' }],
    suggested_qna: [{ question: 'Unknown?', answer: 'Still unclear from sources.' }],
    business_angle_text: 'Angle',
  });

  const result = await enrichFullStory(
    {
      members: [baseMember],
      requestedSections: ['business'],
    },
    {
      chat: async () => fakeResponse,
      model: 'test-model',
    },
  );

  assert.deepEqual(result.talking_points, ['TP']);
  assert.deepEqual(result.timeline, [{ date: 'Today', content: 'Happened' }]);
  assert.equal(result.business_angle_text, 'Angle');
});

test('enrichFullStory prompt from fake chat never solicits map', async () => {
  let capturedPrompt = '';
  await enrichFullStory(
    {
      members: [baseMember],
      requestedSections: ['history'],
    },
    {
      chat: async (prompt) => {
        capturedPrompt = prompt;
        return JSON.stringify({
          talking_points: ['x'],
          timeline: [],
          suggested_qna: [{ question: 'q', answer: 'a' }],
          historical_background: 'context',
        });
      },
    },
  );

  assert.match(capturedPrompt, /historical_background/);
  assert.doesNotMatch(capturedPrompt, /"map"/);
  assert.match(capturedPrompt, /Never include map/);
});
