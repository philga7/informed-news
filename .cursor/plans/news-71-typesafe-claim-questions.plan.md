# NEWS-71 — TypeSafe client + claim question library + confidence gates

**Ticket:** [NEWS-71](https://informedcrew.atlassian.net/browse/NEWS-71)  
**Branch:** `feat/news-71-typesafe-claim-questions`  
**Spec authority:** NEWS-71 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + Epic J plan + NEWS-70 claim types/status constants  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Add a TypeSafe (Jev) client and an **atomic claim question library** with confidence-gated routing. TypeSafe is judgment-of-record for claim/evidence micro-judgments. Composite claim **status** remains in application code (`deriveClaimStatus` from NEWS-70). Demo: fixture state → batched typed answers; low confidence → `needs_review`. **No extract pipeline wiring, no HTTP/UI.**

## Global Constraints

- Product path: `mvp/server` only. No `_legacy/` / Supabase.
- Dependency: `@typesafe-ai/sdk` (official JS SDK). Do not invent a raw HTTP client unless the SDK cannot load.
- Env: `TYPESAFE_API_KEY` (+ optional model id) in `mvp/.env.example`. Never commit real keys or `mvp/.env`.
- Mirror Ollama client style: lazy init, null when key missing, no secrets in logs.
- Question library uses atomic Noul / Choice / Score only — **never** a single “is this true / verified?” question.
- Composite `ClaimStatus` stays in `deriveClaimStatus` — TypeSafe must not mint status/verdicts.
- Confidence below floor → `needs_review` (not silent merge). Wire routing in code.
- Out of scope: NEWS-72 extract pipeline, NEWS-73–76 UI/APIs, Ollama for these judgments.
- Tests must not require a live TypeSafe key (inject/mock `systemOne`).
- Register new tests in `mvp/server/package.json` `"test"` script.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Package | `npm install @typesafe-ai/sdk` in `mvp/server`. | |
| Env | `TYPESAFE_API_KEY=` and `TYPESAFE_MODEL=jev-latest` (commented default) in `mvp/.env.example`. Client reads `process.env.TYPESAFE_API_KEY` / `TYPESAFE_MODEL`. | Operators guess wrong var names. |
| Client file | `mvp/server/src/services/typesafeClient.ts` — `getTypeSafeClient(): TypeSafeClient \| null`, `getTypeSafeModelName(): string`, reset helper for tests (same spirit as Ollama). | |
| Questions file | `mvp/server/src/services/typesafeClaimQuestions.ts` — builders + `judgeClaimCandidate`. | |
| Confidence floor | `CLAIM_JUDGE_CONFIDENCE_FLOOR = 0.5` — any Choice/Score answer with `confidence < floor` forces routing `needs_review`. | Silent merge of weak judgments. |
| Assertable gate | Noul `assertable`: if `noul < ASSERTABLE_NOUL_FLOOR` (`0.55`) → routing `reject_not_claim` (not a desk claim). If assertable passes but other confidences fail → `needs_review`. | Opinion treated as claim. |
| Proceed | routing `proceed` only when assertable passes **and** every Choice/Score in the batch has `confidence >= CLAIM_JUDGE_CONFIDENCE_FLOOR`. | |
| Batch | One `systemOne` call with all questions sharing the same `state` object. | Extra latency/cost. |
| Claim type criteria | Closed set keys match NEWS-70 `ClaimType` exactly. | TypeSafe Choice ≠ store enum. |
| Stance criteria | `supports` \| `contradicts` \| `mentions` (NEWS-70 `EvidenceStance`). | |
| Alignment | Choice: `new_claim` \| `merge_existing` \| `unclear` (descriptions in builder). Do not invent claim ids inside TypeSafe — NEWS-72 maps merge. | |
| Utility Score | Ordered levels (low→high), 4 levels: reprint noise → weak sensor signal → useful sensor → strong primary utility. Returns numeric score + confidence. | |
| Injection | `judgeClaimCandidate(state, opts?: { client?, model? })` — if no client and env missing → `{ ok: false, error: 'TypeSafe not configured' }` (parallel Ollama). Tests pass a mock client. | |
| Honesty | Reuse / import NEWS-70 honesty constants in docs comments only; do not add “Verified” language. | |

### Question keys (verbatim)

```ts
questions: {
  assertable: noul(...),      // assertable factual claim vs opinion/commentary
  claimType: choice(...),     // ClaimType closed set
  alignment: choice(...),     // new_claim | merge_existing | unclear
  stance: choice(...),        // supports | contradicts | mentions
  utility: score(...),        // primary-vs-sensor utility / novelty
}
```

### Result shape (verbatim)

```ts
export type ClaimJudgeRouting = 'proceed' | 'needs_review' | 'reject_not_claim';

export type ClaimJudgeSuccess = {
  ok: true;
  routing: ClaimJudgeRouting;
  model: string;
  answers: {
    assertableNoul: number;
    claimType: ClaimType | null;       // null if needs_review / reject
    claimTypeConfidence: number;
    alignment: 'new_claim' | 'merge_existing' | 'unclear' | null;
    alignmentConfidence: number;
    stance: EvidenceStance | null;
    stanceConfidence: number;
    utilityScore: number;
    utilityConfidence: number;
  };
};

export type ClaimJudgeFailure = {
  ok: false;
  error: string;
  model: string | null;
};

export type ClaimJudgeResult = ClaimJudgeSuccess | ClaimJudgeFailure;
```

### State shape (verbatim)

```ts
export type ClaimJudgeState = {
  articleExcerpt: string;
  candidateText: string;
  candidateQuote?: string | null;
  existingClaimSummaries?: ReadonlyArray<{ id: string; text: string }>;
  sourceTierHint?: 'primary' | 'sensor' | null;
};
```

---

## Task 1: Dependency + env + TypeSafe client wrapper

**Files:**

- `mvp/server/package.json` — add `@typesafe-ai/sdk` dependency (run install in `mvp/server`).
- `mvp/.env.example` — `TYPESAFE_API_KEY=` and `TYPESAFE_MODEL=jev-latest` with short comments (judgment-of-record; never log the key).
- Create `mvp/server/src/services/typesafeClient.ts` — lazy `getTypeSafeClient`, `getTypeSafeModelName`, `resetTypeSafeClientForTests`.
- Create `mvp/server/src/services/typesafeClient.test.ts` — missing key → null; with key → non-null (construct without calling network); reset restores lazy state.
- Export from `services/index.ts`.
- Register test in `package.json`.

**Commit:** `feat(server): add TypeSafe client wrapper and env`

---

## Task 2: Claim question library + confidence routing

**Files:**

- Create `mvp/server/src/services/typesafeClaimQuestions.ts`:
  - Export floors: `CLAIM_JUDGE_CONFIDENCE_FLOOR`, `ASSERTABLE_NOUL_FLOOR`
  - `buildClaimJudgeQuestions()` — returns the questions map using `noul` / `choice` / `score` from SDK
  - `judgeClaimCandidate(state, opts?)` — calls `client.systemOne({ state, model, questions })`, maps answers into `ClaimJudgeResult`, applies routing rules
  - Validate Choice winners against closed sets; unknown → treat as needs_review
- Create `mvp/server/src/services/typesafeClaimQuestions.test.ts` — mock client `systemOne`:
  1. High-confidence assertable + choices → `proceed` with typed fields
  2. Low assertable noul → `reject_not_claim`
  3. High assertable but low choice confidence → `needs_review`
  4. Missing client → `ok: false`
  5. Fixture-like state object accepted (shape only; mock returns answers)
- Export from `services/index.ts`; register tests.

**Commit:** `feat(server): TypeSafe claim question library + confidence gates`

---

## Task 3: Docs seam

**Files:**

- `docs/MVP_API_COMPAT.md` — note TypeSafe env + judgment library landed (NEWS-71); extract route still NEWS-72; no HTTP judge endpoint yet.
- `docs/CLAIMS_DISCERNMENT.md` or `docs/OWNED_BRIEF.md` — one short line that Reason lens = TypeSafe atomic questions + confidence gates (NEWS-71).
- Do not freeze fake routes.

**Commit:** `docs: note NEWS-71 TypeSafe claim judge foundation`

---

## Out of scope

- Wiring into `fetchAllSources` / extract route (NEWS-72)
- Primary feed config (NEWS-73)
- Radar / Brief / Accept UI (NEWS-74–76)
- Using Ollama for claim type / stance / assertable
- Changing `deriveClaimStatus` thresholds (may import floors for documentation alignment only; do not change NEWS-70 behavior)
