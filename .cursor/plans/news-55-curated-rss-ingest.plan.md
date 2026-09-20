# NEWS-55 — Ingest curated RSS into article store

**Ticket:** [NEWS-55](https://informedcrew.atlassian.net/browse/NEWS-55)  
**Branch:** `feat/news-55-curated-rss-ingest`  
**Spec authority:** NEWS-55 description + [docs/RADAR_SOURCES.md](../../docs/RADAR_SOURCES.md) + existing CFP ingest path (`cfpFetch.ts` / `fetchAllSources.ts`)

## Goal

Ingest enabled curated radar RSS sources (NEWS-54 config) into the MVP article store via the same upsert / classify / cluster path as CFP. Demo: `POST /api/fetch` → ≥1 non-CFP `sourceKind: 'rss'` article in store. Ingest alone does **not** put items on Brief (Accept is NEWS-65).

## Global Constraints

- Product path: `mvp/server` (+ docs / smoke). Do not touch `_legacy/` or revive mvp-web. Kite UI out of scope (Radar UI is NEWS-58).
- Reuse store upsert / merge / classify / `assignClusterIds`. Do **not** invent a parallel store.
- CFP + xcancel must stay unbroken. Empty/missing curated config → skip curated (CFP-only still works).
- Curated failures are **isolated** (like xcancel): do not fail the whole refresh if CFP succeeded; surface errors honestly; never silently wipe classifications (existing merge rules).
- No paywall bypass; body scrape failures → `unavailable`/`blocked`, item still stored.
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/*.json`.
- Follow existing MVP TypeScript + `node:test` patterns.
- Fox: strip URL fragments (`#…`) from item links before identity/citations.
- Do not implement Radar UI, Accept, mute/track, Birdclaw, Telegram, or NEWS-67 admin CRUD.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| `sourceKind` | Add `'rss'` to `SourceKind` (not `'curated'` / `'radar'`). NEWS-66 may add `'manual'` later. | Rename later if product wants a longer label. |
| Aggregator scrape | Curated feeds are **direct publisher** feeds. Do **not** run CFP’s `scrapePublisherUrl` external-link hop. `canonicalUrl` = item `link` (fragment-stripped); `publisherUrl` = same URL; body scrape from that URL. | Misses rare syndication hops; acceptable for v1. |
| Citations | `citationsFromRss(sourceName, articleUrl)` → one citation `{ label: source.name, url: articleUrl }`. “Dual where applicable” remains CFP/xcancel; curated is single-hop. | UI shows one link until Accept/Radar needs more. |
| Per-source limit | Default **10** items per curated feed (`RADAR_FETCH_LIMIT` env, else `options.limit`, else 10). Cap politeness with 14 feeds. | Too few for dense days — bump via env. |
| Orchestration order | `fetchAllSources`: CFP → curated RSS → xcancel → `assignClusterIds` once. Curated empty = skipped. | Order-only; clusters still cross-source. |
| Meta errors | If curated has per-source errors and CFP ok, set `meta.lastError` to a concise curated summary **only when** no harder failure already set — same honesty spirit as xcancel (prefer appending / documenting in fetch payload `curated.errors`). | Operators may miss curated-only failures if they only watch meta — payload must include `curated.errors`. |

---

## Task 1: Extend SourceKind + citations + migrate + classify counts

**Files:**

- `mvp/server/src/types/article.ts` — `SourceKind = 'cfp' | 'xcancel' | 'rss'`.
- `mvp/server/src/store/migrateArticle.ts` — add `'rss'` to `SOURCE_KINDS`; export `citationsFromRss(sourceName: string, articleUrl: string): ArticleCitation[]` (single citation, label = sourceName).
- `mvp/server/src/store/index.ts` — re-export `citationsFromRss`.
- `mvp/server/src/services/classifyArticles.ts` — `bySourceKind` includes `rss: number` (initialize 0; increment via `article.sourceKind`).
- Any typecheck fallout in tests that construct `bySourceKind` literals.

**Tests:** Extend or add a small unit assertion that `citationsFromRss('Georgia Recorder', 'https://example.com/a')` returns one citation; migrate accepts `sourceKind: 'rss'`. Prefer a focused test file if none exists for citations — e.g. assert in a new `migrateArticle` / citations test or a tiny `citationsFromRss` block under an existing store test. Keep scope minimal.

**Commit:** `feat(server): add rss sourceKind and citations helper`

---

## Task 2: Curated RSS fetch service + fixture tests

**Files:**

- Create `mvp/server/src/services/curatedRssFetch.ts`:
  - Options: `{ sources?: RadarSource[]; limit?: number; configPath?: string }` — default sources from `loadRadarSources(configPath)`.
  - Result: `{ fetched: number; upserted: Article[]; sources: string[]; skipped: boolean; errors: string[]; limit: number }`.
  - Empty sources → `{ skipped: true, fetched: 0, upserted: [], errors: [], ... }` (no throw).
  - For each source: `parseRssFeed(feedUrl)` → take `limit` items → for each item: strip fragment from link; body scrape via `scrapePublisherBody`; build article with `sourceKind: 'rss'`, citations via `citationsFromRss(source.name, canonicalUrl)`, `publisherDomain` from `publisherDomainFromUrl` or `source.domain`, `handle: null`, classification fields null.
  - Per-source try/catch: push error string, continue other sources; upsert successful articles (batch per source or one upsert at end — prefer upsert per source so partial progress persists).
  - Do not clear `meta.lastError` on partial curated success if CFP already cleared it in the same refresh — leave meta to orchestrator, or only `updateMeta` lastError when curated is invoked standalone. Prefer: **orchestrator owns meta**; curated fetch does not call `updateMeta` (unlike CFP), so CFP remains the meta success writer and orchestrator merges curated errors into payload / optional lastError.
- Create `mvp/server/src/services/curatedRssFetch.test.ts` with a **fixture RSS XML** (inline or `fixtures/curated-rss-sample.xml`) and mocked `parseRssFeed` / `scrapePublisherBody` (or inject fetch) so tests are offline. Assert: ≥1 upsert-shaped article with `sourceKind: 'rss'`; fragment stripped from Fox-like link; empty sources → skipped; one failing source does not block another (mock).
- Update `mvp/server/package.json` `test` script to include the new test file.
- Export from `mvp/server/src/services/index.ts`.

**Commit:** `feat(server): ingest curated radar RSS into article store`

---

## Task 3: Wire fetchAllSources + API response

**Files:**

- `mvp/server/src/services/fetchAllSources.ts` — after CFP, call curated fetch; isolate errors (never throw past CFP success); include curated upserts in `articles` / `fetched`; then xcancel; then `assignClusterIds`. Extend `FetchAllResult` with `curated: CuratedRssFetchResult`.
- `mvp/server/src/index.ts` — `/api/fetch` JSON includes `curated: { skipped, sources, fetched, errors, articles }` (mirror xcancel shape).
- If a dedicated `fetchAllSources` test exists, extend it; otherwise rely on curated unit tests + smoke doc (do not add heavy integration unless cheap).

**Commit:** `feat(server): include curated RSS in unified fetch`

---

## Task 4: Smoke + docs

**Files:**

- `mvp/SMOKE.md` — add a short checklist section: after Refresh, assert ≥1 article with `sourceKind: "rss"` when `radar-sources.json` is present; note empty/missing config keeps CFP-only green; failures appear in `curated.errors` without wiping CFP.
- `docs/RADAR_SOURCES.md` — one short note that NEWS-55 ingests enabled sources on `POST /api/fetch` into the article store (still not Brief membership).

**Commit:** `docs: smoke curated RSS ingest (NEWS-55)`

---

## Out of scope

- Radar UI (`/radar`) — NEWS-58
- Accept / Brief membership — NEWS-65
- Manual seeds — NEWS-66
- Source admin CRUD — NEWS-67
- Rewriting CFP into a shared generic fetcher (optional follow-up; curated may share helpers but must not regress CFP)
