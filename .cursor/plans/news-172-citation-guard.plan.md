# NEWS-172 — Citation guard (SDD plan)

**Spec:** `.cursor/plans/news-172-citation-guard.spec.md` (authority)  
**Branch (after 6 PM ET):** `cursor/news-172-citation-guard-1d53`  
**Commit style:** One Conventional Commit for the ticket on the branch when shipping: `feat(NEWS-172): …` (implementers may use task-scoped commits; squash subject is the PR title).  
**Controller rule (NEWS-179):** Controller plans and reviews only. **Writes no task implementation code inline.** Every Task is dispatched to an implementer subagent; state this in the PR body.

## Global Constraints

- Clean-room: do not open, copy, port, or paraphrase CaseCite (Elastic License 2.0) code, tests, or prompts.
- Binding grill answers in the spec — do not re-litigate.
- No new public npm/bun dependencies.
- Persist via existing `enqueueFileWrite` / `writeJsonAtomic` patterns under `mvp/data/` (gitignored `*.json`).
- Tests: recorded fixtures only; no live network in unit, integration, or e2e CI paths.
- Failed citation checks never fail/block a refresh.
- No verified / false / debunked badge; Transparency copy stays honest.
- Exhaustive `never` default on switches over citation kind / check status unions.
- Prefer thin UI: check logic in `mvp/server`; Kite only renders marks from payload.
- Do not revive `_legacy/` or call Supabase.

## Architecture sketch (implementers follow)

```
refresh / on-demand generate
  → register sources for this runId into citation-sources store (by contentHash)
  → produce summary / full-story / living update
  → citationGuard.check(items, runSources) via kind resolvers (url|quote|claim; court reserved)
  → write citation-check-log per articleId
  → kiteBriefAdapter / full-story payload includes per-item verification marks
  → Kite card: unverified / unconfirmed advisory UI + a11y
```

Suggested paths (adjust only if an existing seam is clearly better; note in report):

| Piece | Suggested location |
|-------|-------------------|
| Types | `mvp/server/src/types/citationGuard.ts` |
| Paths | `CITATION_SOURCES_PATH`, `CITATION_CHECK_LOG_PATH` in `store/paths.ts` |
| Source store | `mvp/server/src/store/citationSourcesStore.ts` (+ test) |
| Check log store | `mvp/server/src/store/citationCheckLogStore.ts` (+ test) |
| Normalize / match | `mvp/server/src/services/citationGuard/normalizeQuote.ts`, `matchQuote.ts` |
| Resolvers | `mvp/server/src/services/citationGuard/resolvers/*.ts` + `registry.ts` |
| Orchestrator | `mvp/server/src/services/citationGuard/runCitationGuard.ts` |
| Wire-in | refresh runner + summary/full-story generate paths |
| Adapter | `kiteBriefAdapter` (+ tests) expose marks |
| UI | Informed News glue on topic Brief card / full story (not upstream churn) |
| E2E | `e2e/` hermetic fixtures — match / mismatch / missing / paraphrase |

Retention prune: 7 days, same spirit as `BRIEF_CACHE_RETENTION_DAYS`; call after successful refresh with other prunes; failures log and never fail refresh.

## Task 1: Per-run source store

**Failing first.** Implement types + `citationSourcesStore` (+ path constants).

**Behavior**

- A refresh (and on-demand generate that needs sources) records each fetched source’s text under a `runId`: at least `url` (nullable for text-only), `text`, `fetchedAt`, `runId`, `contentHash`, and article/member id when known.
- Same-hash reuse: registering already-stored article body text by hash into **this** run’s set counts as fetched that run (no re-HTTP).
- Unresolved Google News URLs are never written as sources with empty/fake body pretending to be publisher text.
- Survives process restart (JSON file under `MVP_DATA_DIR` / `mvp/data`).
- Prune entries older than 7 days on the agreed refresh prune hook (or a dedicated prune called from the same place); missing file → empty store.
- Unit tests cover: record + read round-trip, restart simulation (re-read file), prune drops old keeps new, hash registration without network, GN-unresolved rejected or not stored as a source.

**Done when:** tests green; store exported from `store/index.ts`; no secrets committed.

## Task 2: Link check

**Failing first.** URL resolver in the citation guard registry.

**Behavior**

- Every outbound link extracted from in-scope surfaces maps to a source in the **current run’s** source set (URL match against registered source URLs / publisher URLs).
- Unmatched → status `missing-source` (display unverified).
- Unresolved Google News link → `missing-source` / unverified (not a source).
- Kind `url`. Does not drop the link from the payload; marks it.

