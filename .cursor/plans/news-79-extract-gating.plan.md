# NEWS-79 — Extract gating: spend less on muted / low-value articles

Jira: [NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79) (Story, follows NEWS-78).
Spec: the NEWS-79 ticket plus the operator's gate decisions below (grilled 2026-09-27). No separate spec file.

## Goal

`POST /api/claims/extract` burns Ollama (propose) + TypeSafe (judge) tokens on articles the operator has already vetoed via shared mute rules, and batch mode spends its `limit` on sensor-tier articles before primaries. Stop both.

## Operator decisions (binding)

1. **Mute gate — ships.** Articles matching shared mute rules (`mvp/data/mute-rules.json`, same rules Radar/Brief use) are skipped in **every** mode: batch and explicit `articleIds`. Mute is already a global veto on Radar and Brief.
2. **Tier order — primary first.** Batch mode (no `articleIds`) selects **primary-tier** articles first (newest first), then fills with sensors (newest first) under `limit`. This supersedes the NEWS-73 "sensors first" ruling.
3. **Not shipping:** low-value text gate, Radar "Extract claims" button, default-limit / cap changes. `DEFAULT_BATCH_LIMIT` stays `10`; no cap or confirm flag.

## Global Constraints

- Product path unchanged otherwise: Kite + `mvp/server`; no Supabase; no `_legacy/` changes.
- TypeSafe stays judgment-of-record; Ollama proposes only. Do not change propose/judge logic, thresholds, or persistence.
- Mute matching MUST reuse `articleMatchesMute(article, rules)` from `mvp/server/src/services/muteMatch.ts` — no new matcher.
- Mute rules are read **once per extract run**, via the store's `readMuteRules` (default path `MUTE_RULES_PATH`).
- A muted article is **not** marked extract-processed (so un-muting makes it eligible again) and does **not** consume a `limit` slot.
- `force: true` does **not** bypass the mute gate (force only re-processes already-processed articles).
- Explicit `articleIds` keep their given order (existing locked ruling), minus muted and (unless `force`) processed ones.
- New result/response field name is exactly `skippedMuted` (number): count of otherwise-eligible articles (passed the manual/processed filters) excluded by mute rules during selection. In explicit mode, only ids examined before `limit` was reached count.
- Tests must never read the real `mvp/data/mute-rules.json`.
- Strict TypeScript; `npm run typecheck` and `npm test` in `mvp/server` must pass.

## Files

- Modify: `mvp/server/src/services/extractClaims.ts`
- Modify: `mvp/server/src/services/extractClaims.test.ts`
- Modify: `mvp/server/src/app.ts` (extract route response)
- Modify: `mvp/server/src/app.test.ts` (two `extractClaimsFromArticles` stubs + response assertion)
- Modify: `docs/MVP_API_COMPAT.md`, `docs/CLAIMS_DISCERNMENT.md`

---

### Task 1: Mute gate + primary-first selection in extract service and route

**Where:** `mvp/server` only. Commands run from `mvp/server/`.

**`src/services/extractClaims.ts`:**

1. Options: add
   - `muteRulesPath?: string` (default `MUTE_RULES_PATH` from `../store/paths.js`)
   - `readMuteRulesFn?: (mutePath?: string) => Promise<MuteRulesStore>` (default `readMuteRules` from `../store/index.js`; import the `MuteRulesStore` type from `../store/muteRulesStore.js`)
2. Result type `ExtractClaimsResult`: add `skippedMuted: number` (place after `articlesProcessed`). Initialize from selection.
3. In `extractClaimsFromArticles`, read mute rules once (`(await readMuteRulesFn(muteRulesPath)).rules`) before selection and pass them into `selectArticles`.
4. `selectArticles` returns `{ articles: Article[]; skippedMuted: number }`.
   - Explicit `articleIds` mode: keep existing loop (order, dedupe, manual exclusion, `limit` break, processed check unless `force`). After the processed check, if `articleMatchesMute(article, rules)` → increment `skippedMuted` and `continue` (no slot consumed).
   - Batch mode: keep newest-first sort and manual exclusion. For each article: processed check unless `force` (unchanged), then mute check (`skippedMuted++`, `continue`), then bucket by tier. Return `primaries.concat(sensors).slice(0, limit)`.
   - Replace the "Locked ruling: … prefer sensors first" comment with one stating NEWS-79: batch prefers primaries first, then sensors.
