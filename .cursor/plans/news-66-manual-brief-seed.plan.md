# NEWS-66 — Manual Brief seed (title / note / optional URLs)

**Ticket:** [NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)  
**Branch:** `feat/news-66-manual-brief-seed`  
**Spec authority:** NEWS-66 description + [docs/ROADMAP.md](../../docs/ROADMAP.md) membership + [docs/OWNED_BRIEF.md](../../docs/OWNED_BRIEF.md) + NEWS-65 Accept path

## Goal

Operator creates a Brief story with **title** (required), **note** / **URL(s)** (optional). Persisted as `sourceKind: 'manual'`, **Accepted immediately**, on Brief not Radar. Unaccept drops from Brief (no hard-delete). Survives restart.

## Global Constraints

- Build on NEWS-65 membership (`briefMembershipStore`, `filterArticlesForBrief`, `briefClusterKey`). Do not reinvent Accept.
- Radar stays CFP+RSS only — `buildRadarFeed` already excludes other kinds; keep it that way.
- Product path: `mvp/server` + thin Kite UI. No `_legacy/` / Supabase.
- Session-gated mutating seed API (like Accept).
- **Track** default-on is NEWS-59 — do **not** implement Track store here; leave a one-line seam comment if useful.
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/*.json`.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Identity | `canonicalUrl = manual://seed/{uuid}` → `id = articleIdFromCanonicalUrl(...)`. Set `clusterId = id` so membership key is the real id (not `solo:`). | Solo rematch gap if clustering later rewrites id — same known gap as NEWS-65; document. |
| Note | Store operator note in `snippet`. Empty note → honest Brief summary string (below). | |
| URLs | Optional list → `citations: [{ label: 'Source', url }]` (trim, validate http/https). Also set `publisherUrl` to first URL if present. | |
| Body | `bodyText: null`, `bodyStatus: 'not_applicable'`. | |
| Brief summary | Manual primary: note snippet if present; else fixed copy: `Operator-seeded story — no publisher body yet.` (override title-only fallback for manual). | |
| Accept | Call `acceptCluster(clusterId)` in the same seed transaction after upsert. | |
| Track | Out of scope (NEWS-59). | |
| Radar | No change required if `manual` ∉ cfp\|rss filter; add regression test. | |
| UI | Brief Header (or empty-state) “Add story” button → small modal (title / note / URLs) → `POST /api/brief/seed` via Kite proxy; on success navigate/reload Brief. | |
| Unaccept | Reuse existing Unaccept API. **Brief must expose Unaccept** for accepted clusters (manual seeds never appear on Radar). Prefer a compact control on the story header/card for accepted stories. Seed rows may remain in `articles.json`. | |

### API shape (verbatim)

```ts
// POST /api/brief/seed  (session)
// body: { title: string; note?: string; urls?: string[] }
// 200: { ok: true; articleId: string; clusterId: string; acceptedClusterIds: string[] }
// 400: { ok: false; error: string }  // missing title / bad urls
// 401: Unauthorized
```

---

## Task 1: `sourceKind: 'manual'` type + migrate/classify plumbing

**Files:**

- `mvp/server/src/types/article.ts` — add `'manual'` to `SourceKind`.
- `mvp/server/src/store/migrateArticle.ts` — allow `'manual'` in `SOURCE_KINDS`; default `bodyStatus` for manual → `not_applicable`.
- `mvp/server/src/services/classifyArticles.ts` — extend `bySourceKind` with `manual: number` (or omit from classify batch — prefer skip classifying manual seeds).
- Update any exhaustive SourceKind switches/tests that break.

**Commit:** `feat(server): add manual sourceKind for Brief seeds`

---

## Task 2: `createManualSeed` + session `POST /api/brief/seed`

**Files:**

- Create `mvp/server/src/services/manualBriefSeed.ts` — pure `buildManualSeedArticle(input, now)` + async `createManualSeed(...)` that upserts article + `acceptCluster`.
- Wire `POST /api/brief/seed` in `mvp/server/src/index.ts` after `requireApiSession`.
- Export from `services/index.ts`.
- Tests: `manualBriefSeed.test.ts` — required title; note→snippet; urls→citations; clusterId=id; membership accepted; invalid url 400 path at service or route level.

**Commit:** `feat(server): create Accepted manual Brief seeds`

---

## Task 3: Brief honesty for operator-seeded stories + Radar regression

**Files:**

- `mvp/server/src/services/kiteBriefAdapter.ts` — `shortSummary` (or story mapping): for `sourceKind === 'manual'`, prefer note snippet else operator-seeded copy (never bare title-only silence).
- Tests in `kiteBriefAdapter.test.ts`.
- `radarFeed.test.ts` — assert manual articles excluded from radar clusters.

**Commit:** `feat(server): honest Brief copy for manual seeds`

---

## Task 4: Kite proxy + Add story UI + Brief Unaccept

**Files:**

- `apps/kite/src/routes/api/brief/seed/+server.ts` — POST proxy.
- Thin UI: modal/component under `apps/kite/src/lib/components/` (e.g. `ManualBriefSeedModal.svelte`) + trigger from Header (Brief only) and/or StoryList empty state.
- Copy helpers in a small `$lib/briefSeed.ts` if needed.
- Session: if 401, surface login hint (Radar already has pattern — reuse lightly or link to `/radar` login). Prefer posting with credentials; show error on failure.
- **Brief Unaccept:** control on Brief story chrome for accepted stories (at least for `sourceKind: manual` / all accepted). Call existing `/api/brief/unaccept` with the story’s cluster key; drop from list on success. Required so manual seeds can leave Brief (Radar never lists them).

**Commit:** `feat(kite): Add story UI for manual Brief seeds`

---

## Task 5: Docs + compat assertions

**Files:**

- `docs/OWNED_BRIEF.md`, `docs/MVP_API_COMPAT.md`, `docs/ROUTE_MAP.md` — manual seed flow.
- `tests/mvp-api-compat.test.js` — assert `/api/brief/seed` in server + doc.

**Commit:** `docs: document manual Brief seed API`

---

## Out of scope

- Track / alert badge (NEWS-59 / NEWS-61)
- Mute (NEWS-60)
- Hard-delete seed rows; Radar mirroring
- Remapping membership when clustering rewrites `clusterId`
- Multi-user
