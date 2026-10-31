import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULT_RADAR_SOURCES_PATH,
  exitIfRadarConfigInvalid,
  loadRadarSources,
  loadRadarSourcesFile,
  RadarSourcesConfigError,
} from './loadRadarSources.js';

function writeTempConfig(
  sources: unknown[],
  extras: Record<string, unknown> = {},
): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'radar-sources-'));
  const configPath = path.join(dir, 'radar-sources.json');
  writeFileSync(configPath, JSON.stringify({ ...extras, sources }), 'utf8');
  return configPath;
}

function writeTempRaw(contents: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'radar-sources-'));
  const configPath = path.join(dir, 'radar-sources.json');
  writeFileSync(configPath, contents, 'utf8');
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

const VALID_SOURCE = {
  id: 'valid-source',
  name: 'Valid Source',
  domain: 'example.com',
  feedUrl: 'https://example.com/rss.xml',
};

function assertConfigError(
  fn: () => unknown,
  filePath: string,
  jsonPath: string,
  reason: string,
): void {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof RadarSourcesConfigError);
    assert.equal(err.message, `${filePath}: ${jsonPath}: ${reason}`);
    return true;
  });
}

test('loadRadarSources returns 17 enabled sources from committed config', () => {
  const sources = loadRadarSources();
  assert.equal(sources.length, 17);
  assert.equal(DEFAULT_RADAR_SOURCES_PATH.endsWith('config/radar-sources.json'), true);
});

test('committed config global blocklist is empty', () => {
  const { blocklist } = loadRadarSourcesFile();
  assert.deepEqual(blocklist, []);
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
    VALID_SOURCE,
    { id: 'missing-fields' },
  ]);

  assert.deepEqual(loadRadarSources(configPath), []);
});

test('loadRadarSources defaults missing sourceTier to sensor on returned objects', () => {
  const configPath = writeTempConfig([VALID_SOURCE]);

  const sources = loadRadarSources(configPath);
  assert.equal(sources.length, 1);
  assert.equal(sources[0]!.sourceTier, 'sensor');
});

test('loadRadarSources returns [] when sourceTier is invalid', () => {
  const configPath = writeTempConfig([
    {
      ...VALID_SOURCE,
      id: 'bad-tier',
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

test('global blocklist loads string and object entries', () => {
  const configPath = writeTempConfig([VALID_SOURCE], {
    blocklist: ['Horoscope', { term: 'sponsored', substring: true }],
  });

  const { blocklist } = loadRadarSourcesFile(configPath);
  assert.deepEqual(blocklist, [
    { term: 'Horoscope', substring: false },
    { term: 'sponsored', substring: true },
  ]);
});

test('per-source blocklist and criteria load onto RadarSource', () => {
  const configPath = writeTempConfig([
    {
      ...VALID_SOURCE,
      blocklist: ['Local junk'],
      criteria: '  Georgia politics only  ',
    },
    {
      id: 'plain-source',
      name: 'Plain',
      domain: 'plain.example',
      feedUrl: 'https://plain.example/rss.xml',
    },
  ]);

  const { sources } = loadRadarSourcesFile(configPath);
  assert.equal(sources.length, 2);

  const withExtras = sources.find((s) => s.id === 'valid-source');
  assert.ok(withExtras);
  assert.deepEqual(withExtras!.blocklist, [{ term: 'Local junk', substring: false }]);
  assert.equal(withExtras!.criteria, 'Georgia politics only');

  const plain = sources.find((s) => s.id === 'plain-source');
  assert.ok(plain);
  assert.equal(plain!.blocklist, undefined);
  assert.equal(plain!.criteria, undefined);
});

test('throws RadarSourcesConfigError for empty blocklist term', () => {
  const configPath = writeTempConfig([VALID_SOURCE], { blocklist: [''] });
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'blocklist[0]',
    'term is empty',
  );
});

test('throws RadarSourcesConfigError for blocklist term longer than 80 characters', () => {
  const configPath = writeTempConfig([VALID_SOURCE], {
    blocklist: ['x'.repeat(81)],
  });
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'blocklist[0]',
    'term is longer than 80 characters',
  );
});

test('throws RadarSourcesConfigError when substring is not boolean', () => {
  const configPath = writeTempConfig([VALID_SOURCE], {
    blocklist: [{ term: 'sponsored', substring: 'yes' }],
  });
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'blocklist[0].substring',
    'substring must be boolean',
  );
});

test('throws RadarSourcesConfigError for unexpected blocklist object key', () => {
  const configPath = writeTempConfig([VALID_SOURCE], {
    blocklist: [{ term: 'sponsored', substr: true }],
  });
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'blocklist[0]',
    'unexpected property "substr"',
  );
});

test('throws RadarSourcesConfigError for empty criteria string', () => {
  const configPath = writeTempConfig([
    {
      ...VALID_SOURCE,
      criteria: '',
    },
  ]);
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'sources[0].criteria',
    'criteria is empty',
  );
});

test('throws RadarSourcesConfigError for criteria longer than 500 characters', () => {
  const configPath = writeTempConfig([
    {
      ...VALID_SOURCE,
      criteria: 'x'.repeat(501),
    },
  ]);
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'sources[0].criteria',
    'longer than 500 characters',
  );
});

test('throws RadarSourcesConfigError when blocklist is not an array', () => {
  const configPath = writeTempConfig([VALID_SOURCE], { blocklist: 'nope' });
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'blocklist',
    'blocklist must be an array',
  );
});

test('throws RadarSourcesConfigError for invalid JSON', () => {
  const configPath = writeTempRaw('{ not json');
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    '(file)',
    'invalid JSON',
  );
});

test('throws for invalid per-source blocklist even when source id is missing', () => {
  const configPath = writeTempConfig([{ blocklist: ['ok', ''] }]);
  assertConfigError(
    () => loadRadarSourcesFile(configPath),
    configPath,
    'sources[0].blocklist[1]',
    'term is empty',
  );
});

test('loadRadarSources rethrows RadarSourcesConfigError', () => {
  const configPath = writeTempConfig([VALID_SOURCE], { blocklist: 'nope' });
  assert.throws(() => loadRadarSources(configPath), RadarSourcesConfigError);
});

test('exitIfRadarConfigInvalid calls exit with code 1 on bad config', () => {
  const configPath = writeTempConfig([VALID_SOURCE], { blocklist: 'nope' });
  let exitCode: number | undefined;
  exitIfRadarConfigInvalid(configPath, {
    load: loadRadarSourcesFile,
    exit: ((code: number) => {
      exitCode = code;
    }) as (code: number) => never,
  });
  assert.equal(exitCode, 1);
});

test('exitIfRadarConfigInvalid does not exit when config is missing', () => {
  let exitCalled = false;
  exitIfRadarConfigInvalid('/nonexistent/radar-sources.json', {
    load: loadRadarSourcesFile,
    exit: ((code: number) => {
      exitCalled = true;
      void code;
    }) as unknown as (code: number) => never,
  });
  assert.equal(exitCalled, false);
});
