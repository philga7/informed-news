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

-- Schema v3 (NEWS-254): user accounts, read markers, follow/hide, story owner.
-- Decisions: docs/DECISIONS.md, 2026-11-16 multi-user and per-user entries,
-- and the 2026-11-20 sign-in entry. Like v2, it can be applied again safely.

-- Invite-only accounts. Email is stored trimmed and lowercased by the store;
-- the unique index on lower(email) holds even for a row written another way.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL CHECK (email <> ''),
  password_hash text NOT NULL CHECK (password_hash <> ''),
  display_name text NOT NULL CHECK (display_name <> ''),
  created_at timestamptz NOT NULL,
  disabled_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

-- A story with an owner is private to that user; no owner means shared.
-- Until Phil decides the open branch questions, only a hub may be private.
-- That a branch's hub is not private is checked by the store.
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users (id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stories_branch_not_private'
      AND conrelid = 'stories'::regclass
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_branch_not_private
      CHECK (role = 'hub' OR owner_user_id IS NULL);
  END IF;
END
$$;

-- One marker per user and tracker. A story tracker names its story; CFP and
-- Weather are one tracker each, with no id. read_up_to only moves forward.
CREATE TABLE IF NOT EXISTS read_markers (
  user_id text NOT NULL REFERENCES users (id),
  tracker_kind text NOT NULL CHECK (tracker_kind IN ('story', 'cfp', 'weather')),
  tracker_id text REFERENCES stories (id),
  read_up_to timestamptz,
  last_opened_at timestamptz,
  CHECK ((tracker_kind = 'story') = (tracker_id IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (user_id, tracker_kind, tracker_id)
);

-- Follow or hide, per user, for a story or a topic. It changes only what that
-- user sees. Topics live outside Postgres, so topic_id has no foreign key.
CREATE TABLE IF NOT EXISTS user_follows (
  user_id text NOT NULL REFERENCES users (id),
  story_id text REFERENCES stories (id),
  topic_id text CHECK (topic_id <> ''),
  state text NOT NULL CHECK (state IN ('follow', 'hide')),
  updated_at timestamptz NOT NULL,
  CHECK ((story_id IS NULL) <> (topic_id IS NULL)),
  UNIQUE NULLS NOT DISTINCT (user_id, story_id, topic_id)
);

-- One row: the schema version applied. ensureDashboardSchema writes it after
-- the statements above and runs nothing once it is current.
CREATE TABLE IF NOT EXISTS dashboard_schema_version (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  version integer NOT NULL
);
