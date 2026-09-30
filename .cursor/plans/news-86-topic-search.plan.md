# NEWS-86 — Topic search ingest: Google News RSS + self-hosted SearXNG, merged

**Spec:** Jira [NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86) (Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)). The Jira description is binding; this plan argues from it. Depends on NEWS-85 (topics store: `readTopics()` in `mvp/server/src/store/topicsStore.ts`, `Topic` in `mvp/server/src/types/topic.ts`).

**Branch:** `feat/news-86-topic-search`

## Goal

Every refresh (`POST /api/fetch` → `fetchAllSources`), for each **desired** topic, query Google News RSS and a local SearXNG with the topic's search query, merge + dedupe the results, skip URLs already in the store, cap new articles per topic, and upsert them as articles tagged with the topics and providers that found them. Either provider failing must not fail the refresh; per-provider status is recorded for the refresh. The Google News link resolver (undocumented `batchexecute`) is built with a cache, but ingest only uses **cache hits** — live resolution is for headline-check survivors in NEWS-87.

## Global Constraints

- **No live network in unit tests.** Every network call goes through an injectable `fetch`-like dependency; tests use inline fixtures.
- **Window + caps (constants, one module — `mvp/server/src/services/topicSearchConfig.ts`):** `TOPIC_SEARCH_WINDOW_HOURS = 48`, `TOPIC_SEARCH_MAX_NEW_PER_TOPIC = 20`, `TOPIC_SEARCH_CONCURRENCY = 3` (topics in flight), `GOOGLE_NEWS_TIMEOUT_MS = 15_000`, `SEARXNG_TIMEOUT_MS = 20_000`, `GOOGLE_RESOLVE_TIMEOUT_MS = 15_000`, `PROVIDER_ERRORS_MAX = 5`.
- **Env (documented in `mvp/.env.example`):**
  - `TOPIC_SEARCH_ENABLED` — default on; `false` / `0` / `off` / `no` (case-insensitive) disables topic search entirely (both providers reported `disabled`).
  - `SEARXNG_URL` — unset → default `http://127.0.0.1:8888`; set to an empty string → SearXNG `disabled`; otherwise the base URL (trailing slash trimmed).
