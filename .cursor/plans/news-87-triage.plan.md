# NEWS-87 — Triage pipeline: dedupe, keyword + Jev headline gates, survivor-only scrape, budget caps, drop reasons

**Spec:** Jira [NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87) (Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)). The Jira description and the epic's settled decisions are binding; this plan argues from them. Depends on NEWS-85 (topics: `readTopics()` in `mvp/server/src/store/topicsStore.ts`, `Topic` in `mvp/server/src/types/topic.ts`) and NEWS-86 (topic search rows: `sourceKind: 'search'`, `bodyStatus: 'pending'`, `topicIds`, `searchProviders`, `googleNewsUrl`; resolver `resolveGoogleNewsUrl` in `services/googleNewsResolve.ts`; cache in `store/googleNewsUrlCacheStore.ts`).

**Branch:** `feat/news-87-triage`

## Goal

At the end of every refresh (`POST /api/fetch` → `fetchAllSources`), triage every new in-window article from every non-manual source, cheapest step first: mute/keyword pass (free) → duplicate grouping (free) → one Jev call on headline + publisher per story → survivors only: resolve the Google link, scrape the body, date undated rows from the page, one fuller Jev call on the body. Every candidate ends `kept` or `dropped` with a reason, stored in a new `triage.json` store for NEWS-88 (Brief by topic) and NEWS-90 (Filtered out view). A per-refresh Jev budget is enforced and reported; over-budget items are `not_scored_budget`, never silently dropped. Off-topic, muted, and trash items never reach scrape or Ollama. Claims extraction is not part of this path.

## Operator decisions (asked 2026-09-30)

- **Scope:** all non-manual sources (topic search + curated RSS + CFP + xcancel). Non-search items need a desired-topic keyword hit to reach Jev.
- **Dedupe:** existing relatedness (`articlesAreRelated`) + syndication (identical normalized headline on any outlet) + conservative cross-outlet headline similarity within a shared topic. One kept story per group; the rest are `duplicate` and count toward outlet breadth.
- **Jev unavailable / call error:** `not_scored_error`, retried on the next refresh while still in the window. Nothing unscored is kept.
- **Timing:** inline at the end of every refresh, with concurrency. NEWS-88 adds the timer.

## Global Constraints

- **No live network in unit tests.** Jev (`systemOne`), Google resolution, and scraping are injected dependencies; tests use fakes and inline fixtures. Tests never write to `mvp/data/` (inject temp paths or fake store deps).
- **Constants (one module — `mvp/server/src/services/triageConfig.ts`):**
  - `TRIAGE_WINDOW_HOURS = 48`
  - `DEFAULT_TRIAGE_JEV_BUDGET = 300`, `DEFAULT_TRIAGE_SUMMARY_BUDGET = 60`
  - `TRIAGE_CONCURRENCY = 4` (story groups in flight)
  - `TRIAGE_MAX_CANDIDATE_TOPICS = 6`, `TRIAGE_MAX_UNDESIRED_TOPICS = 10`
  - `TRIAGE_MAX_PROMOTIONS = 2` (alternates tried after the representative is dropped for a quality/date reason)
  - `RELEVANCE_MIN = 0.5` (noul), `UNDESIRED_MIN = 0.6` (noul), `QUALITY_CONFIDENCE_MIN = 0.6` (choice confidence), `WATCH_SIGNIFICANCE_MIN = 1.4` (expected score on a 0–2 rubric)
  - `HEADLINE_SNIPPET_MAX_CHARS = 300`, `BODY_EXCERPT_MAX_CHARS = 3000`
  - `SIMILAR_TITLE_MIN_SHARED_TOKENS = 4`, `SIMILAR_TITLE_JACCARD_MIN = 0.6`
