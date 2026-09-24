# NEWS-73 — Primary vs sensor source tiers + conflict primary starter set

**Ticket:** [NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)  
**Branch:** `feat/news-73-primary-sensor-source-tiers`  
**Spec authority:** NEWS-73 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + Epic J plan [claims_evidence_spine_8f4cde15.plan.md](claims_evidence_spine_8f4cde15.plan.md) + NEWS-70 status derivation + NEWS-72 extract  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Extend the radar-sources config with `sourceTier: primary | sensor`, ingest a small **conflict primary** starter set into the shared article store (same curated RSS path), stamp articles + evidence with tiers, and surface sensor/primary counts on fetch — so primary support can drive `supported_by_primary` via existing `deriveClaimStatus`.

Demo: fetch shows sensor + primary counts; evidence links carry `sourceTier`; extracting a primary article that supports a claim can flip status to `supported_by_primary` (no Verified badge).

## Global Constraints

- Product path: `mvp/server` (+ docs). Do not revive `_legacy/` / Supabase.
- File-config only — no source admin CRUD ([NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67) parked).
- No Birdclaw / Telegram.
- Existing CFP + curated RSS = **sensor** (claim proposers). Primaries = preferred **evidence**.
- Composite claim **status** remains `deriveClaimStatus` (NEWS-70) — never a model truth output.
- Honesty: no Verified / claim-verdict strings.
- Never commit `mvp/.env` or runtime `mvp/data/*.json`.
- Add/update tests in `mvp/server/package.json` `"test"` script as needed.
- CI must not call live remote feeds for unit tests — inject mocks / temp config paths.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Config field | `RadarSource.sourceTier?: 'primary' \| 'sensor'`. **Absent → `sensor`** (backward compatible). Present but not `primary`/`sensor` → entry malformed → entire config load returns `[]` (existing fail-closed). | Sensors silently treated primary. |
| Existing 14 curated | Explicit `"sourceTier": "sensor"` in `radar-sources.json` (clarity) + CFP/xcancel always sensor in code. | Ambiguity in docs vs JSON. |
| Primary starter set (exact URLs) | Three enabled primaries (State / Defense / UN-class): see table below. | Wrong feeds → weak conflict coverage. |
| RSS User-Agent | `mvp/server/src/services/rss.ts` must use `Mozilla/5.0 (compatible; InformedNews/1.0)` — State.gov returns **403** for bare `Informed News MVP`. Do not change publisher-body scrape UA in this ticket unless a focused test proves State item pages need it (body may stay `unavailable`). | Primary State feed never ingests. |
| Article field | Add optional `sourceTier: SourceTier` on `Article` (import type from `claim.ts` or re-export). Missing/legacy rows → treat as **`sensor`** at read/use sites. Persist on curated upsert from config tier; CFP + xcancel write `'sensor'`; manual seeds write `'sensor'`. | Extract cannot know tier. |
| Merge upsert | `mergeArticleOnUpsert`: if incoming has `sourceTier`, take it; else keep existing; else default sensor on new rows. Do not invent other merge policy. | Tier flaps on re-fetch. |
| Curated ingest | Same `fetchCuratedRss` path — primaries are just more entries in `radar-sources.json`. No separate fetch pipeline. | Divergent stores. |
| Fetch response | `POST /api/fetch` JSON gains top-level `tiers: { sensor: { fetched: number; upserted: number }; primary: { fetched: number; upserted: number } }` counted from **this run's** upserted articles (CFP+curated+xcancel). `fetched` = count of upserted rows with that tier (simple demo counts). Also include per-source tier on curated `sources` is **not** required — keep `sources: string[]` as today. | Demo cannot show tier split. |
| Extract evidence tier | Replace hard-coded `sourceTier: 'sensor'` in `extractClaims.ts` with `article.sourceTier === 'primary' ? 'primary' : 'sensor'`. | Primaries never drive `supported_by_primary`. |
| Extract batch preference | When selecting unprocessed articles (no `articleIds`), **prefer sensors first**, then fill remaining slots with primaries (still under limit). Explicit `articleIds` honors order given. | Primaries flood claim proposers. |
| Story Radar | Primaries may appear on story Radar (same curated pool) — no hide filter in this ticket. | Extra UI work. |
| Out of scope | Claim Radar UI (NEWS-74), Accept/Track/Mute HTTP (NEWS-75), Brief verbiage (NEWS-76), source admin CRUD, Birdclaw/Telegram, auto extract-after-fetch. | |

### Locked primary starter set

| id | name | domain | feedUrl | sourceTier |
|----|------|--------|---------|-------------|
| `us-state-press` | US State Department press releases | state.gov | `https://www.state.gov/rss-feed/press-releases/feed/` | primary |
| `us-defense-releases` | US Defense Department news releases | defense.gov | `https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10` | primary |
| `un-news` | UN News | news.un.org | `https://news.un.org/feed/subscribe/en/news/all/rss.xml` | primary |

Region for all three: `"conflict"` (string; optional field already exists).

### Article.sourceTier (verbatim addition)

```ts
import type { SourceTier } from './claim.js'; // or shared re-export

// on Article:
sourceTier?: SourceTier; // absent/legacy → treat as 'sensor'
```

### Fetch tiers payload (verbatim)

