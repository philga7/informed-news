# NEWS-89 — Full stories: tap-to-expand, automatic worth-it bar, topic sections, living updates

**Spec:** Jira [NEWS-89](https://informedcrew.atlassian.net/browse/NEWS-89) (Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)). The Jira description and epic settled decisions are binding. Depends on NEWS-85 (`Topic.sections[]`, `TopicSection`), NEWS-87 (triage kept + `memberIds` + `outletCount` + `significance` + labels), NEWS-88 (topic Brief compose, summaries, seen, refresh runner — [docs/BRIEF.md](../../docs/BRIEF.md)).

**Branch:** `feat/news-89-full-stories`

## Goal

Any topic Brief card can open a **full Kite rich story** (talking points, perspectives, timeline, quote, sources, image, optional topic extras) generated on demand in seconds and cached. At refresh, stories that clear the automatic worth-it bar are generated without a tap (≤5 total, ≤1 per topic). One living full brief per story: significant developments revise it and show "Updated: …"; unsupported sections are omitted, never invented.

**Build order inside this ticket:** tap-to-expand first (Tasks 1–3, 5–6), then automatic bar + living updates (Task 4), then docs/e2e (Task 7). First milestone for Epic L is complete once tap-to-expand ships; this plan also closes the ticket's automatic + living acceptance.

## Global Constraints

- **No live network in unit tests.** Ollama / Jev / fetch are injected; tests use fakes and temp paths. Never write to `mvp/data/`.
- **Constants** live in `mvp/server/src/services/briefConfig.ts` (extend, do not fork):
  - `FULL_STORY_AUTO_MAX_PER_REFRESH = 5`
  - `FULL_STORY_AUTO_MAX_PER_TOPIC = 1`
  - `FULL_STORY_MIN_OUTLETS_AUTO = 3` (independent outlets; syndication already counted once in triage `outletCount`)
  - `ON_DEMAND_FULL_STORY_MAX_PER_HOUR = 20`
  - `FULL_STORY_BODY_MAX_CHARS = 4000` (per member body excerpt in the enrich prompt)
  - `FULL_STORY_MEMBER_MAX = 6` (kept + duplicates fed to Ollama)
- **Env:** reuse `OLLAMA_API_KEY` / `OLLAMA_MODEL` via existing `getOllamaClient()` / `getOllamaModelName()`. No new AI client. Optional document-only note; no new required env var for v1.
- **Ollama = verbiage only** for shown / worth-it stories. Deterministic perspectives + quote builders stay non-AI. No verdict language; Kite keeps "AI-assisted — not ground truth."
- **Never invent sections:** empty / unsupported optional fields are omitted from the payload and from Kite output. Suggested Q&A framed as what to verify / what's still unknown.
- **Search-row batch skip stays** for `POST /api/enrich` / `enrichUnenrichedClusters` (Accept-path batch). Brief full stories use a **new Brief-scoped path** that includes triage-kept search rows.
- **Keying:** full stories are keyed by **kept `articleId`** (same as Brief membership / summaries), not `briefClusterKey` / `solo:…`. Do not break existing `cluster-enrichments.json` Accept-path consumers.
- **Kite:** glue under `apps/kite/src/lib/` + `components/brief/`; minimal upstream edits to `StoryCard` / `StoryHeader` / `+page.svelte`. Proxy routes follow existing `routes/api/**/+server.ts` pattern.
- No new dependencies. No Supabase, no `_legacy/`. Never commit `mvp/.env` or `mvp/data/*.json`.
- Tests: `npm test --prefix mvp/server` (register new files in `scripts.test`), `npm run typecheck`, `npm run test:kite`; Kite `bun run check` / unit tests; `npm run test:e2e:kite` in Task 7.

## Rulings (planning)

- **Separate store:** `mvp/data/brief-full-stories.json` — records keyed by kept `articleId`. Reuse of `cluster-enrichments.json` would collide with `solo:` keys and Accept-path batch semantics.
- **Record shape:** `{ articleId, status: 'ok' | 'unavailable' | 'error', enrichment (extended payload | null), deterministic: { perspectives?, quote? }, sourceHash, topicSections: TopicSection[], model, error, generatedAt, trigger: 'on_demand' | 'refresh', updatedAt?, changeSummary?, priorTimeline?: … }`. Living updates keep one record per story; timeline history is the merged timeline array (append new dated events; do not delete prior ones).
- **Tap-to-expand UX:** Expanding a topic Brief story (title / expand control) requests full story when status is missing/error (and still requests summary when `informed_summary_status === 'missing'`). Collapsed cards show a **Full story** affordance (link/button) that expands + requests. Expanded body shows "Loading full story…" until ok/unavailable/error; on 401 → "Log in on Topics to load full stories".
- **Core sections every time (when sources support them):** `short_summary` (prefer existing Brief summary text; do not re-ask Ollama for summary in the enrich call if `ok` summary exists), deterministic `perspectives` (≥2 members) + quote from member articles, Ollama `talking_points` / `timeline` / `suggested_qna`, sources (`domains` / articles already on card), image if present.
- **Topic extras:** from the story's Brief section topic `sections[]`: `business` → `business_angle_text` / `business_angle_points`; `technical` → `technical_details`; `action` → `user_action_items`; `history` → `historical_background`. **`map` is requested in the type/UI already but there is no Kite map section — omit `map` from generation and output** (never invent coordinates/maps). Document in BRIEF.md.
- **Prompt input:** up to `FULL_STORY_MEMBER_MAX` members from kept article + triage duplicate `memberIds` (same order as Brief links), each with title, domain, publishedAt, and body excerpt (`bodyText` when `bodyStatus === 'ok'`, else snippet). Include which optional section keys were requested.
- **Cache reuse:** `ok` with matching `sourceHash` (hash of concatenated member source texts + sorted requested section keys) → return without Ollama. `unavailable` when no member has usable text ≥ summary's post minimum / any body — no Ollama. `error` retried on next expand/refresh.
- **Automatic bar (all must hold):**
  1. Significance: Core topics need `significance != null` and Jev-significant — treat as `significance >= 1.0` on the 0–2 triage scale (Watch topics already only appear when significant at triage). Injectable threshold constant `FULL_STORY_AUTO_MIN_SIGNIFICANCE = 1`.
  2. Substantiated: `outletCount >= 3` **or** labels include `official`.
  3. New or significantly updated vs last full-story record: no prior `ok` record, or `outletCount` / significance deltas matching Brief seen thresholds (`SIGNIFICANT_UPDATE_*`), or sourceHash changed.
  - Rank candidates by significance desc, then outletCount desc, then newer; take ≤1 per topic section, ≤5 total. Others stay tap-only.
- **Living updates:** when regenerating an existing `ok` record (auto or on-demand after sourceHash change): merge timelines (append events whose `date+content` key is new), prefer new talking_points / perspectives / summary when present, set `updatedAt` and a short `changeSummary` (e.g. "2 new outlets; timeline +1") shown in Kite as "Updated: …". Minor outlet-only bumps without regeneration only change Brief card `+N` (no full regenerate) — automatic bar requires the significant-update gate above.
- **Hydration on GET stories:** `topicStoryToKite` / `topicBriefToKiteStories` merges cached full-story fields when `status === 'ok'` so a revisit shows rich sections without re-calling. Glue: `informed_full_story_status`, `informed_full_story_updated` (changeSummary).
- **Rate limit:** on-demand full stories capped at `ON_DEMAND_FULL_STORY_MAX_PER_HOUR` per process (separate from summaries). Concurrent same `articleId` share one in-flight promise.
- **Refresh integration:** after `generateRefreshSummaries` inside the refresh runner, call `generateRefreshFullStories` (never throws; records meta under `meta.brief.fullStories: { budget, used, generated, reused, unavailable, errors }`).

## Pre-flight conflict scan

| Pair / task | Shared surface | Check |
|-------------|----------------|-------|
| T1 store ↔ T3 service | `brief-full-stories.json` API | T1 defines IO; T3 is sole writer of generation results |
| T2 payload ↔ T3/T5 | extended enrichment fields | T2 owns validate/parse; T5 only maps fields that exist |
| T3 on-demand ↔ T4 refresh | same generate helper | Shared `generateFullStoryForArticle`; refresh uses selector first |
| T5 adapter ↔ T6 Kite | glue fields + story fields | Adapter sets `informed_full_story_*` + rich fields; Kite patches on POST |
| T4 auto ↔ existing enrichClusters | search skip | Auto path must **not** call `enrichUnenrichedClusters`; separate Brief path |
| Self: map section | topic `sections[]` includes map | Ruled omit — tests assert map never appears in payload |
| Self: summary vs enrich short_summary | dual summary sources | Prefer Brief summary store; enrich prompt does not require `short_summary`; optional enrich summary only if Brief summary missing |

---

### Task 1: Full-story types, config, and store

**Files**
- Modify `mvp/server/src/services/briefConfig.ts` (+ extend tests if present)
- Create `mvp/server/src/types/briefFullStory.ts`
- Extend `mvp/server/src/types/clusterEnrichment.ts` **or** put extended payload only on full-story type (prefer: `BriefFullStoryEnrichment` extends core talking_points/timeline/suggested_qna with optional business/technical/action/history fields — keep `ClusterEnrichmentPayload` unchanged for Accept-path)
- Create `mvp/server/src/store/briefFullStoryStore.ts` (+ test)
- Wire path in `mvp/server/src/store/paths.ts`, export from store/services index as needed; register test in `package.json`

**Behavior**
- Constants as in Global Constraints.
- Store: read/write/put-by-id, atomic tmp+rename, serialized writes (same pattern as `briefSummaries` / `briefSeen`).
- Types for record + extended enrichment + deterministic snapshot.

**Tests:** round-trip put; concurrent puts serialize; invalid path / empty file → []; prune helper optional (drop records whose articleId is no longer a kept triage id — call from write path like seen).

---

### Task 2: Full-story Ollama enrich (body + topic sections)

**Files**
- Create `mvp/server/src/services/briefFullStoryEnrichment.ts` (+ test) — can wrap/adapt patterns from `ollamaEnrichment.ts` without breaking Accept-path prompts
- Do **not** change Accept-path `enrichCluster` behavior except shared pure validators if extracted cleanly

**API**
```ts
export type FullStoryMemberInput = {
  title: string; publisherDomain: string; publishedAt: string;
  bodyOrSnippet: string; framingSummary?: string;
};
export type FullStoryEnrichRequest = {
  members: FullStoryMemberInput[];
  requestedSections: Array<'business' | 'technical' | 'action' | 'history'>; // never 'map'
};
export type BriefFullStoryEnrichment = {
  talking_points: string[];
  timeline: EnrichmentTimelineEvent[];
  suggested_qna: EnrichmentQnA[];
  business_angle_text?: string;
  business_angle_points?: string[];
  technical_details?: string[];
  user_action_items?: string[];
  historical_background?: string;
};
export function buildFullStoryEnrichmentPrompt(req: FullStoryEnrichRequest): string;
export function parseFullStoryEnrichmentResponse(raw: string, requested: FullStoryEnrichRequest['requestedSections']): BriefFullStoryEnrichment;
export function enrichFullStory(req: FullStoryEnrichRequest, deps?: { chat?; model?; timeoutMs? }): Promise<BriefFullStoryEnrichment>;
```

**Behavior**
- Prompt: facts from provided text only; omit any section you cannot support; Q&A = verify / unknown; no map; no verdicts.
- Parser drops empty optional sections; drops unrequested extras; empty core (no talking_points, timeline, or qna) → throw (caller records `error`).
- Body truncated per member to `FULL_STORY_BODY_MAX_CHARS`.

**Tests:** prompt includes requested section names and body excerpts; unrequested business fields stripped; empty payload throws; map never solicited; fake chat → parsed fields.

---

### Task 3: Generate full story (on-demand + shared core)

**Files**
- Create `mvp/server/src/services/briefFullStories.ts` (+ test)
- Export from `services/index.ts`

**API**
```ts
export type GenerateFullStoryResult =
  | { ok: true; record: BriefFullStoryRecord }
  | { ok: false; code: 'not_in_brief' | 'rate_limited' | 'error'; error: string };

export function generateFullStory(
  articleId: string,
  options?: { now?: Date; trigger?: 'on_demand' | 'refresh'; skipRateLimit?: boolean },
  deps?: BriefFullStoryDeps,
): Promise<GenerateFullStoryResult>;

export function sourceHashForMembers(members: FullStoryMemberInput[], sections: TopicSection[]): string;
export function mergeLivingFullStory(prior: BriefFullStoryRecord, next: …): BriefFullStoryRecord;
```

**Behavior**
1. Compose current Brief (reuse `loadBriefInputs` / `composeTopicBrief` patterns from `briefSummaries.ts`); 404-equivalent `not_in_brief` if article not visible.
2. Resolve members from kept article + duplicate memberIds (order = Brief links); build source text; no usable text → `unavailable` record, no Ollama.
3. Cache hit on hash → return.
4. On-demand: rate limit unless `skipRateLimit`; Ollama missing → error `Ollama not configured`.
5. Deterministic perspectives/quote from member `Article[]` (extract/reuse helpers from `kiteBriefAdapter.ts` — prefer exporting shared helpers rather than duplicating).
6. Call `enrichFullStory` with topic sections minus `map`.
7. Living merge when prior `ok` exists; set `changeSummary` when merged.
8. Persist; in-flight dedupe by articleId. Never throws.

**Tests:** not in brief; unavailable; cache reuse; rate limit; concurrent dedupe; living merge appends timeline and sets changeSummary; map section ignored; official/search rows allowed.

---

### Task 4: Automatic worth-it selection + refresh wiring

**Files**
- Create `mvp/server/src/services/briefFullStoryAuto.ts` (+ test) — pure `selectAutoFullStoryTargets(brief, existingRecords, opts) → articleId[]`
- Modify `mvp/server/src/services/briefFullStories.ts` — `generateRefreshFullStories` 
- Modify `mvp/server/src/services/refreshRunner.ts` (+ test) to call after summaries
- Update meta type for `meta.brief.fullStories`; `mvp/.env.example` note if needed

**Behavior**
- Selection per Rulings (significance, substantiation, new/updated, caps, rank).
- `generateRefreshFullStories`: for each selected id, `generateFullStory(..., { trigger: 'refresh', skipRateLimit: true })`; never throws; returns counts.
- Refresh runner attaches counts to result / meta.

**Tests:** fakes cover: Watch vs Core significance gate; outletCount 2 without official → skip; outletCount 3 → select; official with 1 outlet → select; cap 5 and 1-per-topic; ranking order; existing fresh hash → skip; significant update → select; refresh runner invokes and swallows generator errors.

---

### Task 5: Routes + Kite adapter hydration

**Files**
- Modify `mvp/server/src/services/kiteBriefAdapter.ts` (+ test): merge full-story fields into `topicStoryToKite`; extend `KiteBriefStory` with optional rich + glue fields
- Modify `mvp/server/src/services/kiteBriefRoutes.ts` / `mvp/server/src/app.ts`: `POST /api/brief/stories/:articleId/full` (session) → `generateFullStory`; status codes mirror summary (404/429/502/200)
- Kite proxy: `apps/kite/src/routes/api/brief/stories/[articleId]/full/+server.ts`
- `createApp` deps injectable `generateFullStory`

**Behavior**
- GET stories hydrates from store when `ok`.
- POST returns `{ ok: true, fullStory: { status, enrichment fields flattened or record, changeSummary? } }` suitable for client patch.
- 401 without session.

**Tests:** mapping includes talking_points when cached; glue status `missing`/`ok`/`unavailable`; route codes with stub generator; existing summary route unaffected.

---

### Task 6: Kite Topic Brief full-story UI

**Files**
- Extend `apps/kite/src/lib/topicBrief.ts` (+ unit tests): `postFullStory`, status helpers, patch applicator
- Modify `TopicBrief.svelte`: on expand / Full story click → POST full; patch story fields in place; loading/error/login copy
- Minimal `StoryCard` / `StoryHeader` / types for "Full story" control + "Updated: …" line when `informed_full_story_updated` set
- Ensure `StorySectionManager` receives patched fields (no new section components except reuse existing)

**Behavior**
- Mirror summary-on-demand effect for full stories (`informed_full_story_status === 'missing' | 'error'`).
- After success, story shows AI disclaimer when talking_points/timeline/qna present (existing StoryCard behavior).
- `bun run check` no new errors vs baseline; unit tests for helpers.

**Tests:** vitest for postFullStory URL/body handling and patch merge; manual browser is controller-owned.

---

### Task 7: Docs + e2e smoke

**Files**
- Update `docs/BRIEF.md`, `docs/OWNED_BRIEF.md`, `docs/MVP_API_COMPAT.md`, `docs/ROUTE_MAP.md` as needed; `AGENTS.md` only if operator path changes
- Extend `e2e/stack/scenarios.mjs` and/or `e2e/kite-smoke.spec.ts`: topic Brief card with pre-seeded full-story record expands to show talking point / AI disclaimer; optional stub note that live Ollama is off
- ROADMAP pointer stays NEWS-89 until ship cleanup (do not mark Done in this task)

**Behavior**
- Document tap-to-expand, cache file, auto bar, living updates, map omission.
- E2E hermetic: seed `brief-full-stories.json` in scenario so expand shows rich content without Ollama.

**Verification:** `npm run test:e2e:kite` green.
