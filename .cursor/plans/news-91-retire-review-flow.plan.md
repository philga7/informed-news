# NEWS-91 — Retire review flow from default path; park claims desk

Spec: Jira [NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91) (Epic L, NEWS-84). Ticket text is the binding authority; this plan argues from it.

> **Scope (ticket):** Remove Radar's Needs review queue, Mark reviewed, Accept and Track from the default operator path (Radar route becomes / redirects to Topics + Filtered out). Keep server code/APIs where cheap; no hard deletes of stored data. Claims extraction/judging (Epic J) no longer runs as part of refresh; park it (document how to run manually if kept). Update `AGENTS.md`, `README`, `docs/OWNED_BRIEF.md`, `docs/ROUTE_MAP.md`, `docs/CLAIMS_DISCERNMENT.md`, `docs/MVP_API_COMPAT.md`, `docs/ROADMAP.md`, smoke docs to describe the topic-driven brief.
>
> **Acceptance:** `npm run dev` default path has no review step. Docs describe topics → search → triage → Brief → full stories; claims desk marked parked.

Branch: `feat/news-91-retire-review-flow`.

## Global Constraints

- Product invariants (`AGENTS.md`): Kite (`apps/kite`) + `mvp/server` only; business logic in `mvp/server`, thin UI; no Supabase, no `_legacy/`.
- **Server APIs and stores stay.** Do not delete `mvp/server` routes, services, or stores for Radar / claims / accept / track / membership / review queue (ticket: "keep server code/APIs where cheap"). Do not delete or migrate any `mvp/data/*.json` file. Only the refresh wiring changes server-side (Task 1).
- Claims extraction is already manual-only today (`POST /api/claims/extract`, `POST /api/claims/enrich`; nothing in `refreshRunner.ts` / `fetchAllSources.ts` calls claims code). Keep it that way; do not add claims to refresh.
- **Add story (manual seed, `/api/brief/seed`, `ManualBriefSeedModal`, `briefSeed.ts`) and story Unaccept are out of scope** — owned by NEWS-98. Keep them working; only repoint their login links (Task 2).
- TypeScript strict. `npm run typecheck` (mvp/server) clean; `cd apps/kite && bun run check` must stay **0 errors, 0 warnings**.
- Tests: server `npm test --prefix mvp/server` (`node:test`; the test list lives in `mvp/server/package.json` `scripts.test` — keep it in sync with any test file you add/remove); Kite `cd apps/kite && bun run test:unit && bun run test:integration`; root contract tests `npm run test:kite`; e2e `npm run test:e2e:kite` (hermetic stack under `e2e/stack/`, never `mvp/data` / `mvp/.env`). No skipped tests.
- Prefer Informed News glue over upstream Kite edits. Copy strings live as exported constants in `$lib` glue modules, not inline.
- Never commit `mvp/.env` or `mvp/data/*`.

### Exact values

- `/radar` → `redirect(307, '/topics')` from `apps/kite/src/routes/radar/+page.server.ts` (`load`). Query string is not forwarded.
- Login hint copy (replaces every "Open Radar login" / "Sign in on Radar" string): `Log in on Topics` linking `/topics`.
- Mute-rule copy constants move from `$lib/radar.ts` to `$lib/topics.ts`, renamed `RADAR_MUTES_*` → `MUTES_*` (same string values).
- Parked banner text used in docs (verbatim first line under the H1 of `docs/CLAIMS_DISCERNMENT.md`): `> **Parked (Epic L, NEWS-91).** The claims desk (Radar claim inbox, Needs review, Mark reviewed, Accept, Track, Brief claims lead) is off the default product path. Server APIs and stored claims remain; extraction runs only when called manually.`

---

## Task 1: Server — drop tracked-story sync from refresh

**Files:** `mvp/server/src/services/refreshRunner.ts` (+ `refreshRunner.test.ts`), `mvp/server/src/app.test.ts` (only tests that depend on refresh calling tracked sync), `mvp/server/src/services/index.ts` if exports change.

1. `createRefreshRunner` no longer calls a tracked-stories sync. Remove the `syncTracked` dep from `RefreshRunnerDeps` and the `try { await syncTracked() } …` block. Refresh steps become: fetch (ingest + topic search + triage) → Brief summaries → full stories → meta.
2. Remove `createTrackedStoriesSync` and `countByClusterIdFromArticles` from `refreshRunner.ts` **only if** they have no other caller after step 1; leave `syncTrackedAfterFetch` and the tracked stores themselves untouched (still used by the kept `/api/brief/track*` routes or harmless).
3. Update tests: remove assertions that refresh calls tracked sync; add one test asserting a refresh run invokes `fetchAll`, `generateSummaries`, `generateFullStories` in order and nothing else is injected (i.e. the deps type has no `syncTracked`). Adjust any `app.test.ts` `POST /api/fetch` test that injected or asserted tracked sync.
4. `npm run typecheck` and `npm test --prefix mvp/server` pass.