- **Env (documented in `mvp/.env.example`):**
  - `TRIAGE_ENABLED` — default on; `false` / `0` / `off` / `no` (trimmed, case-insensitive) disables triage (run reported `skipped`).
  - `TRIAGE_JEV_BUDGET` — non-negative integer; unset/invalid → 300. `0` means every Jev-stage item is `not_scored_budget`.
  - `TRIAGE_SUMMARY_BUDGET` — non-negative integer; unset/invalid → 60. **Defined and reported here; enforced by NEWS-88** (summaries are generated there).
  - Jev uses the existing `TYPESAFE_API_KEY` / `TYPESAFE_MODEL` via `services/typesafeClient.ts`. Do not add a new client.
- **Candidates:** articles with `sourceKind !== 'manual'`, whose `publishedAt ?? fetchedAt` is within `TRIAGE_WINDOW_HOURS` of `now`, and that have no triage record or a record with `final: false`. Older un-triaged rows are not candidates and get no record.
- **Drop reasons (exact strings):** `off_topic`, `muted:<ruleOrTopicId>`, `duplicate`, `clickbait`, `opinion`, `rewrite`, `sponsored`, `not_significant`, `undated`, `stale`, `not_scored_budget`, `not_scored_error`. Only `not_scored_budget` and `not_scored_error` are non-final (`final: false`, re-triaged next refresh); every other outcome is `final: true`.
- **Label:** `official` (official/primary statement) — kept items only.
- **Mute always wins:** mute rules (`mute-rules.json`) and undesired topics are checked before anything else, and a Jev undesired match beats relevance.
- **Order of spend:** keyword/mute → dedupe → headline Jev → survivor prep (resolve + scrape) → body Jev. Nothing reaches resolve/scrape without passing headline Jev; nothing in this path calls Ollama.
- **One Jev call = one `systemOne` request** (one state, several questions). Failed calls count toward the budget.
- **Failure isolation:** triage never throws out of `fetchAllSources`; CFP behavior unchanged (CFP failure still fails the refresh). Run summary persisted in `meta.json` under `triage` and returned by `POST /api/fetch` as `triage`.
- **Interim guards from NEWS-86 stay:** search rows remain excluded from clustering and from the classify / enrich / claims-extract batch paths. Kept stories reach the product through NEWS-88, not the old Radar/Brief paths. No Kite changes in this ticket.
- Follow existing patterns: `topicSearchIngest.ts` (deps injection, concurrency pool, `Promise.allSettled`), `muteRulesStore.ts` / `topicsStore.ts` (flat JSON store with injectable path), `muteMatch.ts`, `typesafeClaimQuestions.ts` (question builders + pure routing + `systemOne` wrapper), `publisherBodyScrape.ts`.
- No new dependencies. No Supabase, no `_legacy/`. Never commit `mvp/.env` or `mvp/data/*.json`.
- Server tests: `node:test` via `npm test --prefix mvp/server` (append new test files to `scripts.test` in `mvp/server/package.json`); `npm run typecheck`; `npm run test:kite` must stay green.

## Rulings made while planning

