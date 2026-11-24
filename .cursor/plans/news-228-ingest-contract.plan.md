# NEWS-228 — Ingest contract for stories, entries, Breaking, CFP and Morning

Spec: Jira NEWS-228 (description widened 2026-11-23, and its two comments), `docs/DECISIONS.md` 2026-11-16 entries (ingest contract, per-user) and 2026-11-20 (NEWS-254), row 5 of "UI build sequence (2026-11-16)" in `docs/ROADMAP.md`, and Phil's answers in the step 5 thread (2026-11-23), copied below.

Approach: SDD in a Claude session, built inline in the main model. One fresh sub-agent reviews the whole branch before the PR opens. Ledger: `bash .cursor/skills/subagent-driven-development/scripts/sdd-workspace <this plan>` → `progress.md`.

## Phil's answers (2026-11-23)

| # | Question | Answer |
|---|---|---|
| 1 | Morning cards | Step 5 defines and checks the data for the four cards. The Morning block moves to step 6 |
| 2 | Weather and Market shapes | From the mockup screenshot (see Task 2) |
| 3 | Requests | One route, `kind` per item, plus `{ items: [...] }` batches with a result per item |
| 4 | Story post | Nests sources, tags, categories, dates, panels, links. Entries are posted on their own |
| 5 | Same id again | Same content: unchanged. Story: re-post replaces its fields. Entry, Breaking, CFP, Morning: fixed, different content is 409 |
| 6 | Nested rows | Created or updated by their own id. Nothing is deleted by leaving it out |
| 7 | Ids | Opaque, 1–200 chars of `[A-Za-z0-9._:-]` |
| 8 | Token | One `INGEST_TOKEN`, `Authorization: Bearer`, constant-time compare, 503 when unset or no database |
| 9 | Cited sources | `url`/`label` optional with `sourceId`, copied from the `story_sources` row (label = outlet). Entry source url nullable (schema v4) |
| 10 | Timestamps | Also accept `z`, `±HHMM`, a space or lowercase `t` separator; still refuse no offset |
| 11 | JSON checks | Weather and Market `data`, Seats payload; other panel kinds any object under a size cap |
| 12 | Entry body | Optional (schema v4) |
| 13 | Errors | 23503 → 422 missing, 23505 → 409, 23514/23502/22xxx → 422, store error → 422, else 500 with no SQL text |
| 14 | Labels | Stored lowercase values |
| 15 | Tags | Inline per entry `{ slug, name }`, created on the story when missing |
| 16 | Limits | Headline 200, 10 bullets of 280, 20 tags per entry |
| 17 | Categories | By id, existing only |
| 18 | Private marker | `ownerUserId`. Must exist. A disabled account still has an id and is accepted |
| 19 | Owner on re-post | May change or clear |
| 20 | Read-back | Yes: token-only `GET /api/ingest/:kind/:id`. Operator in-site visibility stays open |
| 21 | Breaking about a private story | Accepted; hidden from other users (hiding built in step 11) |
| 22 | Private branches | Keep current refusals |
| 23 | What following changes | Open |
| 24 | Hold | Cleared for this ticket |
| 25 | Contract doc | `docs/INGEST.md`, linked from `PRODUCT_SPEC.md` |

## Global constraints

- Nothing under `.github/workflows`, no UI screens, no `AGENTS.md`/`CLAUDE.md` edits, nothing from NEWS-255/256.
- `npm run dev` unchanged. The server still starts with no Postgres and no token.
- Any `schema.sql` edit bumps `DASHBOARD_SCHEMA_VERSION` and adds its hash to `SCHEMA_HASHES`.
- Env reads outside tests must be listed in `mvp/.env.example`. New test files go in the `test` script.
- No SQL text, stack or token in any response or log line.

## Tasks

### Task 1 — Store foundations and schema v4

Files: `store/postgres/storeSupport.ts`, `schema.sql`, `dashboardStore.ts`, `schemaV3.test.ts` (hash), `storeSupport.test.ts` (new), `dashboardStore.test.ts`.

