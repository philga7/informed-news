# NEWS-75 — Accept / Track / Mute / badge on claimId

**Ticket:** [NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75)  
**Branch:** `feat/news-75-claim-desk-verbs`  
**Spec authority:** NEWS-75 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + Epic J [claims_evidence_spine_8f4cde15.plan.md](claims_evidence_spine_8f4cde15.plan.md) + shipped NEWS-70 stores + NEWS-74 claims radar  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Rematerialize desk verbs onto **`claimId`**:

1. Accept / Unaccept → `claimMembershipStore` (Brief eligibility; Brief hybrid UI is NEWS-76).
2. Track / Untrack / ack → `trackedClaimsStore`; `pendingUpdate` already set on new evidence / stance change via `markTrackedClaimPending` in `evidenceLinkStore`.
3. Mute CRUD stays the **shared** keyword/source mute rules (`/api/brief/mutes`) — already hides claims via `claimMatchesMute` on claim Radar (no per-claimId mute list in v1).
4. Footer / in-app badge counts pending **claim** track updates (keep story pending in the sum during transition).
5. Default **Track-on-Accept** (mirror story `POST /api/brief/accept`).

Demo: Accept claim → membership updated + tracked; Track → new evidence sets pending; Mute rule hides from claim Radar; ack clears badge.

## Global Constraints

- Product path: `mvp/server` + thin `apps/kite`. No `_legacy/` / Supabase.
- Session-gated mutating routes (same as brief story verbs).
- Reuse existing claim membership / tracked claims stores — do not reinvent JSON shapes.
- Story brief APIs remain for Headline clusters transition — not removed.
- **Out of scope:** Brief hybrid rendering of accepted claims (NEWS-76); per-claimId mute store; Verified badges.
- Never commit `mvp/.env` or `mvp/data/*.json`.
- Register new server tests in `mvp/server/package.json` `"test"` script.
- Preserve `/radar` visual language; no Verified copy.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Mute | **No new mute-by-claimId API.** Shared `mute-rules.json` + existing CRUD (`/api/brief/mutes`) already filters claim Radar. Document that Mute section on `/radar` is the claim mute surface. | Duplicate mute systems. |
| Accept body | `{ claimId: string }` — trim; 400 if missing/empty. | Soft fails. |
| Track-on-Accept | `POST /api/claims/accept` calls `acceptClaim` then `trackClaim` (idempotent). Unaccept does **not** auto-untrack (mirror story desk). | Divergent desk UX. |
| Routes | Session-gated under `/api/claims/*` (see table). Injectable store deps on `createApp` like brief routes. | Untestable. |
| claimsRadar fields | Extend `ClaimRadarItem` with `accepted: boolean`, `tracked: boolean`, `pendingUpdate: boolean` (default false). Join from membership + tracked stores in `loadClaimsRadar` / builder input. | UI needs extra fetches. |
| Tracked claims GET | `GET /api/claims/tracked` → `{ ok, entries: TrackedClaimEntry[], updatedAt }` (mirror brief tracked shape enough for UI). | Footer can't poll claims. |
| Membership GET | `GET /api/claims/membership` → `{ ok, acceptedClaimIds, updatedAt }` optional but ship for symmetry / debugging. | |
| Ack | `POST /api/claims/tracked/ack` body `{ claimId }` → clears pending via `ackTrackedClaimUpdate`. | Badge stuck. |
| Kite proxies | One file per verb under `apps/kite/src/routes/api/claims/{accept,unaccept,track,untrack,tracked,tracked/ack,membership}/` using existing proxy helpers. | Cookie fail. |
| Radar UI | Claim cards: Accept/Unaccept + Track/Untrack (+ Dismiss ack when `pendingUpdate`). **Tracked claims** section (like Tracked stories) listing tracked claim text/status with ack. Keep Mutes section as-is. Keep Headline clusters. | Operators can't act on claims. |
| Footer badge | `Footer.svelte`: fetch `/api/claims/tracked` **and** `/api/brief/tracked`; badge count = sum of `pendingUpdate` entries across both. Prefer claims if only one fetch fails. | Silent claim alerts or lost story alerts. |
| Honesty | Status chips unchanged; no Verified. Accept ≠ truth. | |

### Claim verb routes (verbatim)

| Method | Path | Body | Success |
|--------|------|------|---------|
| GET | `/api/claims/membership` | — | `{ ok, acceptedClaimIds, updatedAt }` |
| POST | `/api/claims/accept` | `{ claimId }` | `{ ok, acceptedClaimIds }` (+ track side effect) |
| POST | `/api/claims/unaccept` | `{ claimId }` | `{ ok, acceptedClaimIds }` |
| GET | `/api/claims/tracked` | — | `{ ok, entries, updatedAt }` |
| POST | `/api/claims/track` | `{ claimId }` | `{ ok, entries }` |
| POST | `/api/claims/untrack` | `{ claimId }` | `{ ok, entries }` |
| POST | `/api/claims/tracked/ack` | `{ claimId }` | `{ ok, entries }` |

Unknown claimId: still accept/track id strings (stores do not require claim to exist — **Ruling:** validate claim exists via `getClaimById` / `readClaims` for accept/track/ack; 404 `{ ok:false, error }` if missing. Unaccept/untrack of unknown id remain idempotent success like story desk).

---

## Task 1: Claim verb HTTP routes + claimsRadar membership/track fields

**Files:**

- Extend `mvp/server/src/services/claimsRadar.ts` (+ tests): pass membership + tracked into builder; set `accepted` / `tracked` / `pendingUpdate` on each item.
- Wire routes in `app.ts` per table; `parseClaimId` helper; Track-on-Accept; 404 when claim missing for accept/track/ack.
- Unit/app tests: accept→tracked; unaccept leaves track; ack clears pending; radar items reflect flags; unauth 401.
- Export anything needed from `services/index.ts` / store already exported.
- Register tests in `package.json` if new files.

**Commit:** `feat(server): claim accept/track/ack APIs + radar flags`

---

## Task 2: Kite proxies + Radar claim verbs + footer badge

**Files:**

- Proxies under `apps/kite/src/routes/api/claims/...`
- Update `apps/kite/src/routes/radar/+page.svelte` + `$lib/radar` constants: Accept/Unaccept/Track/Untrack/Dismiss on claim cards; Tracked claims section; refresh radar after mutations.
- Update `apps/kite/src/lib/components/Footer.svelte` for combined pending badge.
- Preserve visual language; no Verified; no Brief hybrid UI.

**Commit:** `feat(kite): claim desk verbs on /radar + footer badge`

---

## Task 3: Docs seam

**Files:**

- `docs/MVP_API_COMPAT.md` — freeze claim verb routes; note mute shared; Track-on-Accept; Brief hybrid still NEWS-76.
- `docs/ROUTE_MAP.md` / `docs/OWNED_BRIEF.md` / `docs/CLAIMS_DISCERNMENT.md` — claim Accept/Track live on `/radar`; mute rules apply to claims.

**Commit:** `docs: ship NEWS-75 claim desk verbs`

---

## Out of scope

- Brief `/` showing accepted claims (NEWS-76)
- Per-claimId mute list / mute-this-claim button that invents a new store
- Removing story Accept/Track
- Auto extract after fetch