- **Triage lives in its own store** (`mvp/data/triage.json`, keyed by article id), not on `Article`. Avoids another round of `migrateArticle` / merge plumbing; NEWS-88/90 join records to articles by id. Records for article ids no longer in the article store are pruned on write.
- **Candidate topics:** search rows use their `topicIds` (search already matched them) plus any keyword hits; non-search rows use keyword hits only (none → `off_topic`, no Jev). Topic ids that no longer exist as desired topics are ignored.
- **Keyword matching:** a desired topic's `name` and `keywords`, against title + publisherTitle + snippet, on word boundaries. A keyword with no lowercase letters (e.g. `ICE`, `DOGE`, `PLTR`, `F-250`) matches case-sensitively so `ICE` doesn't hit "ice cream"; otherwise case-insensitive.
- **Undesired topics:** keyword hit in title + publisherTitle + snippet → `muted:<topicId>`. A keyword that contains a dot and no spaces is also an **outlet block**: matches when `publisherDomain` equals it or ends with `.<keyword>`. Jev also checks undesired topics by description (meaning-based).
- **Duplicate groups prefer an already-kept story.** A new article in the same group as a story kept earlier in the window becomes `duplicate` of it (no Jev), and that kept record's outlet breadth and member ids are refreshed.
- **Representative order** in a new group: primary `sourceTier` first, then has `publisherUrl`, then `bodyStatus: 'ok'`, then longer snippet, then earlier `publishedAt` (nulls last), then id. If the representative is dropped for `clickbait` / `opinion` / `rewrite` / `sponsored` / `undated` / `stale`, up to `TRIAGE_MAX_PROMOTIONS` alternates are tried. `off_topic`, `muted:*`, `not_significant` stop the group (same event, same answer).
- **Outlet breadth:** distinct publisher domains among group members, where domains that published the same normalized headline (syndication) collapse into one outlet. Stored on the kept record as `outletCount`.
- **`official` bypasses quality gates only** (clickbait/opinion/rewrite/sponsored), not relevance, undesired, or significance.
- **Watch significance:** asked in every headline call (no extra cost). Watch topics below `WATCH_SIGNIFICANCE_MIN` are removed from the kept topic list; if no topics remain → `not_significant`. Core topics are never significance-gated.
- **Body check** runs only when the scrape yields `bodyStatus: 'ok'`. Blocked/unavailable bodies keep the headline verdict with `bodyChecked: false` (NEWS-88 shows "full text unavailable"). Out of budget at the body stage → kept with `bodyChecked: false` (headline-cleared, not silently dropped).
- **Undated search survivors** get `publishedAt` from page metadata at scrape time; still undated → `undated`; page date older than the window → `stale` (NEWS-86 spec: "dated from page metadata at scrape time or dropped").
- **Budget priority:** round-robin across topics in topics-store order (core before watch within a round), newest first within a topic, so one busy topic can't eat the budget. Items/groups left when the budget runs out → `not_scored_budget` (non-final).
- **Jev unavailable** (no client): no calls are made; every Jev-stage item → `not_scored_error`, run error `TypeSafe not configured`.
- **Topic edits don't re-triage final records** while they're in the window (simple, cheap); revisit in NEWS-88/90 if needed.
- **Carry-overs from NEWS-86 fixed here:** Google URL cache writes are serialized and atomic (resolves now run in parallel).

---

### Task 1: Triage model, config, and store

**Files**
- Create `mvp/server/src/types/triage.ts`; export from `mvp/server/src/types/index.ts`
- Modify `mvp/server/src/types/article.ts`: `StoreMeta` gains `triage?: TriageRunMeta | null`
- Create `mvp/server/src/services/triageConfig.ts` (constants above + env readers)
- Modify `mvp/server/src/store/paths.ts` (`TRIAGE_PATH = path.join(DATA_DIR, 'triage.json')`)
- Create `mvp/server/src/store/triageStore.ts` (+ `triageStore.test.ts`); export from `mvp/server/src/store/index.ts`
- Create `mvp/server/src/services/triageConfig.test.ts`
- Modify `mvp/server/package.json` (append test files)

