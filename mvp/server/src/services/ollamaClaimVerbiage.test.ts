import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildClaimVerbiagePrompt,
  generateClaimVerbiage,
  parseClaimVerbiageResponse,
} from './ollamaClaimVerbiage.js';

test('buildClaimVerbiagePrompt includes AI-assisted guardrails', () => {
  const prompt = buildClaimVerbiagePrompt({
    claimText: 'A bridge strike was reported.',
    claimType: 'event_occurrence',
    status: 'reported',
    linkedHeadlines: [
      {
        title: 'Bridge strike reported by local outlet',
        stance: 'mentions',
        sourceTier: 'sensor',
        publisherDomain: 'example.com',
        publishedAt: '2026-09-24T00:00:00.000Z',
      },
    ],
  });

  assert.match(prompt, /AI-assisted/);
  assert.match(prompt, /not ground truth/);
  assert.match(prompt, /Do not change the claim status/);
});

test('parseClaimVerbiageResponse trims fields and filters empty talking points', () => {
  const parsed = parseClaimVerbiageResponse(
    JSON.stringify({
      short_summary: '  Careful summary.  ',
      talking_points: [' Point A ', '', 'Point B'],
    }),
  );

  assert.deepEqual(parsed, {
    short_summary: 'Careful summary.',
    talking_points: ['Point A', 'Point B'],
  });
});

test('generateClaimVerbiage succeeds with mocked Ollama client', async () => {
  const seenPrompts: string[] = [];
  const result = await generateClaimVerbiage(
    {
      claimText: 'A bridge strike was reported.',
      claimType: 'event_occurrence',
      status: 'contested',
      linkedHeadlines: [
        {
          title: 'Headline one',
          stance: 'supports',
          sourceTier: 'primary',
          publisherDomain: 'example.com',
          publishedAt: '2026-09-24T00:00:00.000Z',
        },
      ],
    },
    {
      model: 'glm-5.3-flash',
      ollama: {
        chat: async ({ messages }) => {
          seenPrompts.push(String(messages?.[0]?.content ?? ''));
          return {
            message: {
              content: JSON.stringify({
                short_summary: 'Careful summary.',
                talking_points: ['Point A', 'Point B'],
              }),
            },
          } as any;
        },
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.model, 'glm-5.3-flash');
  assert.deepEqual(result.enrichment, {
    short_summary: 'Careful summary.',
    talking_points: ['Point A', 'Point B'],
  });
  assert.equal(seenPrompts.length, 1);
  assert.match(seenPrompts[0]!, /Headline one/);
});