- **Google News RSS URL:** `https://news.google.com/rss/search?q=<encodeURIComponent(query + ' when:2d')>&hl=en-US&gl=US&ceid=US:en`.
- **SearXNG query:** `GET <base>/search?q=<query>&categories=news&format=json&language=en-US`. **Never** send `time_range`.
- **Query per topic:** `topic.searchQuery.trim() || topic.name`. Only `kind === 'desired'` topics are searched.
- **Providers:** type `SearchProvider = 'google_news' | 'searxng'`.
- **Articles from topic search:** new `SourceKind` value `'search'`; `sourceTier: 'sensor'`; `bodyStatus: 'pending'` (no body scrape at ingest — NEWS-87 scrapes survivors only); `snippet` = SearXNG `content` when present, else `''` (Google's description is not a summary).
- **New optional Article fields:** `topicIds?: string[]`, `searchProviders?: SearchProvider[]`, `googleNewsUrl?: string | null`. Optional so existing construction sites (CFP, curated RSS, xcancel, manual, tests) are untouched. They must survive `migrateArticle` (which rebuilds articles field-by-field) and upserts from other sources.
- **Provider failure isolation:** a provider error for a topic is recorded and the refresh continues; topic search as a whole never throws out of `fetchAllSources`. CFP behavior is unchanged (CFP failure still fails the refresh, as today).
- **Provider status per refresh** persisted in `meta.json` under `topicSearch` and returned by `POST /api/fetch`. Showing it in the Kite Brief is NEWS-88 (the Brief-by-topic rebuild); no Kite changes in this ticket.
- Follow existing patterns: `curatedRssFetch.ts` (deps injection, per-source error isolation), `rss.ts` (`rss-parser`), `muteRulesStore.ts` / `topicsStore.ts` (flat JSON store with injectable path), `publisherDomainFromUrl` in `publisherScrape.ts` (hostname minus `www.`).
- No new dependencies (`rss-parser`, `cheerio` are already available). No Supabase, no `_legacy/`. Never commit `mvp/.env` or `mvp/data/*.json`. Tests never write to `mvp/data/` (inject temp paths).
- Server tests: `node:test` via `npm test --prefix mvp/server` (append new test files to `scripts.test` in `mvp/server/package.json`); `npm run typecheck`; `npm run test:kite` must stay green.

## Rulings made while planning

- **Google links stay the identity until resolved.** A Google-only result's `canonicalUrl` is the Google News link (`?oc=…` query stripped), `googleNewsUrl` the same, `publisherUrl` = cached resolution or `null` — the same shape as CFP items (aggregator URL as identity, publisher URL alongside). Re-keying on resolution would churn article ids.
- **Cross-provider merge prefers the direct URL.** When a SearXNG result and a Google result are the same story, the merged article uses the SearXNG (direct publisher) URL as `canonicalUrl` and keeps `googleNewsUrl` — saving a Google resolution later. Match rule: equal canonicalized publisher URL, **or** same publisher domain + same normalized title (Google links are opaque until resolved, so URL-only matching would almost never merge).
- **Already-seen means "skip".** Candidates whose canonical URL, publisher URL, or Google link already exists in the store are skipped (not re-tagged with new topicIds). Within one refresh, the same story found by several topics is one article with all their `topicIds`.
- **Undated SearXNG results are kept** with `publishedAt: null`, sorted after dated ones for the cap; NEWS-87 dates them from page metadata at scrape time or drops them (spec: "dated from page metadata at scrape time or dropped").
- **Provider status display** lands in NEWS-88 (the Brief has no meta surface today); this ticket stores and returns it.
- **SearXNG config** is committed at `mvp/searxng/settings.yml`; the secret key comes from `SEARXNG_SECRET` at `docker run`, never committed.

---

### Task 1: Article model + store plumbing for topic search

**Files**
- Create `mvp/server/src/types/topicSearch.ts`
- Modify `mvp/server/src/types/article.ts`, `mvp/server/src/types/index.ts`
- Modify `mvp/server/src/store/migrateArticle.ts` (+ `migrateArticle.test.ts`)
- Modify `mvp/server/src/store/mergeArticleOnUpsert.ts` (+ `mergeArticleOnUpsert.test.ts`)
- Modify `mvp/server/src/store/paths.ts` (add `GOOGLE_NEWS_URL_CACHE_PATH = path.join(DATA_DIR, 'google-news-url-cache.json')`) and export it from `mvp/server/src/store/index.ts`
- Modify `mvp/server/src/services/classifyArticles.ts` (`bySourceKind` gains `search: 0`) and anything else the compiler flags from the `SourceKind` change
- Create `mvp/server/src/services/topicSearchConfig.ts` (constants from Global Constraints) and `mvp/server/src/services/searchUrl.ts` (+ `searchUrl.test.ts`)
- Modify `mvp/server/package.json` (append new test files)

**`types/topicSearch.ts`**
```ts
export type SearchProvider = 'google_news' | 'searxng';
export const SEARCH_PROVIDERS: readonly SearchProvider[] = ['google_news', 'searxng'];

export type ProviderRunState = 'ok' | 'partial' | 'down' | 'disabled';
export type ProviderRunStatus = {
  state: ProviderRunState;
  topicsAttempted: number;
  topicsFailed: number;
  items: number;        // candidates returned within the window, before merge
  errors: string[];     // at most PROVIDER_ERRORS_MAX, each "<topicId>: <message>"
};
export type TopicSearchMeta = {
  at: string;           // ISO time the run finished
  providers: Record<SearchProvider, ProviderRunStatus>;
};

/** One provider result, normalized. */
export type SearchCandidate = {
  provider: SearchProvider;
  title: string;
  /** Direct publisher article URL when known (SearXNG result URL; Google cache hit). */
  publisherUrl: string | null;
  publisherName: string | null;
  publisherDomain: string | null;
  /** Google News article link (query stripped); null for SearXNG. */
  googleNewsUrl: string | null;
  /** The CBMi… token from the Google link; null for SearXNG. */
  googleArticleId: string | null;
  publishedAt: string | null; // ISO
  snippet: string;
};
```

**`types/article.ts`**
- `SourceKind` gains `'search'`.
- `Article` gains optional `topicIds?: string[]`, `searchProviders?: SearchProvider[]`, `googleNewsUrl?: string | null` (import `SearchProvider` from `./topicSearch.js`), each with a one-line doc comment like neighbors.
- `StoreMeta` gains `topicSearch?: TopicSearchMeta | null`.

**`migrateArticle.ts`** — add `'search'` to `SOURCE_KINDS`. Preserve the new fields only when present and valid: `topicIds` = array of non-empty trimmed strings (deduped, order kept; omit the key if absent/not an array); `searchProviders` = array filtered to `SEARCH_PROVIDERS` (deduped; omit if absent); `googleNewsUrl` = string or null when the key exists (omit otherwise). Do **not** add these to `articleNeedsRewrite`. Tests: a stored search article round-trips all three fields; junk values are filtered; a CFP article without them has no such keys.

**`mergeArticleOnUpsert.ts`** — after existing logic, when an existing row exists: `topicIds` = union(existing, incoming) (existing order first) — present only if either side has it; same for `searchProviders`; `googleNewsUrl` = incoming value if it is a string, else existing value if present. Tests: CFP re-upsert of a URL first found by topic search keeps `topicIds`/`searchProviders`/`googleNewsUrl`; unions dedupe; no existing row → incoming as-is.

**`searchUrl.ts`**
- `canonicalizeSearchUrl(url: string): string | null` — parse with `URL`; only `http:`/`https:` (else null); drop the fragment; drop query params whose lowercased name starts with `utm_` or equals `fbclid`, `gclid`, `ocid`, `cmpid`, `oc`; lowercase the hostname; keep path as-is; remove a trailing `?` if no params remain. Invalid → null.
- `normalizeTitleForMatch(title: string): string` — lowercase, Unicode-normalize (NFKD) and strip combining marks, replace every non-alphanumeric run with one space, trim.
- Tests: tracking params removed but other params kept; fragment dropped; non-http rejected; Google link `https://news.google.com/rss/articles/CBMiXyz?oc=5` → `https://news.google.com/rss/articles/CBMiXyz`; title normalization collapses punctuation/case/accents (`"Iran’s Nuclear Deal — Update!"` → `"iran s nuclear deal update"`).

**Verify:** `npm test --prefix mvp/server`, `npm run typecheck`.

**Commit:** `feat(news-86): article + meta model for topic search provenance`

---

### Task 2: Google News RSS provider (search + parse)

**Depends on Task 1** (`SearchCandidate`, `topicSearchConfig`, `canonicalizeSearchUrl`).

**Files**
- Create `mvp/server/src/services/googleNewsRss.ts` (+ `googleNewsRss.test.ts`); export public functions from `services/index.ts`; append test to `package.json`.

**API**
```ts
export function buildGoogleNewsSearchUrl(query: string): string;
export function googleArticleIdFromUrl(url: string): string | null; // CBMi… token after /articles/, query stripped
export async function parseGoogleNewsRss(xml: string): Promise<SearchCandidate[]>;
export async function searchGoogleNews(
  query: string,
  options?: { now?: Date },
  deps?: { fetch?: typeof fetch },
): Promise<SearchCandidate[]>;
```

**Behavior**
- Parse with `rss-parser` (as `rss.ts` does, `preprocessXml` first), with a custom item field capturing `<source url="…">Publisher</source>` (name + `url` attribute). If `rss-parser` cannot expose the attribute, parse `<item>` blocks with `cheerio` in `xmlMode` instead — pick one and keep it in this file.
- Each item → candidate: `provider: 'google_news'`; `title` = item title with a trailing `" - <Publisher>"` removed when it matches the `<source>` name (only the last occurrence; otherwise title unchanged); `publisherName` = source text; `publisherDomain` = `publisherDomainFromUrl(source url)`; `googleNewsUrl` = `canonicalizeSearchUrl(link)`; `googleArticleId` from the link; `publisherUrl: null`; `publishedAt` = ISO of pubDate or null; `snippet: ''`. Items without title or link are skipped.
- `searchGoogleNews`: GET the built URL with `User-Agent: Mozilla/5.0 (compatible; InformedNews/1.0)` and `AbortSignal.timeout(GOOGLE_NEWS_TIMEOUT_MS)`; non-2xx → throw `Error('Google News RSS <status>')`; parse; keep only items with `publishedAt` within `TOPIC_SEARCH_WINDOW_HOURS` of `now` (default `new Date()`); items with no/invalid date are dropped (Google always dates items).

**Tests (fixture XML inline, 3–4 items):** URL encoding includes ` when:2d` and the fixed `hl/gl/ceid` params; suffix stripping (including a title that contains " - " earlier, and a title whose suffix doesn't match the source → unchanged); source name/domain; article id extraction; `?oc=5` stripped; 48h filter with injected `now` (one item 3 days old dropped); non-2xx throws; injected fetch receives the timeout signal and UA header.

**Verify / Commit:** `npm test --prefix mvp/server`, `npm run typecheck`. Commit `feat(news-86): Google News RSS topic search provider`.

---

### Task 3: Google News link resolver + URL cache

**Depends on Task 1** (`GOOGLE_NEWS_URL_CACHE_PATH`, config constants) and Task 2 (`googleArticleIdFromUrl`).

**Files**
- Create `mvp/server/src/store/googleNewsUrlCacheStore.ts` (+ test); export from `store/index.ts`
- Create `mvp/server/src/services/googleNewsResolve.ts` (+ test); export from `services/index.ts`
- Append tests to `package.json`

**Cache store** — file shape `{ "entries": { "<articleId>": { "url": "<resolved>", "resolvedAt": "<ISO>" } } }`. API (all async): `readGoogleNewsUrlCache(cachePath = GOOGLE_NEWS_URL_CACHE_PATH)` (missing file → empty; malformed entries dropped; non-object → throw), `getCachedGoogleNewsUrl(articleId, cachePath?): Promise<string | null>`, `putCachedGoogleNewsUrl(articleId, url, cachePath?): Promise<void>` (writes pretty JSON + newline, creates dir). Only successful resolutions are cached.

**Resolver** — `resolveGoogleNewsUrl(googleUrl: string, options?: { cachePath?: string }, deps?: { fetch?: typeof fetch }): Promise<string | null>`:
1. `articleId = googleArticleIdFromUrl(googleUrl)`; none → `null`.
2. Cache hit → return it with **no network call**.
3. `GET https://news.google.com/articles/<articleId>` (UA as Task 2, timeout `GOOGLE_RESOLVE_TIMEOUT_MS`); read attributes `data-n-a-sg` (signature) and `data-n-a-ts` (timestamp) from the first element carrying them (cheerio). Missing → `null`.
4. `POST https://news.google.com/_/DotsSplashUi/data/batchexecute` with header `content-type: application/x-www-form-urlencoded;charset=UTF-8` and body `f.req=` + `encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]]))` where `inner` is this exact string (substitute `<id>`, `<ts>`, `<sig>`):
   `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"<id>",<ts>,"<sig>"]`
5. Response: text begins with `)]}'`; take the part after the first blank line (`split('\n\n')[1]`), `JSON.parse` it → array of envelopes; find the envelope whose `[0] === 'wrb.fr'` and `[1] === 'Fbv4je'`; `JSON.parse(envelope[2])` → `["garturlres", "<url>", …]`; the URL is index 1. Must be http(s) and not on `news.google.com`, else `null`.
6. Success → `putCachedGoogleNewsUrl` then return. **Any** error (network, status, parse) → `null` (log nothing noisy; one `console.warn` line with the article id is fine) — callers keep the Google link + publisher.

**Tests (fixtures inline: a minimal article HTML with a `<c-wiz><div data-n-a-sg="SIG" data-n-a-ts="1700000000">`, and a batchexecute response body in the real envelope format):** happy path returns the URL, caches it, and the POST body contains `Fbv4je`, `garturlreq`, the id, ts, sig; second call hits cache with zero fetch calls; missing attributes → null, nothing cached; non-2xx → null; garbage response → null; resolved `news.google.com` URL rejected; non-Google URL input → null without fetching. Temp cache paths only.

**Verify / Commit:** `npm test --prefix mvp/server`, `npm run typecheck`. Commit `feat(news-86): Google News link resolver with URL cache`.

---

### Task 4: SearXNG provider

**Depends on Task 1.**

**Files**
- Create `mvp/server/src/services/searxngSearch.ts` (+ test); export from `services/index.ts`; append test to `package.json`.

**API**
```ts
export function resolveSearxngBaseUrl(env?: NodeJS.ProcessEnv): string | null; // unset → 'http://127.0.0.1:8888'; '' → null (disabled); trims trailing '/'
export function buildSearxngSearchUrl(baseUrl: string, query: string): string;
export function parseSearxngPublishedDate(value: unknown, now: Date): string | null;
export function parseSearxngResults(json: unknown, now: Date): SearchCandidate[];
export async function searchSearxng(
  query: string,
  options: { baseUrl: string; now?: Date },
  deps?: { fetch?: typeof fetch },
): Promise<SearchCandidate[]>;
```

**Behavior**
- URL: `${baseUrl}/search?q=…&categories=news&format=json&language=en-US` via `URLSearchParams`; assert in tests that `time_range` is absent.
- `parseSearxngPublishedDate`: ISO/RFC date strings → ISO; relative English text anywhere in the string matching `/(\d+)\s*(minute|min|hour|hr|day)s?\s+ago/i` → `now` minus that amount; `"yesterday"` → now − 24h; anything else → null.
- `parseSearxngResults`: input must be an object with array `results` (else throw `Error('SearXNG response missing results')`). Per result: requires string `url` (canonicalized via `canonicalizeSearchUrl`; null → skip) and non-empty `title`. `publishedAt` = parse(`publishedDate`) ?? parse(`pubdate`) ?? parse(first 40 chars of `content`). Drop dated items older than `TOPIC_SEARCH_WINDOW_HOURS`; **keep undated** (`publishedAt: null`). Candidate: `provider: 'searxng'`, `publisherUrl` = canonical URL, `publisherDomain` = `publisherDomainFromUrl`, `publisherName: null`, `googleNewsUrl: null`, `googleArticleId: null`, `snippet` = trimmed `content` or `''`. Dedupe by canonical URL within one response (keep first).
- `searchSearxng`: GET with `Accept: application/json` and `AbortSignal.timeout(SEARXNG_TIMEOUT_MS)`; non-2xx → throw `Error('SearXNG <status>')`; network errors propagate (the orchestrator records them).

**Tests (fixture JSON inline):** env resolution (unset / empty / trailing slash); URL params and no `time_range`; ISO date, "3 hours ago", "2 days ago" (kept) vs "4 days ago" (dropped), undated kept; tracking params stripped and duplicate URLs collapsed; missing `results` throws; non-2xx throws; injected fetch sees Accept header + timeout signal.

**Verify / Commit:** `npm test --prefix mvp/server`, `npm run typecheck`. Commit `feat(news-86): SearXNG topic search provider`.

---

### Task 5: Topic search ingest (merge, dedupe, caps, status) wired into refresh

**Depends on Tasks 1–4** and NEWS-85 `readTopics`.

**Files**
- Create `mvp/server/src/services/topicSearchIngest.ts` (+ `topicSearchIngest.test.ts`); export from `services/index.ts`
- Modify `mvp/server/src/services/fetchAllSources.ts`
- Modify `mvp/server/src/app.ts` (`POST /api/fetch` response) and `mvp/server/src/app.test.ts` (stubs gain `topicSearch`; one assertion that the response includes it)
- Append test to `package.json`

**API**
```ts
export type TopicSearchTopicCounts = { found: number; merged: number; skippedSeen: number; new: number };
export type TopicSearchResult = {
  skipped: boolean;              // disabled, or no desired topics
  providers: Record<SearchProvider, ProviderRunStatus>;
  fetched: number;               // total candidates across providers/topics (within window, pre-merge)
  perTopic: Record<string, TopicSearchTopicCounts>;
  upserted: Article[];
  errors: string[];              // run-level errors (e.g. topics store unreadable)
};
export type TopicSearchDeps = {
  readTopics?: () => Promise<{ topics: Topic[] }>;
  readArticles?: () => Promise<Article[]>;
  upsertArticles?: typeof upsertArticles;
  updateMeta?: (patch: Partial<StoreMeta>) => Promise<unknown>;
  searchGoogleNews?: (query: string, options: { now: Date }) => Promise<SearchCandidate[]>;
  searchSearxng?: (query: string, options: { baseUrl: string; now: Date }) => Promise<SearchCandidate[]>;
  getCachedGoogleNewsUrl?: (articleId: string) => Promise<string | null>;
};
export async function runTopicSearch(
  options?: { now?: Date; env?: NodeJS.ProcessEnv },
  deps?: TopicSearchDeps,
): Promise<TopicSearchResult>;
```
Also export pure helpers used by the orchestrator so they are unit-testable: `mergeCandidates(candidates: SearchCandidate[]): MergedCandidate[]`, `selectNewForTopic(merged, seen: Set<string>, max): { selected; skippedSeen }`, `buildSeenKeys(articles: Article[]): Set<string>`, `toArticleInput(merged, topicIds, fetchedAt)`. `MergedCandidate` = `{ canonicalUrl, publisherUrl, googleNewsUrl, title, publisherName, publisherDomain, publishedAt, snippet, providers: SearchProvider[] }`.

**Behavior**
1. `TOPIC_SEARCH_ENABLED` off → `skipped: true`, both providers `{ state: 'disabled', topicsAttempted: 0, topicsFailed: 0, items: 0, errors: [] }`, write meta, return. `resolveSearxngBaseUrl(env)` null → SearXNG `disabled` (Google still runs).
2. Read topics; filter `kind === 'desired'`. Read failure → `skipped: true`, `errors: [message]`, providers `down` with that message, write meta, return (never throw). Zero desired topics → `skipped: true`, providers `ok` with zeros.
3. For each topic (at most `TOPIC_SEARCH_CONCURRENCY` in flight), query = `searchQuery.trim() || name`; run enabled providers with `Promise.allSettled`. Rejections → that provider's `topicsFailed += 1` and an error `"<topic.id>: <message>"` (keep the first `PROVIDER_ERRORS_MAX`). Fulfilled → `items += n`.
4. Google candidates with `googleArticleId`: look up `getCachedGoogleNewsUrl`; hit → set `publisherUrl` to the canonicalized hit. **No live resolution here.**
5. `mergeCandidates` (per topic): two candidates are the same story when (a) both have a `publisherUrl` and they are equal, or (b) both have a `publisherDomain` and equal `normalizeTitleForMatch(title)` (non-empty) and equal domain. Merged fields: `providers` = union in `SEARCH_PROVIDERS` order; `canonicalUrl` = first `publisherUrl` from a SearXNG member, else any member's `publisherUrl`, else the Google member's `googleNewsUrl`; `publisherUrl` = that direct URL or null; `googleNewsUrl` = the Google member's, or null; `title` = SearXNG member's title if present else Google's; `publisherName` = Google's `publisherName` ?? null; `publisherDomain` = first non-null; `publishedAt` = Google member's if present, else SearXNG's; `snippet` = first non-empty.
6. `buildSeenKeys` from the store: canonicalized `canonicalUrl`, `publisherUrl`, and `googleNewsUrl` of every article. `selectNewForTopic`: drop merged candidates whose `canonicalUrl`, `publisherUrl`, or `googleNewsUrl` is in `seen` (count `skippedSeen`), sort remaining by `publishedAt` desc with nulls last, take `TOPIC_SEARCH_MAX_NEW_PER_TOPIC`.
7. Across topics: combine by `canonicalUrl` — `topicIds` union (topic order), `providers` union. Build upsert inputs via `toArticleInput`: `sourceKind: 'search'`, `sourceTier: 'sensor'`, `canonicalUrl`, `citations` = `[{ label: publisherName ?? publisherDomain ?? 'Publisher', url: publisherUrl ?? canonicalUrl }]` plus `{ label: 'Google News', url: googleNewsUrl }` when a Google link exists and differs from the first citation URL, `publisherUrl`, `publisherDomain`, `handle: null`, `publishedAt`, `snippet`, `bodyText: null`, `bodyStatus: 'pending'`, `publisherTitle: null`, image fields null, `clusterId: null`, `fetchedAt`, classification fields null, `topicIds`, `searchProviders`, `googleNewsUrl`. One `upsertArticles` call (skip when empty).
8. Provider states: `disabled` as above; else `down` when `topicsFailed === topicsAttempted && topicsAttempted > 0`; `partial` when `0 < topicsFailed < topicsAttempted`; else `ok`.
9. `updateMeta({ topicSearch: { at: <now ISO>, providers } })` — a failing meta write is logged, not thrown. Return the result.

**`fetchAllSources.ts`** — after xcancel and **before** `assignClusterIds`, run `runTopicSearch()` inside `try/catch` (catch → a `TopicSearchResult` with `skipped: false`, both providers `down` with the message, empty arrays). Add `topicSearch` to `FetchAllResult` (with `upserted` passed through `withCluster`), include its upserted rows in `articles` and its `fetched` in the total. Update the doc comment's source order.

**`app.ts` `POST /api/fetch`** — add `topicSearch: { skipped, providers, fetched, perTopic, errors, articles: <upserted count> }` to the JSON (count, not the rows — rows are already in top-level `articles`).

**Tests (`topicSearchIngest.test.ts`, all via deps — no network, no disk):**
- both providers return fixtures for two topics → merged + deduped candidates; a story present in both providers becomes one article with `searchProviders: ['google_news','searxng']`, SearXNG URL as `canonicalUrl`, and `googleNewsUrl` kept
- title+domain match merges when URLs differ; different domains with the same title do not merge
- Google cache hit sets `publisherUrl` and enables URL-based merge; `getCachedGoogleNewsUrl` is the only resolver touched (assert no live resolver is referenced/called)
- same story found by two topics → one upsert input with both `topicIds`
- already-seen canonical / publisher / Google URLs skipped and counted
- cap: 25 fresh candidates for one topic → 20 selected, newest first, undated last
- SearXNG rejects for every topic → `searxng.state === 'down'`, Google results still upserted, refresh result not skipped; Google down → SearXNG only; one topic failing → `partial`
- `TOPIC_SEARCH_ENABLED=off` → skipped, both `disabled`, no provider calls; `SEARXNG_URL=''` → SearXNG `disabled`, Google runs
- only desired topics searched; empty `searchQuery` falls back to the name
- `updateMeta` receives `topicSearch` with the provider statuses; a throwing `updateMeta` doesn't fail the run
- error lists capped at 5

**Verify / Commit:** `npm test --prefix mvp/server`, `npm run typecheck`, `npm run test:kite`. Commit `feat(news-86): topic search ingest merged into refresh`.

---

### Task 6: SearXNG setup, env, and docs

**Depends on Tasks 1–5.**

**Files**
- Create `mvp/searxng/settings.yml`
- Create `docs/TOPIC_SEARCH.md`
- Modify `README.md` (Environment section: short "Topic search (optional SearXNG)" subsection linking the doc), `mvp/.env.example`, `docs/MVP_API_COMPAT.md`, `AGENTS.md` (architecture block: mvp/server also ingests topic search via Google News RSS + local SearXNG)

**`mvp/searxng/settings.yml`**
```yaml
use_default_settings: true
server:
  # Overridden at runtime by the SEARXNG_SECRET env var; never commit a real key.
  secret_key: "replace-via-SEARXNG_SECRET"
  limiter: false
  image_proxy: false
search:
  formats:
    - html
    - json
```

**Pinned image tag:** look up a current real `searxng/searxng` tag (e.g. `curl -s 'https://hub.docker.com/v2/repositories/searxng/searxng/tags?page_size=10'` and pick the newest dated tag, not `latest`) and use it everywhere the doc names the image. If the lookup is impossible, stop and report NEEDS_CONTEXT rather than inventing a tag.

**`docs/TOPIC_SEARCH.md`** — sections: What it does (per desired topic, both providers every refresh, merged, 48h window, ≤20 new per topic, skip seen, provenance fields `topicIds` / `searchProviders` / `googleNewsUrl`); Google News RSS (URL shape, link resolution only for headline-check survivors in NEWS-87 with a cache at `mvp/data/google-news-url-cache.json`, undocumented `batchexecute` gray area — may break); SearXNG setup (the committed settings file; `docker run -d --name informed-searxng --restart unless-stopped -p 127.0.0.1:8888:8080 -v "$(pwd)/mvp/searxng:/etc/searxng" -e SEARXNG_SECRET="$(openssl rand -hex 32)" searxng/searxng:<pinned>` from the repo root; bound to localhost; limiter off; JSON enabled; never send `time_range`; Bing engine broken upstream — left as-is; quick check `curl 'http://127.0.0.1:8888/search?q=test&categories=news&format=json' | head -c 300`); Env (`TOPIC_SEARCH_ENABLED`, `SEARXNG_URL` semantics from Global Constraints); Failure behavior (either provider down → refresh continues, status in `meta.json` → `topicSearch` and in the `POST /api/fetch` response; `npm run dev` does not need SearXNG running); Trade-offs (SearXNG proxies Google/Brave/DDG so providers are not fully independent).

**`mvp/.env.example`** — add, with comments: `TOPIC_SEARCH_ENABLED=true` and `SEARXNG_URL=http://127.0.0.1:8888` (comment: empty value disables SearXNG; see docs/TOPIC_SEARCH.md).

**`docs/MVP_API_COMPAT.md`** — update the `POST /api/fetch` row to mention topic search (Google News RSS + SearXNG per desired topic) and the new `topicSearch` block `{ skipped, providers: { google_news, searxng }: { state, topicsAttempted, topicsFailed, items, errors }, fetched, perTopic, errors, articles }`; note that articles may now have `sourceKind: 'search'` and optional `topicIds`, `searchProviders`, `googleNewsUrl`; link NEWS-86. Keep every string `tests/mvp-api-compat.test.js` asserts.

**Optional live smoke (do it if Docker is available; report either way):** start the container per the doc, `curl` the JSON endpoint, then (with `mvp/.env` present) run a refresh in the dev stack or a one-off `tsx` script calling `runTopicSearch()` and report provider states and counts. Stop and remove the container afterwards (`docker rm -f informed-searxng`). This writes to real `mvp/data/` (gitignored) — acceptable; never commit it.

**Verify / Commit:** `npm run test:kite`, `npm test --prefix mvp/server`, `npm run typecheck`. Commit `docs(news-86): SearXNG setup and topic search docs`.