**`types/triage.ts`**
```ts
export const TRIAGE_STATIC_REASONS = [
  'off_topic', 'duplicate', 'clickbait', 'opinion', 'rewrite', 'sponsored',
  'not_significant', 'undated', 'stale', 'not_scored_budget', 'not_scored_error',
] as const;
export type TriageStaticReason = (typeof TRIAGE_STATIC_REASONS)[number];
export type TriageReason = TriageStaticReason | `muted:${string}`;
export const NON_FINAL_REASONS: ReadonlySet<TriageReason> = new Set(['not_scored_budget', 'not_scored_error']);

export type TriageStatus = 'kept' | 'dropped';
export type TriageStage = 'keyword' | 'dedupe' | 'headline' | 'survivor' | 'body' | 'budget';
export type TriageLabel = 'official';

export type TriageRecord = {
  articleId: string;
  status: TriageStatus;
  reason: TriageReason | null;     // null iff kept
  stage: TriageStage;              // where the decision was made
  final: boolean;                  // false iff reason is non-final
  topicIds: string[];              // kept: Jev-confirmed topics; dropped: candidate topics considered
  labels: TriageLabel[];
  duplicateOf: string | null;      // reason 'duplicate' only
  memberIds: string[];             // kept only: duplicate article ids in its group
  outletCount: number | null;      // kept only
  significance: number | null;     // headline significance score when asked
  bodyChecked: boolean;
  jevCalls: number;                // calls spent on this article
  triagedAt: string;               // ISO
};
export type TriageStore = { records: Record<string, TriageRecord>; updatedAt: string | null };

export type TriageRunMeta = {
  at: string;
  skipped: boolean;                // disabled, or topics/articles unreadable
  candidates: number;
  kept: number;
  dropped: number;
  byReason: Record<string, number>; // 'muted:<id>' counted under 'muted'
  jev: { budget: number; used: number; errors: number };
  summaryBudget: number;
  errors: string[];                // at most 5
};
```

**`triageConfig.ts`** exports the constants plus:
- `isTriageEnabled(env = process.env): boolean` — same semantics as `isTopicSearchEnabled`.
- `resolveTriageBudgets(env = process.env): { jevCalls: number; summaries: number }` — parse `TRIAGE_JEV_BUDGET` / `TRIAGE_SUMMARY_BUDGET` as non-negative integers (`/^\d+$/` after trim); otherwise defaults.

**`triageStore.ts`**
- `readTriage(triagePath = TRIAGE_PATH): Promise<TriageStore>` — missing file → `{ records: {}, updatedAt: null }`; non-object → throw; malformed records dropped (validate status, reason string-or-null, stage, booleans, arrays of strings, numbers-or-null; `articleId` must equal its key).
- `writeTriage(store, triagePath = TRIAGE_PATH): Promise<void>` — pretty JSON + newline, creates the directory, writes to `<path>.tmp-<pid>-<random>` then `rename` (atomic).

**Tests:** config env parsing (unset, `off`, ` FALSE `, `0`, invalid budgets, `0` budget); store round-trip in a temp dir, missing file, malformed record dropped, key/articleId mismatch dropped, non-object throws, no tmp file left behind.

---

### Task 2: Keyword and mute pass (pure)

**Files**
- Create `mvp/server/src/services/triageKeywords.ts` (+ `triageKeywords.test.ts`)
- Modify `mvp/server/package.json`

**API**
```ts
export function keywordMatches(text: string, keyword: string): boolean;
export function desiredTopicHits(article: Article, desired: readonly Topic[]): string[];   // topic ids, topics-store order
export function candidateTopicIds(article: Article, desired: readonly Topic[]): string[];  // search: topicIds ∩ desired ∪ hits; else hits
export function muteReason(article: Article, muteRules: readonly MuteRule[], undesired: readonly Topic[]): `muted:${string}` | null;
```
- `keywordMatches`: trimmed keyword; empty → false. Escape regex specials. Boundary = not preceded / followed by `[A-Za-z0-9]`. No lowercase letter in the keyword → case-sensitive; otherwise case-insensitive.
- `desiredTopicHits`: haystack = `title`, `publisherTitle`, `snippet` joined by newline; a topic hits when its `name` or any keyword matches.
- `candidateTopicIds`: result ordered by topics-store order, deduped; ignores ids not in `desired`.
- `muteReason`: first mute rule (in rule order) for which `articleMatchesMute(article, [rule])` is true → `muted:<rule.id>`; else first undesired topic whose `name`/keyword matches the headline haystack, or whose dotted, space-free keyword matches `publisherDomain` (equal or `.`-suffix) → `muted:<topic.id>`; else null.

