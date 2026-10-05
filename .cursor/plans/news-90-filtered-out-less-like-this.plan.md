# NEWS-90 — Filtered out view + "Less like this"

Spec: Jira [NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90) (Epic L, NEWS-84). Ticket text is the binding authority; this plan argues from it.

> **Scope (ticket):** *Filtered out* view — what the latest refresh(es) dropped and why (reason from triage). For spot checks and trust — no required actions. "Show anyway" out of scope. *Less like this* on a Brief card offers (a) create an undesired topic prefilled from the story's subject, or (b) block the outlet. Creates entries in the Topics store; takes effect next refresh.
>
> **Acceptance:** Every dropped candidate from the last refresh appears with its reason. "Less like this" creates an undesired topic or outlet block visible on the Topics page.

Branch: `feat/news-90-filtered-out-less-like-this`.

## Global Constraints

- Product invariants (`AGENTS.md`): Kite (`apps/kite`) + `mvp/server` only; business logic in `mvp/server`, thin UI; no Supabase, no `_legacy/`; flat JSON stores via existing store helpers; mutating / list APIs behind session (`requireApiSession` — every `/api/*` route registered in `createApp` after the session middleware already is; follow the existing pattern).
- TypeScript strict. `npm run typecheck` (mvp/server) clean; `cd apps/kite && bun run check` must stay **0 errors, 0 warnings**.
- Tests: server uses `node:test` (`npm test --prefix mvp/server`); Kite unit tests are vitest (`cd apps/kite && bun run test:unit`); root contract tests `npm run test:kite`; e2e `npm run test:e2e:kite` (hermetic stack under `e2e/stack/`, never `mvp/data` / `mvp/.env`). No skipped tests.
- Honesty: Jev reasons are AI-assisted judgments — the Filtered out page must say so ("AI-assisted judgments, not ground truth"). No verdict language.
- Prefer Informed News glue files in `apps/kite` over editing upstream Kite components. `StoryCard` already exposes a `belowHeader` snippet used by `TopicBrief.svelte`; use it rather than editing `StoryCard`/`StoryHeader`.
- Copy strings live as exported constants in the `$lib` glue module (pattern: `apps/kite/src/lib/topicBrief.ts`, `apps/kite/src/lib/topics.ts`), not inline in markup.
- Kite proxies to mvp/server via `$lib/server/proxy` (`proxyGET('/path')`, `proxyPOST('/brief/stories/[articleId]/summary')` pattern).
- Never commit `mvp/.env` or `mvp/data/*`.

### Reason labels and display order (exact)

Reason group key = `'muted'` for any `muted:<id>`, otherwise the static reason. Display order and labels:

| group | label |
|---|---|
| `muted` | `Muted` |
| `off_topic` | `Off-topic` |
| `clickbait` | `Clickbait` |
| `opinion` | `Opinion` |
| `rewrite` | `Rewrite / roundup` |
| `sponsored` | `Sponsored` |
| `not_significant` | `Not significant` |
| `duplicate` | `Duplicate` |
| `undated` | `Undated` |
| `stale` | `Too old` |
| `not_scored_budget` | `Not scored (budget)` |
| `not_scored_error` | `Not scored (error)` |

Non-final reasons (`not_scored_budget`, `not_scored_error`) show the note `Retried next refresh`.

### Definitions

- **Last refresh** = triage run in `meta.json → triage` (`TriageRunMeta`, `run.at`). Every record written by a run gets `triagedAt === run.at` (see `triagePipeline.ts`). So "dropped in the last refresh" = records with `status === 'dropped'` and `triagedAt === run.at`.
- **Last 48 hours** = dropped records with `triagedAt` within `TRIAGE_WINDOW_HOURS` (48) of now.
- **Outlet keyword** = keyword containing `.` and no whitespace (existing `isOutletKeyword` in `triageKeywords.ts`); outlet domains are compared lowercased with a leading `www.` stripped (existing `topicBlocksOutlet`).
- **Outlet-only topic** = undesired topic with ≥1 keyword where every keyword is an outlet keyword.

---

## Task 1: Server — filtered-out listing + overview count

**Files:** create `mvp/server/src/services/triageFiltered.ts` + `triageFiltered.test.ts`; modify `mvp/server/src/app.ts` (+ `app.test.ts`), `mvp/server/src/services/topicBrief.ts` / `kiteBriefRoutes.ts` (overview), tests next to them.

