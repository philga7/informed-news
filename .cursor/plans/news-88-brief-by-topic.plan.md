# NEWS-88 — Brief by topic: top 3 per topic, summaries for shown stories only, scheduled + manual refresh

**Spec:** Jira [NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88) (Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)). The Jira description, the epic's settled decisions, and the NEWS-87 handoff comment on NEWS-88 are binding. Depends on NEWS-85 (topics: `readTopics()` / `Topic` in `types/topic.ts`, array order = topic order), NEWS-86 (topic search meta `meta.topicSearch.providers`), NEWS-87 (triage: `readTriage()` / `TriageRecord` in `types/triage.ts`, `muteReason` in `services/triageKeywords.ts`, `TRIAGE_WINDOW_HOURS`, `BODY_EXCERPT_MAX_CHARS`, `resolveTriageBudgets().summaries` in `services/triageConfig.ts`, `docs/TRIAGE.md`).

**Branch:** `feat/news-88-brief-by-topic`

## Goal

Opening the app shows a finished, topic-grouped Brief built from triage's kept stories — no Accept step. Sections follow topic order (Core first, then Watch); each shows its top 3 stories ranked by significance then outlet breadth, with "More" to expand; quiet topics collapse into one "Nothing new: …" line. Cards show headline, a 1–2 sentence neutral Ollama summary (generated only for stories shown in the Brief), "+N outlets", links, and an `Official statement` label. A story with no readable text anywhere in its group shows headline only + "Full text unavailable" — never an invented summary. Stories the operator has read don't come back on later refreshes unless significantly updated. The server refreshes on a timer (default every 3 hours) with catch-up on startup, and Kite gets a manual Refresh button plus refresh time and provider status.

## Operator decisions (asked 2026-09-30, all recommended options)

- **Layout:** one scrolling Brief page with a section per topic (Core first, then Watch), top 3 cards each, a "More" toggle per section, and the "Nothing new: …" line at the bottom. Not one Kite category tab per topic.
- **Seen:** stories read in Kite (expanded or marked read) are recorded on the server and hidden from later refreshes unless significantly updated; they stay visible (read styling) until the next refresh.
- **Summaries:** the top 3 per topic are summarised at refresh (Core topics first, within the summary budget); "More" stories and any over budget get a summary on demand when the operator expands them.
- **Auto-refresh:** every 3 hours by default, configurable.

## Global Constraints

- **No live network in unit tests.** Ollama, fetch, and timers are injected; tests use fakes and temp paths. Tests never write to `mvp/data/`.
- **Constants (one module — `mvp/server/src/services/briefConfig.ts`):**
  - `BRIEF_TOP_N = 3`
  - `BRIEF_MAX_LINKS = 8` (article links per card: the kept article plus duplicate members, distinct domains)
  - `SIGNIFICANT_UPDATE_OUTLET_DELTA = 2`, `SIGNIFICANT_UPDATE_SIGNIFICANCE_DELTA = 0.5` (0–2 scale)
  - `BRIEF_SEEN_RETENTION_DAYS = 7`
  - `SUMMARY_SOURCE_MAX_CHARS = 3000`, `SUMMARY_MIN_CHARS = 20`, `SUMMARY_MAX_CHARS = 400`, `SUMMARY_POST_MIN_CHARS = 120` (post text used as source when no body applies)
  - `SUMMARY_CONCURRENCY = 2`
  - `ON_DEMAND_SUMMARY_MAX_PER_HOUR = 30`
  - `DEFAULT_REFRESH_INTERVAL_HOURS = 3`, `MIN_REFRESH_INTERVAL_HOURS = 0.25`, `REFRESH_CHECK_MINUTES = 5`, `REFRESH_RETRY_MINUTES = 30`
- **Env (documented in `mvp/.env.example`):**
  - `REFRESH_INTERVAL_HOURS` — positive number (decimals allowed), clamped up to `MIN_REFRESH_INTERVAL_HOURS`; unset/invalid → 3; `0` / `off` / `false` / `no` disables the timer **and** startup catch-up (manual refresh still works).
  - `TRIAGE_SUMMARY_BUDGET` (existing) is now **enforced** for refresh-time summaries.
  - Ollama uses the existing `OLLAMA_API_KEY` / `OLLAMA_MODEL` via `getOllamaClient()` / `getOllamaModelName()` in `services/ollamaFraming.ts`. Do not add a new client.