**Tests:** `ICE` vs "ice cream" / "ICE raids"; case-insensitive `tariffs`; `F-250` boundary ("F-2500" no); regex specials `8(a)`; search row with stale topic id ignored; non-search with no hit → `[]`; mute rule wins over undesired; rule with `source` respected (reuses `articleMatchesMute`); outlet block `dailymail.co.uk` matches `www`-stripped domain and subdomain `us.dailymail.co.uk`, not `notdailymail.co.uk`.

---

### Task 3: Duplicate grouping and outlet breadth (pure)

**Files**
- Create `mvp/server/src/services/triageDedupe.ts` (+ `triageDedupe.test.ts`)
- Modify `mvp/server/src/services/clusterArticles.ts` only to export the existing `jaccard` / `sharedTokenCount` helpers if needed (no behavior change)
- Modify `mvp/server/package.json`

**API**
```ts
export type DedupeCandidate = { article: Article; topicIds: string[] };
export type DedupeGroup = {
  ordered: DedupeCandidate[];        // representative first, then alternates (representative order ruling)
  existingKeptId: string | null;     // set when the group joins a story kept earlier
  topicIds: string[];                // union of member candidate topics
};
export function storiesAreDuplicates(a: DedupeCandidate, b: DedupeCandidate): boolean;
export function groupCandidates(candidates: DedupeCandidate[], recentKept: DedupeCandidate[]): DedupeGroup[];
export function outletCount(members: readonly Article[]): number;
```
- `storiesAreDuplicates`: `articlesAreRelated(a.article, b.article)` **or** equal non-empty `normalizeTitleForMatch` of title (syndication) **or** (share a topic id **and** title tokens via `titleTokens` have ≥ `SIMILAR_TITLE_MIN_SHARED_TOKENS` shared **and** Jaccard ≥ `SIMILAR_TITLE_JACCARD_MIN`).
- `groupCandidates`: union-find over candidates + recentKept. Groups with no candidate are discarded. A group containing recentKept members → `existingKeptId` = the kept member with the smallest id; `ordered` = candidates only. Otherwise `ordered` sorted by the representative-order ruling. Output order is deterministic (by representative id).
- `outletCount`: union domains that share a normalized title; count components over members with a `publisherDomain`; if none have a domain, return 1.

**Tests:** syndication across msn/yahoo collapses to one group with `outletCount` 1 for those two plus a distinct-headline outlet → 2; cross-outlet similar titles within a shared topic group, but not without a shared topic; distinct stories about the same topic ("Iran sanctions…" vs "Iran election…") stay separate; group joins recent kept; representative order (primary first, then direct URL, …); deterministic output.

---

### Task 4: Jev headline and body checks

**Files**
- Create `mvp/server/src/services/triageJev.ts` (+ `triageJev.test.ts`)
- Modify `mvp/server/package.json`

**API**
```ts
export const QUALITY_LABELS = ['news', 'official', 'clickbait', 'opinion', 'rewrite', 'sponsored'] as const;
export type TriageJevContext = { candidates: Topic[]; undesired: Topic[] };   // already capped by caller
export type TriageJevAnswers = {
  relevance: Record<string, number>;        // topicId → noul
  undesired: Record<string, number>;        // topicId → noul
  quality: { choice: (typeof QUALITY_LABELS)[number]; confidence: number };
  significance: number;                     // expected score 0–2
};
export type TriageVerdict =
  | { decision: 'keep'; topicIds: string[]; labels: TriageLabel[]; significance: number }
  | { decision: 'drop'; reason: TriageReason; topicIds: string[]; significance: number };
export function buildTriageQuestions(ctx: TriageJevContext): Questions;   // keys: topic_<i>, undesired_<i>, quality, significance
export function buildHeadlineState(article: Article): Record<string, unknown>;
export function buildBodyState(article: Article): Record<string, unknown>;
export function routeTriageAnswers(answers: TriageJevAnswers, ctx: TriageJevContext): TriageVerdict;
export async function judgeTriage(
  stage: 'headline' | 'body', article: Article, ctx: TriageJevContext,
  deps?: { systemOne?: typeof systemOne },
): Promise<{ ok: true; answers: TriageJevAnswers; verdict: TriageVerdict; model: string } | { ok: false; error: string }>;
```
- Questions (built with SDK `noul` / `choice` / `score`):
  - `topic_<i>`: noul "Is this story substantively about <name>?" with true = topic description, false = "Not about this topic, or only a passing mention."
  - `undesired_<i>`: noul "Is this story about <name> (a subject the reader excluded)?" true = description.
  - `quality`: choice with criteria — `news` straight news report with new information; `official` an official or primary statement (government, court, company filing, press release) or reporting that is mainly that statement; `clickbait` clickbait or rage bait (withholds/exaggerates to provoke clicks or anger); `opinion` opinion, editorial, or commentary presented as news; `rewrite` rewrite, aggregation, or "what to know" roundup with no new reporting; `sponsored` sponsored content, deals, shopping, stock tips, or listicles.
  - `significance`: score rubric `['Routine or minor update', 'Notable but incremental development', 'Significant development a follower of this topic must know']`.
