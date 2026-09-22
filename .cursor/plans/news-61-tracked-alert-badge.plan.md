# NEWS-61 — In-app alert badge when tracked cluster updates

**Ticket:** [NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61)  
**Branch:** `feat/news-61-tracked-alert-badge`  
**Spec authority:** NEWS-61 description + NEWS-59 `pendingUpdate` seam in [docs/OWNED_BRIEF.md](../../docs/OWNED_BRIEF.md)

## Goal

Show an in-app **badge/dot** on Radar **Tracked** rows (and a small aggregate signal on the Brief footer Radar link) when a tracked cluster has `pendingUpdate: true` after fetch. Clear via **ack** (view / dismiss): set `pendingUpdate: false` and bump `memberCountSnapshot` to the current member count. No browser Notification API / email.

## Global Constraints

- Product path: `mvp/server` ack on tracked store + thin Kite UI. No `_legacy/` / Supabase.
- Auth: ack behind `requireApiSession`.
- Tracked-only alerts — never badge untracked Radar clusters.
- Mute does not clear or suppress badges (muted+tracked may still show pendingUpdate).
- Prefer existing `trackedStoriesStore` patterns; do not reinvent growth detection.
- Never commit secrets / runtime `mvp/data/*.json`.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Ack semantics | `ackTrackedUpdate(clusterId, currentMemberCount)`: set `pendingUpdate: false`, set `memberCountSnapshot = currentMemberCount` (from full-store count via `briefClusterKey`). Idempotent if already clear. | False re-alerts or stuck badges. |
| API | `POST /api/brief/tracked/ack` body `{ clusterId }` → `{ ok: true, entries: TrackedEntry[] }`; 400 empty id; 401 unauthorized. | |
| UI primary | Dot/badge on Tracked section rows when `entry.pendingUpdate`. Explicit **Dismiss** control. Also ack when **Open on Brief** is clicked (view). | |
| UI chrome | Footer Radar link shows a small count/dot when any tracked entry has `pendingUpdate` (Brief-wide signal). Fetch lightweight: reuse `/api/brief/tracked` from Footer or a tiny count field. | |
| Out of scope | Browser notifications, email, SSE/push, main headline-lane spam badges. | |

### Response shapes

```ts
// POST /api/brief/tracked/ack
// body: { clusterId: string }
// 200: { ok: true, entries: TrackedEntry[] }  // same entry shape as GET tracked (incl. muted?, pendingUpdate)
// 400: { ok: false, error: string }
// 401: { ok: false, error: 'Unauthorized' }
```

---

## Task 1: Ack store helper + API

**Files:**

- `mvp/server/src/store/trackedStoriesStore.ts` — `ackTrackedUpdate(clusterId, memberCount)`
- Tests for ack clears pending + bumps snapshot; idempotent
- `mvp/server/src/app.ts` — `POST /api/brief/tracked/ack` (compute count from `readArticles` + `briefClusterKey`)
- Route test in `app.test.ts`
- Export from store index if needed

**Commit:** `feat(server): ack tracked updates clears pendingUpdate`

---

## Task 2: Radar Tracked badge + dismiss / view ack

**Files:**

- Kite proxy `apps/kite/src/routes/api/brief/tracked/ack/+server.ts`
- `apps/kite/src/lib/radar.ts` — badge/dismiss copy
- `apps/kite/src/routes/radar/+page.svelte` — badge on pending Tracked rows; Dismiss → ack; Open on Brief → ack then navigate

**Commit:** `feat(kite): Tracked update badge + dismiss/ack`

---

## Task 3: Footer Radar pending signal + docs

**Files:**

- `apps/kite/src/lib/components/Footer.svelte` — pending count/dot on Radar link (fetch tracked when session-capable; honest empty if unauthenticated)
- `docs/OWNED_BRIEF.md`, `docs/MVP_API_COMPAT.md`, `docs/ROUTE_MAP.md`, `docs/ROADMAP.md` as needed
- `tests/mvp-api-compat.test.js` — assert ack route string

**Commit:** `feat(kite): footer Radar pending badge + docs`

---

## Out of scope

- Browser Notification API / email
- Per-headline-lane badges for untracked clusters
- Auto-polling beyond existing page loads
