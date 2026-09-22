# NEWS-65 — Accept cluster onto Brief (membership + association)

**Ticket:** [NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)  
**Branch:** `feat/news-65-accept-brief-membership`  
**Spec authority:** NEWS-65 description + [docs/ROADMAP.md](../../docs/ROADMAP.md) membership + [docs/OWNED_BRIEF.md](../../docs/OWNED_BRIEF.md)

## Goal

Persist accepted `clusterId`s (single-operator JSON). Session Accept / Unaccept. Brief shows **accepted only** (association = same `clusterId` after fetch). Radar keeps Accept control. Honest empty when articles exist but none accepted. Survives restart.

## Global Constraints

- Product path: `mvp/server` membership + filter; thin Radar Accept UI in `apps/kite`. Do not revive `_legacy/` watch/Supabase models.
- Auth: Accept / Unaccept behind `requireApiSession` (same cookie as `/api/radar`). Public brief routes stay public but membership-filtered.
- Association v1 = same `clusterId` only (no fuzzy rematch when solos merge).
- **Mute** filter is NEWS-60 — do not implement mute store here; leave a clear seam comment if useful.
- **Track** is NEWS-59 — do not default Track on Accept in this ticket.
- **Manual seeds** are NEWS-66 — no `sourceKind: manual` yet.
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/*.json`.
- Prefer existing store patterns (`clusterEnrichmentStore` / `metaStore`).

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Canonical key | One helper `briefClusterKey(article)` → `clusterId.trim()` or `solo:${id}`. Change Radar `singleton:` → `solo:` so Accept keys match Brief + enrich. | Accept from Radar misses Brief filter. |
| Membership file | `mvp/data/brief-membership.json`: `{ acceptedClusterIds: string[], updatedAt: string \| null }`. Upsert/remove by id. ENOENT → empty accepted. | |
| Fixture vs empty | Fixture **only** when `articles.json` is empty. Non-empty store + empty accepted → `stories: []` (honest empty). | Operators think Brief is broken vs “accept something.” |
| Filter seam | After `readArticles`, before `articlesToKiteStories`: keep articles whose `briefClusterKey` ∈ accepted set. Multi-member association is automatic. | |
| APIs | `POST /api/brief/accept` `{ clusterId }` · `POST /api/brief/unaccept` `{ clusterId }` · optional `GET /api/brief/membership` `{ acceptedClusterIds }`. All session-gated. Idempotent accept/unaccept. | |
| Radar payload | Extend each cluster with `accepted: boolean`. UI toggles Accept / Unaccept. | Extra round-trip if omitted. |
| Mute / Track | Out of scope; document in OWNED_BRIEF that mute intersection lands in NEWS-60. | Demo “muted accepted” waits on 60. |

### Response shapes (verbatim)

```ts
// POST /api/brief/accept | /api/brief/unaccept
// body: { clusterId: string }
// 200: { ok: true, acceptedClusterIds: string[] }
// 400: { ok: false, error: string }  // missing/empty clusterId
// 401: { ok: false, error: 'Unauthorized' }

// GET /api/brief/membership
// 200: { ok: true, acceptedClusterIds: string[], updatedAt: string | null }

// RadarCluster (extended)
type RadarCluster = {
  clusterId: string; // real id or `solo:<articleId>` (NOT singleton:)
  headlines: RadarHeadline[];
  newestAt: string | null;
  accepted: boolean;
};
```

---

## Task 1: Canonical `solo:` key + Radar alignment

**Files:**

- Create `mvp/server/src/services/briefClusterKey.ts` — `briefClusterKey(article: { id: string; clusterId: string | null }): string` and `isSoloClusterKey(key: string): boolean`.
- Update `mvp/server/src/services/radarFeed.ts` to use `briefClusterKey` (replace `singleton:`).
- Update `mvp/server/src/services/kiteBriefAdapter.ts` grouping to call the same helper.
- Tests: `briefClusterKey.test.ts`; update `radarFeed.test.ts` expectations from `singleton:` → `solo:`.

**Commit:** `fix(server): unify brief/radar cluster keys as solo:`

---

## Task 2: Membership store + Accept / Unaccept APIs

**Files:**

- `mvp/server/src/store/paths.ts` — `BRIEF_MEMBERSHIP_PATH`.
- Create `mvp/server/src/store/briefMembershipStore.ts` — `readBriefMembership`, `acceptCluster`, `unacceptCluster` (persist JSON; export accepted ids).
- Export from `store/index.ts`.
- Wire in `mvp/server/src/index.ts` (after `requireApiSession`):
  - `POST /api/brief/accept`
  - `POST /api/brief/unaccept`
  - `GET /api/brief/membership`
- Create `mvp/server/src/store/briefMembershipStore.test.ts` (temp dir or mock fs per existing store test style).
- Add store/API tests to `mvp/server` test script if needed.

**Commit:** `feat(server): persist Brief accept membership + session APIs`

---

## Task 3: Filter owned Brief to accepted clusters

**Files:**

- `mvp/server/src/services/kiteBriefAdapter.ts` / `kiteBriefRoutes.ts` — load membership; filter articles by accepted keys before story build; fixture only when store empty.
- Pure helper preferred: `filterArticlesForBrief(articles, acceptedClusterIds): Article[]` (testable).
- `mvp/server/src/services/kiteBriefAdapter.test.ts` — cases: none accepted → `[]`; accepted multi-member includes new member; empty store still fixture; accepted solo key works.
- `docs/OWNED_BRIEF.md` — rewrite Membership + empty-state sections for Accept behavior.

**Commit:** `feat(server): Brief shows accepted clusters only`

---

## Task 4: Radar Accept UI + proxies + `accepted` flag

**Files:**

- `mvp/server/src/services/radarFeed.ts` + route in `index.ts` — attach `accepted` from membership when building response (or map in handler).
- Update `radarFeed.test.ts` / handler tests as needed.
- Kite proxies:
  - `apps/kite/src/routes/api/brief/accept/+server.ts`
  - `apps/kite/src/routes/api/brief/unaccept/+server.ts`
  - `apps/kite/src/routes/api/brief/membership/+server.ts` (optional if UI uses radar flag only — still add for debug/parity)
- `apps/kite/src/routes/radar/+page.svelte` — per-cluster Accept / Unaccept button; call proxies with `credentials: 'include'`; optimistic toggle using `accepted`.
- `apps/kite/src/lib/radar.ts` — button/empty copy strings if page stays thin.

**Commit:** `feat(kite): Accept / Unaccept clusters from Radar`

---

## Task 5: Compat docs + shell assertions

**Files:**

- `docs/MVP_API_COMPAT.md` — document `/api/radar`, `/api/brief/accept`, `/api/brief/unaccept`, `/api/brief/membership`.
- `docs/ROUTE_MAP.md` — note Brief = accepted-only after NEWS-65; Radar Accept control.
- `tests/mvp-api-compat.test.js` — assert new route strings exist in server source.
- Light touch: `e2e/kite-smoke.spec.ts` only if a one-liner is cheap (Radar still loads); no full Accept e2e required.

**Commit:** `docs: document Brief membership Accept APIs`

---

## Out of scope

- Mute store / Radar hide count (NEWS-60)
- Track / alert badge (NEWS-59 / NEWS-61)
- Manual Brief seeds (NEWS-66)
- Remapping accepted keys when clustering merges solos
- Finance / Situation / Listen chrome
- Push / multi-user