- Headline state: `{ headline, publisher (first citation label, else publisherDomain, else null), snippet (≤ HEADLINE_SNIPPET_MAX_CHARS), publishedAt }`. Body state: headline state + `bodyExcerpt` (≤ `BODY_EXCERPT_MAX_CHARS`).
- `routeTriageAnswers` (in order): any undesired noul ≥ `UNDESIRED_MIN` → drop `muted:<topicId>` (first in ctx order); relevant = candidates with noul ≥ `RELEVANCE_MIN`, none → drop `off_topic`; quality ∈ {clickbait, opinion, rewrite, sponsored} with confidence ≥ `QUALITY_CONFIDENCE_MIN` → drop that reason; `official` with confidence ≥ floor → label `official`; then drop watch topics from relevant when significance < `WATCH_SIGNIFICANCE_MIN`, none left → drop `not_significant`; else keep with relevant topic ids (ctx order).
- `judgeTriage` uses the injected `systemOne` (default from `typesafeClient.ts`); `ok: false` passes the error through. Never throws.

**Tests:** question keys and criteria shape; routing table (undesired beats relevance; off_topic; each quality reason; low-confidence clickbait kept; official label; watch dropped below threshold while core kept; all-watch → not_significant); state truncation; `judgeTriage` with a fake `systemOne` maps answers back to topic ids; failure passthrough.

---

### Task 5: Survivor preparation (resolve, scrape, page date) + cache hardening

**Files**
- Modify `mvp/server/src/services/publisherBodyScrape.ts` (+ `publisherBodyScrape.test.ts`): `PublisherBodyResult` gains `publishedAt: string | null`
- Create `mvp/server/src/services/triageSurvivor.ts` (+ `triageSurvivor.test.ts`)
- Modify `mvp/server/src/store/googleNewsUrlCacheStore.ts` (+ test): serialized, atomic writes
- Modify any compile fallout (`cfpFetch.ts`, `curatedRssFetch.ts` ignore the new field)
- Modify `mvp/server/package.json`

**Page date** — `extractPublisherBodyFromHtml` reads, first hit wins: `meta[property="article:published_time"]`, `meta[property="og:article:published_time"]`, `meta[itemprop="datePublished"]` (content), `meta[name="pubdate"|"publishdate"|"date"|"dc.date"]`, JSON-LD `datePublished` (first `script[type="application/ld+json"]` object or array element / `@graph` entry that has it; ignore parse errors), first `time[datetime]`. Normalize with `new Date()`; invalid → null; output ISO. All non-success paths return `publishedAt: null`.