- **Brief membership (default path):** when the article store is non-empty, the owned Brief is built from triage kept records only. Accept / `brief-membership.json` no longer gates the default Brief. The empty-store fixture (`ownedBriefFixtureArticles`) stays for an empty article store. Accept/Unaccept endpoints and `BriefClaimsLead` are untouched (NEWS-91 retires them).
- **Ollama only for shown stories:** refresh-time summaries only for the top `BRIEF_TOP_N` visible stories per section; on-demand summaries only for stories currently visible in the composed Brief. No other new Ollama call sites. Failed calls count toward the refresh budget.
- **Never invent:** no summary without source text; summaries are labelled as AI in Kite ("AI summary — not ground truth"). No verdict language.
- **Refresh is single-flight per process:** the timer, startup catch-up and `POST /api/fetch` share one runner; a call while a refresh is running joins the in-flight run.
- **Failure isolation:** summary generation never throws out of a refresh; the scheduler never throws (errors logged + recorded in meta); the server must start and serve even if catch-up fails. CFP failure behavior unchanged (refresh fails, `POST /api/fetch` → 500).
- **Interim guards from NEWS-86 stay:** search rows remain excluded from clustering and the classify / enrich / claims-extract batches. Kept search rows get Brief summaries through the new path only.
- **Kite:** Informed News glue first (new files under `apps/kite/src/lib/components/brief/` and `src/lib/*.ts`); upstream files get minimal, clearly-scoped edits. No Kagi chrome. Proxy routes follow the existing `src/routes/api/**/+server.ts` pattern.
- Follow existing patterns: `ollamaClaimVerbiage.ts` (injectable Ollama `chat`, JSON output, validation), `triageStore.ts` / `googleNewsUrlCacheStore.ts` (atomic tmp+rename, serialized writes), `triagePipeline.ts` (deps injection, never-throw `finish()`), `kiteBriefAdapter.ts` (Kite story shape), `briefSeed.ts` (Kite client fetch with `credentials: 'include'`, 401 handling).
- No new dependencies. No Supabase, no `_legacy/`. Never commit `mvp/.env` or `mvp/data/*.json`.
- Tests: `npm test --prefix mvp/server` (append new test files to `scripts.test` in `mvp/server/package.json`), `npm run typecheck`, `npm run test:kite`; Kite type check via its existing script (`bun run check` in `apps/kite` if present); `npm run test:e2e:kite` updated in Task 7.

## Rulings made while planning