1. Pure builder `buildFilteredOut(input)` in `triageFiltered.ts`:
   - Input: `{ store: TriageStore, articles: Article[], topics: Topic[], muteRules: MuteRule[], run: TriageRunMeta | null, scope: 'last' | 'window', now: Date }`.
   - Selects dropped records per **Definitions** (scope `last` with `run === null` → no items). No cap — every matching record is returned.
   - Output:
     ```ts
     type FilteredOutItem = {
       articleId: string;
       title: string | null;            // article gone → null
       url: string | null;              // publisherUrl ?? canonicalUrl
       publisherDomain: string | null;
       publishedAt: string | null;
       sourceKind: string | null;
       reason: TriageReason;
       group: FilteredReasonGroup;      // see table
       final: boolean;
       stage: TriageStage;
       mutedBy: { kind: 'rule' | 'topic'; id: string; label: string } | null;
       topics: { id: string; name: string }[];   // record.topicIds that still exist, store order
       duplicateOf: { articleId: string; title: string | null; url: string | null } | null;
       triagedAt: string;
     };
     type FilteredOut = {
       scope: 'last' | 'window';
       run: TriageRunMeta | null;
       counts: Partial<Record<FilteredReasonGroup, number>>;
       items: FilteredOutItem[];
     };
     ```
   - `mutedBy` resolution for `muted:<id>`: a mute rule with that id → `kind: 'rule'`, label = rule keyword, plus ` (<source>)` when the rule has a source; else a topic with that id → `kind: 'topic'`, label = topic name; else `{ kind: 'topic', id, label: 'Removed rule or topic' }`.
   - Sort: by group display order (table above), then `publishedAt` newest first (null last), then `articleId` ascending.
   - Export the group order/type so later tasks and tests can import it (`FILTERED_REASON_GROUPS` as a readonly tuple in the table order).
2. Route `GET /api/triage/filtered?scope=last|window` in `createApp` next to `GET /api/triage` (session-protected like it). Missing/unknown `scope` → `last`. Reads triage store, articles, topics, mute rules, meta in parallel; responds `{ ok: true, ...FilteredOut }`; store read failure → 500 `{ ok: false, error }` (same pattern as `/api/triage`).
3. Overview count: `GET /api/brief/overview` gains `filteredOut: number | null` = `meta.triage.dropped` when a triage run exists and `skipped === false`, else `null`. Keep all existing fields unchanged.
4. Tests: builder unit tests (scope last vs window, run null, skipped run, every reason group incl. both muted kinds and removed id, non-final, duplicateOf join, article gone, sorting, deleted topic ids filtered out); app tests (401 without session, 200 shape, scope default, overview `filteredOut` both cases).

## Task 2: Server — "Less like this" + outlet field + Jev exclusion

**Files:** create `mvp/server/src/services/briefLessLikeThis.ts` + test; modify `triageKeywords.ts` (+ test), `triagePipeline.ts` (+ test), `kiteBriefAdapter.ts` (+ test), `app.ts` (+ `app.test.ts`). Use existing topics store helpers (the ones `POST /api/topics` uses) and `parseTopicCreate` / `TopicValidationError` from `topicInput.ts`.

1. `triageKeywords.ts`: export `normalizeOutletDomain(raw: string | null | undefined): string | null` (trim, lowercase, strip leading `www.`, empty → null), `isOutletKeyword`, and `isOutletOnlyTopic(topic)`; refactor `topicBlocksOutlet` to use the normalizer and export it. Behavior of `muteReason` must not change.
2. `triagePipeline.ts`: the Jev context's undesired list (`undesired.slice(0, TRIAGE_MAX_UNDESIRED_TOPICS)`) excludes outlet-only topics **before** slicing. Keyword/outlet muting (`muteReason`) still gets the full undesired list. Test: an outlet-only topic doesn't take one of the 10 Jev slots and still mutes by domain.
3. `kiteBriefAdapter.ts`: topic Brief stories gain `informed_publisher_domain?: string` = the kept article's normalized publisher domain (omit when none). Test it.
4. `briefLessLikeThis.ts` + route `POST /api/brief/stories/:articleId/less-like-this` (session):
   - Body `{ kind: 'outlet' }` or `{ kind: 'subject', name: string, keywords?: string[], description?: string }`. Anything else → 400 `{ ok: false, error: 'kind must be outlet or subject' }`.
   - Article not in the article store → 404 `{ ok: false, error: 'story_not_found' }`.
   - **outlet:** domain = `normalizeOutletDomain(article.publisherDomain)`; none → 400 `{ ok: false, error: 'no_outlet' }`. If an existing **undesired** topic already blocks that domain (`topicBlocksOutlet`) → 200 `{ ok: true, created: false, topic: <existing>, topics }`. Else create undesired topic `{ name: <domain>, kind: 'undesired', keywords: [<domain>], description: 'Outlet blocked from the Brief.', notes: 'Added with Less like this on: <headline>' }` → 201 `{ ok: true, created: true, topic, topics }`.
   - **subject:** create via `parseTopicCreate({ kind: 'undesired', name, keywords: keywords ?? [], description: description ?? '', notes: 'Added with Less like this on: <headline>' })`; validation errors → 400 with the validation message. → 201 `{ ok: true, created: true, topic, topics }`.
   - `notes` headline is the article title, truncated so the full notes string is ≤ `TOPIC_TEXT_MAX` (500).
   - Store write failure → 500 `{ ok: false, error }`.
