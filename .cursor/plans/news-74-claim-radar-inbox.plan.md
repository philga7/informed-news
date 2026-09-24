# NEWS-74 — Claim Radar API + Kite claim inbox UI

**Ticket:** [NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74)  
**Branch:** `feat/news-74-claim-radar-inbox`  
**Spec authority:** NEWS-74 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + Epic J plan [claims_evidence_spine_8f4cde15.plan.md](claims_evidence_spine_8f4cde15.plan.md) + shipped NEWS-70–73 stores/API  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Ship the **claim inbox**:

1. Session-gated `GET /api/claims/radar` — claims with status, evidence counts, TypeSafe confidence summary, linked `clusterKey`s + expandable headlines; mute filter; separate `needsReview` section.
2. Kite `/radar` — **primary list = claims** (status/evidence chips, confidence); per-claim expandable linked sensor/outlet headlines; keep legacy story `/api/radar` available for a secondary/collapsible headline-cluster section (Accept/Track still story-desk until NEWS-75).
3. Honesty: status + evidence chips only — **no** Verified badges / claim verdicts.

Demo: logged-in `/radar` shows claims from extract (not only reprint clusters); expand shows linked outlets.

## Global Constraints

- Product path: `mvp/server` + thin `apps/kite` wrappers. No `_legacy/` / Supabase.
- Session-gated like other desk APIs (`requireApiSession`).
- Reuse `claimMatchesMute` + existing mute rules store — do not invent a parallel mute system.
- Keep `GET /api/radar` (story) working unchanged for transition / Tracked / Accept.
- **Out of scope:** Accept / Track / Mute / badge on `claimId` (NEWS-75); Brief hybrid (NEWS-76); extract UX changes.
- Never commit `mvp/.env` or runtime `mvp/data/*.json`.
- No “Verified” / true-false claim verdict copy in UI or API field names.
- Preserve existing `/radar` visual language (Lufga/`--font-lufga`, `max-w-3xl`, soft borders, light/dark utility classes) — reshape content, do not invent a new design system.
- Register new server tests in `mvp/server/package.json` `"test"` script.
- Add Kite proxy route for claims radar (cookie forward via existing `proxy.ts`).

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Service module | `mvp/server/src/services/claimsRadar.ts` — `buildClaimsRadarFeed(input)` pure-ish builder + thin `loadClaimsRadar()` that reads stores. | Fat handler in app.ts. |
| Confidence | `confidence` = **max** of linked evidence `confidence` values; `null` if no evidence. (TypeSafe scores live on links; do not invent a second model call.) | Misrepresents judgment strength. |
| Evidence counts | `{ total, supports, contradicts, mentions, primary, sensor }` from links for that claim. | Weak chips. |
| Cluster keys | Unique `briefClusterKey(article)` for each linked article with resolvable id; omit if no article. | Broken expand linkage. |
| Linked headlines | Up to **8** newest-by-`publishedAt`/`fetchedAt` linked articles: `{ id, title, sourceKind, publisherDomain, publishedAt, canonicalUrl, sourceTier, stance }`. Stance from evidence link. | Huge payloads. |
| Mute | Drop claim from both lists when `claimMatchesMute(claim, linkedArticles, rules)`; increment `hiddenMutedCount`. | Mutes ignored. |
| needsReview partition | Claim id appears in `claim-review-queue.json` → **only** in `needsReview` (not also in `claims`). Attach `reviewReasons` from the **newest** queue entry for that claimId. | Dupes confuse inbox. |
| Sort | Each array: `createdAt` desc. | Stale claims on top. |
| Response shape | See verbatim types below. | Client drift. |
| Route | `GET /api/claims/radar` behind session; injectable builder for tests (mirror extract/classify deps pattern lightly). | Untestable. |
| Kite primary UI | Replace main story-cluster list with claim cards. Sections: **Needs review** (if any), **Claims**, then existing **Tracked** (stories) + **Mutes**, then collapsible **Headline clusters** fed by existing `GET /api/radar` for Accept/Track transition. | Breaks story Accept with no claim Accept yet. |
| Claim card actions | Display only — **no** Accept/Track/Mute buttons on claims. Expand toggles linked headlines. | Scope creep into NEWS-75. |
| Status chips | Humanize claim status with spaces/underscores → readable labels; never “Verified”. | Honesty break. |
| Empty copy | When no claims and not needsReview: short honesty line that extract produces the inbox (no fake sample claims). | Confusing empty. |
| Proxy | `apps/kite/src/routes/api/claims/radar/+server.ts` → `proxyGET('/claims/radar')`. | CORS/cookie fail. |
| e2e | Keep `/radar` heading smoke; do not require live claims in CI. | Flaky e2e. |

