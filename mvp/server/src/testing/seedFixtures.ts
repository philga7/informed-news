import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';

/** Test-only. Two real Iran stories in the v2 shape, loaded through POST /api/ingest. */

type Source = { id: string; outlet: string; url: string; publishedOn?: string };
export type FixtureStory = {
  kind: 'story';
  id: string;
  role: 'hub' | 'branch';
  hubId?: string;
  title: string;
  status: string;
  nowSummary: string;
  nowUpdatedAt: string;
  lastCheckedAt: string;
  nextCheckAt: string;
  categoryIds: string[];
  sources: Source[];
  links?: { toStoryId: string; note: string }[];
};
export type FixtureEntry = {
  kind: 'entry';
  id: string;
  storyId: string;
  precision: 'day' | 'time';
  occurredAt: string;
  headline: string;
  label: string;
  changes: string[];
  sources: { sourceId: string }[];
};
export type SeedFixture = {
  category: { id: string; name: string; sort: number };
  items: (FixtureStory | FixtureEntry)[];
};

export const seedFixture = JSON.parse(
  readFileSync(new URL('./fixtures/seedStories.json', import.meta.url), 'utf8'),
) as SeedFixture;

type BreakingFixture = {
  kind: 'breaking';
  id: string;
  occurredAt: string;
  headline: string;
  label: string;
  sourceName?: string;
  via?: string;
  storyId?: string;
};
type CfpItemFixture = {
  kind: 'cfp_item';
  id: string;
  roundupAt: string;
  title: string;
  topic?: string;
  sourceName?: string;
  url?: string;
  status?: string;
};
type CfpDayNoteFixture = { kind: 'cfp_day_note'; day: string; stillWorking?: string; dropped?: string };
type MorningFixture = {
  kind: 'morning';
  id: string;
  card: 'bluf' | 'weather' | 'market' | 'osint';
  postedAt: string;
  body: string;
  data?: Record<string, unknown>;
};
export type SeedMorningFixture = {
  items: (BreakingFixture | CfpItemFixture | CfpDayNoteFixture | MorningFixture)[];
};

/** Test-only. Breaking, CFP and Morning items from Grok Bot's export; post `seedFixture` first. */
export const seedMorningFixture = JSON.parse(
  readFileSync(new URL('./fixtures/seedMorning.json', import.meta.url), 'utf8'),
) as SeedMorningFixture;

/**
 * Insert the fixture's category. Categories have no ingest kind, and
 * `createCategory` makes its own id, so the fixed id needs this insert.
 */
export async function seedCategory(pool: Pool): Promise<void> {
  const { id, name, sort } = seedFixture.category;
  await pool.query('INSERT INTO categories (id, name, sort) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [
    id,
    name,
    sort,
  ]);
}