## Task 2: Kite — retire Radar from the default path

**Files (delete):** `apps/kite/src/routes/radar/+page.svelte`, `apps/kite/src/lib/radar.ts`, `apps/kite/src/lib/components/brief/BriefClaimsLead.svelte`, `apps/kite/src/lib/briefClaims.ts`, and Kite proxy routes under `apps/kite/src/routes/api/` whose **only** consumers were the deleted files / Footer badge: `radar`, `claims/*` (radar, accept, unaccept, track, untrack, tracked, tracked/ack, membership, enrich, review/dismiss, review/dismiss-all, and any other `claims/*` proxy), `brief/accept`, `brief/track`, `brief/untrack`, `brief/tracked`, `brief/tracked/ack`, `brief/membership`, `batches/latest/claims`, `batches/[batchId]/claims`. Before deleting each proxy, `rg` for its path in `apps/kite/src` and keep it if anything else still calls it. **Keep** `brief/seed`, `brief/unaccept`, `brief/mutes*`, `brief/seen`, `brief/overview`, `brief/stories/**`, `topics*`, `triage/filtered`, and anything else still referenced.

**Files (create):** `apps/kite/src/routes/radar/+page.server.ts`.

**Files (modify):** `apps/kite/src/lib/topics.ts` (+ its test), `apps/kite/src/routes/topics/+page.svelte`, `apps/kite/src/lib/components/Footer.svelte`, `apps/kite/src/lib/brand.ts`, `apps/kite/src/routes/+page.svelte`, `apps/kite/src/lib/components/StoryList.svelte`, `apps/kite/src/lib/components/ManualBriefSeedModal.svelte`, `apps/kite/src/lib/briefSeed.ts` (+ test), `apps/kite/src/app.css` (comment only), `e2e/kite-smoke.spec.ts`, `tests/nav-shell.test.js`.

1. Redirect: `+page.server.ts` with `load` → `redirect(307, '/topics')` (import from `@sveltejs/kit`).
2. Move `RADAR_MUTES_*` constants into `$lib/topics.ts` as `MUTES_*` (identical values); update Topics page imports; add/extend a vitest asserting the moved constants exist with the same values. Delete `$lib/radar.ts` and the Radar page.
3. Footer: remove the `/radar` link, the tracked-update dot/badge, `loadPendingTrackedCount` and its types/state/call. Keep the Topics link. `brand.ts`: remove the `footer.radar` key (check `tests/branding.test.js` and any locale tooling still pass).
4. Brief page (`routes/+page.svelte`): remove both `BriefClaimsLead` renders and the import. Keep the stories section heading behavior unchanged otherwise (if `BRIEF_STORIES_SECTION_TITLE` came from `briefClaims.ts`, move that constant to the glue module that still needs it, e.g. `$lib/topicBrief.ts` or `$lib/briefSeed.ts`, same value). Delete `BriefClaimsLead.svelte` and `briefClaims.ts`.
5. Login links: every `href="/radar"` / "Open Radar login" / "Sign in on Radar" copy in `StoryList.svelte`, `ManualBriefSeedModal.svelte`, `briefSeed.ts` (`BRIEF_SEED_LOGIN_HINT` etc.) → `Log in on Topics` linking `/topics`. After this task `rg -n "/radar|Radar" apps/kite/src` must only hit the redirect file (and unrelated upstream Kite strings, if any — list them in the report).
6. Delete the now-orphaned Kite proxy routes listed above.
7. E2E: replace the `/radar loads session shell` test with `/radar redirects to /topics` (navigate to `/radar`, expect URL `/topics` and the Topics heading). Assert the footer has no link to `/radar` on `/`.
8. `tests/nav-shell.test.js`: assert `apps/kite/src/routes/radar/+page.svelte` does **not** exist, `apps/kite/src/routes/radar/+page.server.ts` exists and contains `redirect(307, '/topics')`, footer has no `href="/radar"`, and `/topics` + `/filtered` pages exist. Leave assertions about `docs/ROUTE_MAP.md` content unchanged here — Task 3 updates the doc and those assertions together.
9. Verification: `cd apps/kite && bun run check` (0/0), `bun run test:unit`, `bun run test:integration`; `npm run test:kite`; `npm run test:e2e:kite`.