**Tests:** match, mismatch (URL not in store), missing-source, GN unresolved.

**Done when:** resolver registered; unit tests green; no UI yet required beyond returning structured results the log can store.

## Task 3: Quote check

**Failing first.** Quote normalize + match + `quote` resolver.

**Behavior**

- Normalize: collapse whitespace; map curly quotes to straight. Nothing else.
- Exact match against full source texts in the run set → `match`.
- One-word change → `mismatch`.
- Paraphrase presented as quote → `mismatch`.
- No fetched source text → `missing-source`.
- Case differs → `mismatch`. Ellipsis / `[bracketed]` not in source → `mismatch`.
- Never treat a failed quote as fact (status drives display in later tasks).

**Tests:** exact, whitespace/curly pass, one-word fail, paraphrase fail, missing source, case fail.

**Done when:** unit tests green; integrated into registry.

## Task 4: Claims and “debunked” → unconfirmed

**Failing first.** `claim` resolver.

**Behavior**

- A claim that would be shown as refuted/debunked **without** a linked refuting source among fetched sources resolves to display **unconfirmed** (check status `missing-source` or a dedicated claim outcome mapped to unconfirmed — pick one and keep exhaustive).
- When a linked refuting source **is** among fetched sources, record `match` for that claim’s refutation link path; still **do not** add a Debunked / false / verified badge in UI (Task 6 only shows unconfirmed / unverified).
- No new verified/false badge anywhere.

**Tests:** claim without refuting source → unconfirmed mapping; with refuting source URL in run store → match; no badge fields introduced on API as ground-truth verdicts.

**Done when:** unit tests green; registry includes `claim`; `court` kind reserved (stub resolver that returns missing-source or “not implemented” without breaking — enough for NEWS-173 to replace).

## Task 5: Per-story check log

**Failing first.** `citationCheckLogStore` + wire guard output into it; expose marks on Brief/full-story read path.

**Behavior**

- Each check writes per item: `kind`, identity (url/quote text hash or stable id), `status` (`match` | `mismatch` | `missing-source`), timestamps, `runId`.
- Keyed by articleId / story id; survives restart.
- Old stories without a log still load (adapter treats missing log as no marks).
- Fold slim verification marks into existing Brief / full-story JSON the Kite client already consumes (prefer extend adapter types; add a session GET only if payload would bloat — default embed).
- Prune log entries with the same 7-day / kept-article spirit as sources (or drop when article pruned).

**Tests:** write/read round-trip; restart; missing log → load ok; adapter includes marks for match and unverified cases.

**Done when:** tests green; refresh and on-demand generate paths call the guard and persist the log (mark-only; refresh continues on guard errors).

## Task 6: Render and e2e

**Failing first.** Kite UI + hermetic e2e.

**Behavior**

- Unverified mark on unmatched links and quotes; unconfirmed on claims per Task 4.
- Keyboard-reachable; screen reader hears polite advisory (e.g. “unverified link”, “unverified quote”, “unconfirmed”) — not assertive alarm.
- E2E fixture covers: match, mismatch, missing source, paraphrase-as-quote.
- No live network.

**Also in this task (docs + env — same PR, can be same or follow-up commit on the branch before push):**

- `docs/BRIEF.md` + `docs/TRIAGE.md`: new store and checks.
- `docs/DECISIONS.md`: dated entry with binding grill answers (source definition, mark unverified, unconfirmed not debunked, store + 7-day retention, NEWS-173 hook).
- `docs/PRODUCT_SPEC.md`: NEWS-167 Approved/Filtered/All catch-up + NEWS-172 unverified/unconfirmed scenarios.
- `docs/WHATS_NEW.md`: replace 2026-10-27 “No user-visible change” with toggle entry; add NEWS-172 entry.
- `docs/ROADMAP.md` + `AGENTS.md` Current next → NEWS-173; mark NEWS-172 Done in combined order item 4 and row 75.
- `docs/VISION.md`: only if direction changes; otherwise note unchanged in PR body.
- Create lean `.cursor/environment.json` if absent: idempotent `install` that skips work when lockfile hash matches last-install hash (root + `mvp/server` package-lock + `apps/kite` bun.lock).

**Done when:** e2e green locally via hermetic stack; unit/typecheck paths for touched packages green; docs updated.

## Out of scope (PR body must say so)

NEWS-173, NEWS-179, NEWS-176, NEWS-177, NEWS-178, NEWS-175. Propose discovered tickets in the PR body; do not file them.

## Trial note

This is trial merge **#1 of 5** for NEWS-175. NEWS-167 merged before the trial landed and does not count.
