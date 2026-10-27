# NEWS-173 court-record checks

Spec: `.cursor/plans/news-173-court-citations-spec.md` (binding).

**Approach:** SDD. Controller plans and reviews only and writes no task code (NEWS-179). Every task goes to an implementer subagent.

**Branch:** `cursor/news-173-court-record-checks-13cd`.

## Global Constraints

- Clean-room. Do not open, copy, or port CaseCite or Eyecite. Parse the reporter allowlist below; send citation text to CourtListener's citation-lookup API. Do not add an npm dependency. `global fetch` is the HTTP client.
- No live CourtListener call from tests or CI. Production `fetch` throws if `process.env.NODE_TEST_CONTEXT` is set. Tests pass a `fetchImpl`.
- Never log, throw, or persist `COURTLISTENER_API_TOKEN`. If an error string contains the token, replace it with `[redacted]` before `console.warn`.
- Never block refresh or on-demand generation. Guard failures `console.warn` and mark affected items. They do not return `[]` for a thrown check (fail closed).
- No new reader-facing terminal status. Status stays `match | mismatch | missing-source`. Display stays `ok | unverified | unconfirmed`.
- `mismatch` and `missing-source` still display the same for URLs: **unverified**. The URL resolver still returns only `match` or `missing-source`. Say so in the DECISIONS entry (Task 5).
- Do not commit `mvp/data/*.json`, `.env`, or secrets. Do not edit `CHANGELOG.md`. Do not edit `docs/VISION.md` (direction unchanged). Do not edit `.cursor/environment.json` (no new dependency).
- Imports stay at the top of the file. Switches on unions get a `never` default.
- TDD: write the failing test, then the code, per task. Run the focused `node --test` / bun test for files you touch. Do not start the dev server.
- Informed-brain MCP is out. T4 (wider Google News hosts) is out.

## CourtListener (from the live docs, 2026-10-27)

`POST https://www.courtlistener.com/api/rest/v4/citation-lookup/`

- Header `Authorization: Token <token>`. Body `application/x-www-form-urlencoded` with `text` (a block of citation text) or `volume`, `reporter`, `page`.
- Hit fields we read: `citation`, `normalized_citations`, `status` (200, 404, 400, 300, 429), `error_message`, `clusters[]`.
- Cluster fields we read: `absolute_url`, `case_name`, `syllabus` (optional string), `docket` (optional string URL or `{ absolute_url }`).
- A path-only `absolute_url` is prefixed with `https://www.courtlistener.com`.
- HTTP 429 JSON may include `wait_until` or the documented typo `wait_util` (ISO-8601).
- Limits: 60 valid citations per minute; 250 citations per request; 64,000 characters. One lookup POST per article. If the joined text would exceed 64,000 characters, send only the prefix that fits and mark the dropped cites Unverified.
- Docket resolve: `GET https://www.courtlistener.com/api/rest/v4/dockets/{id}/` where `{id}` is the first numeric segment of a `/docket/{id}/` or `/recap/{id}/` path. Opinion URLs (`/opinion/{id}/`) are already the record: do not GET; treat the URL as resolved with `procedural: false` and `text` equal to the URL (no body). Docket JSON fields we read: `absolute_url`, `case_name`, `cause` (optional string).

Procedural (case-insensitive) when the blob (`syllabus`, else `cause`, else `case_name`) matches:

- `dismissed for lack of standing`, `lack of standing`, `want of standing`
- `dismissed as untimely`, `time-barred`, `statute of limitations`
- `lack of jurisdiction`, `want of jurisdiction`, `for lack of subject-matter jurisdiction`, `for lack of personal jurisdiction`

A merits sentence such as “The judgment is affirmed.” is not procedural. If any cluster on a 200 or 300 hit is procedural, the item is procedural. Register the first cluster as the source. Status 300 is still `match` when at least one cluster exists.

Status map: 200 or 300 with a cluster → resolved. 404, 400, empty clusters, item-level 429, HTTP 429 after one backoff, timeout, or no token → unresolved → `missing-source` / **unverified**.

Backoff: one retry. Sleep until `wait_until` / `wait_util` when that instant is within 60 seconds. Otherwise do not sleep; mark Unverified. Timeout is 10 seconds (`AbortSignal.timeout(10_000)`).

## Reporter allowlist and docket URLs