5. Tests: service unit tests + app route tests (401, 400s, 404, outlet create, outlet dedupe incl. `www.` / subdomain-of-existing-block, subject create + validation error, notes truncation).

## Task 3: Kite — `/filtered` page

**Files:** create `apps/kite/src/lib/filteredOut.ts` + `apps/kite/src/lib/__tests__/filteredOut.test.ts`, `apps/kite/src/routes/filtered/+page.svelte`, `apps/kite/src/routes/api/triage/filtered/+server.ts`; modify `apps/kite/src/lib/topicBrief.ts` (`BriefOverview.filteredOut`), `apps/kite/src/lib/components/brief/BriefRefreshBar.svelte`, `apps/kite/src/routes/topics/+page.svelte`, `docs/ROUTE_MAP.md`.

1. Proxy: `GET /api/triage/filtered` → mvp/server `/triage/filtered` (forward query string — check how `$lib/server/proxy` handles search params and follow it).
2. `$lib/filteredOut.ts`: client types mirroring Task 1's response, the reason label table + display order (exact values above), `groupFilteredItems(items)` → ordered `{ group, label, items }[]` (empty groups omitted), `mutedByLine(item)` (`Muted by: <label>`), `runSummaryLine(run)` e.g. `Last refresh 3:40 PM: 120 candidates, 18 kept, 102 dropped` (`null` run → `No refresh has triaged stories yet.`; skipped → `Last refresh did not triage stories` plus the first error when present), `fetchFilteredOut(scope, fetchFn)` returning `{ ok: true, data } | { ok: false, unauthenticated: boolean, error }`, and copy constants (page title `Filtered out — <PRODUCT_NAME>`, heading `Filtered out`, intro `Stories the last refresh dropped, and why. For spot checks only — nothing here needs action.`, disclaimer `Reasons from story scoring are AI-assisted judgments, not ground truth.`, scope labels `Last refresh` / `Last 48 hours`, empty `Nothing was filtered out.`, login hint `Log in on Topics to see filtered stories` linking `/topics`, `Show all (N)` / `Show fewer`, `Duplicate of:`, `Retried next refresh`, `Article no longer stored`).
3. Page `/filtered` (session data; no inline login form — on 401 show the login hint link): style matches `/topics` (same shell classes). Shows run summary line, scope toggle (two buttons, `aria-pressed`), the disclaimer, a reason summary row (label + count per non-empty group), then one section per group: heading `<label> (<count>)`, first 20 items with `Show all (N)` / `Show fewer` toggle when more. Each item: headline linked to `url` (`target="_blank" rel="noopener noreferrer"`; plain text when no url; `Article no longer stored` when no title), outlet domain, relative/short published time, topic names, `Muted by: …` for muted, `Duplicate of: <title>` (linked when url) for duplicates, `Retried next refresh` for non-final. `← Back to Brief` link. Keep the item list in a small glue component if the page grows past ~250 lines.
4. Links: `BriefRefreshBar` shows a `Filtered out` link to `/filtered` — text `N filtered out` when `overview.filteredOut` is a number > 0, `Filtered out` otherwise. Topics page gets a link to `/filtered` near the footer note (`See what was filtered out`).
5. `docs/ROUTE_MAP.md`: add `/filtered` to the **Shipped (live)** table (session-required; NEWS-90; reached from the Brief refresh bar and Topics).
6. Tests: vitest for every helper in `filteredOut.ts` (grouping/order, labels, summary lines incl. null/skipped, fetch 401/500/network/ok) and for any new `topicBrief.ts` logic.

## Task 4: Kite — "Less like this" on topic Brief cards

**Files:** create `apps/kite/src/lib/components/brief/LessLikeThis.svelte`, `apps/kite/src/routes/api/brief/stories/[articleId]/less-like-this/+server.ts`; modify `apps/kite/src/lib/topicBrief.ts` (+ `__tests__/topicBrief.test.ts`), `apps/kite/src/lib/types.ts` (`informed_publisher_domain?: string` beside the other `informed_*` fields), `apps/kite/src/lib/components/brief/TopicBrief.svelte`.

