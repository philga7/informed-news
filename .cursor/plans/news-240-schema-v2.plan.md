# NEWS-240 — Schema v2 for the dashboard UI (SDD plan)

Ticket: https://informedcrew.atlassian.net/browse/NEWS-240
Spec: "informed-news: data model proposal for the dashboard UI", section "Schema v2" (https://claude.ai/artifact/7tdU3JNNAw5waXnvxy4g4N), and `docs/DECISIONS.md` 2026-11-16 entries (fixed labels, multi-user accounts, ingest contract).
Execution: inline in a Claude session, then one fresh sub-agent reviews the whole branch (`CLAUDE.md` "SDD in a Claude session").
Baseline on `main` at `d907194`: typecheck clean; `npm test` 1,179 passed, 1 skipped; `npm run test:kite` 159 passed.

## Global constraints

- All work is in `mvp/server/src/store/postgres/`, `mvp/server/package.json` (test list only), and the three docs named in Task 5. Nothing under `.github/workflows`, no route, no UI.
- Out of scope: `users`, `read_markers`, sign-in (step 3); seed fixtures (step 4); the ingest contract (step 5).
- App code calls the store and does not write SQL. Tests may use raw SQL to prove what the database itself refuses.
- Fixed values are enforced twice: by a `CHECK` in the schema and by the store before it writes.
- No tone column anywhere. Tone lives in UI code.
- Every time column is `timestamptz`. The store refuses a time with no zone offset, so nothing depends on the server's local zone.
- `schema.sql` stays one idempotent file: the NEWS-224 `CREATE TABLE IF NOT EXISTS` statements unchanged, then the v2 statements. A fresh database and a NEWS-224 database end in the same shape.
- No new dependency.

## Decisions confirmed by Phil (2026-11-16)

1. Day-only entries: `occurred_at` / `occurred_until` stay `timestamptz`; `occurred_precision` is `time` or `day`. A `day` value is stored at 00:00 UTC of that calendar day and is shown as that date, unshifted.
2. Old NEWS-224 rows: `stories.status`, `story_entries.headline`, `story_entries.label`, `story_entries.occurred_precision` are `NOT NULL` with no default. Applying v2 over rows that lack them fails and changes nothing. No placeholders.
3. `cfp_roundup_items.status` is optional; when set it is `working` or `unconfirmed`.
4. `cfp_day_notes.still_working` and `dropped` are one text line each.

## Stored values (lowercase, as NEWS-224 already stores `hub` and `bluf`)

| Used on | Stored values |
|---|---|
| Entry and Breaking label | `official_ruling`, `official`, `on_record`, `reported`, `working`, `single_outlet`, `claim_no_new_evidence`, `claim_no_evidence_shown` |
| CFP status | `working`, `unconfirmed` |
| Story status | `developing`, `active`, `stalled`, `waiting` |
| Entry precision | `time`, `day` |

## Tasks

### Task 1 — Schema v2 SQL and how it is applied

Files: `schema.sql`, `dashboardStore.ts` (`ensureDashboardSchema`), new `schemaV2.test.ts`.

- Extend `stories`, `story_entries`, `story_entry_sources`, `cfp_roundup_items`, `morning_items` with `ALTER TABLE … ADD COLUMN IF NOT EXISTS`; `cfp_roundup_items.url` drops `NOT NULL`.
- Create `categories`, `story_categories`, `story_tags`, `entry_tags`, `story_sources`, `story_dates`, `story_panels`, `story_links`, `breaking_items`, `cfp_day_notes`.
- Cross-column rules as named constraints added only when missing: an entry's `occurred_until` is not before `occurred_at`; a `day` entry sits at 00:00 UTC; a story date's `ends_on` is not before `starts_on`; a story does not link to itself; a Breaking item with an entry also names its story.
- `ensureDashboardSchema` applies the file in one transaction under an advisory lock (test files run in parallel against one database). A not-null failure is rethrown as `DashboardStoreError` saying v2 cannot be applied over NEWS-224 rows.
- Tests (each in its own Postgres schema via `search_path`, so the shared test database is untouched): v2 applies on top of empty NEWS-224 tables; applying twice changes nothing; NEWS-224 tables holding a row make it fail and leave the tables as they were; every time column is `timestamptz`; no column is named `tone`; the database refuses an out-of-list label, story status, CFP status and Breaking label through raw SQL.

### Task 2 — Fixed vocabulary module

Files: new `vocabulary.ts`, new `vocabulary.test.ts`.

- Export the value lists and types above, with a guard per list that throws `DashboardStoreError`.
- Test: the lists equal the "Used on / Value" table in `docs/DECISIONS.md` (display text lowercased, non-alphanumerics to `_`), so the doc and the code cannot drift.

### Task 3 — Extended store functions for the five NEWS-224 tables, plus Breaking and the CFP footer

Files: `dashboardStore.ts`, `dashboardStore.test.ts`, new `storeSupport.ts` (shared text, time, date and JSON helpers and the error class).

- `createStory` / `readStory`: status plus the nine optional fields.
- `createStoryEntry` / `readStoryEntry`: headline, label, changes, precision, `occurredUntil`, and an optional `sourceId` per source. A cited `story_sources` row must belong to the entry's story.
- `createMorningItem` / `readMorningItem`: optional structured `data`.
- `createCfpRoundupItem` / `readCfpRoundupItem`: topic, source name, optional status, optional url.
- `createBreakingItem` / `readBreakingItem`; `setCfpDayNote` / `readCfpDayNote`.
- Tests: create and read for each, refusal of out-of-list values, a time with an offset reads back as the same instant in UTC, a zoneless time is refused, day and day-range entries.

### Task 4 — Story detail store

Files: new `storyDetailStore.ts`, new `storyDetailStore.test.ts`.

- `createCategory` / `readCategory`, `addStoryCategory`, `listStoryCategories`.
- `createStoryTag` / `readStoryTag`, `addEntryTag`, `listEntryTags` (a tag must belong to the entry's story).
- `createStorySource` / `readStorySource`, `createStoryDate` / `readStoryDate`, `createStoryPanel` / `readStoryPanel`, `createStoryLink` / `readStoryLink`.
- Tests: create and read for each, plus each refusal above.

### Task 5 — Wiring and docs

- Add the new test files to the `test` script in `mvp/server/package.json`.
- `docs/ROADMAP.md` row 2: NEWS-240, **Done**. `docs/WHATS_NEW.md`: "No user-visible change." `docs/PRODUCT_SPEC.md` unchanged.
- `npm run typecheck`, `npm test`, `npm run test:kite`.

### Final — whole-branch review

One fresh sub-agent reviews the branch against NEWS-240, this plan and the repo rules. Resolve findings, delete this plan on the branch, open the PR.