A reporter cite is `volume + reporter + page` with this reporter alternation (whitespace flexible where the pattern shows `\s`):

`U.S.` | `S. Ct.` | `L. Ed.` | `L. Ed. 2d` | `F.2d` | `F.3d` | `F.4th` | `F. Supp.` | `F. Supp. 2d` | `F. Supp. 3d` | `S.E.2d` | `N.E.2d` | `N.E.3d` | `P.2d` | `P.3d` | `So. 2d` | `So. 3d` | `A.2d` | `A.3d` | `Cal.` | `Cal. 2d` | `Cal. 3d` | `Cal. 4th` | `Cal. 5th` | `Cal. App.` | `N.Y.` | `N.Y.2d` | `N.Y.3d`

Volume is 1–4 digits. Page is 1–5 digits. Example that must match: `598 U.S. 651`, `576 U.S. 644`. Example that must not match: `Students for Fair Admissions v. Harvard`.

A court URL has host `courtlistener.com` or `www.courtlistener.com` and a path starting with `/docket/`, `/recap/`, or `/opinion/`.

Normalized cite key: collapse internal whitespace to a single space and trim. Example: `598  U.S.  651` → `598 U.S. 651`.

## URL equivalence (G1 / T6)

`normalizeCitationUrl` comparison key:

- trim; unparseable → trimmed string
- `http` and `https` compare as `https`
- hostname already lowercased by `URL`
- drop a trailing slash on a non-root path
- drop query keys that start with `utm_` (case-insensitive)
- leave every other query key
- this key is what URL matching and URL `itemId`s use

`https://publisher.example/story/` and `http://publisher.example/story?utm_source=brief` match `https://publisher.example/story`.

## Check-log scope (G3 / T1)

`CitationCheckLogEntry.scope` is `'summary' | 'story'`.

`RunCitationGuardArgs.scope` is required. `briefSummaries.ts` passes `'summary'`. `briefFullStories.ts` passes `'story'`.

Merge: drop prior entries whose `scope` is one of the scopes in the incoming batch and whose `itemId` is not in the incoming batch. Keep prior entries from other scopes. Same `itemId` is replaced by the incoming entry. Entries with no `scope` (legacy) stay until the 7-day prune unless the same `itemId` is replaced. Summary marks therefore survive a story regenerate, and a story item removed on the next story regenerate does not linger.

## Fail closed (G2 / T7)

If `checkCitationItems` throws, `console.warn` and return one `missing-source` result per input item (`unconfirmed` for `claim`, `unverified` otherwise), and persist that log. Do not return `[]`.

If source registration throws, `console.warn` and still run the check with the sources already in hand (or none). Do not return `[]`.

## Claim identity (G1 / T5)

Claim `itemId` is `claim:` plus sha256-16 of `normalizedRefutingUrl + "\n" + claimText` (empty string when a part is missing). Two claims that share a refuting URL and differ in text get different ids.

## Court fields

On `CitationCheckItem` / result / log entry, all optional:

- `citation`, `volume`, `reporter`, `page` (strings)
- `courtRecordUrl` (the CourtListener record; original link stays on `url`)
- `procedural` (boolean) on the result, the log entry, and `CitationSourceRecord`

Court `itemId`: `court:` plus sha256-16 of the normalized cite, else of the normalized court URL, else `court:court`.

`citationMarksForStory` includes an entry when `display !== 'ok'` **or** `procedural === true`. Pass `courtRecordUrl` and `procedural` through to `informed_citation_marks`.

## Task 1: NEWS-172 guard fixes

Files: `mvp/server/src/types/citationGuard.ts`, `mvp/server/src/services/citationGuard/runCitationGuard.ts`, `mvp/server/src/services/citationGuard/resolvers/urlResolver.ts`, `mvp/server/src/store/citationCheckLogStore.ts`, `mvp/server/src/store/citationSourcesStore.ts`, `mvp/server/src/services/briefSummaries.ts`, `mvp/server/src/services/briefFullStories.ts`, and the matching tests. No UI. No CourtListener.

Failing tests first:

