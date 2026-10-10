# NEWS-98 — Manual seeds (Add story) on the topic Brief; retire Unaccept

Spec: Jira [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98) (Epic L, NEWS-84), grilled 2026-10-09. The ticket's **Decisions** and **Done when** are the binding authority; this plan argues from them.

Branch: `feat/news-98-manual-seeds-topic-brief`.

## Global Constraints

- Product invariants (`AGENTS.md`): Kite (`apps/kite`) + `mvp/server` only; business logic in `mvp/server`, thin UI; no Supabase, no `_legacy/`; flat JSON stores via store helpers; mutating APIs behind the session (every `/api/*` route registered in `createApp` after the session middleware already is; follow the existing pattern).
- TypeScript strict. `npm run typecheck` (mvp/server) clean; `cd apps/kite && bun run check` stays **0 errors, 0 warnings**.
- **Test-first (`/tdd`)**: for each behavior, write the failing test at the public seam first (service function, `createApp` route via the existing `app.test.ts` harness, Kite `$lib` helper), then the minimum code. Tests assert behavior through public interfaces, with expected values from the spec (literals), never recomputed the way the code computes them.
- Tests: server `node:test` (`npm test --prefix mvp/server`; **new server test files must be added to the explicit list in `mvp/server/package.json` `test` script**); Kite vitest (`cd apps/kite && bun run test:unit`, `bun run test:integration`); root contract tests `npm run test:kite`; e2e `npm run test:e2e:kite` (hermetic `e2e/stack/`, never `mvp/data` / `mvp/.env`, never the internet). No skipped tests.
- Copy strings are exported constants in the `$lib` glue module (`apps/kite/src/lib/briefSeed.ts`, `apps/kite/src/lib/topicBrief.ts`), not inline in markup.
- Kite proxies use `$lib/server/proxy` (`proxyPOST('/brief/stories/[articleId]/…')` pattern).
- Honesty: no verdict language; seeds are labelled as operator-added.
- Never commit `mvp/.env` or `mvp/data/*`.

### Definitions (exact)

- **Seed** = article with `sourceKind: 'manual'`.
- **Seed triage record** = `{ articleId, status: 'kept', reason: null, stage: 'manual', final: true, topicIds: [topicId], labels: [], duplicateOf: null, memberIds: [], outletCount: <distinct URL hostnames, www. stripped, lowercased, min 1>, significance: null, bodyChecked: false, jevCalls: 0, triagedAt: <save time ISO> }`.
- **Window** = `TRIAGE_WINDOW_HOURS` (48 h) from `publishedAt ?? fetchedAt` (seeds: `fetchedAt` = save time).
- **Seed scrape timeout** = `MANUAL_SEED_SCRAPE_TIMEOUT_MS = 8000` (default publisher scrape timeout stays 15 000).

### Error copy (exact, server)

| case | status | body |
|---|---|---|
| title missing/blank | 400 | `{ ok: false, error: 'title is required' }` (existing) |
| `topicId` missing / not a string | 400 | `{ ok: false, error: 'topicId is required' }` |
| topic unknown or not desired | 400 | `{ ok: false, error: 'topic must be a desired topic' }` |
| no URLs | 400 | `{ ok: false, error: 'at least one URL is required' }` |
| bad URL | 400 | `{ ok: false, error: 'urls must be valid http or https URLs' }` (existing) |
| mute rule match | 409 | `{ ok: false, code: 'muted', error: "This matches your mute rule '<keyword>', so it wouldn't show." }` |
| undesired topic match | 409 | `{ ok: false, code: 'muted', error: "This matches your undesired topic '<name>', so it wouldn't show." }` |
| duplicate of kept story | 409 | `{ ok: false, code: 'duplicate', error: "Already in your Brief: '<headline>' under <topic name>.", existing: { articleId, title, topicName } }` |

`<topic name>` = name of the existing record's first `topicIds` entry that still exists in the topics store, else `another topic`.

---

## Task 1: Server — serialized triage updates, seed pinning, "Added by you" flag

**Files:** modify `mvp/server/src/store/triageStore.ts` (+ `triageStore.test.ts`), `mvp/server/src/store/index.ts`, `mvp/server/src/types/triage.ts`, `mvp/server/src/services/triagePipeline.ts` (+ test), `mvp/server/src/services/topicBrief.ts` (+ test), `mvp/server/src/services/kiteBriefAdapter.ts` (+ test).