**`triageSurvivor.ts`**
```ts
export type SurvivorDeps = {
  resolveGoogleNewsUrl?: (googleUrl: string) => Promise<string | null>;
  scrapePublisherBody?: (url: string | null) => Promise<PublisherBodyResult>;
};
export type SurvivorResult = { article: Article; changed: boolean; dateIssue: 'undated' | 'stale' | null };
export async function prepareSurvivor(article: Article, now: Date, deps?: SurvivorDeps): Promise<SurvivorResult>;
```
- Only rows with `bodyStatus === 'pending'` touch the network; others return unchanged (`dateIssue` still computed).
- `publisherUrl` null and `googleNewsUrl` present → resolve; on success set `publisherUrl`, `publisherDomain` (`publisherDomainFromUrl`), and append a citation `{ label: <existing first citation label or domain>, url: publisherUrl }` if that url isn't already cited. `canonicalUrl` / id never change.
- Scrape `publisherUrl` (null → result `unavailable` without fetch); copy `bodyText`, `bodyStatus`, `publisherTitle`, image fields; fill `publishedAt` only when it was null.
- `dateIssue`: `publishedAt` still null → `undated` **only for `sourceKind: 'search'`** (others fall back to `fetchedAt` and are never `undated`); date older than `TRIAGE_WINDOW_HOURS` → `stale`.
- Never throws (resolver/scrape already swallow; still guard).

**Cache hardening:** `putCachedGoogleNewsUrl` chains writes per cache path through a module-level promise map so concurrent puts never lose entries; each write goes to a temp file then `rename`. Test: 10 concurrent puts → all 10 entries present.

**Tests:** page-date extraction for each source + invalid date; survivor with Google-only row resolves then scrapes (fakes), citation appended once; resolve failure → scrape skipped (`unavailable`), `undated` when no date; non-pending row makes no calls; page date fills null `publishedAt`; stale detection; CFP row with null `publishedAt` uses `fetchedAt` (no `undated`).

---

### Task 6: Triage orchestrator wired into refresh + `GET /api/triage`

**Files**
- Create `mvp/server/src/services/triagePipeline.ts` (+ `triagePipeline.test.ts`)
- Modify `mvp/server/src/services/fetchAllSources.ts` (run triage after `assignClusterIds`; result gains `triage`)
- Modify `mvp/server/src/app.ts` (`/api/fetch` response gains `triage`; new session-protected `GET /api/triage`) + `app.test.ts` stubs/assertions
- Modify `mvp/server/src/services/index.ts` exports, `mvp/server/package.json`