1. Two `kind: 'claim'` items with the same `refutingUrl` and different `claimText` get different `citationCheckItemId`s. Update any test that hashed only the URL.
2. `normalizeCitationUrl` / `resolveUrlCitation`: trailing slash, `http` vs `https`, and `utm_*` match the same source. A non-`utm` query still distinguishes URLs. `displayForUrlStatus` maps both `mismatch` and `missing-source` to `unverified` (add a direct assertion if one is missing).
3. `runCitationGuardForArticle`: when `checkCitationItems` throws, the result list has one unverified (or unconfirmed, for a claim) entry per item, `console.warn` was called, and the log was written. `registerSourcesAndRunCitationGuard` still checks items when `registerCitationSources` throws.
4. A second `'story'` run that omits an item drops that story entry and keeps a `'summary'` entry. Update the existing merge test so the summary call passes `scope: 'summary'` and the story call passes `scope: 'story'`; both ids still remain. Then add the drop test.
5. `updateCitationSources`: a mutate that inserts `https://news.google.com/rss/articles/abc` does not leave that record on disk. `registerCitationSources` behavior stays as it is.

`RunCitationGuardArgs` requires `scope`. Thread it onto each log entry inside `citationCheckResultToLogEntry` via the args (the result itself need not carry scope). Call sites in the summary and full-story services pass the scopes above. Existing `runCitationGuardForArticle` tests must pass a scope so they typecheck; use `'story'` unless the test is about summary.

Do not change court resolution in this task. The court stub stays.

Commit: `fix(NEWS-173): citation guard identity, URL key, fail-closed, and stale marks`.

## Task 2: court item extraction

Files: `mvp/server/src/types/citationGuard.ts` (court fields on the item), `mvp/server/src/services/citationGuard/extractCitationItems.ts` and its test. Extraction only. No network.

Failing tests first, using the allowlist above:

- Summary text `The Court held in 598 U.S. 651 that the program fell.` yields one `kind: 'court'` item with `citation: '598 U.S. 651'`, `volume: '598'`, `reporter: 'U.S.'`, `page: '651'`.
- The same text also still yields no claim. A normal `https://publisher.example/a` in the same string is still `kind: 'url'` and not `kind: 'court'`.
- `Students for Fair Admissions v. Harvard` alone yields no court item.
- `https://www.courtlistener.com/docket/67590963/students-for-fair-admissions-v-harvard/` yields a court item whose `url` is that URL (trailing sentence punctuation stripped, same as other URLs) and a separate `kind: 'url'` item for the same href.
- `https://www.courtlistener.com/opinion/2812209/obergefell-v-hodges/` and a `/recap/` URL on `courtlistener.com` are court items. `https://example.com/docket/1` is not.
- Pull quote, perspectives, talking points, timeline, and `changeSummary` are scanned the same way as today. A reporter cite inside a talking point is a court item.
- Non-court text yields no court item.

Court items are deduped by normalized cite or normalized URL. Do not remove existing url, quote, or claim extraction.

Commit: `feat(NEWS-173): extract reporter cites and CourtListener docket URLs`.

## Task 3: CourtListener client and cache

New files under `mvp/server/src/services/citationGuard/`:

- `courtListenerClient.ts` + `courtListenerClient.test.ts`
- `courtCacheStore.ts` + `courtCacheStore.test.ts` (or colocate cache in the store folder `mvp/server/src/store/citationCourtCacheStore.ts` and export it from `mvp/server/src/store/index.ts`)
- recorded fixtures as JSON next to the tests, not under `mvp/data/`

Cache file path: add `CITATION_COURT_CACHE_PATH` in `mvp/server/src/store/paths.ts` → `citation-court-cache.json` under `DATA_DIR`. Shape: `{ entries: Record<string, { key, fetchedAt, hit }>, updatedAt }`. `key` is the normalized cite or the normalized docket/opinion URL. Use `enqueueFileWrite` / `writeJsonAtomic`. `pruneCitationCourtCacheOlderThan(now, 7)` drops entries whose `fetchedAt` is older than 7 days. Wire that prune into `mvp/server/src/services/briefRetention.ts` next to the other citation prunes, and extend `briefRetention.test.ts` the same way those prunes are stubbed. A missing cache file reads as empty. Malformed entries are dropped.

`lookupCourtCitations` (name this) accepts the court items, `runId`, `now`, `articleId`, `token`, optional `fetchImpl`, optional `sleep`, optional cache path. It returns attachments keyed by `citationCheckItemId` plus `CitationSourceRecord`s to register (do not register them here; Task 4 does).

