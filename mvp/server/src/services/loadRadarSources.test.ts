import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_RADAR_SOURCES_PATH,
  loadRadarSources,
} from './loadRadarSources.js';

const LOCKED_IDS = [
  'georgia-recorder',
  'capitol-beat',
  '11alive-local',
  'newsnation',
  'scotusblog',
  'times-of-israel',
  'al-monitor',
  'goldseek',
  'macrumors',
  'fox-latest',
  'abc-topstories',
  'cbs-main',
  'nbc-news',
  'newsmax-newsfront',
];

test('loadRadarSources returns 14 enabled sources from committed config', () => {
  const sources = loadRadarSources();
  assert.equal(sources.length, 14);
  assert.equal(DEFAULT_RADAR_SOURCES_PATH.endsWith('config/radar-sources.json'), true);
});

test('loadRadarSources ids match locked NEWS-54 list', () => {
  const sources = loadRadarSources();
  const ids = sources.map((source) => source.id).sort();
  assert.deepEqual(ids, [...LOCKED_IDS].sort());
});

test('fox-latest feedUrl has no URL fragment', () => {
  const fox = loadRadarSources().find((source) => source.id === 'fox-latest');
  assert.ok(fox);
  assert.doesNotMatch(fox!.feedUrl, /#/);
  assert.equal(
    fox!.feedUrl,
    'https://moxie.foxnews.com/google-publisher/latest.xml',
  );
});

test('loadRadarSources returns [] for missing config path', () => {
  const sources = loadRadarSources('/nonexistent/radar-sources.json');
  assert.deepEqual(sources, []);
});
