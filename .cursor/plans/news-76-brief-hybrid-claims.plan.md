# NEWS-76 — Brief hybrid: accepted claims + linked clusters + Ollama verbiage

**Ticket:** [NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)  
**Branch:** `feat/news-76-brief-hybrid-claims`  
**Spec authority:** NEWS-76 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + [docs/OWNED_BRIEF.md](../../docs/OWNED_BRIEF.md) + Epic J [claims_evidence_spine_8f4cde15.plan.md](claims_evidence_spine_8f4cde15.plan.md) + shipped NEWS-70–75  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Ship the **hybrid Brief** on `/`:

1. **Lead objects** = **accepted claims** (status + evidence honesty; no Verified).
2. **Expand** = **linked story clusters / outlets** (reuse claimsRadar join: evidence → articles → `briefClusterKey` + linked headlines).
3. **Ollama verbiage** only for accepted claims (`short_summary` + `talking_points`) — never overwrites TypeSafe / code-derived claim fields (`status`, evidence scores).
4. Owned brief adapter / public batches surface gains a **claims-mode** section; document in API compat.

Demo: Accept claim on Radar → Brief `/` shows claim + linked outlets; primary support shows `supported_by_primary` without a Verified seal; contested when contradicting evidence is linked; Ollama copy marked AI-assisted.

## Global Constraints

- Product path: `mvp/server` + thin `apps/kite`. No `_legacy/` / Supabase.
- TypeSafe / code-derived status stays judgment-of-record; Ollama = verbiage only ([CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md)).
- Reuse `claimsRadar` join helpers / patterns — do not fork a second evidence→article resolver.
- Shared mute rules apply: muted accepted claims are **excluded from Brief** (membership retained).
- Story brief membership + `GET /api/batches/.../stories` remain for transition / manual seeds — not removed.
- **Out of scope:** multi-domain; Verified badges; rewriting story enrich; per-claimId mute store; docs-only ROADMAP companion ticket polish beyond this story’s docs seam.
- Never commit `mvp/.env` or runtime `mvp/data/*.json`.
- Register new server tests in `mvp/server/package.json` `"test"` script.
- No “Verified” / true-false claim verdict copy in UI or API field names.
- Preserve Brief / Radar visual language (Lufga, soft borders) — reshape content, do not invent a new design system.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Brief claims source | Only `ClaimMembership.acceptedClaimIds`. Not the full radar inbox; not needsReview-only queue. | Inbox leaks onto Brief. |
| Mute on Brief | Drop muted accepted claims from Brief claims feed; do **not** remove membership. Mirror story `filterArticlesForBrief`. | Muted claims still on `/`. |
| Join / expand | Reuse claimsRadar resolution: evidence links → articles → `clusterKeys` + up to **8** `linkedHeadlines` (same shape as radar). | Divergent expand UX. |
| Public vs session | Brief claims read path is **public** (same as `GET /api/batches/.../stories`) so `/` loads without login. Mutating unaccept stays session via existing `/api/claims/unaccept`. | Brief blank for visitors / cookie-only. |
| Route | Public: `GET /api/batches/:batchId/claims` (and `latest`) on `createKiteBriefRouter` — batch id `owned-latest` / `latest` only. Response `{ ok: true, claims: BriefClaimItem[] }`. | Kite can’t proxy beside stories. |
| Item shape | See verbatim types below. Includes optional `verbiage` from claim-enrichments store. | Client drift. |
| Sort | `createdAt` desc among accepted claims on Brief. | Stale claims on top. |
| Empty Brief claims | `{ ok: true, claims: [] }` when none accepted (or all muted) — **no** fixture claims. Story fixture path unchanged when articles empty. | Fake claims. |
| Verbiage store | New `mvp/data/claim-enrichments.json` via `claimEnrichmentStore` (mirror cluster-enrichments pattern). Keys = `claimId`. Payload: `{ short_summary: string; talking_points: string[] }` only. | Overwrites judgment fields. |
| Ollama module | `ollamaClaimVerbiage.ts` — generates short_summary + talking_points from claim text + linked headline titles/stances. Never writes `Claim.status` or evidence scores. | Honesty / spine break. |
| Enrich trigger | Session `POST /api/claims/enrich` (optional `{ claimIds?: string[]; force?: boolean }`) — enrich **accepted** claims only (skip non-accepted). Idempotent skip when enrichment exists unless `force`. Do **not** block Accept on Ollama. | Slow Accept / scope creep. |
| Brief UI lead | `/` leads with **Accepted claims** section (new thin components / fetch). Expand toggles linked headlines + shows verbiage when present with “AI-assisted — not ground truth.” | Still story-first. |
| StoryList | Keep existing accepted-story `StoryList` **below** claims as secondary “Accepted stories” (transition + manual seeds). Do not delete story Accept path. | Breaks seeds / story desk. |
| Unaccept on Brief | Claim cards expose **Unaccept** (session) calling existing `POST /api/claims/unaccept`; refresh claims list. No Accept on Brief (Radar remains accept surface). | Operators stuck with accepted claims. |
| Status chips | Humanize statuses (`supported_by_primary` → readable label); never “Verified”. Contested / insufficient_evidence / reported unchanged honesty. | Honesty break. |
| Kite proxies | `apps/kite/src/routes/api/batches/latest/claims/+server.ts` (+ batchId variant if stories has one) → `proxyGET`. Enrich proxy under `api/claims/enrich`. | Cookie/CORS fail on enrich. |
| Adapter docs | Update OWNED_BRIEF + MVP_API_COMPAT + ROUTE_MAP + CLAIMS_DISCERNMENT; ROADMAP stays “next” until merge Done. | Docs lie. |