Failing tests first, fixtures only:

- Token `test-token-do-not-log`. A fixture for `576 U.S. 644` returns status 200, `absolute_url` `https://www.courtlistener.com/opinion/2812209/obergefell-v-hodges/`, `case_name` `Obergefell v. Hodges`, syllabus `The judgment is affirmed.` → attachment resolved, `procedural: false`, source text is that syllabus, source url is that absolute URL, source `runId` is the one passed in.
- `1 U.S. 200` fixture status 404 and `clusters: []` → attachment unresolved, no source.
- Several reporter cites in one call → exactly one POST to `/api/rest/v4/citation-lookup/` with those cites in `text`. Authorization header is `Token test-token-do-not-log`. A second call for the same cite uses the cache and does not call `fetchImpl`.
- HTTP 429 with `wait_until` two seconds ahead, then a 200 on retry → one sleep of about 2000 ms and a resolved attachment. Inject `sleep` and do not actually wait.
- `fetchImpl` that aborts / times out → unresolved, and `console.warn` was called.
- `token` null or `''` → `fetchImpl` is not called; every court item is unresolved.
- `fetchImpl` rejects with `Error` whose message includes `test-token-do-not-log` → the `console.warn` argument string does not contain that token.
- A docket fixture GET for id `67590963` with `cause: 'Dismissed for lack of standing.'` → resolved, `procedural: true`, source url is the docket `absolute_url`.
- An `/opinion/` URL does not GET; it resolves with `procedural: false`.
- Cache entry older than 7 days is pruned and is not reused.

Header and body must not be written into the cache hit if they contain the token. Cache the parsed hit only.

Commit: `feat(NEWS-173): CourtListener citation lookup client and 7-day cache`.

## Task 4: court resolver and procedural claims

Files: `mvp/server/src/services/citationGuard/resolvers/courtResolver.ts` and its test, `registry.ts` if the court resolver signature must accept the attachment, `resolvers/claimResolver.ts` and its test, `runCitationGuard.ts` and its test. Use `lookupCourtCitations` from Task 3. No UI.

`resolveCourtCitation` is still synchronous and does no I/O.

- Attachment resolved → `status: 'match'`, `display: 'ok'`, `courtRecordUrl` set, `procedural` copied, original `url` kept when the item had one.
- Attachment missing, unresolved, or no token → `status: 'missing-source'`, `display: 'unverified'`, `procedural` omitted or false.
- The registry still maps `court` to this function. Delete the stub behavior that always returns missing-source.

`runCitationGuardForArticle` before `checkCitationItems`:

1. Call `lookupCourtCitations` for items with `kind: 'court'` (injectable dep; default the real function). Pass `process.env.COURTLISTENER_API_TOKEN` trimmed, or null when unset/blank.
2. `registerCitationSources` for returned sources (injectable). A procedural source has `procedural: true`.
3. Those sources are included in the list passed to `checkCitationItems` (append to `sourcesForRun` for this call).
4. Pass each attachment into the court item the resolver sees (a shallow copy; do not mutate the caller’s array).

Claim resolver: a source with `procedural: true` does not count as a match. If every URL match is procedural, the claim is `missing-source` / `unconfirmed`. A non-procedural source with the same URL still matches. URL resolver still matches a procedural source (the link is real).

Failing tests first:

- Resolved fixture attachment → `match` / `ok`, and `registerCitationSources` received a record whose `url` is the CourtListener URL and whose `text` is the syllabus.
- A claim whose `refutingUrl` is that CourtListener URL then resolves `match` / `ok` in the same `runCitationGuardForArticle` call.
- The same claim against a procedural source resolves `unconfirmed`, and the court item itself is `match` with `procedural: true`.
- Unknown cite → court item `unverified`. Lookup throw → fail closed unverified court items (`console.warn`), not `[]`.
- No token → lookup dep is invoked in a way that performs no fetch (the Task 3 function), court items unverified.

Commit: `feat(NEWS-173): resolve court cites and refuse procedural refutations`.

## Task 5: marks, e2e, docs, bun install

Reader copy (exact):

