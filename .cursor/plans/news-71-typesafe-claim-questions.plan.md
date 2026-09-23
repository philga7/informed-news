# NEWS-71 — TypeSafe client + claim question library + confidence gates

**Ticket:** [NEWS-71](https://informedcrew.atlassian.net/browse/NEWS-71)  
**Branch:** `feat/news-71-typesafe-claim-questions`  
**Spec authority:** NEWS-71 description + [docs/CLAIMS_DISCERNMENT.md](../../docs/CLAIMS_DISCERNMENT.md) + Epic J plan + NEWS-70 claim types  
**Parent:** [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)

## Goal

Wire **TypeSafe / Jev** as judgment-of-record for claim desk atomic questions: env + SDK client + question library + confidence routing to `needs_review`. Demo with fixture state + mocked client (no live API required in CI). **No extract pipeline, no UI, no Ollama for these judgments.**

## Global Constraints

- Product path: `mvp/server` only. Do not revive `_legacy/` / Supabase.
- TypeSafe is judgment-of-record; **do not** call Ollama for assertability / type / stance / alignment / utility.
- Composite claim **status** remains `deriveClaimStatus` (NEWS-70) — never a TypeSafe “is this true?” question.
- Never log `TYPESAFE_API_KEY` or full secrets; mirror Ollama lazy-init warn pattern when key missing.
- Out of scope: NEWS-72 extract/fetch wiring, Radar/Brief UI, primary feed config (NEWS-73).
- Never commit `mvp/.env` or runtime `mvp/data/*.json`.
- Add new tests to `mvp/server/package.json` `"test"` script.
- Dependency: official `@typesafe-ai/sdk` (Node ≥20).

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| Env | `TYPESAFE_API_KEY=` and `TYPESAFE_MODEL=jev-1.13.0` in `mvp/.env.example` (pin version; comment that `jev-latest` drifts). | Thresholds break silently. |
| Client module | `mvp/server/src/services/typesafeClient.ts`: lazy `getTypeSafeClient()`, `getTypeSafeModelName()`, `systemOne(params)` wrapper. Missing key → `null` client + one warn (like Ollama). | |
| Injectability | `systemOne` accepts optional client for tests; production uses singleton. | Live API in CI. |
| Question module | `mvp/server/src/services/typesafeClaimQuestions.ts` — builders + `judgeClaimCandidate`. | |
| Claim type keys | Exact NEWS-70 set: `event_occurrence`, `attribution`, `casualty_or_count`, `official_statement`, `territorial_or_control`. | Drift vs store. |
| Stance keys | `supports`, `contradicts`, `mentions`. | |
| Alignment | Choice keys = existing claim ids (when provided) **plus** `new`. Instructions: pick best matching existing claim or `new`. Cap existing ids at **8** (truncated by caller order) to stay within practical choice size. | |
| Utility score | Ordered levels (low→high): `["Sensor reprint / low novelty", "Useful sensor detail", "Strong primary-grade evidence"]` — Score question for primary-vs-sensor utility/novelty. | |
| Assertable Noul | `isAssertable`: Noul “Is this an assertable factual claim (not opinion/commentary)?” with true/false criteria spelled out. | |
| Batch | One `systemOne` call per candidate with all five questions in parallel. | |
| Confidence floors | Export constants: `CHOICE_CONFIDENCE_FLOOR = 0.6`, `SCORE_CONFIDENCE_FLOOR = 0.6`. Noul: `needs_review` when `isAssertable.noul` is in **(0.4, 0.6)** exclusive (uncertain band); clear yes ≥0.6, clear no ≤0.4. | |
| needs_review | `judgeClaimCandidate` returns `needsReview: true` if **any** gated answer fails its floor/band. Still return raw answers for operator inspection. Do **not** invent claim status. | Silent merge of weak judgments. |
| State shape | `ClaimJudgeState = { articleExcerpt: string; candidateText: string; candidateQuote?: string \| null; existingClaims: Array<{ id: string; text: string; claimType?: string }> }` | |
| Result shape | See verbatim types below. | |
| Honesty | No Verified / truth-seal strings in this story’s copy. | |

### Result types (verbatim)

```ts
export type ClaimJudgeAnswers = {
  isAssertable: { noul: number };
  claimType: { choice: string; confidence: number; probabilities: Record<string, number> };
  claimAlignment: { choice: string; confidence: number; probabilities: Record<string, number> };
  evidenceStance: { choice: string; confidence: number; probabilities: Record<string, number> };
  sourceUtility: { score: number; confidence: number };
};

export type ClaimJudgeResult = {
  ok: true;
  needsReview: boolean;
  reviewReasons: string[]; // machine-readable tags e.g. 'low_confidence:claimType'
  answers: ClaimJudgeAnswers;
  model: string;
} | {
  ok: false;
  error: string;
  model: string | null;
};
```

### Question ids (verbatim keys)

`isAssertable` | `claimType` | `claimAlignment` | `evidenceStance` | `sourceUtility`

---

## Task 1: Env + SDK + TypeSafe client wrapper

**Files:**

- `mvp/server/package.json` — add dependency `@typesafe-ai/sdk` (current stable; lock whatever `npm install` resolves).
- `mvp/.env.example` — `TYPESAFE_API_KEY=` and `TYPESAFE_MODEL=jev-1.13.0` with short comments.
- Create `mvp/server/src/services/typesafeClient.ts`:
  - `getTypeSafeClient(): TypeSafeClient | null`
  - `getTypeSafeModelName(): string` (env or default `jev-1.13.0`)
  - `systemOne<Q>(params, client?)` — if no client and no env key, return structured failure path usable by callers (`ok: false`) **or** throw only when client forced — prefer returning null from getTypeSafeClient and let judge handle.
- Export from `services/index.ts`.
- Create `typesafeClient.test.ts` — missing key → null; model name resolution; **do not** call live network.

**Commit:** `feat(server): add TypeSafe client wrapper and env`

---

## Task 2: Claim question library + confidence gates

**Files:**

- Create `mvp/server/src/services/typesafeClaimQuestions.ts`:
  - `buildClaimJudgeQuestions(existingClaims)` using `noul` / `choice` / `score` from `@typesafe-ai/sdk`
  - `routeClaimJudgeAnswers(answers): { needsReview, reviewReasons }` — pure, unit-tested
  - `judgeClaimCandidate(state, opts?: { client?; model? }): Promise<ClaimJudgeResult>` — builds state object for `systemOne`, maps SDK answers into `ClaimJudgeAnswers`, applies routing
- Create `typesafeClaimQuestions.test.ts`:
  1. builders include all five keys; claimType options = closed set; alignment includes `new` + provided ids
  2. high-confidence fixture answers → `needsReview === false`
  3. low choice confidence → `needsReview` + reason tag
  4. noul in uncertain band → `needsReview`
  5. `judgeClaimCandidate` with injected mock client returning fixture → typed ok result
  6. missing client / null getTypeSafeClient path → `ok: false` with clear error (no throw of secrets)
- Register tests in `package.json`.

**Commit:** `feat(server): TypeSafe claim question library + confidence gates`

---

## Task 3: Docs seam

**Files:**

- `docs/OWNED_BRIEF.md` or `docs/MVP_API_COMPAT.md` — short note: TypeSafe client + question library landed (NEWS-71); extract pipeline still NEWS-72; status still code-derived (NEWS-70).
- `docs/CLAIMS_DISCERNMENT.md` — optional one-liner under Reason lens pointing at the question module (keep secular).

**Commit:** `docs: note NEWS-71 TypeSafe judgment spine`

---

## Out of scope

- POST `/api/claims/extract` / fetch hook (NEWS-72)
- Persisting judgments into evidence store (NEWS-72)
- Radar `needs_review` UI section (NEWS-74+)
- Live TypeSafe integration tests in CI (mock only)