1. `TriageStage` gains `'manual'`; the store's `STAGES` set accepts it (round-trip test).
2. `triageStore.ts`: `updateTriage(mutate: (store: TriageStore) => TriageStore, triagePath = TRIAGE_PATH): Promise<TriageStore>` — reads, applies `mutate`, writes atomically, returns the written store; calls for the same path run strictly one after another through an in-process queue (pattern: `enqueueWrite` in `briefSummariesStore.ts`; a failed update must not block later ones). Export from `store/index.ts`. Tests: sequential application of two concurrent updates (neither lost); a throwing mutator rejects that call only.
3. `triagePipeline.ts`: the final write goes through `updateTriage` (dep `updateTriage?: typeof updateTriage` replacing `writeTriage` in deps; update existing tests). Merge rule inside the mutator, with `current` = store on disk at write time and `computed` = the records the run built (today's `records` object):
   - Every non-`'manual'`-stage record comes from `computed` (today's behavior, including deletion of records whose article is gone).
   - For `'manual'`-stage records: an id present in `current` is kept — using the `computed` version when `computed` also has it (dedupe may have grown `memberIds` / `outletCount`), else the `current` version (seed added during the run). An id in `computed` but absent from `current` is dropped (seed removed during the run).
   - Tests: seed added between the run's read and write survives; seed removed during the run stays removed; dedupe growth of a seed (an in-window search article duplicating the seed's URL) is kept.
4. `topicBrief.ts`: `BriefStory` gains `manualSeed: boolean` (= kept article `sourceKind === 'manual'`). Ranking: seeds first within a section, newest seed first (`publishedAt ?? fetchedAt`), then the existing order for everything else. Seeds count toward `BRIEF_TOP_N` like any card. Tests: a seed with `significance: null` ranks above a 2.0 story; two seeds newest first; `more` flags shift accordingly.
5. `kiteBriefAdapter.ts`: topic stories with `manualSeed` get `informed_added_by_you: true` (omit otherwise). Test both.

## Task 2: Server — seed save on the topic Brief

**Files:** modify `mvp/server/src/services/manualBriefSeed.ts` (+ `manualBriefSeed.test.ts`), `mvp/server/src/services/publisherBodyScrape.ts` (+ test), `mvp/server/src/app.ts` (+ `app.test.ts`). Reuse `muteReason` (`triageKeywords.ts`), `storiesAreDuplicates` / `DedupeCandidate` (`triageDedupe.ts`), `TRIAGE_WINDOW_HOURS`, `updateTriage` (Task 1), topics / mute-rules / articles store readers.

1. `scrapePublisherBody(url, opts?: { timeoutMs?: number })` — optional timeout override; default unchanged. Test the override is honored (e.g. a local `http.createServer` that never responds, timeout ~50 ms → `bodyStatus: 'unavailable'`).
2. `parseManualSeedBody`: body gains required `topicId` (string) and `urls` becomes required non-empty (error table). `note` stays optional.
3. `createManualSeed(input, deps)` flow:
   1. Read topics, mute rules, articles, triage (deps-injectable, defaulting to the real stores).
   2. Topic must exist with `kind === 'desired'` → else 400 (`ManualSeedValidationError`).
   3. Build the article (`buildManualSeedArticle`, unchanged identity rules).
   4. Mute check: `muteReason(article, rules, undesiredTopics)`; on a hit throw a new `ManualSeedConflictError` carrying the 409 body from the error table (rule id → rule `keyword`; topic id → topic `name`).
   5. Duplicate check: `storiesAreDuplicates({ article, topicIds: [topicId] }, { article: kept, topicIds: rec.topicIds })` against every kept triage record whose article is in the window (seen state ignored). First match (iteration order of `Object.values(triage.records)`) → `ManualSeedConflictError` with the duplicate body.
   6. Scrape `urls[0]` with `MANUAL_SEED_SCRAPE_TIMEOUT_MS`; on `bodyStatus: 'ok'` set `bodyText` + `bodyStatus: 'ok'`; otherwise keep `bodyText: null`, `bodyStatus: 'not_applicable'` (so a note ≥ 120 chars is the summary source). Only body fields are taken from the scrape.
   7. `upsertArticle(article)`; then `updateTriage` inserting the seed triage record (Definitions).
   8. **No** `acceptCluster` / `trackCluster` calls (remove those deps).
   9. Return `{ article, topicId }`.
   - Steps 4–5 run before any write; a refused seed writes nothing.
4. Route `POST /api/brief/seed`: 200 `{ ok: true, articleId, clusterId, topicId }`; `ManualSeedValidationError` → 400; `ManualSeedConflictError` → 409 with its body; other errors → 500 `{ ok: false, error }`.
5. Tests (service + route): validation table rows; mute-rule and undesired-topic 409 with exact copy; duplicate 409 (shared URL, and similar headline in the chosen topic) including a seen/hidden existing story; out-of-window kept story is not a duplicate; scrape ok → body stored; scrape failure → `not_applicable`; triage record exactly per Definitions (outletCount from 2 URLs on 2 hosts = 2, `www.` + same host = 1); no accept/track store writes; refused seed writes neither article nor triage; the seed appears in `composeTopicBrief` output pinned in its topic section.

## Task 3: Server — Remove a seed

**Files:** modify `mvp/server/src/app.ts` (+ `app.test.ts`); a small service function (e.g. `removeManualSeed` in `manualBriefSeed.ts`, + test).

1. `POST /api/brief/stories/:articleId/remove` (session):
   - Article not in the store → 404 `{ ok: false, error: 'story_not_found' }`.
   - Article not `sourceKind: 'manual'` → 409 `{ ok: false, error: 'not_a_seed' }`.
   - No triage record for it → 404 `{ ok: false, error: 'story_not_found' }`.
   - Else delete its triage record via `updateTriage` → 200 `{ ok: true }`. The article stays; summary / full-story records are left to the retention prune.
2. Tests: 401 without session; the three error cases; 200 removes the record and the story is gone from `composeTopicBrief`; nothing is written to dropped records (no Filtered out trace).

## Task 4: Kite — Add story form, "Added by you", Remove; retire Unaccept

**Files:** modify `apps/kite/src/lib/briefSeed.ts` (+ `__tests__/briefSeed.test.ts`), `apps/kite/src/lib/components/ManualBriefSeedModal.svelte`, `apps/kite/src/lib/topicBrief.ts` (+ `__tests__/topicBrief.test.ts`), `apps/kite/src/lib/types.ts`, `apps/kite/src/lib/components/brief/TopicBrief.svelte`, `apps/kite/src/lib/components/StoryList.svelte`, `apps/kite/src/lib/components/story/StoryCard.svelte`, `apps/kite/src/lib/components/story/StoryHeader.svelte`; create `apps/kite/src/routes/api/brief/stories/[articleId]/remove/+server.ts`; delete `apps/kite/src/routes/api/brief/unaccept/`.

1. **Retire Unaccept:** remove the Unaccept button/props from `StoryHeader` / `StoryCard`, the unaccept state/handler/error block from `StoryList`, `postBriefUnaccept` + `BriefUnacceptResult` + `BRIEF_UNACCEPT_*` from `briefSeed.ts` (and their tests), and the Kite `/api/brief/unaccept` proxy. Server route untouched.
2. **`briefSeed.ts`:**
   - `BriefSeedPayload` = `{ title: string; topicId: string; note?: string; urls: string[] }`.
   - Copy: `BRIEF_SEED_TOPIC_LABEL = 'Topic'`, `BRIEF_SEED_TOPIC_PLACEHOLDER = 'Choose a topic'`, `BRIEF_SEED_URLS_LABEL = 'URLs (one per line, at least one)'`, `BRIEF_SEED_NO_TOPICS = 'Add a desired topic first.'`, `BRIEF_SEED_NO_TOPICS_LINK_LABEL = 'Go to Topics'`, `BRIEF_SEED_TOPIC_REQUIRED = 'Choose a topic.'`, `BRIEF_SEED_URL_REQUIRED = 'Add at least one URL.'`, `BRIEF_SEED_LOGIN_HINT = 'Log in to add stories.'` (link label stays `Log in on Topics`, href `/topics`). Delete `BRIEF_SEED_TOPIC_BRIEF_NOTE`.
   - `seedTopicOptions(topics: Topic[])` → desired topics, Core (or no level) first then Watch, each in input order: `{ id, name, level }[]`.
   - `fetchSeedTopics(fetchFn)` → `GET /api/topics` → `{ ok: true, topics } | { ok: false, unauthenticated: boolean, error }`.
   - `postBriefSeed`: 409 / 400 → `{ ok: false, status, error: body.error }` (server copy shown verbatim); 401 → login hint; network → existing copy.
3. **Modal:** on open, load topics; render a required `<select>` (placeholder option disabled, no preselection) built from `seedTopicOptions`; with zero desired topics show `BRIEF_SEED_NO_TOPICS` + link to `/topics` and disable submit; 401 on topics → login hint. URLs textarea required; client-side `BRIEF_SEED_TOPIC_REQUIRED` / `BRIEF_SEED_URL_REQUIRED` before posting. Remove the topic-Brief note. After success: close, reload data, `goto('/')` (unchanged).
4. **Badge + Remove (`topicBrief.ts`, `TopicBrief.svelte`, `types.ts`):**
   - `types.ts`: `informed_added_by_you?: boolean` beside the other `informed_*` fields.
   - `topicBrief.ts`: `BRIEF_ADDED_BY_YOU_LABEL = 'Added by you'`, `isManualSeedStory(story)`, `BRIEF_REMOVE_LABEL = 'Remove'`, `BRIEF_REMOVE_PENDING = 'Removing…'`, `BRIEF_REMOVE_ERROR = 'Could not remove this story. Try again.'`, `BRIEF_REMOVE_LOGIN_HINT = 'Log in on Topics to remove stories'`, `postRemoveSeed(articleId, fetchFn)` → `{ ok: true } | { ok: false, unauthenticated: boolean, error }`.
   - `TopicBrief.svelte` `storyMeta`: the **Added by you** pill in the badge row (same styling as `Official statement`), shown collapsed and expanded. Expanded seed cards show a `Remove` text button (data-testid `seed-remove`) instead of `LessLikeThis`; on success hide the card immediately and reload the overview; errors inline (`role="alert"`), 401 → login hint linked to `/topics`.
   - Proxy: `POST /api/brief/stories/[articleId]/remove`.
5. **Tests (vitest):** `seedTopicOptions` (filters undesired, Core/no-level before Watch, keeps order), `fetchSeedTopics` (ok / 401 / 500 / network), `postBriefSeed` (200, 400 copy, 409 copy verbatim, 401, network, payload carries `topicId` + `urls`), `isManualSeedStory`, `postRemoveSeed` (200 / 401 / 404 / 409 / network). Assert Unaccept is gone: no `BRIEF_UNACCEPT` / `postBriefUnaccept` export (import-shape test) and no `unaccept` proxy route file.

## Task 5: E2E, contract tests, docs

**Files:** `e2e/stack/config.mjs`, `e2e/stack/start.mjs`, `e2e/kite-smoke.spec.ts`, `tests/mvp-api-compat.test.js` (and any other root test touched by the doc changes), `docs/BRIEF.md`, `docs/MVP_API_COMPAT.md`, `docs/OWNED_BRIEF.md`, `mvp/SMOKE.md`, `docs/ROADMAP.md`, `agents.md`, `.cursor/rules/news-roadmap.mdc`.

1. **Fixture page:** `config.mjs` exports `E2E_FIXTURE_PORT = Number(process.env.E2E_FIXTURE_PORT ?? E2E_API_PORT + 100)`. `start.mjs` starts a tiny `node:http` server on it (stopped with the other children) serving `GET /seed-article` → an HTML page with an `<article>` body of ≥ 200 characters about a subject unrelated to every seeded scenario headline (so the duplicate check doesn't fire). Export the fixture URL helper for the spec.
2. **E2E scenario** (`Manual seeds (NEWS-98)` describe; log in with the existing `page.request.post('/api/login')` pattern): open Add story from the header → choose the seeded Core topic → title + the fixture URL → `Add to Brief` → the card appears **first** in that topic's section with `Added by you` and the summary placeholder `Summary loads when you open this story` → expand → `Remove` → the card is gone after reload. The test must leave the Brief as it found it (Remove is the undo). Also: no `Unaccept` button anywhere on `/`.
3. **Contract tests:** `tests/mvp-api-compat.test.js` asserts `app.post('/api/brief/stories/:articleId/remove'` in `app.ts` and a `POST | \`/api/brief/stories/:articleId/remove\`` row in `MVP_API_COMPAT.md`; the existing `/api/brief/unaccept` assertions stay valid (server route + doc row remain, doc row text changes).
4. **Docs:**
   - `BRIEF.md`: new **Added stories (seeds)** section (form, topic required, URL required, scrape, mute / duplicate refusals, pinned first, Added by you, same window / seen / summaries / full stories, Remove), route table rows for seed + remove, remove the Known limits **Add story** line.
   - `MVP_API_COMPAT.md`: seed row (new body/response/409s, no accept/track), remove row, unaccept row → "**Parked (no UI, NEWS-98).** Server-only: no Kite proxy …", fix the line-83 and line-125 prose (Kite no longer proxies `/api/brief/unaccept`).
   - `OWNED_BRIEF.md`: rewrite **Manual Brief seed (NEWS-66)** for the NEWS-98 behavior (topic Brief, no Accept/Track, Unaccept retired from Kite).
   - `mvp/SMOKE.md` 11b: body with `topicId` + `urls`, expected response, seed appears in the topic Brief.
   - `ROADMAP.md`: NEWS-98 row → **Done** (link `BRIEF.md`), *(next)* moves to NEWS-104 (row 12 bold), update the "NEWS-98 stays *(next)*" sentence in the hosting section and the Retired (NEWS-91) paragraph's NEWS-98 mention; `agents.md` Current next → NEWS-104; `.cursor/rules/news-roadmap.mdc` → NEWS-98 Done, next NEWS-104.
5. Run the full verification set: `npm run typecheck`, `npm test --prefix mvp/server`, `npm run test:kite`, `cd apps/kite && bun run check && bun run test:unit && bun run test:integration`, `npm run test:e2e:kite`.