### BriefClaimItem (verbatim)

```ts
export type BriefClaimVerbiage = {
  short_summary: string;
  talking_points: string[];
};

export type BriefClaimItem = {
  claimId: string;
  text: string;
  claimType: string;
  status: string; // code-derived ClaimStatus string
  createdAt: string;
  confidence: number | null; // max evidence confidence, same as radar
  evidence: {
    total: number;
    supports: number;
    contradicts: number;
    mentions: number;
    primary: number;
    sensor: number;
  };
  clusterKeys: string[];
  linkedHeadlines: Array<{
    id: string;
    title: string;
    sourceKind: string;
    publisherDomain: string | null;
    publishedAt: string | null;
    canonicalUrl: string;
    sourceTier: 'primary' | 'sensor';
    stance: 'supports' | 'contradicts' | 'mentions';
  }>;
  verbiage: BriefClaimVerbiage | null;
};
```

### Builder

```ts
buildBriefClaimsFeed({
  claims,
  evidenceLinks,
  articles,
  membership, // acceptedClaimIds
  muteRules,
  enrichments, // Map<claimId, BriefClaimVerbiage>
}): { claims: BriefClaimItem[] }
```

Filter: id ∈ acceptedClaimIds ∧ !muted. Map join like radar. Attach enrichment or null.

---

## Task 1: Brief claims feed + claim enrichment store + Ollama verbiage + enrich route

**Files:**

- `mvp/server/src/services/briefClaims.ts` (+ `briefClaims.test.ts`) — `buildBriefClaimsFeed` / `loadBriefClaims` per rulings.
- `mvp/server/src/store/claimEnrichmentStore.ts` (+ tests) + `CLAIM_ENRICHMENTS_PATH` in `paths.ts` + export from store index.
- `mvp/server/src/services/ollamaClaimVerbiage.ts` (+ unit test with mocked client) — short_summary + talking_points only.
- `mvp/server/src/services/enrichClaims.ts` — batch accepted-only write to store (mirror `enrichClusters` lightly).
- Wire public `GET /api/batches/:batchId/claims` (+ `latest`) in `kiteBriefRoutes.ts`.
- Wire session `POST /api/claims/enrich` in `app.ts`.
- App/route tests: empty accepted → `[]`; accepted unmuted appears; muted accepted omitted; enrich skips non-accepted; unauth enrich → 401.
- Register tests in `package.json`.

**Commit:** `feat(server): Brief claims feed + Ollama claim verbiage`

---

## Task 2: Kite Brief `/` claims lead + proxies

**Files:**

- Proxies: `apps/kite/src/routes/api/batches/latest/claims/+server.ts` (and batchId path if needed); `apps/kite/src/routes/api/claims/enrich/+server.ts`.
- Brief UI: lead **Accepted claims** on `+page.svelte` / thin new components under `$lib/components/brief/` (or adjacent) — status/evidence chips, expand linked headlines, verbiage + honesty line, Unaccept.
- Keep `StoryList` below as secondary accepted stories.
- Empty claims copy: short honesty line (Accept on Radar); no fake claims.
- No Verified copy; preserve visual language.

**Commit:** `feat(kite): Brief hybrid accepted claims lead on /`

---

## Task 3: Docs seam

**Files:**

- `docs/MVP_API_COMPAT.md` — freeze `GET /api/batches/.../claims` + `POST /api/claims/enrich`; mark Brief hybrid shipped.
- `docs/OWNED_BRIEF.md` / `docs/ROUTE_MAP.md` / `docs/CLAIMS_DISCERNMENT.md` — Brief leads with accepted claims; expand linked clusters; Ollama verbiage only.

**Commit:** `docs: ship NEWS-76 Brief hybrid claims`

---

## Out of scope

- Removing story Accept / StoryList entirely
- Auto-enrich on Accept (optional later)
- Verified seals / claim verdicts
- Multi-domain / Epic B–G
