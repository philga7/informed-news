# NEWS-60 — Mute undesired topics (global: Radar + Brief)

**Ticket:** [NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)  
**Branch:** `feat/news-60-mute-global`  
**Spec authority:** NEWS-60 description + [docs/ROADMAP.md](../../docs/ROADMAP.md) membership (Mute = global veto)

## Goal

Persist **mute rules** (keyword + optional source) in single-operator JSON. Matching clusters are **hidden on Radar** (with **hidden N** count) and **ineligible for Brief** (even if Accepted / manual seed). **Tracked override:** muted + tracked clusters still appear in the Radar **Tracked** section (with a mute indicator); mute must not strip alert visibility without Untrack.

## Global Constraints

- Product path: `mvp/server` mute store + thin Radar UI in `apps/kite`. No `_legacy/` / Supabase.
- Auth: mute CRUD behind `requireApiSession`.
- Match keys: evaluate against article/headline text + optional `source` / publisher fields already on Radar headlines; cluster mute = any member matches.
- Track / Accept / Untrack unchanged except Brief/Radar filters honor mute.
- Badge chrome is NEWS-61 — only a simple “muted” label on Tracked rows here, no update badge work.
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/*.json`.
- Prefer patterns from `briefMembershipStore` / `trackedStoriesStore`.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Store file | `mvp/data/mute-rules.json`: `{ rules: MuteRule[], updatedAt: string \| null }`. ENOENT → empty. | |
| Rule shape | `MuteRule = { id: string; keyword: string; source?: string \| null; createdAt: string }` — `keyword` trimmed case-insensitive substring match; optional `source` also case-insensitive substring on source/domain/name. | Too fuzzy/strict → operator confusion. |
| Match | A cluster is muted if **any** headline/article in the cluster matches a rule (keyword in title/text; if rule.source set, also require source match). | |
| Radar headline lane | Omit muted clusters from the main list; include `hiddenMutedCount: number` on radar response. | Blind spot without hidden N. |
| Tracked override | Tracked section **still lists** muted tracked clusters; show muted indicator. Do not auto-untrack. | Loses alert path. |
| Brief | `filterArticlesForBrief` / resolve path excludes muted clusters even if accepted. | |
| APIs | Session: `GET /api/brief/mutes`, `POST /api/brief/mutes` `{ keyword, source? }`, `DELETE /api/brief/mutes/:id`. Idempotent-ish create (normalize keyword; allow duplicate keywords with different source). | |
| UI | Radar: show “Hidden N” when N>0; simple add-mute control (keyword + optional source); list/delete rules; muted label on Tracked rows. | |

### Response shapes (verbatim)

```ts
type MuteRule = {
  id: string;
  keyword: string;
  source: string | null;
  createdAt: string;
};

// GET /api/brief/mutes → { ok: true, rules: MuteRule[], updatedAt: string | null }
// POST /api/brief/mutes body: { keyword: string; source?: string }
//   200: { ok: true, rules: MuteRule[] }
//   400: empty keyword
// DELETE /api/brief/mutes/:id → { ok: true, rules: MuteRule[] }
// RadarResponse adds: hiddenMutedCount: number
```

---

## Task 1: Mute-rules store + match helper

**Files:**

- `mvp/server/src/store/paths.ts` — `MUTE_RULES_PATH`
- `mvp/server/src/store/muteRulesStore.ts` — read/add/remove; normalize keyword
- `mvp/server/src/services/muteMatch.ts` — `clusterMatchesMute(clusterLike, rules)` / article-level match
- Tests (temp dir + match cases)
- Export from `store/index.ts` / `services/index.ts` as needed

**Commit:** `feat(server): persist mute rules JSON + match helper`

---

## Task 2: Mute APIs + Brief + Radar filters

**Files:**

- `mvp/server/src/app.ts` — session routes GET/POST/DELETE mutes; wire radar `hiddenMutedCount` + filter; Brief resolve path applies mute
- `mvp/server/src/services/kiteBriefAdapter.ts` / `kiteBriefRoutes.ts` — exclude muted from Brief
- `mvp/server/src/services/radarFeed.ts` — accept mute rules or muted set; return hidden count; keep tracked muted clusters available to caller for Tracked section
- Tests proving: muted accepted article off Brief; radar hides muted; tracked muted still surfaced for Tracked; hidden count

**Commit:** `feat(server): global mute APIs + Radar/Brief veto`

---

## Task 3: Radar Mute UI + proxies

**Files:**

- Kite proxies under `apps/kite/src/routes/api/brief/mutes/`
- `apps/kite/src/lib/radar.ts` — copy for Hidden N / muted
- `apps/kite/src/routes/radar/+page.svelte` — Hidden N, add/list/delete mutes, muted indicator on Tracked

**Commit:** `feat(kite): Mute controls + hidden count on Radar`

---

## Task 4: Docs + compat

**Files:**

- `docs/OWNED_BRIEF.md`, `docs/MVP_API_COMPAT.md`, `docs/ROUTE_MAP.md`, `docs/ROADMAP.md` as needed
- `tests/mvp-api-compat.test.js`

**Commit:** `docs: document global mute APIs and Radar hidden count`

---

## Out of scope

- NEWS-61 badge/dot for pendingUpdate
- Browser notifications / email
- Per-cluster mute without keyword (keyword(+source) only in v1)
- Auto-untrack on mute
