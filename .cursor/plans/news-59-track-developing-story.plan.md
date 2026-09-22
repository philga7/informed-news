# NEWS-59 — Track developing story (alerts; optional default on Accept)

**Ticket:** [NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59)  
**Branch:** `feat/news-59-track-developing-story`  
**Spec authority:** NEWS-59 description + [docs/ROADMAP.md](../../docs/ROADMAP.md) membership + [docs/OWNED_BRIEF.md](../../docs/OWNED_BRIEF.md) + NEWS-65 Accept / NEWS-66 seed paths

## Goal

Persist **tracked** developing stories (single-operator JSON). Watch points use the same keys as Brief membership (`clusterId` or `solo:{articleId}`). Tracked section on `/radar`. Track ≠ Accept: Track = alerts when the cluster gains members; Accept = Brief membership. **Default Track on** when the operator Accepts or creates a manual seed. Opening a tracked item that is Accepted reuses Brief expand (navigate to `/`). After fetch, sync member-count snapshots and set `pendingUpdate` so [NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61) can badge without inventing the store.

## Global Constraints

- Product path: `mvp/server` track store + thin Radar UI in `apps/kite`. Do not revive `_legacy/` watch/Supabase models.
- Auth: Track / Untrack (and list) behind `requireApiSession` (same cookie as Accept / Radar).
- Keys: reuse `briefClusterKey` / Accept `clusterId` strings — no second key scheme.
- **Mute** is NEWS-60 — do not implement mute here.
- **Badge UI** is NEWS-61 — persist `pendingUpdate` + expose it; do **not** ship chrome badge/dot in this ticket.
- Track must **not** put a cluster on Brief by itself (Accept / seed only).
- Untrack ≠ Unaccept; Unaccept ≠ Untrack (independent flags).
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/*.json`.
- Prefer existing store patterns (`briefMembershipStore`).

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Store file | `mvp/data/tracked-stories.json`: `{ entries: TrackedEntry[], updatedAt: string \| null }`. ENOENT → empty entries. | |
| Entry shape | `TrackedEntry = { clusterId: string; trackedAt: string; memberCountSnapshot: number; pendingUpdate: boolean }`. | NEWS-61 has nowhere to hang ack/clear. |
| Count key | Member count = number of articles whose `briefClusterKey(a)` equals the tracked `clusterId` (same association as Accept). | Alerts fire on wrong set. |
| Default on | `POST /api/brief/accept` and `createManualSeed` both call `trackCluster` after accept (idempotent). Explicit Untrack still allowed afterward. | Demo “Accept → watched” fails. |
| Sync hook | After successful `fetchAllSources` in `POST /api/fetch`, call `syncTrackedAfterFetch(articles)`: for each entry, if currentCount > `memberCountSnapshot` → `pendingUpdate = true` (do **not** bump snapshot until NEWS-61 ack/view). New Track sets snapshot to current count and `pendingUpdate: false`. | Badge ticket must re-plumb growth detection. |
| APIs | Session: `POST /api/brief/track`, `POST /api/brief/untrack`, `GET /api/brief/tracked`. Idempotent track/untrack. | |
| Radar | Each cluster: `tracked: boolean` (+ optional `pendingUpdate` for later badge). **Tracked** section lists clusters where `tracked` (or entries whose cluster is not in the headline lane — still list by resolving from articles when possible). Track / Untrack control beside Accept. | |
| Open tracked | If `accepted`, primary action opens Brief home `/` (expand already lives on Brief). No new product route. | Extra surface for no win. |
| Mute / badge | Out of scope. | |

### Response shapes (verbatim)

```ts
type TrackedEntry = {
  clusterId: string;
  trackedAt: string; // ISO
  memberCountSnapshot: number;
  pendingUpdate: boolean;
};

// POST /api/brief/track | /api/brief/untrack
// body: { clusterId: string }
// 200: { ok: true, entries: TrackedEntry[] }
// 400: { ok: false, error: string }  // missing/empty clusterId
// 401: { ok: false, error: 'Unauthorized' }

// GET /api/brief/tracked
// 200: { ok: true, entries: TrackedEntry[], updatedAt: string | null }

// RadarCluster (extended)
type RadarCluster = {
  clusterId: string;
  headlines: RadarHeadline[];
  newestAt: string | null;
  accepted: boolean;
  tracked: boolean;
  pendingUpdate?: boolean; // from track store when tracked
};
```

---

## Task 1: Tracked-stories store

**Files:**

- `mvp/server/src/store/paths.ts` — `TRACKED_STORIES_PATH`.
- Create `mvp/server/src/store/trackedStoriesStore.ts` — `readTrackedStories`, `trackCluster(clusterId, memberCount)`, `untrackCluster`, `syncTrackedAfterFetch(articles)` (or accept a `countByClusterId` map), normalize/ENOENT.
- Export from `store/index.ts`.
- Create `mvp/server/src/store/trackedStoriesStore.test.ts` (temp dir pattern like `briefMembershipStore.test.ts`).

**Commit:** `feat(server): persist tracked developing stories JSON`

---

## Task 2: Track APIs + default-on Accept/seed + fetch sync

**Files:**

- Wire in `mvp/server/src/index.ts` (after `requireApiSession`):
  - `POST /api/brief/track` — count members via `briefClusterKey`, then `trackCluster`
  - `POST /api/brief/untrack`
  - `GET /api/brief/tracked`
- `POST /api/brief/accept` — after `acceptCluster`, also `trackCluster` (compute count from `readArticles`)
- `mvp/server/src/services/manualBriefSeed.ts` — after `acceptCluster`, `trackCluster` with count `1` (seed identity = clusterId)
- `POST /api/fetch` — after `fetchAllSources`, `syncTrackedAfterFetch(result.articles)` (errors logged; do not fail the fetch response)
- Tests: extend membership/seed/fetch tests or add focused route/store tests proving Accept/seed track by default; sync sets `pendingUpdate` when count grows; track alone does not call `acceptCluster`.

**Commit:** `feat(server): Track APIs, default-on Accept/seed, fetch sync`

---

## Task 3: Radar `tracked` flag + Tracked section + Track UI

**Files:**

- `mvp/server/src/services/radarFeed.ts` (+ `index.ts` radar handler) — attach `tracked` / `pendingUpdate` from track store.
- Update `radarFeed.test.ts`.
- Kite proxies:
  - `apps/kite/src/routes/api/brief/track/+server.ts`
  - `apps/kite/src/routes/api/brief/untrack/+server.ts`
  - `apps/kite/src/routes/api/brief/tracked/+server.ts`
- `apps/kite/src/lib/radar.ts` — Track / Untrack / Tracked section copy.
- `apps/kite/src/routes/radar/+page.svelte` — Tracked section (tracked clusters); Track/Untrack beside Accept; if accepted, “Open on Brief” → `/`.

**Commit:** `feat(kite): Track / Untrack + Tracked section on Radar`

---

## Task 4: Docs + compat assertions

**Files:**

- `docs/OWNED_BRIEF.md` — Track vs Accept; default-on; `pendingUpdate` seam for NEWS-61.
- `docs/MVP_API_COMPAT.md` — track / untrack / tracked routes.
- `docs/ROUTE_MAP.md` — Radar Tracked section.
- `tests/mvp-api-compat.test.js` — assert new route strings in server + docs.

**Commit:** `docs: document Track APIs and alert-path seam`

---

## Out of scope

- Mute store / Radar hide (NEWS-60)
- In-app alert badge / dismiss UX (NEWS-61)
- Browser Notification API / email
- Remapping tracked keys when clustering merges solos (same known gap as Accept)
- Multi-user / push
