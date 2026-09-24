import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_RADAR_SOURCES_PATH,
  loadRadarSources,
} from './loadRadarSources.js';

function writeTempConfig(sources: unknown[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'radar-sources-'));
  const configPath = path.join(dir, 'radar-sources.json');
  writeFileSync(configPath, JSON.stringify({ sources }), 'utf8');
  return configPath;
}

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
  'us-state-press',
  'us-defense-releases',
  'un-news',
];

const PRIMARY_IDS = ['us-state-press', 'us-defense-releases', 'un-news'] as const;

test('loadRadarSources returns 17 enabled sources from committed config', () => {
  const sources = loadRadarSources();
  assert.equal(sources.length, 17);
  assert.equal(DEFAULT_RADAR_SOURCES_PATH.endsWith('config/radar-sources.json'), true);
});

test('loadRadarSources ids match locked NEWS-54 list', () => {
  const sources = loadRadarSources();
  const ids = sources.map((source) => source.id).sort();
  assert.deepEqual(ids, [...LOCKED_IDS].sort());
});

test('loadRadarSources includes three primary sources with sourceTier primary', () => {
  const sources = loadRadarSources();
  for (const id of PRIMARY_IDS) {
    const source = sources.find((s) => s.id === id);
    assert.ok(source, `missing primary source ${id}`);
    assert.equal(source!.sourceTier, 'primary');
  }
});

test('loadRadarSources marks existing curated sources as sensor', () => {
  const source = loadRadarSources().find((s) => s.id === 'georgia-recorder');
  assert.ok(source);
  assert.equal(source!.sourceTier, 'sensor');
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

test('loadRadarSources returns [] when any source entry is malformed', () => {
  const configPath = writeTempConfig([
    {
      id: 'valid-source',
      name: 'Valid Source',
      domain: 'example.com',
      feedUrl: 'https://example.com/rss.xml',
    },
    { id: 'missing-fields' },
  ]);

  assert.deepEqual(loadRadarSources(configPath), []);
});

test('loadRadarSources defaults missing sourceTier to sensor on returned objects', () => {
  const configPath = writeTempConfig([
    {
      id: 'missing-tier',
      name: 'Missing Tier',
      domain: 'example.com',
      feedUrl: 'https://example.com/rss.xml',
    },
  ]);

  const sources = loadRadarSources(configPath);
  assert.equal(sources.length, 1);
  assert.equal(sources[0]!.sourceTier, 'sensor');
});

test('loadRadarSources returns [] when sourceTier is invalid', () => {
  const configPath = writeTempConfig([
    {
      id: 'bad-tier',
      name: 'Bad Tier',
      domain: 'example.com',
      feedUrl: 'https://example.com/rss.xml',
      sourceTier: 'nope',
    },
  ]);

  assert.deepEqual(loadRadarSources(configPath), []);
});

test('loadRadarSources returns [] when all valid sources are disabled', () => {
  const configPath = writeTempConfig([
    {
      id: 'disabled-one',
      name: 'Disabled One',
      domain: 'example.com',
      feedUrl: 'https://example.com/one.xml',
      enabled: false,
    },
    {
      id: 'disabled-two',
      name: 'Disabled Two',
      domain: 'example.org',
      feedUrl: 'https://example.org/two.xml',
      enabled: false,
    },
  ]);

  assert.deepEqual(loadRadarSources(configPath), []);
});