### Response types (verbatim)

```ts
export type ClaimRadarLinkedHeadline = {
  id: string;
  title: string;
  sourceKind: string;
  publisherDomain: string | null;
  publishedAt: string | null;
  canonicalUrl: string;
  sourceTier: 'primary' | 'sensor';
  stance: 'supports' | 'contradicts' | 'mentions';
};

export type ClaimRadarEvidenceCounts = {
  total: number;
  supports: number;
  contradicts: number;
  mentions: number;
  primary: number;
  sensor: number;
};

export type ClaimRadarItem = {
  claimId: string;
  text: string;
  claimType: string;
  status: string;
  createdAt: string;
  confidence: number | null;
  evidence: ClaimRadarEvidenceCounts;
  clusterKeys: string[];
  linkedHeadlines: ClaimRadarLinkedHeadline[];
  needsReview: boolean;
  reviewReasons: string[]; // empty when not in needsReview
};

export type ClaimsRadarResponse = {
  ok: true;
  claims: ClaimRadarItem[];
  needsReview: ClaimRadarItem[];
  hiddenMutedCount: number;
};
```

Error: `{ ok: false, error: string }` with 500 on unexpected failures; 401/403 via existing session middleware.

### Builder input (for tests)

```ts
buildClaimsRadarFeed({
  claims,
  evidenceLinks,
  articles, // Article[]
  muteRules,
  reviewQueue,
}): Omit<ClaimsRadarResponse, 'ok'>
```

---

## Task 1: Claims radar service + GET /api/claims/radar

**Files:**

- Create `mvp/server/src/services/claimsRadar.ts` (+ `claimsRadar.test.ts`) implementing locked rulings.
- Wire `GET /api/claims/radar` in `app.ts` (session already applied): read claims, evidence, articles, mutes, review queue; return builder output + `ok: true`.
- Optional injectable deps on the route for app tests.
- Extend `app.test.ts`: unauthenticated → 401/403; authenticated with injected empty stores → `{ ok: true, claims: [], needsReview: [], hiddenMutedCount: 0 }`.
- Unit tests (temp fixtures, no live AI):
  1. Builds evidence counts + max confidence + clusterKeys + linked headlines
  2. Muted claim omitted + `hiddenMutedCount`
  3. Review-queue claim only in `needsReview` with reasons
  4. Partition / sort createdAt desc
- Export from `services/index.ts`; register test in `package.json`.

**Commit:** `feat(server): GET /api/claims/radar claim inbox`

---

## Task 2: Kite `/radar` claim inbox UI + proxy

**Files:**

- Create `apps/kite/src/routes/api/claims/radar/+server.ts` proxy.
- Update `apps/kite/src/routes/radar/+page.svelte` (+ `$lib/radar` copy constants as needed):
  - Fetch `/api/claims/radar` for primary inbox.
  - Render Needs review + Claims lists with status/evidence/confidence chips; expandable linked headlines.
  - Keep Tracked + Mutes sections (existing story APIs).
  - Add collapsible Headline clusters section using existing `/api/radar` for Accept/Track transition.
  - Session/login UX unchanged.
  - No Verified wording; no claim Accept/Track/Mute controls.
- Prefer small constants additions in `$lib/radar` (or adjacent) over hard-coded strings scattered in the page.
- Preserve existing visual language.

**Commit:** `feat(kite): claim inbox on /radar`

---

## Task 3: Docs seam (+ smoke note)

**Files:**

- `docs/MVP_API_COMPAT.md` — move `GET /api/claims/radar` from Planned into frozen/session routes; document response briefly.
- `docs/ROUTE_MAP.md` — `/radar` now claim-primary + headline clusters secondary; Accept/Track still story until NEWS-75.
- `docs/OWNED_BRIEF.md` / `docs/CLAIMS_DISCERNMENT.md` — one-liner each that claim inbox is live on `/radar`.
- Touch `e2e/kite-smoke.spec.ts` only if heading/copy would break the existing Radar title assertion.

**Commit:** `docs: ship NEWS-74 claim radar inbox`

---

## Out of scope

- Accept / Unaccept / Track / Mute / ack / badge on `claimId` (NEWS-75)
- Brief hybrid + Ollama verbiage (NEWS-76)
- Removing story `/api/radar` or story Accept
- Source admin CRUD / Birdclaw / Telegram
- Auto extract after fetch
