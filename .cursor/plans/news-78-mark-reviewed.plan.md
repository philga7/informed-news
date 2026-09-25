# NEWS-78 — Mark reviewed: dequeue Needs review + Accept clears queue

**Ticket:** [NEWS-78](https://informedcrew.atlassian.net/browse/NEWS-78)  
**Branch:** `feat/news-78-mark-reviewed`  
**Spec authority:** NEWS-78 + grilled lock (2026-09-24) + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md)  
**Follow-up (out of scope):** [NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79) extract gating

## Goal

Give operators an exit from **Needs review** without deleting claims:

1. Dequeue-only clear of `claim-review-queue` for a `claimId`.
2. **Accept** auto-dequeues that claimId.
3. Radar: **Mark reviewed** per card + **Mark all reviewed** (visible/mute-filtered) with confirm.
4. Docs freeze.

## Global Constraints

- Product path: `mvp/server` + thin `apps/kite`. No `_legacy_` / Supabase.
- Dequeue only — never hard-delete claims/evidence/enrichments.
- UI labels **Mark reviewed** / **Mark all reviewed** — not “Dismiss” (Tracked alerts keep Dismiss).
- Re-entry allowed if later extract enqueues again; Mute = permanent ignore.
- Session-gated mutating routes; register server tests in `package.json`.
- Never commit `mvp/.env` or `mvp/data/*.json`.
- Out of scope: NEWS-79 extract gating; hard-delete; multi-select; soft-hide junk lane.

## Locked design rulings

| Topic | Ruling |
|-------|--------|
| Store | `dismissClaimReview(claimId)` removes **all** queue entries with that claimId; returns `{ dismissedClaimIds: string[] }` (empty if none). |
| Accept | After successful `acceptClaim`, call `dismissClaimReview(claimId)` (idempotent). |
| Single API | `POST /api/claims/review/dismiss` `{ claimId }` → `{ ok: true, dismissedClaimIds }`. 400 empty id; **404** claim missing; queue-empty still 200. |
| Bulk API | `POST /api/claims/review/dismiss-all` → `{ ok: true, dismissedClaimIds }` for claimIds currently in Radar Needs review after mute filter (reuse `loadClaimsRadar` / builder mute path — do not wipe muted-hidden queue rows). |
| Kite proxies | `apps/kite/src/routes/api/claims/review/dismiss/+server.ts` and `…/dismiss-all/+server.ts`. |
| Radar UI | Needs review header: **Mark all reviewed** → `confirm(\`Clear ${n} from Needs review?\`)` then dismiss-all; each card: **Mark reviewed**. Refresh radar lists after. Accept already present — ensure UI drops card from Needs review after Accept (server dequeue). |
| Docs | MVP_API_COMPAT, ROUTE_MAP, CLAIMS_DISCERNMENT. |

---

## Task 1: Queue dequeue store + Accept hook + HTTP routes

**Files:**

- `mvp/server/src/store/claimReviewQueueStore.ts` (+ tests): `dismissClaimReview(claimId, queuePath?)`.
- Wire Accept in `app.ts` to dequeue after accept+track.
- Routes: `POST /api/claims/review/dismiss`, `POST /api/claims/review/dismiss-all` (session); dismiss-all uses radar mute filter to choose claimIds.
- Export from store index; app tests for 401/404/idempotent/accept-dequeues.
- Register tests in `package.json` if needed.

**Commit:** `feat(server): dismiss claim review queue + Accept dequeue`

---

## Task 2: Kite proxies + Radar Mark reviewed UI

**Files:**

- Proxies under `apps/kite/src/routes/api/claims/review/{dismiss,dismiss-all}/`
- `apps/kite/src/lib/radar.ts` constants for Mark reviewed / Mark all / confirm / pending
- `apps/kite/src/routes/radar/+page.svelte` — buttons + confirm + refresh

**Commit:** `feat(kite): Mark reviewed on Needs review`

---

## Task 3: Docs seam

**Files:** `docs/MVP_API_COMPAT.md`, `docs/ROUTE_MAP.md`, `docs/CLAIMS_DISCERNMENT.md`

**Commit:** `docs: ship NEWS-78 Mark reviewed`

---

## Out of scope

- NEWS-79 extract gating
- Hard-delete claims
- Renaming Tracked **Dismiss**
