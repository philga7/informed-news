# NEWS-70 — Claim + evidence stores and status derivation (no verdicts)

**Ticket:** [NEWS-70](https://informedcrew.atlassian.net/browse/NEWS-70)  
**Branch:** `feat/news-70-claim-evidence-stores`  
**Spec authority:** NEWS-70 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + Epic J plan [claims_evidence_spine_8f4cde15.plan.md](claims_evidence_spine_8f4cde15.plan.md)  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Foundation for the claims desk: JSON stores under `mvp/data/`, TypeScript types, and **code-derived** claim status (not model verdicts). Unit/store tests prove create claim + evidence → status flips correctly. **No UI, no TypeSafe/Ollama, no Radar/Brief routes.**

## Global Constraints

- Product path: `mvp/server` types + stores + pure status derivation. Do not revive `_legacy/` claims/Supabase models.
- Mirror existing flat-file store patterns (`briefMembershipStore`, `trackedStoriesStore`, `articleStore`).
- Reuse existing **MuteRules** store (`mute-rules.json`); do **not** invent a second mute file. Extend matching only.
- Status is derived in **code** from evidence tiers + confidence — never a true/false model output alone.
- Honesty: no “Verified” / truth-seal strings in constants or comments that could leak to UI as product chrome.
- Sensor reprint volume must **not** inflate status (N sensor supports ≠ `supported_by_primary`).
- Out of scope: TypeSafe client, Ollama propose, Radar/Brief APIs/UI, primary feed config (NEWS-71–75).
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/*.json`.
- Add new `*.test.ts` paths to `mvp/server/package.json` `"test"` script.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Claim file | `mvp/data/claims.json`: JSON **array** of `Claim`. ENOENT → `[]` (create empty on first write like articles). | |
| Evidence file | `mvp/data/evidence-links.json`: JSON **array** of `EvidenceLink`. ENOENT → `[]`. | |
| Membership | `mvp/data/claim-membership.json`: `{ acceptedClaimIds: string[], updatedAt: string \| null }`. ENOENT → empty accepted. Parallel to brief-membership. | |
| Tracked | `mvp/data/tracked-claims.json`: `{ entries: TrackedClaimEntry[], updatedAt: string \| null }`. ENOENT → empty. | |
| Track pending | `pendingUpdate` becomes `true` when a **new** EvidenceLink is added for that `claimId` **or** an existing link’s `stance` changes. Not on membership Accept. Ack clears pending (store helper only; no HTTP). | NEWS-75 badge has nowhere to hang. |
| Mute | Same `MuteRule` shape. `claimMatchesMute({ text }, linkedHeadlines[], rules)` — keyword in claim text **or** any linked headline title/snippet; optional `source` matched against linked article source candidates (reuse hostname helpers from `muteMatch.ts`). | Radar mute later invents a third matcher. |
| Status values | Closed set: `reported` \| `supported_by_primary` \| `contested` \| `insufficient_evidence`. | |
| Claim types | Closed set: `event_occurrence` \| `attribution` \| `casualty_or_count` \| `official_statement` \| `territorial_or_control`. | |
| Domain | v1 always `domain: 'conflict'`. | |
| Confidence gate | Evidence with `confidence < CONFIDENCE_FLOOR` (constant `0.5`) is **ignored** for status derivation (still stored). | Low-signal noise flips status. |
| Contested | ≥1 qualifying `supports` **and** ≥1 qualifying `contradicts` (any tier). Mentions never contest. | Misses disagreement. |
| supported_by_primary | ≥1 qualifying `supports` with `sourceTier === 'primary'` and `confidence >= PRIMARY_SUPPORT_FLOOR` (`0.6`), and **not** contested. Sensor supports never satisfy this alone. | Sensor volume inflates “support.” |
| insufficient_evidence | Zero qualifying links after confidence floor (or only `mentions`). | |
| reported | Default when there is qualifying evidence that is neither contested nor primary-supported (e.g. sensor-only supports). | |
| Persist status | On evidence upsert/remove, recompute status and write it onto the Claim row. `deriveClaimStatus(links)` is pure and unit-tested. | UI later shows stale status. |
| Honesty constants | Module `mvp/server/src/constants/claimHonesty.ts` exporting string constants for AI-assisted status/evidence copy (no Verified). | Copy drifts per surface. |
| IDs | `Claim.id` / `EvidenceLink.id` = `randomUUID()`. Callers may pass an id on upsert for tests. | |

### Types (verbatim)

```ts
export type ClaimType =
  | 'event_occurrence'
  | 'attribution'
  | 'casualty_or_count'
  | 'official_statement'
  | 'territorial_or_control';

export type ClaimStatus =
  | 'reported'
  | 'supported_by_primary'
  | 'contested'
  | 'insufficient_evidence';

export type EvidenceStance = 'supports' | 'contradicts' | 'mentions';

export type SourceTier = 'primary' | 'sensor';

export type Claim = {
  id: string;
  text: string;
  claimType: ClaimType;
  status: ClaimStatus;
  entities: string[];
  createdAt: string; // ISO
  domain: 'conflict';
};

export type EvidenceLink = {
  id: string;
  claimId: string;
  articleId: string | null;
  url: string | null; // at least one of articleId / url required on write
  stance: EvidenceStance;
  sourceTier: SourceTier;
  confidence: number; // 0..1
  /** Optional TypeSafe score bag; opaque to status derivation in v1. */
  scores: Record<string, number> | null;
  createdAt: string; // ISO
};

export type ClaimMembership = {
  acceptedClaimIds: string[];
  updatedAt: string | null;
};

export type TrackedClaimEntry = {
  claimId: string;
  trackedAt: string;
  pendingUpdate: boolean;
};