- `DashboardStoreError` gets `reason: 'invalid' | 'missing' | 'conflict'` (default `invalid`).
- `storeErrorFrom(error)`: maps Postgres codes to `DashboardStoreError` (23503 missing, 23505 conflict, 23514/23502/22xxx invalid). Anything else is returned unchanged.
- `asInstant` accepts `T`/`t`/space, `Z`/`z`/`±HH:MM`/`±HHMM`; refuses no offset.
- `asId(value, label)`: the caller id format.
- Schema v4: `story_entries.body` nullable; `story_entry_sources.url` nullable with CHECK `url IS NOT NULL OR source_id IS NOT NULL`. Version 4 and its hash.
- `createStoryEntry`: optional body; a source with `sourceId` may omit `url`/`label`, copied from the row (label = outlet, url = row url, may be null). A source without `sourceId` still needs both.
- Read types: `body: string | null`, entry source `url: string | null`.

### Task 2 — JSON shapes for Morning data and panels

Files: `store/postgres/jsonShapes.ts` (new) and its test. Wired into `createMorningItem` and `createStoryPanel`.

- `weather`: `{ unit: 'F'|'C', issuedAt: instant, alertsAt?: instant, days: date[] (1–10), locations: [{ name, now?: { temp: number, conditions?: text, rainChancePct?: 0–100 }, days: [{ high: number, low: number }] (same length as days), note?: text, alert?: text }] (1–12) }`. From the mockup: Thu–Sun columns, high/low, "now 52° clear rain 7% today", a note line, an alert line, and the "6:32 AM · alerts 9:59 PM" header.
- `market`: `{ quotes: [{ label, value: number, changePct?: number }] (1–20), notes?: text[] (≤ 6) }`. From the mockup: S&P, Nasdaq, VIX, and the "Needs attention" and feed lines.
- `osint`: `{ watch?: text }` or null (the "Watch:" line). `bluf`: data must be null.
- Panels: `seats` is `{ segments: [{ name, value: number }] (1–20), threshold?: number, note?: text }`; any other kind is an object up to 32 KB serialized.

### Task 3 — Retry-safe puts (ingest store)

Files: `store/postgres/ingestStore.ts` (new) and its test; small extractions in `dashboardStore.ts` and `storyDetailStore.ts` so each row is validated by one function.

- `putStory`, `putEntry`, `putBreaking`, `putCfpItem`, `putCfpDayNote`, `putMorning`, each in one transaction, returning `{ outcome: 'created'|'updated'|'unchanged', id }`.
- Story: upsert with `IS DISTINCT FROM`; role and hub cannot change on re-post (409). Owner may change or clear; a hub with branches cannot become private (422). Nested rows upsert by id; a nested id that belongs to another story is 409. Tags by `(story, slug)`. Categories by id, missing → 422. Links upsert on the pair.
- Fixed kinds: read by id; none → insert; same → unchanged; different → 409. A unique violation from a racing insert re-reads and compares.
- Entry: tags inline, created on the story when missing; compared by slug set.
- `readIngested(kind, id)` for the read-back: story with its nested rows, entry with tag slugs, others as stored.
- Existing `create*` functions accept an optional `id`; a duplicate id is a conflict.

### Task 4 — Ingest route

Files: `src/ingest/parse.ts`, `src/ingest/ingestRoutes.ts`, `src/ingest/openIngest.ts` (+ tests), `app.ts`, `index.ts`, `mvp/.env.example`, `package.json` test script.

- Mounted at `/api/ingest` before the global JSON parser and the session guard, with its own 1 MB JSON limit.
- 503 with no token or no database; 401 on a wrong or missing Bearer token (constant time).
- `POST`: one item → 201 created / 200 updated or unchanged / 409 / 422 / 503; `{ items }` (1–100) → 200 with a result per item, each in its own transaction.
- `GET /api/ingest/:kind/:id` → 200 or 404.
- `parse.ts` checks the kind, id, types and the limits, and turns the item into a store put.
- Database unreachable → 503; unexpected → 500 with a fixed message and a log line without SQL.

### Task 5 — Docs

`docs/INGEST.md` (new), `docs/DECISIONS.md` (2026-11-23 entry, Decision/Why/What it rules out), `docs/ROADMAP.md` (row 5 Done with the key; row 5/6 wording for the Morning block move), `docs/PRODUCT_SPEC.md`, `docs/WHATS_NEW.md`. Run `npm run test:kite`.

### Task 6 — Whole-branch review

One fresh sub-agent with `scripts/review-package`. Fix findings, re-run the suite.