5. No other behavior changes (propose/judge/persist/queue/mark-processed untouched).

**`src/services/extractClaims.test.ts`:**

1. `tempStorePaths()` also returns `muteRulesPath: path.join(dir, 'mute-rules.json')` (file not created → empty rules). Every existing test already spreads `...paths`, so all tests stop touching real data. Verify no existing test bypasses `tempStorePaths()`; if one does, give it a temp `muteRulesPath` too.
2. Replace `extractClaims: batch selection prefers sensors before primaries` with `extractClaims: batch selection prefers primaries before sensors` — same three fixtures, `limit: 2`, expect propose calls `['primary: newer', 'sensor: newer']`.
3. Add `extractClaims: batch selection takes all primaries (newest first) before any sensor` — two primaries (older/newer) + one newer sensor, `limit: 2` → the two primaries, newest first.
4. Add mute tests, injecting `readMuteRulesFn: async () => ({ rules: [...], updatedAt: null })` with rules shaped `{ id, keyword, source, createdAt }`:
   - `extractClaims: batch skips muted articles without consuming limit or marking processed` — rule keyword `ceasefire` (source `null`); a newer primary whose title contains `Ceasefire` (mixed case) + an older clean article; `limit: 1` → propose called only for the clean article; `result.skippedMuted === 1`; `result.attempted === 1`; mark-processed never receives the muted id.
   - `extractClaims: explicit articleIds skip muted articles` — `articleIds: [mutedId, cleanId]` → only clean proposed; `skippedMuted === 1`.
   - `extractClaims: force does not bypass mute` — `force: true`, processed-check returns `true` for all; muted article not proposed, clean one is; `skippedMuted === 1`.
   - `extractClaims: mute rule with non-matching source does not skip` — rule `{ keyword: 'border', source: 'other.com' }` vs default fixture (title contains "border", publisher `publisher.com`) → article proposed; `skippedMuted === 0`.
5. Keep existing assertions passing; if any test compares the whole result object, add `skippedMuted: 0`.

**`src/app.ts`:** in the `POST /api/claims/extract` handler JSON, add `skippedMuted: result.skippedMuted` right after `articlesProcessed`.

**`src/app.test.ts`:** both `extractClaimsFromArticles` stubs (the 401 test near line 671 and the ok-payload test near line 865) gain `skippedMuted` (use `0` in the 401 stub, `2` in the ok stub). In the ok-payload test add `skippedMuted: number` to the body type and `assert.equal(body.skippedMuted, 2)`.

**TDD:** write/adjust the extractClaims tests first and show them failing (RED), then implement (GREEN).

**Verify:**
- `node --import tsx --test src/services/extractClaims.test.ts`
- `node --import tsx --test src/app.test.ts`
- `npm run typecheck`
- `npm test` (full suite once before committing)

**Commit:** one commit, subject `NEWS-79: skip muted articles and prefer primaries in claim extract`.

---

### Task 2: Docs for extract gating

Docs only; no code.

1. `docs/MVP_API_COMPAT.md`, `POST /api/claims/extract` row: response shape gains `skippedMuted` (after `articlesProcessed`); replace the "selects **sensor-tier articles first**, then fills with primaries … ([NEWS-73]…)" sentence with: batch mode selects **primary-tier articles first**, then fills with sensors under `limit` ([NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79)); articles matching shared mute rules are skipped in all modes (including explicit `articleIds` and `force`), are not marked processed, and are counted in `skippedMuted`. Keep the rest of the row intact.
2. `docs/CLAIMS_DISCERNMENT.md`: in the bullet that mentions `POST /api/claims/extract` (NEWS-72), append one sentence: extract skips articles matching shared mute rules and spends batch `limit` on primary-tier sources first ([NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79)).
3. Do not edit `docs/ROADMAP.md` or `AGENTS.md` (ship loop updates those at close).

**Verify:** `rg -n "sensor-tier articles first" docs/` returns nothing; `rg -n "skippedMuted" docs/MVP_API_COMPAT.md` returns the row.

**Commit:** `NEWS-79: document extract mute gate and primary-first batch`.
