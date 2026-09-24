# NEWS-72 — Ollama propose candidates + TypeSafe judge extract pipeline

**Ticket:** [NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)  
**Branch:** `feat/news-72-ollama-propose-typesafe-judge`  
**Spec authority:** NEWS-72 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + Epic J plan [claims_evidence_spine_8f4cde15.plan.md](claims_evidence_spine_8f4cde15.plan.md) + NEWS-70/71 modules  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Ship the **propose → judge → persist** pipeline for conflict-domain claim candidates:

1. Ingest + cluster unchanged (stories remain input).
2. **Ollama propose:** candidate spans `{ text, claimTypeGuess, quote }` from articles — no Accept decisions.
3. **TypeSafe judge:** reuse NEWS-71 `judgeClaimCandidate` (atomic questions + confidence gate).
4. Persist claims + evidence links; status stays code-derived (`deriveClaimStatus` / evidence upsert).
5. Session-gated `POST /api/claims/extract` mirroring classify patterns.

Demo: run extract on fixture/store articles → claims + evidence in stores; low-confidence → `needs_review` queue. **No Radar/Brief UI; no Ollama Brief verbiage.**

## Global Constraints

- Product path: `mvp/server` only. Do not revive `_legacy/` / Supabase.
- **TypeSafe = judgment-of-record** for assertability / type / alignment / stance / utility. Ollama proposes candidate text only — never overwrite TypeSafe fields with Ollama guesses on persist.
- Composite claim **status** remains `deriveClaimStatus` (NEWS-70) via `upsertEvidenceLink` — never a model “is this true?” output.
- Legacy `POST /api/classify` stays available and is **not** judgment-of-record for claims.
- Session-gated mutating route under existing `requireApiSession` (same as classify).
- Never log `OLLAMA_API_KEY`, `TYPESAFE_API_KEY`, or secrets.
- Out of scope: Radar/Brief UI (NEWS-74+), Accept/Track/Mute HTTP (NEWS-75), primary feed tiers config (NEWS-73), Brief verbiage (NEWS-76), auto post-fetch hook.
- Never commit `mvp/.env` or runtime `mvp/data/*.json`.
- Add new tests to `mvp/server/package.json` `"test"` script.
- CI must not call live Ollama or TypeSafe — inject mocks / fixture clients.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Propose module | `mvp/server/src/services/ollamaProposeClaims.ts` — Ollama JSON extraction of candidates; mirror `ollamaFraming.ts` lazy client reuse via `getOllamaClient()` / `getOllamaModelName()`. | Duplicate Ollama init. |
| Candidate shape | `{ text: string; claimTypeGuess: ClaimType \| null; quote: string \| null }` — `claimTypeGuess` validated against NEWS-70 closed set or null. | |
| Pipeline module | `mvp/server/src/services/extractClaims.ts` — `extractClaimsFromArticles(options)` orchestrates propose → judge → persist. | |
| Source tier (v1) | Always persist evidence as `sourceTier: 'sensor'` until NEWS-73. | Primary status flips early without primary feeds. |
| Assertable clear-no | When judge ok and `isAssertable.noul ≤ 0.4` and not in uncertain band: **skip** create/link (not a claim). | Opinion spam fills store. |
| Assertable uncertain / low confidence | Persist claim+evidence **and** enqueue `needs_review` (see queue ruling). | Silent merge of weak judgments. |
| Alignment `new` | Create Claim with `claimType` from TypeSafe `answers.claimType.choice` (fallback `event_occurrence` if invalid); `text` = candidate text; `entities: []`; `domain: 'conflict'`. | Ollama guess becomes judgment-of-record. |
| Alignment existing id | Do **not** create a new claim; `upsertEvidenceLink` onto that `claimId`. | Duplicate claims. |
| Evidence confidence | `confidence` = min of `claimType`, `claimAlignment`, `evidenceStance`, `sourceUtility` confidences (0..1). Stance from TypeSafe choice. | |
| Evidence scores | Store TypeSafe numeric bag: `{ isAssertable, claimTypeConfidence, claimAlignmentConfidence, evidenceStanceConfidence, sourceUtility, sourceUtilityConfidence }` (and choice keys as needed under string→number only for numeric fields). Non-numeric review tags go on the review queue, not `scores`. | |
| Review queue | `mvp/data/claim-review-queue.json`: JSON **array** of `{ id, claimId, evidenceLinkId, articleId, reviewReasons: string[], candidateText, createdAt }`. ENOENT → `[]`. Append when `needsReview === true`. Idempotent skip if same `(articleId, claimId, evidenceLinkId)` already queued. | Radar has nowhere to hang needs_review. |
| Processed set | `mvp/data/claim-extract-processed.json`: `{ articleIds: string[], updatedAt: string \| null }`. Skip already-processed articles unless `force: true`. Write after successful propose attempt (even if zero candidates / all skipped) so failures that threw before propose do not mark processed. | Infinite re-extract. |
| Batch limit | Default `10` (env `CLAIMS_EXTRACT_BATCH_LIMIT`); newest-first; skip `sourceKind === 'manual'`; prefer articles with body text via `framingBodyText`, else title+snippet. | |
| Article selection | Optional body/query `articleIds?: string[]` — when provided, extract only those ids (still honor limit/force). Else newest unprocessed. | Demo on fixtures hard. |
| Route | `POST /api/claims/extract` behind `requireApiSession`. Body/query: `{ limit?, force?, articleIds? }`. Response mirrors classify shape: `{ ok, limit, attempted, proposed, judged, persistedClaims, persistedEvidence, needsReview, failed, articlesProcessed, claims, evidence, reviewQueued }`. Exact field set locked in Task 3. | |
| Fetch hook | **None** in NEWS-72 (parity with classify). Document that operators call extract explicitly. | Surprises on every fetch. |
| Injectability | `extractClaimsFromArticles` accepts deps: propose fn, judge fn, store writers, path overrides — for tests without live AI. | Live API in CI. |
| Honesty | No Verified / truth-seal strings. | |