**API**
```ts
export type TriageResult = TriageRunMeta & { keptIds: string[] };
export type TriageDeps = {
  readTopics?: () => Promise<{ topics: Topic[] }>;
  readMuteRules?: () => Promise<{ rules: MuteRule[] }>;
  readArticles?: () => Promise<Article[]>;
  upsertArticles?: typeof upsertArticles;
  readTriage?: () => Promise<TriageStore>;
  writeTriage?: (store: TriageStore) => Promise<void>;
  updateMeta?: (patch: Partial<StoreMeta>) => Promise<unknown>;
  judge?: typeof judgeTriage;                 // Jev
  jevAvailable?: () => boolean;               // default: getTypeSafeClient() !== null
  prepareSurvivor?: typeof prepareSurvivor;
};
export async function runTriage(options?: { now?: Date; env?: NodeJS.ProcessEnv }, deps?: TriageDeps): Promise<TriageResult>;
```
**Behavior**
1. `isTriageEnabled(env)` false → skipped result, meta written, no reads beyond that.
2. Read topics, mute rules, articles, triage store; topics or articles unreadable → skipped with error (meta still written). Mute rules unreadable → treat as none + error. Triage store unreadable → start empty + error.
3. Select candidates (Global Constraints). For each: `muteReason` → drop final (stage `keyword`). Else `candidateTopicIds` (cap `TRIAGE_MAX_CANDIDATE_TOPICS`, keep order); empty → `off_topic` (stage `keyword`).
4. `groupCandidates(survivors, recentKept)` where recentKept = articles with a kept record whose article is in the window. Groups with `existingKeptId` → every member `duplicate` of it (stage `dedupe`, final); recompute that kept record's `memberIds` (union) and `outletCount` (kept article + all members).
5. Order new groups by budget priority (ruling). Process with a pool of `TRIAGE_CONCURRENCY`. Budget counter: reserve a call synchronously before each `judge` await; when `used >= budget`, the current item and all untried members of its group → `not_scored_budget` (stage `budget`, non-final). If `jevAvailable()` is false → no calls; Jev-stage items → `not_scored_error` (non-final), run error `TypeSafe not configured`.
6. Per group, for the representative then alternates (promotion ruling): headline `judge` (failure → `not_scored_error` for it and untried members, non-final; count `jev.errors`). Keep → `prepareSurvivor` (stage `survivor`); `dateIssue` → drop `undated`/`stale` (promotion allowed). Body `ok` and budget left → body `judge`; drop verdict → that reason (stage `body`); failure → keep headline verdict, `bodyChecked: false`, count error. Keep → record kept with topics/labels/significance/`bodyChecked`; other members → `duplicate` of it; `outletCount` over the whole group. No member kept → untried members `duplicate` of the representative.
7. Write: merge new records into the store, prune ids not in the article store, `writeTriage`; `upsertArticles` for survivors whose article changed; `updateMeta({ triage })`. Each write failure is caught into `errors` (never throws). `byReason` counts this run's records (`muted:*` under `muted`; duplicates under `duplicate`).
8. `fetchAllSources` runs `runTriage()` after `assignClusterIds` inside try/catch; on throw, result `triage` = skipped-style failure with the message.
9. `POST /api/fetch` adds `triage: { skipped, candidates, kept, dropped, byReason, jev, summaryBudget, errors }`.
10. `GET /api/triage` (after `requireApiSession`): `{ ok: true, run: meta.triage ?? null, records: [...] }` — records newest `triagedAt` first, at most 500, each joined with `title`, `canonicalUrl`, `publisherUrl`, `publisherDomain`, `publishedAt`, `sourceKind` (null fields when the article is gone). Deps-injectable in `createApp` like other stores.

**Tests (fakes only):** acceptance trio — (a) off-topic/muted/trash never reach `prepareSurvivor` or `judge` beyond what's allowed (spy counts); (b) budget cap respected and reported (`jev.used ≤ budget`, rest `not_scored_budget`, non-final, retried next run); (c) every candidate ends kept or dropped with a reason. Plus: mute beats keyword; non-search no-hit off_topic without Jev; duplicate joins prior kept and bumps `outletCount`; promotion after clickbait rep; `not_significant` stops the group; Jev unavailable → `not_scored_error` and zero calls; headline failure counted; body blocked → kept `bodyChecked: false`; undated search survivor dropped `undated`; final records not re-triaged; non-final records re-triaged; round-robin priority with budget 2 across two topics picks one per topic; disabled → skipped; store write failure caught; `/api/fetch` payload includes `triage`; `GET /api/triage` shape, ordering, cap, auth required.

---

### Task 7: Docs

**Files**
- Create `docs/TRIAGE.md`: pipeline order, drop reasons table (final vs non-final), `official` label, budget + env, Jev questions (plain-language), outlet breadth, what's stored where (`triage.json`, `meta.json.triage`), `GET /api/triage`, interim limits (topics edits don't re-triage final records; summaries budget enforced in NEWS-88; kept stories not yet shown in the Brief until NEWS-88; Filtered out view is NEWS-90).
- Update `docs/TOPIC_SEARCH.md` interim section (search rows are now triaged; survivors get resolved/scraped; guards still in place).
- Update `docs/MVP_API_COMPAT.md` (`/api/fetch` `triage` block; `GET /api/triage` row).
- Update `mvp/.env.example` (`TRIAGE_ENABLED`, `TRIAGE_JEV_BUDGET`, `TRIAGE_SUMMARY_BUDGET`).
- Update `AGENTS.md` (architecture block: triage step) and `README.md` if it lists refresh steps.
- Keep `npm run test:kite` doc checks green; docs must match the code (read it) and must not claim the Brief already uses triage (NEWS-88).
