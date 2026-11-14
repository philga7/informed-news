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
