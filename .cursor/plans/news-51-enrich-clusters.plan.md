# NEWS-51 — Pipeline: enrich clusters with highlights, timeline, and Q&A

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (this session) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist LLM cluster enrichment (`talking_points`, `timeline`, `suggested_qna`) via a sibling Ollama step, map it through the owned brief adapter, document regenerate via `POST /api/enrich`, and show a **concise** expand-view honesty line — not ground truth.

**Architecture:** Framing stays per-article (`Article.classification`). Enrichment is **cluster-level** in `mvp/data/cluster-enrichments.json`, keyed by `clusterId` (or `solo:{articleId}` for ungrouped). `POST /api/enrich` (session-gated) synthesizes JSON with Ollama Cloud; `kiteBriefAdapter` copies fields onto `KiteBriefStory`. Empty-store fixture ships sample enrichment so Playwright can assert without a live model call.

**Tech Stack:** Express (`mvp/server`), Ollama Cloud (reuse client from `ollamaFraming.ts`), flat JSON store, SvelteKit Kite Brief expand UI, node:test + Playwright.

**Spec / ticket:** [NEWS-51](https://informedcrew.atlassian.net/browse/NEWS-51) (Epic H / NEWS-48). No separate design-doc Spec file — ticket acceptance is binding.

## Global Constraints

- Prefer Informed News glue (`mvp/server`, thin Kite edits) over rewriting upstream kite files.
- Do **not** fold enrichment into `FramingAnalysis` / `Article.classification`.
- Do **not** call Ollama inside the brief adapter read path.
- Prompt and UI copy must include honesty: **AI-assisted** and **not ground truth** (prompt snapshot + concise expand label).
- UI honesty must be a **short** muted line in dig expand — must **not** dominate (no banner/hero disclaimer).
- Session-gate `POST /api/enrich` like classify; document in `OWNED_BRIEF.md` + `MVP_API_COMPAT.md`.
- Tests must not require a live `OLLAMA_API_KEY` (mock parse / fixture data).
- Out of scope: left/right scores, claim verdicts, Kagi Translate, perfect Kagi field parity, NEWS-52 work.

---

### Task 1: Cluster enrichment types, Ollama step, store, `POST /api/enrich`

**Files:**
- Create: `mvp/server/src/types/clusterEnrichment.ts`
- Create: `mvp/server/src/store/clusterEnrichmentStore.ts`
- Create: `mvp/server/src/services/ollamaEnrichment.ts`
- Create: `mvp/server/src/services/enrichClusters.ts`
- Create: `mvp/server/src/services/ollamaEnrichment.test.ts`
- Create: `mvp/server/src/services/enrichClusters.test.ts`
- Modify: `mvp/server/src/store/paths.ts` (add enrichments path)
- Modify: `mvp/server/src/store/index.ts` (export store helpers if needed)
- Modify: `mvp/server/src/services/index.ts` (export enrich APIs)
- Modify: `mvp/server/src/index.ts` (`POST /api/enrich`)
- Modify: `mvp/server/package.json` (register new tests)
- Modify: `docs/MVP_API_COMPAT.md` (document route)

- [ ] **Step 1: Define types**

In `mvp/server/src/types/clusterEnrichment.ts`:

```typescript
export type EnrichmentTimelineEvent = {
  date: string;
  content: string;
  date_iso?: string;
};

export type EnrichmentQnA = {
  question: string;
  answer: string;
};

/** Cluster-level Story enrich fields (AI-assisted — not ground truth). */
export type ClusterEnrichmentPayload = {
  talking_points: string[];
  timeline: EnrichmentTimelineEvent[];
  suggested_qna: EnrichmentQnA[];
  /** Optional improved dig summary; adapter may prefer over framing summary. */
  short_summary?: string;
};

export type ClusterEnrichmentRecord = {
  /** Same key as adapter groups: clusterId or `solo:{articleId}` */
  key: string;
  enrichment: ClusterEnrichmentPayload | null;
  enrichedAt: string | null;
  enrichError: string | null;
  model: string | null;
};
```

- [ ] **Step 2: Store**

Mirror `articleStore` patterns in `clusterEnrichmentStore.ts`:
- Path: `mvp/data/cluster-enrichments.json` (array of `ClusterEnrichmentRecord`)
- `readClusterEnrichments()`, `writeClusterEnrichments()`, `upsertClusterEnrichment(record)`, `getClusterEnrichment(key)`
- Missing file → empty array (create on write)
- Gitignored via existing `mvp/data/*.json` rules (do not commit runtime data)

- [ ] **Step 3: Ollama enrichment service**

`ollamaEnrichment.ts`:
- Reuse `getOllamaClient` / `getOllamaModelName` / `resetOllamaClient` from `ollamaFraming.ts` (import public exports; do not duplicate client init)
- Export `buildEnrichmentPrompt(members: EnrichMemberInput[]): string` — **must** contain the substrings `AI-assisted` and `not ground truth`
- Export `parseEnrichmentResponse(raw: string): ClusterEnrichmentPayload` (validate arrays; drop empty strings; timeline items need `date`+`content`; qna needs `question`+`answer`)
- Export `enrichCluster(members: EnrichMemberInput[]): Promise<{ ok: true; enrichment; model; rawText } | { ok: false; error; model; rawText }>`
- Member input: `{ title, snippet, publisherDomain, publishedAt, framingSummary? }` (truncate long snippets)
- Prompt: synthesize only from provided member texts; JSON shape with `talking_points`, `timeline`, `suggested_qna`, optional `short_summary`; no markdown fences

- [ ] **Step 4: Batch orchestration**

`enrichClusters.ts`:
- `enrichUnenrichedClusters({ limit?: number })` — group articles like adapter (`clusterId` or `solo:{id}`), newest clusters first by primary `publishedAt`/`fetchedAt`
- Skip keys that already have `enrichment !== null` (unless `force: true` optional)
- Call `enrichCluster`, upsert record (success or `enrichError`)
- Return `{ limit, attempted, succeeded, failed, keys: string[] }`

- [ ] **Step 5: Route**

`POST /api/enrich` in `index.ts` (session-gated with other mutating APIs):
- Optional `{ limit?: number }` body/query
- JSON response mirror classify: `{ ok, limit, attempted, succeeded, failed, keys }`

Document in `MVP_API_COMPAT.md`.

- [ ] **Step 6: Tests**

`ollamaEnrichment.test.ts`:
- Assert `buildEnrichmentPrompt([...])` includes `AI-assisted` and `not ground truth`
- Assert parse of a valid JSON blob → expected arrays
- Assert parse rejects / soft-handles garbage reasonably (throws or empty with clear error — pick one and test it)

`enrichClusters.test.ts`:
- With mocked `enrichCluster` (dependency injection or module mock), verify unenriched cluster gets upserted and already-enriched is skipped

Register both in `package.json` `"test"` script.

- [ ] **Step 7: Typecheck + commit**

```bash
cd mvp/server && npm test && npm run typecheck
```

```bash
git add mvp/server docs/MVP_API_COMPAT.md
git commit -m "$(cat <<'EOF'
feat(news-51): add cluster enrichment Ollama step and POST /api/enrich

EOF
)"
```

---

### Task 2: Adapter mapping, fixture enrichment, OWNED_BRIEF docs

**Files:**
- Modify: `mvp/server/src/services/kiteBriefAdapter.ts`
- Modify: `mvp/server/src/services/kiteBriefAdapter.test.ts`
- Modify: `mvp/server/src/services/kiteBriefRoutes.ts` (wire enrichment store into story build if routes currently only pass articles)
- Modify: `docs/OWNED_BRIEF.md`

- [ ] **Step 1: Extend `KiteBriefStory`**

Add optional:
```typescript
talking_points?: string[];
timeline?: Array<{ date: string; content: string; date_iso?: string }>;
suggested_qna?: Array<{ question: string; answer: string }>;
```

- [ ] **Step 2: Map enrichment in `articlesToKiteStories`**

Signature becomes:

```typescript
export function articlesToKiteStories(
  articles: Article[],
  options: {
    limit?: number;
    enrichments?: Map<string, ClusterEnrichmentPayload> | Record<string, ClusterEnrichmentPayload>;
  } = {},
): KiteBriefStory[]
```

For each group key, if enrichment exists with non-empty arrays, copy fields onto the story. Prefer `enrichment.short_summary` for `short_summary` when non-empty; else keep existing framing/snippet/title cascade.

Update `buildOwnedStoriesResponse` / routes to `readClusterEnrichments()` and pass a map keyed by `record.key` → `record.enrichment` (skip null enrichment).

- [ ] **Step 3: Fixture**

Extend `ownedBriefFixtureArticles` path so empty-store Brief still demos enrich:
- Either embed a parallel `ownedBriefFixtureEnrichments()` returning a `Map` for `owned-fixture-cluster` with sample `talking_points` (≥2), `timeline` (≥1), `suggested_qna` (≥1)
- Or when `fromFixture`, routes merge fixture enrichments into the lookup map
- Sample talking point text must be distinctive enough for e2e (e.g. include `Owned brief fixture highlight`)

- [ ] **Step 4: Unit tests**

In `kiteBriefAdapter.test.ts`:
- With enrichment map → story has `talking_points`, `timeline`, `suggested_qna`
- Without enrichment → those fields omitted/undefined
- `short_summary` prefers enrichment when provided

- [ ] **Step 5: Docs**

Update `OWNED_BRIEF.md`:
- Document regenerate: after classify, `POST /api/enrich`
- Document story fields `talking_points` / `timeline` / `suggested_qna` from cluster enrichments store
- Note AI-assisted / not ground truth

- [ ] **Step 6: Commit**

```bash
cd mvp/server && npm test && npm run typecheck
git add mvp/server docs/OWNED_BRIEF.md
git commit -m "$(cat <<'EOF'
feat(news-51): map cluster enrichment into owned brief stories

EOF
)"
```

---

### Task 3: Concise expand honesty + e2e smoke

**Files:**
- Modify: `apps/kite/src/lib/components/story/StoryCard.svelte` (minimal: one muted honesty line when enriched sections present)
- Modify: `e2e/kite-smoke.spec.ts`
- Modify: `mvp/SMOKE.md` (enrich step after classify)
- Optional: `docs/OWNED_BRIEF.md` if honesty UI note needed

- [ ] **Step 1: Concise honesty in expand**

In `StoryCard.svelte`, inside the expanded content region **above** `StorySectionManager`, when `displayStory` has any of `talking_points?.length`, `timeline?.length`, or `suggested_qna?.length`, render a single muted line:

Exact copy (use verbatim):

`AI-assisted — not ground truth.`

Styling: existing muted text classes already used in Kite (e.g. `text-xs text-gray-500 dark:text-gray-400 px-4` or match nearby caption styles). No banner, no alert role, no multi-paragraph block.

- [ ] **Step 2: E2E**

In owned-brief smoke (`e2e/kite-smoke.spec.ts`), with empty store / fixture path:
- Assert stories payload includes at least one story with non-empty `talking_points`, `timeline`, and `suggested_qna` (fixture guarantees this when store empty — document that live non-empty stores without enrich skip is OK: if store has articles but no enrichment, skip that assert with `test.skip` only when **no** story has talking_points; prefer asserting when fixture is active)
- Open first story expand and assert visible text `AI-assisted — not ground truth.`

Practical approach matching NEWS-50:
- Always assert API fields when any story has `talking_points`; if none, `test.skip` with reason that enrich fixture/live data missing
- Fixture path (empty `articles.json`) must make the assert pass

- [ ] **Step 3: SMOKE.md**

Add row: after classify, `POST /api/enrich` → inspect cluster-enrichments / brief stories for highlights/timeline/qna.

- [ ] **Step 4: Verify + commit**

```bash
# Ensure mvp/data/articles.json is [] or absent so fixture path is used for e2e
npm run test:kite
# If playwright available in env:
npm run test:e2e:kite
```

```bash
git add apps/kite/src/lib/components/story/StoryCard.svelte e2e/kite-smoke.spec.ts mvp/SMOKE.md docs/
git commit -m "$(cat <<'EOF'
feat(news-51): concise enrich honesty line and e2e smoke

EOF
)"
```

---

## Demo checklist (human)

1. Empty store → Brief expand shows Highlights + Timeline + Q&A + honesty line from fixture.
2. With `OLLAMA_API_KEY`: login → fetch → classify → enrich → reload Brief → live clusters show sections.
3. Transparency page still carries longer methodology honesty (unchanged OK).
