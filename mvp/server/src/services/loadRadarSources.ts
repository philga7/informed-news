import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  BlocklistTerm,
  LoadedRadarSourcesFile,
  RadarSource,
} from '../types/radarSource.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default committed config at mvp/server/config/radar-sources.json */
export const DEFAULT_RADAR_SOURCES_PATH = path.resolve(
  __dirname,
  '../../config/radar-sources.json',
);

export class RadarSourcesConfigError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly jsonPath: string,
    public readonly reason: string,
  ) {
    super(`${filePath}: ${jsonPath}: ${reason}`);
    this.name = 'RadarSourcesConfigError';
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceIsEnabled(source: RadarSource): boolean {
  return source.enabled !== false;
}

function normalizeSourceTier(value: unknown): 'primary' | 'sensor' | null {
  if (value === 'primary') return 'primary';
  if (value === 'sensor') return 'sensor';
  return null;
}

function throwConfigError(
  filePath: string,
  jsonPath: string,
  reason: string,
): never {
  throw new RadarSourcesConfigError(filePath, jsonPath, reason);
}

function parseBlocklistTerm(
  entry: unknown,
  filePath: string,
  jsonPath: string,
): BlocklistTerm {
  if (typeof entry === 'string') {
    const term = entry.trim();
    if (term.length === 0) {
      throwConfigError(filePath, jsonPath, 'term is empty');
    }
    if (term.length > 80) {
      throwConfigError(filePath, jsonPath, 'term is longer than 80 characters');
    }
    return { term, substring: false };
  }

  if (!entry || typeof entry !== 'object') {
    throwConfigError(filePath, jsonPath, 'term is required');
  }

  const record = entry as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'term' && key !== 'substring') {
      throwConfigError(filePath, jsonPath, `unexpected property "${key}"`);
    }
  }

  if (typeof record.term !== 'string') {
    throwConfigError(filePath, jsonPath, 'term is required');
  }

  const term = record.term.trim();
  if (term.length === 0) {
    throwConfigError(filePath, jsonPath, 'term is empty');
  }
  if (term.length > 80) {
    throwConfigError(filePath, jsonPath, 'term is longer than 80 characters');
  }

  if (record.substring === undefined) {
    return { term, substring: false };
  }
  if (typeof record.substring !== 'boolean') {
    throwConfigError(filePath, `${jsonPath}.substring`, 'substring must be boolean');
  }

  return { term, substring: record.substring };
}

function parseBlocklistArray(
  value: unknown,
  filePath: string,
  jsonPath: string,
): BlocklistTerm[] {
  if (!Array.isArray(value)) {
    throwConfigError(filePath, jsonPath, 'blocklist must be an array');
  }

  return value.map((entry, index) =>
    parseBlocklistTerm(entry, filePath, `${jsonPath}[${index}]`),
  );
}

function parseCriteria(
  value: unknown,
  filePath: string,
  jsonPath: string,
): string {
  if (typeof value !== 'string') {
    throwConfigError(filePath, jsonPath, 'criteria must be a string');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throwConfigError(filePath, jsonPath, 'criteria is empty');
  }
  if (trimmed.length > 500) {
    throwConfigError(filePath, jsonPath, 'longer than 500 characters');
  }
  return trimmed;
}

function parseSource(
  entry: unknown,
  filePath: string,
  sourceIndex: number,
): RadarSource | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const sourcePrefix = `sources[${sourceIndex}]`;

  let blocklist: BlocklistTerm[] | undefined;
  if (record.blocklist !== undefined) {
    blocklist = parseBlocklistArray(
      record.blocklist,
      filePath,
      `${sourcePrefix}.blocklist`,
    );
  }

  let criteria: string | undefined;
  if (record.criteria !== undefined) {
    criteria = parseCriteria(record.criteria, filePath, `${sourcePrefix}.criteria`);
  }

  if (
    !isNonEmptyString(record.id) ||
    !isNonEmptyString(record.name) ||
    !isNonEmptyString(record.domain) ||
    !isNonEmptyString(record.feedUrl)
  ) {
    return null;
  }

  if (record.enabled !== undefined && typeof record.enabled !== 'boolean') {
    return null;
  }

  const source: RadarSource = {
    id: record.id.trim(),
    name: record.name.trim(),
    domain: record.domain.trim(),
    feedUrl: record.feedUrl.trim(),
  };

  if (record.region !== undefined) {
    if (!isNonEmptyString(record.region)) {
      return null;
    }
    source.region = record.region.trim();
  }

  if (record.enabled !== undefined) {
    source.enabled = record.enabled;
  }

  if (record.sourceTier !== undefined) {
    const tier = normalizeSourceTier(record.sourceTier);
    if (!tier) return null;
    source.sourceTier = tier;
  } else {
    source.sourceTier = 'sensor';
  }

  if (blocklist !== undefined) {
    source.blocklist = blocklist;
  }
  if (criteria !== undefined) {
    source.criteria = criteria;
  }

  return source;
}

function parseConfigFile(raw: unknown, filePath: string): LoadedRadarSourcesFile {
  if (!raw || typeof raw !== 'object') {
    return { blocklist: [], sources: [] };
  }

  const record = raw as Record<string, unknown>;

  let blocklist: BlocklistTerm[] = [];
  if (record.blocklist !== undefined) {
    blocklist = parseBlocklistArray(record.blocklist, filePath, 'blocklist');
  }

  const sourcesRaw = record.sources;
  if (!Array.isArray(sourcesRaw) || sourcesRaw.length === 0) {
    return { blocklist, sources: [] };
  }

  const parsed: RadarSource[] = [];
  for (let index = 0; index < sourcesRaw.length; index += 1) {
    const source = parseSource(sourcesRaw[index], filePath, index);
    if (!source) {
      return { blocklist, sources: [] };
    }
    parsed.push(source);
  }

  return {
    blocklist,
    sources: parsed.filter(sourceIsEnabled),
  };
}

/**
 * Load global blocklist and enabled curated radar RSS sources from JSON config.
 * Missing file returns empty config. Invalid blocklist/criteria throws.
 */
export function loadRadarSourcesFile(
  configPath: string = DEFAULT_RADAR_SOURCES_PATH,
): LoadedRadarSourcesFile {
  let rawText: string;
  try {
    rawText = readFileSync(configPath, 'utf8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { blocklist: [], sources: [] };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throwConfigError(configPath, '(file)', 'invalid JSON');
  }

  return parseConfigFile(parsed, configPath);
}

/**
 * Load enabled curated radar RSS sources from committed JSON config.
 * Missing file returns []. Invalid blocklist/criteria rethrows RadarSourcesConfigError.
 */
export function loadRadarSources(
  configPath: string = DEFAULT_RADAR_SOURCES_PATH,
): RadarSource[] {
  return loadRadarSourcesFile(configPath).sources;
}

type ExitIfRadarConfigInvalidDeps = {
  load: typeof loadRadarSourcesFile;
  exit: (code: number) => never;
};

/** Validates radar config before startup; exits the process on config errors. */
export function exitIfRadarConfigInvalid(
  configPath: string = DEFAULT_RADAR_SOURCES_PATH,
  deps: ExitIfRadarConfigInvalidDeps = {
    load: loadRadarSourcesFile,
    exit: process.exit,
  },
): void {
  try {
    deps.load(configPath);
  } catch (err) {
    if (err instanceof RadarSourcesConfigError) {
      console.error(err.message);
      deps.exit(1);
      return;
    }
    throw err;
  }
}