```ts
tiers: {
  sensor: { fetched: number; upserted: number };
  primary: { fetched: number; upserted: number };
}
```

For this ticket, set `fetched` === `upserted` for each tier (count of this-run upserts by tier). Keep existing `cfp` / `curated` / `xcancel` blocks unchanged aside from articles carrying `sourceTier`.

---

## Task 1: Config + loader — sourceTier + primary starter set

**Files:**

- Update `mvp/server/src/types/radarSource.ts`: add `sourceTier?: 'primary' | 'sensor'`.
- Update `mvp/server/src/services/loadRadarSources.ts`: parse `sourceTier`; default absent → `'sensor'` on returned objects (always set the field on successful parse for downstream ease); invalid value → malformed entry → `[]`.
- Update `mvp/server/config/radar-sources.json`:
  - Add `"sourceTier": "sensor"` to each of the existing 14 entries.
  - Append the 3 locked primary rows (enabled: true, region: `"conflict"`).
- Update `loadRadarSources.test.ts`:
  1. Committed config returns **17** enabled sources.
  2. Ids include the three primary ids; those three have `sourceTier === 'primary'`.
  3. A sample existing id (e.g. `georgia-recorder`) has `sourceTier === 'sensor'`.
  4. Temp config missing `sourceTier` → loaded source has `sensor`.
  5. Temp config with `sourceTier: "nope"` → `[]`.
- Update `docs/RADAR_SOURCES.md`: document `sourceTier`, list the three primaries, note CFP is sensor in code, note UA requirement for State.gov briefly.

**Commit:** `feat(server): radar sourceTier + conflict primary starter set`

---

## Task 2: Persist article sourceTier + fetch tier counts + RSS UA

**Files:**

- `mvp/server/src/types/article.ts` — optional `sourceTier?: SourceTier` (import from claim types).
- `mvp/server/src/services/rss.ts` — User-Agent → `Mozilla/5.0 (compatible; InformedNews/1.0)`.
- `mvp/server/src/services/curatedRssFetch.ts` — set `sourceTier: source.sourceTier === 'primary' ? 'primary' : 'sensor'` on each pending article (after Task 1, loader always sets the field).
- `mvp/server/src/services/cfpFetch.ts` — set `sourceTier: 'sensor'` on upserts.
- `mvp/server/src/services/xcancelFetch.ts` — set `sourceTier: 'sensor'` on upserts (if articles are built there).
- `mvp/server/src/services/manualBriefSeed.ts` — set `sourceTier: 'sensor'` on manual seeds.
- `mvp/server/src/store/mergeArticleOnUpsert.ts` (+ test if present) — preserve/apply `sourceTier` per locked ruling.
- `mvp/server/src/services/fetchAllSources.ts` + `app.ts` `POST /api/fetch` — compute and return `tiers` payload from this-run upserted articles (helper ok: `countFetchTiers(articles: Article[])`).
- Tests:
  - `curatedRssFetch.test.ts`: injected source with `sourceTier: 'primary'` → upserted article has primary; sensor source → sensor.
  - `fetchAllSources` or `app.test.ts`: mocked fetch returns mixed tiers → response includes correct `tiers` counts.
  - Adjust any fixtures that construct full `Article` objects if typecheck requires the new field (optional field — prefer leaving fixtures without it; runtime treats as sensor).

**Commit:** `feat(server): persist sourceTier on articles + fetch tier counts`

---

## Task 3: Extract uses article sourceTier + sensor-first batch

**Files:**

- `mvp/server/src/services/extractClaims.ts`:
  - Evidence `sourceTier` from article (ruling above).
  - Unprocessed selection: sensors first, then primaries.
- `extractClaims.test.ts`:
  1. Article with `sourceTier: 'primary'` → evidence link `sourceTier: 'primary'`; with supporting stance + high conf → claim status `supported_by_primary` after upsert.
  2. Article without `sourceTier` / `'sensor'` → evidence `sensor`.
  3. Mixed unprocessed pool: without `articleIds`, sensors selected before primaries when both available (assert via which articleIds were proposed against — inject propose spy).
- Export/helpers only if needed; register tests already covered by package.json script.

**Commit:** `feat(server): evidence sourceTier from article + sensor-first extract`

---

## Task 4: Docs seam

**Files:**

- `docs/MVP_API_COMPAT.md` — document `tiers` on `POST /api/fetch`; note article/evidence `sourceTier`.
- `docs/CLAIMS_DISCERNMENT.md` — one line that NEWS-73 stamps primary vs sensor on feeds/articles/evidence.
- `docs/RADAR_SOURCES.md` — already updated in Task 1; only touch if Task 2/3 need a fetch-response note.
- Optional one-liner in `docs/OWNED_BRIEF.md` if it mentions radar sources without tiers.

**Commit:** `docs: ship NEWS-73 primary/sensor tier notes`

---

## Out of scope

- `GET /api/claims/radar` / Kite claim inbox (NEWS-74)
- Accept / Track / Mute on claims (NEWS-75)
- Brief hybrid / Ollama verbiage (NEWS-76)
- Source admin CRUD (NEWS-67)
- Birdclaw / Telegram
- Hiding primaries from story Radar
- Changing `deriveClaimStatus` thresholds (already NEWS-70)
)