## Task 3: Docs + roadmap + contract tests

**Files:** `AGENTS.md`, `README.md`, `docs/OWNED_BRIEF.md`, `docs/ROUTE_MAP.md`, `docs/CLAIMS_DISCERNMENT.md`, `docs/MVP_API_COMPAT.md`, `docs/ROADMAP.md`, `docs/BRIEF.md`, `docs/TRIAGE.md`, `docs/TOPIC_SEARCH.md`, `docs/RADAR_SOURCES.md`, `mvp/SMOKE.md`, `.cursor/rules/news-roadmap.mdc`, `tests/nav-shell.test.js`, `tests/mvp-api-compat.test.js`.

1. **Pipeline story (every doc that describes the product flow):** topics (`/topics`) → search (Google News RSS + SearXNG) → triage (keyword/mute → dedupe → Jev headline → scrape → Jev body) → Brief by topic (top 3 per topic, Ollama summaries for shown stories) → full stories (tap to expand) ; dropped stories visible on `/filtered`. No review queue, no Accept/Track step.
2. `docs/CLAIMS_DISCERNMENT.md`: add the exact parked banner (see Exact values). Describe Radar/claims inbox in past tense. Add a **Running claims manually** section: with a session cookie, `POST /api/claims/extract` (body `{ limit?, force?, articleIds? }`; without `articleIds` it skips topic-search rows) and `POST /api/claims/enrich`; note results are stored but no default UI shows them; TypeSafe/Ollama split still binding.
3. `docs/ROUTE_MAP.md`: remove `/radar` from **Shipped (live)**; add a **Retired** section/table row: `/radar` → 307 redirect to `/topics` (NEWS-91; Needs review / Mark reviewed / Accept / Track retired; server APIs parked). Fix any "Developing desk" / Epic I planned rows that imply Radar is live.
4. `docs/MVP_API_COMPAT.md`: keep every route row (APIs remain) but mark the Radar / claims / accept / track / membership / review-queue / tracked rows **Parked (no UI, NEWS-91)**; note `POST /api/fetch` refresh no longer syncs tracked stories and never runs claims extraction.
5. `docs/OWNED_BRIEF.md`: rewrite the interim/claims/membership/tracking/Radar sections into a short current description (topic Brief from triage-kept records) + a **Parked: story desk and claims desk** section summarizing what was retired and that data/APIs remain. Keep the Manual seed section (NEWS-98 owns it) but drop Radar references from it.
6. `docs/BRIEF.md`, `docs/TRIAGE.md`, `docs/TOPIC_SEARCH.md`, `docs/RADAR_SOURCES.md`, `mvp/SMOKE.md`: remove "on Radar" / accepted-claims lead / "Still interim" NEWS-91 bullets; `RADAR_SOURCES.md` keeps the curated-sources content (refresh ingest still uses `radar-sources.json`) but drops desk/triage-fuel wording. `SMOKE.md` smoke steps must not include a review step.
7. `AGENTS.md`, `README.md`, `.cursor/rules/news-roadmap.mdc`: Epic J claims desk **parked** (not just "Done"); product routes list unchanged except no Radar; Current next = NEWS-91 Done → next **NEWS-99** (prune summaries store) per `docs/ROADMAP.md` order. `docs/ROADMAP.md`: NEWS-91 row **Done**, NEWS-99 `*(next)*`; replace the "Story-desk membership (still live until claim cutover)" section with a short **Retired (NEWS-91)** note; keep historical Epic J / NEWS-57 tables.
8. Contract tests: `tests/nav-shell.test.js` — ROUTE_MAP Shipped section must **not** include `` `/radar` `` and a Retired section must mention `/radar` and `/topics`; rename the test titles that say "Radar shipped". `tests/mvp-api-compat.test.js` — keep server-route assertions; add an assertion that the doc marks the Radar/claims rows parked (e.g. `/Parked/` near `/api/claims/radar` and `/api/radar`). Add a test in `tests/nav-shell.test.js` (or a new root test added to `test:kite`) asserting `docs/CLAIMS_DISCERNMENT.md` contains `Parked (Epic L, NEWS-91)`.
9. Verification: `npm run test:kite`, `npm run typecheck`, `npm test --prefix mvp/server`; `rg -n "Radar" AGENTS.md README.md docs mvp/SMOKE.md` — every remaining hit is past-tense/parked/retired context or `RADAR_SOURCES.md` file naming (list them in the report).