### Propose result types (verbatim)

```ts
export type ClaimCandidate = {
  text: string;
  claimTypeGuess: ClaimType | null;
  quote: string | null;
};

export type ProposeClaimsSuccess = {
  ok: true;
  candidates: ClaimCandidate[];
  model: string;
  rawText: string;
};

export type ProposeClaimsFailure = {
  ok: false;
  error: string;
  model: string | null;
  rawText: string | null;
};

export type ProposeClaimsResult = ProposeClaimsSuccess | ProposeClaimsFailure;
```

### Review queue entry (verbatim)

```ts
export type ClaimReviewQueueEntry = {
  id: string;
  claimId: string;
  evidenceLinkId: string;
  articleId: string;
  reviewReasons: string[];
  candidateText: string;
  createdAt: string; // ISO
};
```

---

## Task 1: Ollama propose candidates module

**Files:**

- Create `mvp/server/src/services/ollamaProposeClaims.ts`:
  - `proposeClaimCandidates(input: { title; snippet; bodyText?; publisherDomain? }, opts?: { client?; model? }): Promise<ProposeClaimsResult>`
  - Prompt: conflict/geopolitics domain; extract assertable claim **spans** only; JSON array shape `{ "candidates": [ { "text", "claimTypeGuess", "quote" } ] }`; max **5** candidates; quote must be substring when possible; no Accept / true-false judgments.
  - Parse/validate like framing (`parseJsonResponse` pattern — may share a tiny private helper or duplicate minimal parse; do not refactor framing unless trivial).
  - Missing Ollama client → `{ ok: false, error: clear message, model: null, rawText: null }` (no throw of secrets).
- Create `ollamaProposeClaims.test.ts`:
  1. Missing client → ok false
  2. Injected mock client returning fixture JSON → validated candidates (invalid claimTypeGuess → null; empty text dropped)
  3. Malformed JSON → ok false
- Export from `services/index.ts`.
- Register tests in `package.json`.

**Commit:** `feat(server): Ollama propose claim candidates`

---

## Task 2: Review queue store + extract processed meta

**Files:**

- Create `mvp/server/src/store/claimReviewQueueStore.ts`:
  - `readClaimReviewQueue` / `writeClaimReviewQueue` / `enqueueClaimReview(entry)` (idempotent on articleId+claimId+evidenceLinkId)
  - Path: `CLAIM_REVIEW_QUEUE_PATH` in `paths.ts` → `claim-review-queue.json`
- Create `mvp/server/src/store/claimExtractProcessedStore.ts`:
  - `readClaimExtractProcessed` / `markArticlesExtractProcessed(ids)` / `isArticleExtractProcessed`
  - Path: `CLAIM_EXTRACT_PROCESSED_PATH` → `claim-extract-processed.json`
- Export from `store/index.ts`.
- Unit tests for both stores (temp dirs); register in `package.json`.

**Commit:** `feat(server): claim review queue + extract processed stores`

---

## Task 3: Extract pipeline + session-gated route

**Files:**

- Create `mvp/server/src/services/extractClaims.ts`:
  - `extractClaimsFromArticles(options)` implementing locked rulings (propose → judge → persist → queue).
  - When judge `ok: false`: count as failed for that candidate; continue others.
  - When propose fails for an article: count article failed; do **not** mark processed.
  - Cap existing claims passed to judge at 8 (newest / store order as readClaims returns — document: first 8 from `readClaims()`).
- Wire `POST /api/claims/extract` in `app.ts` (injectable dep like classify).
- Create `extractClaims.test.ts` with fully mocked propose+judge+temp stores:
  1. New claim path: propose 1 candidate → judge high-confidence new → claim + evidence persisted; status derived; not queued
  2. Low confidence → persisted + review queue entry with reasons
  3. Clear non-assertable → nothing persisted
  4. Alignment to existing id → evidence on existing claim only
  5. Already-processed skipped unless force
- Create or extend `app.test.ts` coverage: unauthenticated extract → 401/403 per existing session pattern; authenticated with injected extract dep returns ok payload.
- Env: optional `CLAIMS_EXTRACT_BATCH_LIMIT=` comment in `mvp/.env.example`.
- Export extract from `services/index.ts`; register tests.

**Commit:** `feat(server): claims extract pipeline + POST /api/claims/extract`

---

## Task 4: Docs seam

**Files:**

- `docs/MVP_API_COMPAT.md` — move `POST /api/claims/extract` into frozen/session routes (or mark shipped under Epic J section); note request/response briefly; clarify classify is not claim judgment-of-record.
- `docs/OWNED_BRIEF.md` — one short note if it mentions extract/planned claims pipeline.
- `docs/CLAIMS_DISCERNMENT.md` — optional one-liner that extract enqueues `needs_review` for low confidence (Radar UI later).

**Commit:** `docs: ship NEWS-72 claims extract API note`

---

## Out of scope

- `GET /api/claims/radar` / Kite claim inbox UI (NEWS-74)
- Accept / Track / Mute on claims (NEWS-75)
- Primary vs sensor feed config (NEWS-73) — evidence always `sensor` here
- Ollama Brief verbiage (NEWS-76)
- Auto extract after `POST /api/fetch`
- Live Ollama/TypeSafe CI tests
)
