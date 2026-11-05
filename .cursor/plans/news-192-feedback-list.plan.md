# NEWS-192 — /feedback list, citation links, E2E

Spec: Jira NEWS-192 (In Progress). Approach: SDD. Builder: Cursor.
Parent context: NEWS-169 (store + `/api/feedback`), NEWS-190 (`feedback:<id>` citation in triage), NEWS-191 (Like / Not relevant on cards, merged `a212d92`, PR #233).

## Grill (binding — Phil's launch prompt took every recommended answer)

Record these questions and answers in `docs/DECISIONS.md` and in the PR body. Do not reopen them.

1. **Where the link lives.** In the Brief refresh bar, immediately after the Filtered out link. One place. Label `Feedback`, `href="/feedback"`, `data-testid="brief-feedback-link"`. Not in the footer. Not on Topics.
2. **Edit UX on the list.** The same toggle and comment box as `FeedbackButtons`: `Like` / `Not relevant` with `aria-pressed`, comment label `Comment (optional)`, `maxlength` 500, live `{n} / 500` counter, Save / Cancel, the server's 4xx text inline, a generic line for 5xx. See the list-page ruling below for how delete differs.
3. **Delete confirm.** Inline `Delete?` with buttons `Yes` and `No` inside the entry. No `window.confirm` and no modal.
4. **Citation for a deleted entry.** Keep the advisory reason text. Replace the `feedback:<id>` link with plain `feedback removed`. Decide that from the one shared `GET /api/feedback` result. No extra request per citation.
5. **Highlight on `/feedback#<id>`.** Scroll the entry into view, focus it, add class `feedback-highlight`. The class animates briefly. Under `prefers-reduced-motion: reduce`, do not animate: keep a static background and scroll with `behavior: 'auto'`.
6. **Ordering and paging.** Newest first, which `GET /api/feedback` already returns. Render that order. No paging and no "Load more". One entry per item keeps the list small. Do not file a paging ticket.

### List-page ruling

`FeedbackButtons` stays the card control. Do not add props to it and do not share its module cache. The list is a self-contained component that only calls `/api/feedback`.

On a list entry the pressed button does **not** delete. Switching the other button PATCHes `{ signal }` and opens the comment box prefilled, same as a card switch. `Edit comment` opens that same box without changing the signal, because the list must change a comment in place. Save PATCHes `{ comment }`. Cancel closes with no request. The only removal is `Delete` → `Delete?` → `Yes` (DELETE) or `No` (close the confirm). This is the grill's "exactly like on a card" for the controls, with the ticket's confirmed delete as the only removal.

## Global constraints

- Reuse `GET/POST/PATCH/DELETE /api/feedback`. No server route or store change unless a test proves a field is missing. Do not add one.
- Do not change the triage prompt, `buildTriageQuestions`, or `TRIAGE_JEV_BUDGET` (300). Do not edit `mvp/server/src/services/triageJev.ts` or `triageConfig.ts`.
- SPA-portable for NEWS-170: the new page only calls `/api/feedback`. No new `$lib/stores` store. No new dependency. No `mvp/server` import from Kite.
- Not relevant never mutes. Less like this stays as it is.
- Svelte 5 runes. Imports at the top of the module. No inline imports.
- Do not edit `.github/workflows`. Do not commit `mvp/data`, `.env`, or secrets.
- Branch is `cursor/news-192-feedback-list-4795`. Commit on that branch. Do not push. Do not open a PR. Do not merge.
- Commit subject for implementation commits: `feat(NEWS-192): feedback list page, citation links and E2E`
- VISION.md stays unchanged. News Desk Bot, in-app blocklist editing, NEWS-178, and NEWS-170 are out of scope.

## Task 1: Citation links in advisory reasons

`feedback:<id>` inside a Filtered (and Approved) advisory reason becomes a link. Other `criteriaRef` values stay plain text.

### Files

- Create `apps/kite/src/lib/components/brief/FeedbackCriteriaLink.svelte`
- Edit `apps/kite/src/lib/components/brief/VerdictReasonExpander.svelte` so a `criteriaRef` matching `/^feedback:(.+)$/` renders `FeedbackCriteriaLink` instead of the mono span. The reason paragraph is unchanged. Non-matching refs, including absent, stay the current mono text.
- Create `apps/kite/src/lib/components/brief/__tests__/FeedbackCriteriaLink.test.ts`
- Extend `apps/kite/src/lib/components/brief/__tests__/VerdictReasonExpander.test.ts` with one case: `criteriaRef: 'feedback:fb-1'` renders a link, and `topic:e2e-topic-grid` still renders plain text.

### Behavior

- `<script module>` holds one shared load, same shape as `FeedbackButtons`' `loadOnce`: first caller `GET /api/feedback` with `credentials: 'include'`. Later callers on the page await that promise. Export `resetFeedbackCriteriaCache()` for tests.
- Parse entries leniently. An entry counts when `id` is a string. Ignore malformed rows.
- While the load has not finished, render the raw `feedback:<id>` as text (not a link, not "feedback removed").
- When the load succeeds and the id is present: an anchor, visible text `feedback:<id>`, `href={"/feedback#" + id}`, `data-testid="feedback-criteria-link"`.
- When the load succeeds and the id is absent: `<span data-testid="feedback-criteria-removed">feedback removed</span>`. Not a link.
- When the load fails (network or non-OK): leave the raw `feedback:<id>` as text. Do not say removed.
- Two mounted links cause one GET. Assert that in the unit test.
- Do not fetch during SSR module init. Fetch from `onMount` (or the shared promise started from `onMount`).

### Tests (vitest, failing first if you can)

- Link when the id is in the GET body.
- `feedback removed` when the GET body has other entries but not this id. Reason text is not this component's job.
- Raw text, no link and no "feedback removed", when GET returns 500.
- Two components, one `fetch` call.

Run: `cd apps/kite && bun run test:unit -- src/lib/components/brief/__tests__/FeedbackCriteriaLink.test.ts src/lib/components/brief/__tests__/VerdictReasonExpander.test.ts`

## Task 2: /feedback page and the refresh-bar link

### Files

- Create `apps/kite/src/lib/components/feedback/FeedbackList.svelte` (self-contained; only `/api/feedback`).
- Create `apps/kite/src/lib/components/feedback/__tests__/FeedbackList.test.ts`
- Create `apps/kite/src/routes/feedback/+page.svelte` — thin page: `<svelte:head>` title `Feedback — Informed News`, product name, `<h1>Feedback</h1>`, short line that these are soft signals and not mutes, then `<FeedbackList />`. Match the filtered page shell (font, `max-w-3xl`, back link to `/` labelled `Back to Brief`).
- Edit `apps/kite/src/lib/components/brief/BriefRefreshBar.svelte`: after the Filtered out anchor, a separator dot (same `aria-hidden` dot already used) and the Feedback link.
- Extend `BriefRefreshBar.test.ts`: the link is named `Feedback`, href `/feedback`, test id `brief-feedback-link`.

### List behavior

- `onMount`: one `GET /api/feedback` with `credentials: 'include'`.
- 401: `Log in on Topics to see feedback.` linking to `/topics`. `role="alert"`.
- Other failure: `Could not load feedback. Try again.` `role="alert"`.
- Empty `entries`: `No feedback yet.`
- Render `entries` in response order (newest first from the server). Do not re-sort. No paging control.
- Each entry is `<article id={entry.id} data-testid="feedback-entry" tabindex="-1" aria-labelledby={headingId}>`.
  - Headline from `snapshot.headline` (the heading).
  - Source from `snapshot.source`.
  - The story link is `snapshot.url` (new tab, `rel="noopener noreferrer"`).
  - Topic names from `snapshot.topics`, joined with `, `, omitted when empty.
  - Saved comment as text when the box is closed and comment is non-empty.
  - Time: `<time datetime={entry.ts}>` using `formatTimeAgoShort` from `$lib/topicBrief`. If that returns null, show the ISO string.
- Choice controls, copy `FeedbackButtons` classes and rules:
  - Group `aria-label="Feedback on this story"`.
  - `Like` and `Not relevant`, `aria-pressed` from `signal`.
  - Other signal: `PATCH /api/feedback/:id` body `{ signal }`, then open the comment box prefilled with the saved comment.
  - Pressed signal: do not DELETE. Leave it pressed.
  - `Edit comment` opens the box prefilled.
  - Box: label `Comment (optional)`, `maxlength="500"`, `aria-describedby` the counter, counter `{n} / 500` with `aria-live="polite"`, Save and Cancel.
  - Save: `PATCH` `{ comment }`, close the box, show the new comment.
  - Cancel: close, no request, typed draft discarded.
  - 4xx with `error` string: show that string in `role="alert"`, keep the draft.
  - 5xx or a non-string error: `Could not save feedback. Try again.`
  - `pending` disables the buttons.
- Delete:
  - Button name `Delete`.
  - Click shows `Delete?` and buttons `Yes` and `No` in `role="group"` `aria-label="Delete this feedback?"`. Hide the first Delete button while the confirm is open.
  - `No` closes the confirm, no request.
  - `Yes` sends `DELETE /api/feedback/:id`. On `{ ok: true }`, remove the article from the list. On failure, show the same error rules and leave the entry.
- Keydown inside the entry stops propagation so Brief shortcuts cannot fire if this component is ever mounted under the Brief. Escape while the box is open cancels. Escape while confirm is open is `No`.
- Hash: read `page` from `$app/state`. When `page.url.hash` is `#` + an entry id that is in the list, `scrollIntoView` and `focus()` that article and set `feedback-highlight`. Re-run when the hash or the loaded list changes. `scrollIntoView({ block: 'nearest', behavior })` uses `auto` when `matchMedia('(prefers-reduced-motion: reduce)').matches`, otherwise `smooth`.
- CSS in the component: `.feedback-highlight` fades out over 1.6s. Inside `@media (prefers-reduced-motion: reduce)` the class has `animation: none` and a static light amber background.

### Tests

- Renders headline, source, url, topic names, comment, and a time for two entries, in array order.
- 401 shows the login link and no entries.
- Empty array shows `No feedback yet.`
- Switch to Not relevant PATCHes `{ signal: 'not_relevant' }` and opens the comment box. The previously pressed Like is not a delete.
- Edit comment → Save PATCHes `{ comment }` and shows it. Cancel does not fetch.
- Delete → `No` does not fetch. Delete → `Yes` DELETEs and removes the article.
- A 400 from Save shows the server string.
- Hash `#fb-2` focuses the matching article and adds `feedback-highlight`. Stub `Element.prototype.scrollIntoView` and `matchMedia`.
- `window.confirm` is not called (stub it and assert zero calls) during Delete → Yes.

Run the new unit file and `BriefRefreshBar.test.ts`.

## Task 3: E2E on the stubbed triage path

No live model. `TRIAGE_ENABLED` stays false in `e2e/stack/start.mjs`. Do not point e2e at a real Jev or Ollama key.

### Stub script

Create `e2e/stack/stubFeedbackRefresh.ts`, run with `mvp/server/node_modules/.bin/tsx` and `MVP_DATA_DIR` set to the e2e data dir (import `E2E_DATA_DIR` from `./config.mjs` in the Playwright spec and pass it in the child env).

The script:

1. Reads the feedback store with `readFeedback` from `mvp/server/src/store/feedbackStore.ts`.
2. Builds a match from the newest entry's snapshot (`source`, topic ids) and calls `selectFeedback` with `resolveFeedbackLimits()` from `triageConfig.ts` (read-only use of the existing helper; do not change the helper or the 300 budget).
3. Prints one JSON line to stdout: `{ "promptIds": string[] }` using the selected entries' ids, newest-preference order that `selectFeedback` returns. This is the feedback a later scoring prompt would contain. No network.
4. When `promptIds` is non-empty, load `triage.json` from the data dir, find one record that already has a non-empty `reasonText` and `verdict: 'filtered'` (a seeded drop, not a muted drop — skip `criteriaRef` starting with `rule:mute:`), and set `criteriaRef` and `reasonText` from `advisoryFromJev` using the off-topic drop shape in `triageVerdict.test.ts` (`decision: 'drop', reason: 'off_topic'`) and `feedback: { id: promptIds[0], signal }` from the matching entry. Write the record back. Leave every other field. This is the stubbed refresh citation. Do not call `systemOne`, do not scrape, do not start the pipeline.
5. Exit 0. On no feedback entries, print `{ "promptIds": [] }` and do not write triage.

### Playwright

Create `e2e/feedback.spec.ts`. Change the root `package.json` script `test:e2e:kite` from `playwright test e2e/kite-smoke.spec.ts` to `playwright test e2e` so this file runs with the smoke spec. Do not edit `.github/workflows`.

Use the existing hermetic stack, `logIn`, and seeded stories. Cover:

1. **Approved card.** Sign in, expand one kept story (same expand helper pattern as the Less like this tests in `e2e/kite-smoke.spec.ts`), press `Like`, type a comment, Save. `aria-pressed` is true on Like.
2. **Filtered card.** Open the Brief Filtered view, press `Not relevant` on one filtered card, Save a different comment.
3. **List.** The refresh bar `Feedback` link goes to `/feedback`. Both headlines are visible, newest interaction first is acceptable as server order (assert both headlines and both comments, not a hand-rolled sort).
4. **List edit.** `Edit comment` on the liked entry, change the text, Save. The new text shows. Then `Delete` → `No` leaves the entry.
5. **Stubbed refresh cites it.** Run the stub script. Parse stdout `promptIds` and assert it includes the liked entry's id (read the id from the article's `id` attribute or from `GET /api/feedback`). Reload the Brief, Filtered view, open `Why this verdict` on the patched card, and assert a link whose href ends with `#` + that id and whose text is `feedback:` + that id. Click it. The URL hash is that id, the article is focused, and it has class `feedback-highlight`.
6. **Delete and the next prompt.** On `/feedback`, `Delete` → `Yes` for that entry. It disappears. Run the stub script again. `promptIds` does not include the deleted id. Open the Filtered reason again: the reason sentence is still there, and the citation is the text `feedback removed` with no `feedback-criteria-link`.
7. **Keyboard and screen reader.** On `/feedback` with at least one entry: the `h1` is `Feedback`; each entry exposes its headline to the accessibility tree; `Like` and `Not relevant` are buttons with `aria-pressed`; Tab / focus reaches `Delete`; Enter on `Delete` shows `Yes` and `No`; there is no `role="dialog"`. Do not call `window.confirm`.

