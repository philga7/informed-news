import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BriefFullStoryRecord } from '../types/briefFullStory.js';
import type { BriefStory, TopicBrief } from './topicBrief.js';
import { selectAutoFullStoryTargets } from './briefFullStoryAuto.js';

const AT = '2026-10-01T12:00:00.000Z';

function story(id: string, overrides: Partial<BriefStory> = {}): BriefStory {
  return {
    articleId: id,
    topicId: 'topic',
    rank: 1,
    more: false,
    title: id,
    link: `https://example.com/${id}`,
    domain: 'example.com',
    publisherDomain: 'example.com',
    publishedAt: AT,
    fetchedAt: AT,
    outletCount: 3,
    labels: [],
    significance: 1,
    links: [],
    summary: { status: 'ok', text: 'Summary' },
    imageUrl: null,
    imageCaption: null,
    imageCredit: null,
    ...overrides,
  };
}

function brief(sections: Array<{ id: string; level: 'core' | 'watch'; stories: BriefStory[] }>): TopicBrief {
  return {
    boundaryAt: null,
    quiet: [],
    sections: sections.map((section) => ({
      topic: { id: section.id, name: section.id, level: section.level },
      stories: section.stories.map((item) => ({ ...item, topicId: section.id })),
    })),
  };
}

function record(id: string, outletCount = 3, significance: number | null = 1): BriefFullStoryRecord {
  return {
    articleId: id,
    status: 'ok',
    enrichment: { talking_points: [], timeline: [], suggested_qna: [] },
    deterministic: {},
    sourceHash: 'fresh',
    topicSections: [],
    model: 'test',
    error: null,
    generatedAt: AT,
    trigger: 'refresh',
    autoSnapshot: { outletCount, significance },
  };
}

test('automatic selector applies Core significance but lets visible Watch stories pass it', () => {
  const targets = selectAutoFullStoryTargets(brief([
    { id: 'core', level: 'core', stories: [story('core-low', { significance: 0.9 })] },
    { id: 'watch', level: 'watch', stories: [story('watch-low', { significance: 0.1 })] },
  ]), {});
  assert.deepEqual(targets, ['watch-low']);
});

test('automatic selector requires three outlets unless a story is official', () => {
  const targets = selectAutoFullStoryTargets(brief([{
    id: 'topic',
    level: 'core',
    stories: [
      story('two-outlets', { outletCount: 2 }),
      story('three-outlets', { outletCount: 3 }),
      story('official', { outletCount: 1, labels: ['official'] }),
    ],
  }]), {});
  assert.deepEqual(targets, ['three-outlets']);

  const officialOnly = selectAutoFullStoryTargets(brief([{
    id: 'topic',
    level: 'core',
    stories: [story('official', { outletCount: 1, labels: ['official'] })],
  }]), {});
  assert.deepEqual(officialOnly, ['official']);
});

test('automatic selector ranks globally and enforces one per topic and five per refresh', () => {
  const targets = selectAutoFullStoryTargets(brief([
    {
      id: 'first',
      level: 'core',
      stories: [story('first-low', { significance: 1 }), story('first-high', { significance: 2 })],
    },
    { id: 'second', level: 'core', stories: [story('second', { significance: 1.9 })] },
    { id: 'third', level: 'core', stories: [story('third', { significance: 1.8 })] },
    { id: 'fourth', level: 'core', stories: [story('fourth', { significance: 1.7 })] },
    { id: 'fifth', level: 'core', stories: [story('fifth', { significance: 1.6 })] },
    { id: 'sixth', level: 'core', stories: [story('sixth', { significance: 1.5 })] },
  ]), {});
  assert.deepEqual(targets, ['first-high', 'second', 'third', 'fourth', 'fifth']);
});

test('automatic selector skips a fresh record and reselects a significant update', () => {
  const current = story('known', { outletCount: 3, significance: 1 });
  const input = brief([{ id: 'topic', level: 'core', stories: [current] }]);
  assert.deepEqual(selectAutoFullStoryTargets(input, { known: record('known') }), []);
  assert.deepEqual(selectAutoFullStoryTargets(input, {
    known: { ...record('known'), autoSnapshot: undefined },
  }), []);

  const changed = brief([{
    id: 'topic',
    level: 'core',
    stories: [story('known', { outletCount: 5, significance: 1 })],
  }]);
  assert.deepEqual(selectAutoFullStoryTargets(changed, { known: record('known') }), ['known']);
});

test('automatic selector selects missing and non-ok records', () => {
  const input = brief([{ id: 'topic', level: 'core', stories: [story('candidate')] }]);
  assert.deepEqual(selectAutoFullStoryTargets(input, {}), ['candidate']);
  assert.deepEqual(selectAutoFullStoryTargets(input, {
    candidate: { ...record('candidate'), status: 'error', error: 'previous failure' },
  }), ['candidate']);
});
