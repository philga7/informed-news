import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RadarSource, RadarSourcesConfig } from '../types/radarSource.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default committed config at mvp/server/config/radar-sources.json */
export const DEFAULT_RADAR_SOURCES_PATH = path.resolve(
  __dirname,
  '../../config/radar-sources.json',
);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sourceIsEnabled(source: RadarSource): boolean {
  return source.enabled !== false;
}

function parseSource(entry: unknown): RadarSource | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
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

  return source;
}

function parseConfig(raw: unknown): RadarSource[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const sources = (raw as RadarSourcesConfig).sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    return [];
  }

  const parsed: RadarSource[] = [];
  for (const entry of sources) {
    const source = parseSource(entry);
    if (source && sourceIsEnabled(source)) {
      parsed.push(source);
    }
  }

  return parsed;
}

/**
 * Load enabled curated radar RSS sources from committed JSON config.
 * Missing, invalid, or empty config returns [] (CFP-only ingest still works).
 */
export function loadRadarSources(
  configPath: string = DEFAULT_RADAR_SOURCES_PATH,
): RadarSource[] {
  try {
    const raw = readFileSync(configPath, 'utf8');
    return parseConfig(JSON.parse(raw));
  } catch {
    return [];
  }
}