export type TrackedClaims = {
  entries: TrackedClaimEntry[];
  updatedAt: string | null;
};
```

### Status thresholds (verbatim constants)

```ts
/** Ignore evidence below this confidence when deriving status. */
export const CONFIDENCE_FLOOR = 0.5;
/** Minimum confidence for a primary support to yield supported_by_primary. */
export const PRIMARY_SUPPORT_FLOOR = 0.6;
```

### Honesty constants (verbatim)

```ts
export const CLAIM_STATUS_HONESTY =
  'Status is AI-assisted from evidence links — not a verified verdict.';
export const CLAIM_EVIDENCE_HONESTY =
  'Evidence stances and confidence are AI-assisted judgments, not ground truth.';
```

---

## Task 1: Types + honesty + status derivation (pure)

**Files:**

- Create `mvp/server/src/types/claim.ts` — types above; export from `types/index.ts`.
- Create `mvp/server/src/constants/claimHonesty.ts` — honesty strings above.
- Create `mvp/server/src/services/deriveClaimStatus.ts` — `deriveClaimStatus(links: readonly EvidenceLink[]): ClaimStatus` implementing Locked rules + export `CONFIDENCE_FLOOR` / `PRIMARY_SUPPORT_FLOOR`.
- Create `mvp/server/src/services/deriveClaimStatus.test.ts` — cases:
  1. no links → `insufficient_evidence`
  2. only mentions (high confidence) → `insufficient_evidence`
  3. sensor supports only (conf ≥ floor) → `reported`
  4. primary support conf ≥ PRIMARY_SUPPORT_FLOOR → `supported_by_primary`
  5. primary support but conf between CONFIDENCE_FLOOR and PRIMARY_SUPPORT_FLOOR only → `reported` (not primary-supported)
  6. supports + contradicts (both qualifying) → `contested` (wins over primary support)
  7. many sensor supports do **not** become `supported_by_primary`
  8. links below CONFIDENCE_FLOOR ignored

**Commit:** `feat(server): claim types and status derivation (no verdicts)`

---

## Task 2: Claim + evidence stores (status refresh on write)

**Files:**

- `mvp/server/src/store/paths.ts` — `CLAIMS_PATH`, `EVIDENCE_LINKS_PATH`.
- Create `mvp/server/src/store/claimStore.ts` — `readClaims`, `writeClaims`, `getClaimById`, `upsertClaim` (normalize; default status `insufficient_evidence` if omitted; `domain` forced to `'conflict'`).
- Create `mvp/server/src/store/evidenceLinkStore.ts` — `readEvidenceLinks`, `writeEvidenceLinks`, `listEvidenceForClaim`, `upsertEvidenceLink`, `removeEvidenceLink`.
  - On upsert/remove: load claim; recompute `status` via `deriveClaimStatus`; persist claim.
  - Validate: reject write if both `articleId` and `url` empty (return null / no-op per store style — prefer skip invalid like mute empty keyword).
  - Optional hook: accept `onEvidenceChanged?: (claimId, kind: 'added' | 'stance_changed' | 'removed')` **or** call into tracked store from Task 3 — **Ruling for Task 2:** only refresh claim status here; Task 3 wires `notifyTrackedOnEvidenceChange` from evidence store after Task 3 exists. For Task 2 tests, assert status refresh only.
- Export from `store/index.ts`.
- Tests: `claimStore.test.ts`, `evidenceLinkStore.test.ts` (temp-dir pattern) — create claim + add primary support → status `supported_by_primary`; add contradicting link → `contested`.
- Register tests in `package.json`.

**Commit:** `feat(server): persist claims and evidence links JSON`

---

## Task 3: Claim membership + tracked claims + claim mute match

**Files:**

- `mvp/server/src/store/paths.ts` — `CLAIM_MEMBERSHIP_PATH`, `TRACKED_CLAIMS_PATH`.
- Create `mvp/server/src/store/claimMembershipStore.ts` — mirror `briefMembershipStore`: `readClaimMembership`, `acceptClaim`, `unacceptClaim`.
- Create `mvp/server/src/store/trackedClaimsStore.ts` — `readTrackedClaims`, `trackClaim`, `untrackClaim`, `ackTrackedClaimUpdate`, `markTrackedClaimPending(claimId)` (sets pending if tracked).
- Wire evidence store: after successful upsert where link is **new** or `stance` changed, call `markTrackedClaimPending(claimId)`. Removal does **not** set pending (Ruling: pending = new evidence or stance change only).
- Extend `mvp/server/src/services/muteMatch.ts` with `claimMatchesMute(claim: { text: string }, linkedArticles: MuteArticleLike[], rules)`.
- Tests: membership idempotent accept/unaccept; track + evidence upsert sets `pendingUpdate`; ack clears; mute matches claim text and linked headline; source-scoped mute; export barrels.
- Register tests in `package.json`.

**Commit:** `feat(server): claim membership, track pending, claim mute match`

---

## Task 4: Docs seam (store-only)

**Files:**

- `docs/OWNED_BRIEF.md` — short note under claims direction: NEWS-70 landed claim/evidence JSON stores + status derivation; APIs/UI still NEWS-74+.
- `docs/MVP_API_COMPAT.md` — under future/claims note: data files `claims.json`, `evidence-links.json`, `claim-membership.json`, `tracked-claims.json` (no HTTP yet).
- No route strings in compat tests (no routes).

**Commit:** `docs: note NEWS-70 claim/evidence store foundation`

---

## Out of scope

- TypeSafe / Ollama / extract pipeline (NEWS-71, NEWS-72)
- Primary vs sensor feed config (NEWS-73)
- Claim Radar / Brief UI and HTTP APIs (NEWS-74–76)
- Schema fields named for theological poles
- Changing story-desk membership / track / mute behavior