- **Separate stores:** `mvp/data/brief-summaries.json` (keyed by kept article id) and `mvp/data/brief-seen.json` (keyed by article id). Not on `Article` (avoids `migrateArticle` / merge plumbing). Summaries store writes are serialized + atomic (refresh and on-demand can overlap).
- **Section order:** desired topics in topics-store array order, all Core topics before all Watch topics (stable). Undesired topics never form sections.
- **Story → section:** each kept story appears once, under the first section (in section order) among its record's `topicIds` that is still a desired topic. Records whose topics are all gone/undesired are not shown.
- **Visible stories:** kept records whose article exists, whose `publishedAt ?? fetchedAt` is within `TRIAGE_WINDOW_HOURS` of now, that don't now match `muteReason` (mute rules or undesired topics edited since triage — mute always wins), and that aren't hidden as seen.
- **Ranking within a section:** `significance` desc (null last), then `outletCount` desc (null as 1), then newer `publishedAt ?? fetchedAt`, then article id.
- **Seen hiding:** a story is hidden when it has a seen entry with `seenAt` earlier than the **boundary** (= `startedAt` of the last successful refresh) and it is not significantly updated since: `outletCount ≥ seen.outletCount + 2` or `significance ≥ seen.significance + 0.5` re-shows it. No successful refresh yet → nothing is hidden. Reading a story stores a snapshot `{ seenAt, outletCount, significance }` from its kept record (re-reading overwrites the snapshot). Entries older than 7 days or whose id is no longer a kept record are pruned on write.
- **Quiet line:** every desired topic with zero visible stories, Core first then Watch, in topic order.
- **Summary source text:** the kept article's `bodyText` when `bodyStatus === 'ok'`; else the first `memberIds` article (in order) with a triage record `status: 'dropped', reason: 'duplicate'` and `bodyStatus === 'ok'`; else, for a `bodyStatus === 'not_applicable'` kept article (e.g. xcancel posts), its `snippet` when ≥ `SUMMARY_POST_MIN_CHARS`; else none → summary status `unavailable` with no Ollama call (card: "Full text unavailable"). Source text is truncated to `SUMMARY_SOURCE_MAX_CHARS`, prefixed by the source article's title.
- **Summary cache:** a summary record stores `sourceArticleId` + `sourceHash` (sha256 of the source text, first 16 hex). An `ok` record with a matching hash is reused (no call). `error` records are retried on the next refresh / expand. `unavailable` is recomputed cheaply (no call).
- **Summary output:** Ollama returns JSON `{ "summary": string }`; text is trimmed, wrapping quotes stripped, whitespace collapsed, cut to the first two sentences, and must be `SUMMARY_MIN_CHARS`–`SUMMARY_MAX_CHARS` chars, else an `error` record. Prompt: neutral, only facts stated in the text, no speculation, no evaluative adjectives, no claims of truth.
- **Refresh-time order:** sections in order, top `BRIEF_TOP_N` visible stories each, sequentially in that order with `SUMMARY_CONCURRENCY` in flight; stop calling when the budget is used (remaining stories stay without a summary → on-demand). Ollama unavailable → no calls, run error `Ollama not configured`.
- **On-demand:** `POST /api/brief/stories/:articleId/summary` (session) — 404 `not_in_brief` when the id isn't visible in the current composed Brief; cached `ok` / `unavailable` returned without a call; else one call (not counted against the refresh budget) with a per-process cap of `ON_DEMAND_SUMMARY_MAX_PER_HOUR` (429 `rate_limited`); concurrent requests for the same id share one in-flight promise.
- **Refresh meta:** `meta.refresh = { last: RefreshRun | null, lastSuccess: RefreshRun | null }` where `RefreshRun = { trigger: 'manual' | 'timer' | 'startup', startedAt, completedAt, ok, error }`. `meta.brief = { at, summaries: { budget, used, generated, reused, unavailable, errors: string[] } }`.
- **Scheduler:** a check every `REFRESH_CHECK_MINUTES` plus one immediately at startup (`trigger: 'startup'` for that first check, `'timer'` after). A refresh is due when there is no `lastSuccess` (fall back to legacy `meta.lastFetchAt`) or `now − lastSuccess.completedAt ≥ interval`, **and** the last failed attempt (if `last.ok === false`) started ≥ `REFRESH_RETRY_MINUTES` ago. A tick check is cheap (one meta read). Timers are `unref()`'d. This works the same on a laptop that sleeps (the next tick after wake catches up) and on an always-on host.
- **Runner pipeline:** `fetchAllSources(options)` → tracked-stories sync (moved from the `/api/fetch` route into the runner so the timer does it too) → refresh-time summaries → `meta.refresh`. A manual call with custom `limit` / `feedUrl` that joins an in-flight run uses the in-flight run's options.
- **Notices (plain language, server-built):** from `meta.topicSearch.providers` — `down` → "SearXNG unavailable" / "Google News unavailable", `partial` → "SearXNG partly failed" / "Google News partly failed" (`disabled` → no notice); from `meta.triage` — error containing `TypeSafe not configured` → "Story scoring unavailable (TypeSafe not configured)", `byReason.not_scored_budget > 0` → "N stories not scored (budget)"; from `meta.brief` — `Ollama not configured` → "Summaries unavailable (Ollama not configured)"; from `meta.refresh.last` with `ok: false` → "Last refresh failed: <error>".
- **Kite data path:** keep Kite's batch → categories → stories machinery. The owned category stays slug `world` (so Kite's default-enabled categories keep it), renamed **"Brief"**. The stories response returns all visible stories in Brief order (ignores `limit` for the topic Brief) with Informed News glue fields; a new public `GET /api/brief/overview` gives section order, "More" split, quiet line, and refresh meta. The stories response `timestamp` = `lastSuccess.completedAt` (unix seconds) when present.
- **Kite story fields (glue, optional on `Story`):** `informed_article_id`, `informed_topic_id`, `informed_topic_name`, `informed_more` (boolean), `informed_outlet_count`, `informed_labels` (`'official'[]`), `informed_summary_status` (`'ok' | 'missing' | 'unavailable'`). `id` = `membership_key` = kept article id (stable for Kite read state); `short_summary` = summary text when `ok`, else `''`.
- **Manual Refresh needs a session** (`POST /api/fetch` is session-gated). The Brief stays public; on 401 the button shows "Log in on Topics to refresh" linking to `/topics`.
- **Unaccept** is not offered on topic Brief cards (membership isn't accept-gated).

---

### Task 1: Brief model, config, and stores

**Files**
- Create `mvp/server/src/types/brief.ts`, `mvp/server/src/services/briefConfig.ts` (+ test), `mvp/server/src/store/briefSummariesStore.ts` (+ test), `mvp/server/src/store/briefSeenStore.ts` (+ test)
- Modify `mvp/server/src/store/paths.ts` (or wherever `TRIAGE_PATH` lives): `BRIEF_SUMMARIES_PATH`, `BRIEF_SEEN_PATH`; `mvp/server/src/types/article.ts` `StoreMeta` gains `refresh?` and `brief?`; `mvp/server/src/store/metaStore.ts` passes them through (read + merge); store/type index exports; `mvp/server/package.json`

**API**
```ts
export type SummaryStatus = 'ok' | 'unavailable' | 'error';
export type BriefSummaryRecord = {
  articleId: string; status: SummaryStatus; text: string | null;
  sourceArticleId: string | null; sourceHash: string | null;
  model: string | null; error: string | null; generatedAt: string;
  trigger: 'refresh' | 'on_demand';
};
export type BriefSummariesStore = { summaries: Record<string, BriefSummaryRecord>; updatedAt: string | null };
export type BriefSeenEntry = { seenAt: string; outletCount: number | null; significance: number | null };
export type BriefSeenStore = { seen: Record<string, BriefSeenEntry>; updatedAt: string | null };
export type RefreshTrigger = 'manual' | 'timer' | 'startup';
export type RefreshRun = { trigger: RefreshTrigger; startedAt: string; completedAt: string; ok: boolean; error: string | null };
export type RefreshMeta = { last: RefreshRun | null; lastSuccess: RefreshRun | null };
export type BriefRunMeta = { at: string; summaries: { budget: number; used: number; generated: number; reused: number; unavailable: number; errors: string[] } };

// briefConfig.ts: constants from Global Constraints, plus
export function resolveRefreshIntervalHours(env?: NodeJS.ProcessEnv): number | null; // null = disabled

// stores (injectable path, default from paths):
export function readBriefSummaries(path?): Promise<BriefSummariesStore>;            // ENOENT → empty
export function putBriefSummaries(records: BriefSummaryRecord[], path?): Promise<void>; // serialized per path, read-merge-write, atomic
export function readBriefSeen(path?): Promise<BriefSeenStore>;                      // ENOENT → empty
export function writeBriefSeen(store: BriefSeenStore, path?): Promise<void>;        // atomic
```
**Behavior:** non-ENOENT read errors throw. `putBriefSummaries` chains per resolved path so concurrent puts never lose records (a failed put doesn't poison later puts); prune is not done here (callers own it). `resolveRefreshIntervalHours`: trims/lowercases; off values → null; positive finite number → `max(value, MIN_REFRESH_INTERVAL_HOURS)`; else default.

**Tests:** round-trips; ENOENT → empty; corrupt file throws; 10 concurrent `putBriefSummaries` keep all records, no `.tmp` leftovers; failed put doesn't block the next; interval parsing (unset, `2.5`, `0`, `off`, `0.1` → 0.25, `abc` → 3); `readMeta` keeps `refresh` / `brief`.

---

### Task 2: Compose the topic Brief (pure)

**Files**
- Create `mvp/server/src/services/topicBrief.ts` (+ `topicBrief.test.ts`); modify services index, `package.json`

**API**
```ts
export type BriefStory = {
  articleId: string; topicId: string; rank: number; more: boolean;   // more = rank > BRIEF_TOP_N
  title: string; link: string; domain: string | null; publishedAt: string | null;
  outletCount: number; labels: TriageLabel[]; significance: number | null;
  links: { title: string; url: string; domain: string | null; publishedAt: string | null }[]; // ≤ BRIEF_MAX_LINKS
  summary: { status: 'ok' | 'missing' | 'unavailable'; text: string | null };
  imageUrl: string | null; imageCaption: string | null; imageCredit: string | null;
};
export type BriefSection = { topic: { id: string; name: string; level: 'core' | 'watch' }; stories: BriefStory[] };
export type TopicBrief = { boundaryAt: string | null; sections: BriefSection[]; quiet: { id: string; name: string; level: 'core' | 'watch' }[] };

export function composeTopicBrief(input: {
  topics: Topic[]; muteRules: MuteRule[]; articles: Article[]; triage: TriageStore;
  seen: BriefSeenStore; summaries: BriefSummariesStore; refresh: RefreshMeta | null; now: Date;
  boundaryAt?: string | null;   // when provided (even null), overrides refresh.lastSuccess.startedAt
}): TopicBrief;
export function summarySourceFor(record: TriageRecord, articles: Map<string, Article>, triage: TriageStore):
  { sourceArticleId: string; text: string; hash: string } | null;
export function isSignificantlyUpdated(record: TriageRecord, seen: BriefSeenEntry): boolean;
export function buildRefreshNotices(meta: StoreMeta): string[];
```
**Behavior:** implements the rulings: section order, story → first section, visibility (article exists, window, `muteReason` re-check, seen hiding vs boundary = `refresh.lastSuccess.startedAt`), ranking, `more`, quiet line, links (kept article first, then duplicate members by `memberIds` order whose triage status is `duplicate`, distinct domains, ≤ `BRIEF_MAX_LINKS`), `outletCount` (record value, null → 1). `summary`: `summarySourceFor` null → `unavailable`; else a store record with `status: 'ok'` and matching `sourceHash` → `ok` + text; else `missing`. `link` = `publisherUrl || canonicalUrl`; `domain` = `publisherDomain` or hostname. `buildRefreshNotices` implements the Notices ruling.

**Tests:** Core before Watch in topic order; story appears once under its first desired topic; deleted/undesired topic ignored; out-of-window and missing-article records skipped; newly muted (mute rule and undesired keyword) hidden; seen before boundary hidden; seen after boundary visible; significant update (outlets +2, significance +0.5) re-shows; no lastSuccess → nothing hidden; ranking ties; `more` after 3; quiet line order; summary source chain (kept body → duplicate member body → post snippet ≥120 → unavailable); stale hash → `missing`; links distinct + capped; notices for each source.

---

### Task 3: Brief summaries (Ollama), refresh-time generator, on-demand

**Files**
- Create `mvp/server/src/services/briefSummary.ts` (+ test) and `mvp/server/src/services/briefSummaries.ts` (+ test); modify services index, `package.json`

**API**
```ts
// briefSummary.ts — one story
export type SummarizeDeps = { ollama?: { chat: (req: any) => Promise<{ message: { content: string } }> } | null; model?: string; timeoutMs?: number };
export function buildSummaryPrompt(title: string, sourceText: string): string;
export function parseSummaryOutput(raw: string): { ok: true; text: string } | { ok: false; error: string };
export function summarizeSource(source: { title: string; text: string }, deps?: SummarizeDeps):
  Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }>;  // never throws

// briefSummaries.ts
export type BriefSummaryDeps = {
  readTopics?, readMuteRules?, readArticles?, readTriage?, readBriefSeen?, readBriefSummaries?,
  putBriefSummaries?, readMeta?, updateMeta?, summarize?: typeof summarizeSource, ollamaAvailable?: () => boolean;
};
export function generateRefreshSummaries(options?: { now?: Date; env?: NodeJS.ProcessEnv; boundaryAt?: string | null },
  deps?: BriefSummaryDeps): Promise<BriefRunMeta>;                 // never throws; writes meta.brief
export function summarizeBriefStory(articleId: string, options?: { now?: Date }, deps?: BriefSummaryDeps & { rateLimiter?: OnDemandLimiter }):
  Promise<{ ok: true; summary: BriefSummaryRecord } | { ok: false; code: 'not_in_brief' | 'rate_limited' | 'error'; error: string }>;
export function createOnDemandLimiter(maxPerHour?: number, now?: () => number): OnDemandLimiter;
```
**Behavior**
1. `summarizeSource`: client from deps or `getOllamaClient()`; null → `{ ok:false, error:'Ollama not configured' }`. One `chat` call with `format: 'json'` (follow `ollamaClaimVerbiage.ts`), timeout, `parseSummaryOutput` per the Summary output ruling.
2. `generateRefreshSummaries`: compose the Brief with `boundaryAt` (the run's own `startedAt` is passed by the runner so stories read before this refresh are already hidden); targets = top `BRIEF_TOP_N` stories per section in section order. For each: `unavailable` → record (no call); cached ok with matching hash → `reused`; else reserve budget synchronously (`used < budget`) then call with `SUMMARY_CONCURRENCY` pool; result → `ok` or `error` record (`trigger: 'refresh'`). Budget from `resolveTriageBudgets(env).summaries`. Ollama unavailable → no calls, run error `Ollama not configured`. Write records with one `putBriefSummaries`, then `updateMeta({ brief })`. Every read/write guarded; errors into `errors` (≤ 5 plus write errors).
3. `summarizeBriefStory`: compose the current Brief (boundary from `meta.refresh.lastSuccess`); id not among visible stories → `not_in_brief`; summary `ok` (matching hash) → return cached; source null → write + return `unavailable`; limiter refuses → `rate_limited`; else one call, write record (`trigger: 'on_demand'`), return it. Same-id concurrent calls share one in-flight promise (module-level map keyed by id).

**Tests (fakes only):** prompt contains title + text and neutrality instructions; parse: JSON, quotes, >2 sentences cut, too short/long → error, non-JSON → error; Ollama missing → error, zero calls; **acceptance: refresh generator calls `summarize` only for top-3 visible stories (spy ids), never for `more` stories, hidden seen stories, or out-of-window records**; budget 2 with 5 targets → 2 calls, rest left `missing`, `used ≤ budget`; failed call counts; reused hash → no call; unavailable → record, no call; write failure caught; on-demand: not visible → `not_in_brief` and zero calls; `more` story → one call; cached → zero calls; rate limit → `rate_limited`; concurrent same id → one call.

---

### Task 4: Refresh runner, scheduler, and `/api/fetch` wiring

**Files**
- Create `mvp/server/src/services/refreshRunner.ts` (+ test) and `mvp/server/src/services/refreshScheduler.ts` (+ test)
- Modify `mvp/server/src/index.ts` (start scheduler after listen), `mvp/server/src/app.ts` (`/api/fetch` uses the runner; `createApp` deps gain `refreshRunner?`), `app.test.ts`, services index, `package.json`

**API**
```ts
export type RefreshResult = { trigger: RefreshTrigger; joined: boolean; startedAt: string; completedAt: string;
  fetch: FetchAllResult; brief: BriefRunMeta };
export type RefreshRunnerDeps = { fetchAll?: typeof fetchAllSources; syncTracked?: () => Promise<void>;
  generateSummaries?: typeof generateRefreshSummaries; updateMeta?; readMeta?; now?: () => Date };
export function createRefreshRunner(deps?: RefreshRunnerDeps): {
  run(trigger: RefreshTrigger, options?: FetchAllOptions): Promise<RefreshResult>;  // single-flight; rejects only when fetchAll rejects
  isRunning(): boolean;
};
export function getRefreshRunner(): ReturnType<typeof createRefreshRunner>; // process singleton used by app + scheduler

export function isRefreshDue(meta: StoreMeta, intervalHours: number, now: Date): boolean;
export function startRefreshScheduler(options?: { env?: NodeJS.ProcessEnv }, deps?: {
  runner?; readMeta?; setInterval?; clearInterval?; now?: () => Date; log?: (msg: string) => void;
}): { stop(): void; enabled: boolean };
```
**Behavior**
1. `run`: if a run is in flight → return that promise's result with `joined: true` (options ignored). Else: `startedAt` → `fetchAll(options)`; on rejection write `meta.refresh.last = { ok:false, error }` (guarded) and rethrow. On success: `syncTracked()` (guarded; same counts logic as the current route — move it, don't duplicate), `generateSummaries({ boundaryAt: startedAt })` (never throws), write `meta.refresh` `{ last, lastSuccess }` with `completedAt`, return result. In-flight state clears in `finally`.
2. `isRefreshDue` per the Scheduler ruling (legacy `meta.lastFetchAt` fallback; failed-attempt retry gate).
3. `startRefreshScheduler`: `resolveRefreshIntervalHours(env)` null → `{ enabled:false }`, no timers. Else run one check immediately (trigger `startup`) and then every `REFRESH_CHECK_MINUTES` (trigger `timer`); a check skips when `runner.isRunning()`; errors are logged, never thrown; interval handle `unref()`'d; `stop()` clears it.
4. `index.ts`: after `app.listen`, `startRefreshScheduler()`; log whether it's enabled and the interval. `createApp` must not start timers (tests).
5. `POST /api/fetch`: `runner.run('manual', { limit, feedUrl })`; response body unchanged plus `refresh: { trigger, joined, startedAt, completedAt }` and `brief: { summaries }`. CFP failure → 500 as today.

**Tests:** single-flight (two concurrent `run` → one `fetchAll`, second `joined: true`); fetch rejection → meta `last.ok=false`, rethrows, next run allowed; summaries get `boundaryAt = startedAt`; syncTracked failure doesn't fail the run; meta `lastSuccess` updated only on success; `isRefreshDue` cases (no meta, legacy lastFetchAt, fresh, stale, failed attempt within/after retry window); scheduler disabled → no timers; startup check runs immediately with trigger `startup`; tick while running skips; tick error logged not thrown; `/api/fetch` returns `refresh` + `brief` and still 500s on CFP failure (stub runner).

---

### Task 5: Brief routes and Kite story mapping

**Files**
- Modify `mvp/server/src/services/kiteBriefAdapter.ts` (category name "Brief"; new `topicBriefToKiteStories`) and `kiteBriefRoutes.ts` (topic Brief on the default path; new routes; deps-injectable stores); modify `app.ts` (session routes) and tests (`kiteBriefAdapter.test.ts`, `app.test.ts`)

**API**
```ts
export function topicBriefToKiteStories(brief: TopicBrief): KiteBriefStory[];   // Brief order, cluster_number = index+1
export type CreateKiteBriefRouterDeps = { loadBriefClaims?; readArticles?; readTriage?; readTopics?; readMuteRules?;
  readBriefSeen?; readBriefSummaries?; readMeta?; readBriefMembership?; readClusterEnrichments?; now?: () => Date };
```
**Behavior**
1. Kite story per `BriefStory`: `id` = `membership_key` = articleId; `category: 'world'`; `title`; `short_summary` = text when `ok` else `''`; `articles` from `links` (`{ title, link, domain, date }`); `domains`; `primary_image` from image fields when present; glue fields per the Kite story fields ruling. No enrichment fields (full stories are NEWS-89).
2. Default path: article store empty → existing fixture path unchanged. Otherwise compose the topic Brief and serve it from `GET /batches/:id/categories/:cat/stories` (all visible stories, `limit` ignored), with `timestamp` = `lastSuccess.completedAt` (unix s) when present; categories response returns one category (`world`, name **"Brief"**, `clusterCount` = visible story count).
3. `GET /api/brief/overview` (public, in the Kite brief router): `{ ok: true, fixture: boolean, refresh: { last, lastSuccess, nextAt, intervalHours, running }, notices: string[], sections: [{ topicId, name, level, storyIds, moreIds }], quiet: [{ id, name, level }] }`. `nextAt` = `lastSuccess.completedAt + interval` (null when disabled/never); `running` from `getRefreshRunner().isRunning()` (injectable).
4. Session routes in `app.ts` (after `requireApiSession`): `POST /api/brief/seen` body `{ articleIds: string[] }` (1–100 strings; else 400) → snapshot from kept records, ignore unknown ids, prune per ruling, `writeBriefSeen`; `{ ok: true, recorded }`. `POST /api/brief/stories/:articleId/summary` → `summarizeBriefStory`; `not_in_brief` → 404, `rate_limited` → 429, `error` → 502, ok → `{ ok: true, summary: { status, text } }`.

**Tests:** mapping fields + order + glue fields; empty store → fixture unchanged; non-empty store with no kept records → zero stories, categories still `world`/"Brief"; accepted-but-not-kept cluster no longer appears; overview shape (sections/moreIds/quiet/notices/nextAt/running); seen: 401 without session, 400 bad body, records snapshot, ignores unknown, prunes; summary route codes 404/429/502/200 (stub `summarizeBriefStory`); existing claims route unaffected.

---

### Task 6: Kite topic Brief UI

**Files**
- Create glue: `apps/kite/src/lib/topicBrief.ts` (overview/seen/summary/refresh client helpers + types), `apps/kite/src/lib/components/brief/TopicBrief.svelte` (sections), `apps/kite/src/lib/components/brief/BriefRefreshBar.svelte`; proxy routes `apps/kite/src/routes/api/brief/overview/+server.ts`, `apps/kite/src/routes/api/brief/seen/+server.ts`, `apps/kite/src/routes/api/brief/stories/[articleId]/summary/+server.ts`, and `apps/kite/src/routes/api/fetch/+server.ts` if no proxy exists yet
- Minimal upstream edits: `apps/kite/src/lib/types.ts` (optional glue fields on `Story`), `apps/kite/src/routes/+page.svelte` (render `TopicBrief` instead of the plain list for the owned Brief category when the overview isn't `fixture`), and at most a small slot in `StoryCard.svelte` / `StoryHeader.svelte` for the outlet/label badges and the summary-status line; `apps/kite/src/lib/briefClaims.ts` section title

**Behavior**
1. Fetch `/api/brief/overview` alongside the stories load (and on reload). `fixture: true` or fetch failure → current rendering unchanged.
2. `TopicBrief` renders, in overview order, a section per topic: heading (topic name, small Core/Watch tag), top stories (`storyIds`), and a "More (N)" toggle revealing `moreIds`. Reuse existing story rendering (prefer one `StoryList` per section with the page's bindings so expand / read / source overlay behave as today; or `StoryCard` directly) — no Unaccept control. Quiet topics render as one line at the bottom: "Nothing new: A, B, C".
3. Card additions: "+N outlets" when `informed_outlet_count > 1` (N = count − 1); `Official statement` badge when labels include `official`; summary line: `ok` → summary with a small "AI summary — not ground truth" note; `unavailable` → "Full text unavailable" (headline only); `missing` → "Summary loads when you open this story".
4. On expand of a `missing` story → `POST /api/brief/stories/:id/summary`; on success patch that story's `short_summary` / `informed_summary_status` in place; on 401 show "Log in on Topics to load summaries"; other errors show a quiet inline message. One request per story per page load.
5. Seen: when a topic-Brief story id is newly added to the page's read-story set (expand auto-read, manual toggle, mark all read), `POST /api/brief/seen` with those ids (batched, debounced ~1s; 401 ignored silently).
6. `BriefRefreshBar` above the sections: "Updated <time ago>" from `refresh.lastSuccess.completedAt` (or "Not refreshed yet"), "Next refresh <time>" when `nextAt`, notices as small inline text, and a **Refresh** button → `POST /api/fetch` (shows "Refreshing…", disabled while running or when `refresh.running`); success → `dataReloadService.reloadData()`; 401 → "Log in on Topics to refresh" link to `/topics`; error → inline message.
7. Section heading for the Brief list: replace "Accepted stories" (`BRIEF_STORIES_SECTION_TITLE`) with "Your topics".

**Tests / verification:** Kite type check (`bun run check` in `apps/kite`) — no new errors vs `main` (record the before/after counts); `npm run test:kite` green; vitest unit tests (`bun run test:unit` in `apps/kite`, follow `vitest.config.unit.ts` include globs) for the pure helpers in `topicBrief.ts` (grouping stories by overview sections, "+N outlets", summary-status copy, seen-id diffing). Manual browser check is the controller's job.

---

### Task 7: e2e smoke and docs

**Files**
- Modify `e2e/kite-smoke.spec.ts`
- Create `docs/BRIEF.md`; update `docs/OWNED_BRIEF.md`, `docs/TRIAGE.md` (summary budget now enforced; kept stories shown in the Brief), `docs/TOPIC_SEARCH.md` (interim section), `docs/MVP_API_COMPAT.md` (new routes + `/api/fetch` `refresh` / `brief`), `docs/ROUTE_MAP.md` if it describes the Brief, `mvp/.env.example` (`REFRESH_INTERVAL_HOURS`), `agents.md` (architecture: timer + topic Brief), `README.md` (refresh behavior)

**Behavior**
1. e2e: keep existing assertions that still hold (title, owned batch, no kagi requests, settings, nav, health/login). Category check: `categories[0].categoryId === 'world'` and name `Brief`. Replace `stories.length > 0` with: `GET /api/brief/overview` returns `ok` with `sections` / `quiet` arrays; when not `fixture`, the page shows either at least one topic section heading or the "Nothing new:" line; the refresh bar renders. Enrichment assertions stay skip-if-absent.
2. `docs/BRIEF.md` (operator guide): how the Brief is built (sections, ranking, More, quiet line), summaries (when generated, budget, on demand, "Full text unavailable"), seen behavior and "significantly updated", refresh timer / catch-up / manual button / notices, env, stores, routes, what's still interim (Accept/claims lead until NEWS-91; full stories NEWS-89; Filtered out view NEWS-90).
3. Docs must match the code (read it); `npm run test:kite` stays green.

**Verification:** `npm run test:kite`; `npm test --prefix mvp/server`; `npm run test:e2e:kite` when a dev server can run (report if it can't).