Keep the spec serial (`fullyParallel` is already false). Do not start a second web server. Clean up feedback you created if a later smoke test would see it: the spec file runs in the same worker as the smoke file only when both are one Playwright project with workers 1, in file order. Put this spec so it does not depend on smoke order. Delete entries you created before the spec ends (`afterEach` or the last steps) so a reused server cannot leak into `kite-smoke`. `reuseExistingServer` is false, and Playwright starts one server for the whole run, so leftover feedback in the data dir can change later tests. Delete via the API in `afterEach`.

Run `npm run test:e2e:kite` and fix failures that this spec or the script caused. If the full smoke run is too long to finish twice, run `npx playwright test e2e/feedback.spec.ts` first, then the full `npm run test:e2e:kite` once at the end.

## Task 4: Docs and the order catch-up

Main already has NEWS-191 merged (`a212d92`, PR #233) and release `974c18c`, but ROADMAP / AGENTS still say NEWS-191 is "Done when its PR merges" and Current next is NEWS-192. Fix that in this branch.

- `docs/DECISIONS.md`: newest entry dated 2026-11-05, title mentioning NEWS-192 and the `/feedback` page. `**Decision:**` records the six grill answers and the list-page ruling. `**Why:**` the store, the prompt citation, and the card buttons had no list and no way to open a cited entry. `**What it rules out:**` a second link placement, `window.confirm`, a per-citation request, paging in this change, a server API change, feeding News Desk Bot, and any VISION change. State that VISION.md is unchanged.
- `docs/ROADMAP.md`: NEWS-191 **Done** (`a212d92`, PR #233). NEWS-192 **Done**. The NEWS-169 split (store, prompt citation, buttons, list) is complete. **Current next** is NEWS-170 (SPA shell, do not start until Phil approves). Update the combined-order paragraph, item 8, rows 82b and 82c, and the later "Current next" sentence near hosting. Do not reorder the numbered key sequence in `tests/vision-decisions.test.js` (NEWS-191 and NEWS-192 stay between NEWS-193 and NEWS-170).
- `AGENTS.md`: the `**Current next** is` clause names NEWS-170 first, then NEWS-192 and NEWS-191 as Done (191 cites `a212d92`).
- `tests/vision-decisions.test.js`: `**Current next** is [NEWS-192]` becomes NEWS-170. The `nextAt` chain in that clause becomes NEWS-170 before NEWS-192 before NEWS-191 before NEWS-190 before NEWS-193 before NEWS-169. Keep the numbered combined-order key list as it is.
- `docs/PRODUCT_SPEC.md`: edit the Like and Not relevant section and the refresh-bar paragraph. Scenarios a reader can now do: open Feedback from the refresh bar; see newest entries with headline, source, link, topics, choice, comment, and time; switch a choice; edit a comment; delete only after Yes; a `feedback:<id>` in an advisory reason opens that entry and highlights it; after delete the reason text stays and the citation reads feedback removed. Sign-in: the Feedback page asks you to log in on Topics. Do not bump a Last checked line (there is none). No implementation detail.
- `docs/WHATS_NEW.md`: new `## 2026-11-05` entry, newest first, plain language for the list, the refresh-bar link, the citation link, and feedback removed. No ticket keys.
- `docs/ROUTE_MAP.md`: shipped row for `/feedback`. Note the refresh bar link. No footer link. Session required.
- `docs/BRIEF.md`: one sentence on the refresh bar that Feedback sits beside Filtered out and opens the list. One sentence that a `feedback:<id>` criteria ref in the advisory expander links to that entry.

Do not edit `CHANGELOG.md` or `docs/VISION.md`.

Run `npm run test:kite` and `cd apps/kite && bun run test:unit -- src/lib/components/brief/__tests__/BriefRefreshBar.test.ts src/lib/components/feedback/__tests__/FeedbackList.test.ts src/lib/components/brief/__tests__/FeedbackCriteriaLink.test.ts`.

## Done when

Tasks 1–4 are committed on `cursor/news-192-feedback-list-4795`. The plan file is deleted by the controller after review, before the PR. The controller opens the PR and does not merge.
