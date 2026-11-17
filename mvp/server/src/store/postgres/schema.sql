CREATE TABLE IF NOT EXISTS stories (
  id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('hub', 'branch')),
  hub_id text REFERENCES stories (id),
  title text NOT NULL,
  CHECK (
    (role = 'hub' AND hub_id IS NULL)
    OR (role = 'branch' AND hub_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS story_entries (
  id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES stories (id),
  occurred_at timestamptz NOT NULL,
  body text NOT NULL
);

CREATE TABLE IF NOT EXISTS story_entry_sources (
  id text PRIMARY KEY,
  entry_id text NOT NULL REFERENCES story_entries (id),
  url text NOT NULL,
  label text NOT NULL
);

CREATE TABLE IF NOT EXISTS morning_items (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('bluf', 'weather', 'market', 'osint')),
  body text NOT NULL,
  link text,
  posted_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS cfp_roundup_items (
  id text PRIMARY KEY,
  roundup_at timestamptz NOT NULL,
  title text NOT NULL,
  url text NOT NULL
);

-- Schema v2 (NEWS-240). The statements above are the NEWS-224 tables and stay
-- as they were. Everything below widens them and can be applied again safely.
-- Fixed values are listed in docs/DECISIONS.md (2026-11-16). Tone is not stored.
-- A required column has no default: applying this over NEWS-224 rows fails.

ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS status text NOT NULL
    CHECK (status IN ('developing', 'active', 'stalled', 'waiting')),
  ADD COLUMN IF NOT EXISTS now_summary text,
  ADD COLUMN IF NOT EXISTS now_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS cadence text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS unchanged_note text,
  ADD COLUMN IF NOT EXISTS earlier_summary text,
  ADD COLUMN IF NOT EXISTS sources_note text,
  ADD COLUMN IF NOT EXISTS thread_url text;

ALTER TABLE story_entries
  ADD COLUMN IF NOT EXISTS headline text NOT NULL,
  ADD COLUMN IF NOT EXISTS label text NOT NULL
    CHECK (
      label IN (
        'official_ruling',
        'official',
        'on_record',
        'reported',
        'working',
        'single_outlet',
        'claim_no_new_evidence',
        'claim_no_evidence_shown'
      )
    ),
  ADD COLUMN IF NOT EXISTS changes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS occurred_until timestamptz,
  ADD COLUMN IF NOT EXISTS occurred_precision text NOT NULL
    CHECK (occurred_precision IN ('time', 'day'));

-- A 'day' entry has no clock time. It is stored at 00:00 UTC of its calendar
-- day and shown as that date, not shifted into the viewer's zone.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'story_entries_until_not_before_start'
      AND conrelid = 'story_entries'::regclass
  ) THEN
    ALTER TABLE story_entries
      ADD CONSTRAINT story_entries_until_not_before_start
      CHECK (occurred_until IS NULL OR occurred_until >= occurred_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'story_entries_day_at_utc_midnight'
      AND conrelid = 'story_entries'::regclass
  ) THEN
    ALTER TABLE story_entries
      ADD CONSTRAINT story_entries_day_at_utc_midnight
      CHECK (
        occurred_precision <> 'day'
        OR (
          (occurred_at AT TIME ZONE 'UTC')::time = TIME '00:00'
          AND (
            occurred_until IS NULL
            OR (occurred_until AT TIME ZONE 'UTC')::time = TIME '00:00'
          )
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS story_entries_story_occurred_idx
  ON story_entries (story_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS story_sources (
  id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES stories (id),
  outlet text NOT NULL,
  title text,
  url text,
  published_on date,
  via text,
  group_label text,
  note text
);

CREATE INDEX IF NOT EXISTS story_sources_story_idx ON story_sources (story_id);

-- position keeps an entry's sources in the order they were given.
ALTER TABLE story_entry_sources
  ADD COLUMN IF NOT EXISTS source_id text REFERENCES story_sources (id),
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

ALTER TABLE cfp_roundup_items
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IN ('working', 'unconfirmed'));

ALTER TABLE cfp_roundup_items ALTER COLUMN url DROP NOT NULL;

ALTER TABLE morning_items ADD COLUMN IF NOT EXISTS data jsonb;

CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS story_categories (
  story_id text NOT NULL REFERENCES stories (id),
  category_id text NOT NULL REFERENCES categories (id),
  PRIMARY KEY (story_id, category_id)
);

CREATE TABLE IF NOT EXISTS story_tags (
  id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES stories (id),
  slug text NOT NULL,
  name text NOT NULL,
  UNIQUE (story_id, slug)
);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id text NOT NULL REFERENCES story_entries (id),
  tag_id text NOT NULL REFERENCES story_tags (id),
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE IF NOT EXISTS story_dates (
  id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES stories (id),
  starts_on date NOT NULL,
  ends_on date,
  label text NOT NULL,
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS story_dates_story_idx ON story_dates (story_id, starts_on);

CREATE TABLE IF NOT EXISTS story_panels (
  id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES stories (id),
  kind text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL,
  sort integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS story_panels_story_idx ON story_panels (story_id, sort);

CREATE TABLE IF NOT EXISTS story_links (
  from_story_id text NOT NULL REFERENCES stories (id),
  to_story_id text NOT NULL REFERENCES stories (id),
  note text NOT NULL,
  PRIMARY KEY (from_story_id, to_story_id),
  CHECK (from_story_id <> to_story_id)
);

CREATE TABLE IF NOT EXISTS breaking_items (
  id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  headline text NOT NULL,
  label text NOT NULL
    CHECK (
      label IN (
        'official_ruling',
        'official',
        'on_record',
        'reported',
        'working',
        'single_outlet',
        'claim_no_new_evidence',
        'claim_no_evidence_shown'
      )
    ),
  source_name text,
  via text,
  url text,
  story_id text REFERENCES stories (id),
  entry_id text REFERENCES story_entries (id),
  CHECK (entry_id IS NULL OR story_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS breaking_items_occurred_idx ON breaking_items (occurred_at DESC);

-- day is the calendar day the sender files the note under. It is not derived
-- from a UTC time.
CREATE TABLE IF NOT EXISTS cfp_day_notes (
  day date PRIMARY KEY,
  still_working text,
  dropped text
);