- Unresolved court cite visible label: `Unverified citation`. Accessible name: `Unverified citation (advisory)`.
- Procedural note, visible and in the accessible name: `Dismissed on procedure, not on the merits`.
- Expander detail for an unverified link or quote: `This did not match a source from this run.`
- Expander detail for unconfirmed: `No linked refuting source from this run.`
- Extra link text, only when `courtRecordUrl` is non-empty and different from `url`: `CourtListener record` (a real `<a href>`).

Files: `apps/kite/src/lib/types.ts` (`InformedCitationMark` gains optional `courtRecordUrl` and `procedural`), `apps/kite/src/lib/topicBrief.ts`, `apps/kite/src/lib/components/brief/CitationGuardMarks.svelte`, `apps/kite/src/lib/components/brief/__tests__/CitationGuardMarks.test.ts`, `mvp/server/src/services/kiteBriefAdapter.ts` and its citation-mark test, `e2e/kite-smoke.spec.ts`, `e2e/stack/scenarios.mjs`.

The mark control is a `<button>` with `aria-expanded` and `aria-controls`. Enter and Space toggle it (native button). The panel is in the existing polite region (`role="region"`, not `aria-live="assertive"`). `visibleCitationMarks` shows `unverified`, `unconfirmed`, and any mark with `procedural === true` even when `display` is `ok`. `ok` without procedural stays hidden.

Failing component tests first: unresolved court label and accessible name; procedural note is shown and named; the CourtListener link is present only when the URLs differ; a mark button exposes `aria-expanded="false"` and becomes `true` after a click.

E2E: extend the existing citation-guard seeds and the smoke assertions. Cover four seeded marks on the hermetic brief (no network): a resolved procedural court mark (the dismissal note, keyboard-focusable, Enter opens the panel), an unresolved court mark (`Unverified citation`), a docket mark whose panel contains `CourtListener record`, and a no-token-style unresolved court mark (same Unverified citation label; the seed is the skip outcome). Add a server assertion in the Task 3/4 tests if the no-token fetch skip is not already asserted — do not duplicate if Task 3 already covers it. Run `cd apps/kite && bun run test:unit` for the component test. Run the citation portion of e2e if the stack starts; if it cannot, say so in the report and still land the spec.

Docs, same commit or a following docs commit on this branch:

- `docs/DECISIONS.md`: newest entry dated 2026-10-27 titled for the NEWS-173 grill. Record citation scope (reporters and CourtListener/RECAP URLs only; display scope only), unresolved → Unverified, procedural flag (not a new status, never a refutation), token location, cache file and 7-day retention, URL equivalence (trailing slash, http/https, `utm_*`; mismatch and missing-source still both unverified), fail closed, T8 bun choice, T4 deferred. Link NEWS-173.
- `docs/BRIEF.md`: `citation-court-cache.json`, 7-day retention, `COURTLISTENER_API_TOKEN`, court marks. Update the citation-guard section so it is no longer “deferred to NEWS-173”.
- `docs/TRIAGE.md`: one sentence that court checks run in the same guard step and never block refresh. No pipeline reorder.
- `docs/PRODUCT_SPEC.md`: scenarios for an Unverified court citation and for “Dismissed on procedure, not on the merits”. Plain language. Also say that equivalent links (same page with or without a tracking tag) are not marked Unverified just for that difference, and that a citation mark that no longer applies is not left on the card. Bump **Last checked** only if you also change scenarios (you will).
- `docs/WHATS_NEW.md`: newest entry dated 2026-10-27 describing the court marks and the user-visible guard fixes (fewer false Unverified links; stale marks cleared). No ticket-key list.
- `docs/ROADMAP.md`: mark NEWS-173 Done (combined-order item 5 and row 76). **Current next** becomes NEWS-168. Update the “Current next” sentence near the hosting section the same way NEWS-172’s row was updated.
- `AGENTS.md`: the “Current next” sentence points at NEWS-168, then NEWS-169, and names NEWS-173 as Done.
- `mvp/.env.example`: `COURTLISTENER_API_TOKEN=` with a one-line comment that it is optional, server-only, and never committed. Empty skips court checks.
- `.cursor/install-deps.sh`: remove the `curl | bash` bun install. If `bun` is missing, exit 1 with stderr `install bun 1.4.3`. Do not download bun. Leave `.cursor/environment.json` unchanged.

Do not file Jira tickets. Do not add informed-brain files.

Commit: `feat(NEWS-173): show court citation marks and record the grill`.