1. Proxy route `POST` → `/brief/stories/[articleId]/less-like-this`.
2. `topicBrief.ts`: `postLessLikeThis(articleId, body, fetchFn)` → `{ ok: true, created: boolean, topicName: string } | { ok: false, unauthenticated: boolean, error: string }`; `lessLikeThisErrorCopy(code)` (`no_outlet` → `This story has no outlet to block.`, `story_not_found` → `This story is no longer stored.`, otherwise the server message if present else `Could not save. Try again.`); `lessLikeThisSubjectDefault(story)` → story title trimmed and cut to 80 characters (TOPIC_NAME_MAX) on a word boundary when possible; copy constants: trigger `Less like this`, option headings `Not interested in this subject` / `Block this outlet`, subject name label `Undesired topic name`, keywords label `Keywords (optional, comma separated)`, buttons `Add undesired topic`, `Block <domain>`, `Cancel`, success `Added "<name>" to undesired topics. Takes effect next refresh.` / outlet already blocked `<domain> is already blocked.`, link `View Topics` → `/topics`, login hint `Log in on Topics to use Less like this`.
3. `LessLikeThis.svelte`: collapsed = a small text button `Less like this`. Open = inline panel with (a) subject form: name input prefilled with `lessLikeThisSubjectDefault`, optional keywords input (parse with the existing `parseKeywordsInput` from `$lib/topics`), submit; description sent = the story title; (b) outlet button `Block <informed_publisher_domain>` — hidden when the story has no domain. Pending state disables controls; errors inline (`role="alert"`); success replaces the panel with the success line + `View Topics` link; 401 shows the login hint linked to `/topics`. The card stays in place (the change applies on the next refresh / Brief load).
4. `TopicBrief.svelte`: render `LessLikeThis` inside the existing `storyMeta` snippet **only when the card is expanded** and it is a topic Brief story with an id. Ensure `storyMeta`'s outer `{#if}` lets it render when expanded even with no badge/summary line.
5. Tests: vitest for `postLessLikeThis` (201 created, 200 already blocked, 400/404 codes, 401, network error), `lessLikeThisErrorCopy`, `lessLikeThisSubjectDefault` (short, exactly 80, long with/without spaces).

## Task 5: E2E + docs

**Files:** `e2e/stack/scenarios.mjs`, `e2e/kite-smoke.spec.ts`, `docs/TRIAGE.md`, `docs/BRIEF.md`, `docs/MVP_API_COMPAT.md`, `tests/mvp-api-compat.test.js`, `tests/nav-shell.test.js`.

1. Seed the topics scenario with: `meta.json → triage` = a non-skipped run whose `at` equals the seeded records' `triagedAt`, and counts consistent with the seeded records; dropped records for new articles covering at least `off_topic`, `clickbait`, `muted:<undesired topic id>` (add one undesired topic), and the existing `duplicate`. Existing Brief tests must keep passing unchanged.
2. E2E (Playwright runs serially, 1 worker; the stack is shared, so a test that mutates must undo its change):
   - `/filtered` with a session shows each seeded dropped headline under its reason label, `Muted by: <topic name>`, and the AI disclaimer; the Brief refresh bar links to `/filtered`.
   - Less like this: expand a seeded Brief card, open Less like this, click `Block <domain>`, see the success line; `/topics` lists the domain under Undesired; then delete that topic via the API (`DELETE /api/topics/:id`) so later tests see the original Brief.
   - Session in the browser: log in through the existing mechanism the suite uses for session pages (see the health/articles test and the `/topics` shell test; `POST /api/login` via the page's request context shares cookies with the page).
3. Docs: `TRIAGE.md` — replace the "Filtered-out view … is NEWS-90" interim line with a **Filtered out view** section (`/filtered`, `GET /api/triage/filtered`, last-refresh definition, reason labels) and note outlet-only undesired topics skip the Jev undesired check. `BRIEF.md` — **Less like this** section (expanded card, two options, writes undesired topics, applies next refresh, session), `filteredOut` + refresh-bar link, route table rows, remove the NEWS-90 interim bullet. `MVP_API_COMPAT.md` — `GET /api/triage/filtered` and `POST /api/brief/stories/:articleId/less-like-this` rows with shapes/status codes, overview `filteredOut`. Contract tests: assert both routes exist in `app.ts` and are documented (pattern of the existing `/api/topics` assertions); nav-shell asserts `/filtered` in ROUTE_MAP Shipped and that `apps/kite/src/routes/filtered/+page.svelte` exists.
4. Run the full verification set: `npm run typecheck`, `npm test --prefix mvp/server`, `npm run test:kite`, `cd apps/kite && bun run check && bun run test:unit && bun run test:integration`, `npm run test:e2e:kite`.
