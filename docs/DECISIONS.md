# Decisions

Binding choices for Informed News. Newest first. When one of these changes, update this file in the same change as [ROADMAP.md](ROADMAP.md) and Jira. What the product does now, in plain language, is [PRODUCT_SPEC.md](PRODUCT_SPEC.md). Pipeline detail remains in [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84), [TRIAGE.md](TRIAGE.md), and [BRIEF.md](BRIEF.md). The target is [VISION.md](VISION.md).

## 2026-11-09 — Claude builder pins Sonnet and PR review pins Opus

**Decision:** Philip Clapper approved this pilot on Nov 9, 2026, 9:49 PM ET, for philga7/informed-news only. [VISION.md](VISION.md) is unchanged. This is dev tooling, not the product direction. No NEWS key yet.

1. **Builder.** `claude-build` (`.github/workflows/claude.yml`, the `@claude` issue and comment workflow used for Small TDD tickets) pins `--model claude-sonnet-5-5` in `claude_args`. The action version in use is `anthropics/claude-code-action@v1`, which has no `model:` input. The v1 path is `claude_args: --model`. That action installs Claude Code 2.1.322. Claude Code documents `claude-sonnet-5-5` and `claude-opus-5-5` as model ids, and 2.1.322 is newer than the 2.1.284 and 2.1.280 minimums for those two models. `--max-turns` stays 100. Triggers, secrets, and the turn cap are unchanged.
2. **Review.** The existing `claude-review` job (`.github/workflows/claude-review.yml`, `pull_request` opened, synchronize, reopened, and ready_for_review) pins `--model claude-opus-5-5` the same way. It reviews the diff against the acceptance criteria in the linked GitHub issue body and the pull request body first, and does not invent criteria, then checks the pull request against the "When reviewing a PR" checklist in CLAUDE.md. The runner has no Jira access. It posts pull request comments only. It does not edit code, commit, push, approve, or merge. Workflow permissions are `contents: read` and `pull-requests: write`, plus `id-token: write` because the action's default GitHub App token path requires it. `issues: write` is removed. The action's OIDC app token otherwise defaults to contents, pull requests, and issues write (`src/github/token.ts` on `v1`). `additional_permissions` overrides those keys to `contents: read`, `pull_requests: write`, and `issues: read` (`issues: read` is what `gh issue view` needs for the linked issue body). Allowed tools are `Read`, the inline comment tool, `gh pr comment`, `gh pr diff`, `gh pr view`, and `gh issue view`. `Read` is listed because this job sets `prompt` and so runs in agent mode, which does not grant the tag-mode defaults (`Read`, `Glob`, `Grep`, `LS`); the headless SDK denies a tool that is not pre-allowed. Edit, Write, commits, pushes, and merge or review commands are disallowed.
3. **Not automated.** Small TDD tickets build on Sonnet. A big or unsplittable ticket may use Opus (`claude-opus-5-5`) as the builder by setting the model for that run. Fable 5.2 (`claude-fable-5-2`) only if a ticket stalls twice on Opus. Nobody automates that switch. The pilot is to judge review quality over a few pull requests. `github-actions[bot]` is on the review allow-list (`cursor[bot],claude[bot],github-actions[bot]`, never `*`) because a Claude Build follow-up commit is that actor and the review otherwise fails as "Workflow initiated by non-human actor: github-actions (type: Bot)" (PR #257, run 42748052627); this replaces the [2026-11-04](#2026-11-04--claude-follow-up-commits-are-claudebot-and-claude-may-edit-its-own-pr-news-193) bar on adding that bot, and permissions and tools stay read-only.

This replaces point 2 of the [2026-10-31](#2026-10-31--claude-builds-small-builder-claude-tickets-on-claude-mention-via-github-news-180) decision, which left the builder on the action default and said not to pin a model.

**Why:** Small tickets should stay on Sonnet. Review of the diff against the ticket's acceptance criteria is the place to try Opus, read-only, and see whether the comments are worth it.

**What it rules out:** Leaving the builder unpinned, leaving review on Sonnet, a review that edits or pushes, a review that reads Jira, automating an Opus or Fable builder switch, changing triggers or the 100-turn cap, and copying this split to another repo.

## 2026-11-07 — Brief at / is the shell (NEWS-200)

**Decision:** The three grill answers for the Brief cutover are adopted. Kite Brief code stays in the repo until [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202) and [NEWS-203](https://informedcrew.atlassian.net/browse/NEWS-203).

1. **Brief path.** The Brief path is the SPA at `/`. `/latest/…` shared URLs are that same shell. `/shell` stays the placeholder.
2. **Full page load.** Leftover Kite links to Brief URLs are a full page load. Do not teach the Kite router that `/shell` is a batch id.
3. **Parity.** The parity source is the kite-smoke describes: Topic Brief, verdict view, shared links, keyboard, and blur/filter.

The acceptance is kite-smoke parity for keyboard, filters, shared links, the verdict view, blur, and the ported leaves, and it also keeps the reader behaviors already described for the served Brief: on-demand full stories, saved seen marks (including **Mark all as read**), links from a card to its articles, and the last-updated and next-refresh clock. `npm run dev` still serves Kite at `/` only because `WEB_BUILD_DIR` is unset. The image serves those behaviors on the shell.

`npm run dev` is still the server plus Kite vite, because `WEB_BUILD_DIR` is unset there, so local vite still serves Kite at `/` and Kite keeps client-side navigation. Kite full-page-loads `/` and `/latest/…` only when `PUBLIC_SHELL_OWNS_BRIEF=1`, which the image and the hermetic stack set together with `WEB_BUILD_DIR`. There, `/` and `/latest/…` are the shell Brief. Other pages (`/topics`, `/transparency`, `/filtered`, `/feedback`, `/contribute`, `/radar`, and dated batch paths) stay on Kite.

**Why:** The served app should open the shell Brief at `/` with the same topic sections, keyboard, filters, and shared links, without deleting Kite or changing the local dev entry.

**What it rules out:** Teaching the Kite router that `/shell` is a batch id, deleting Kite Brief code in this change, changing the `npm run dev` scripts, marking [NEWS-200](https://informedcrew.atlassian.net/browse/NEWS-200) Done before merge, and starting [NEWS-201](https://informedcrew.atlassian.net/browse/NEWS-201), [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202), or [NEWS-203](https://informedcrew.atlassian.net/browse/NEWS-203).

## 2026-11-05 — SPA Brief foundation harness and express.json on /api (NEWS-194)

**Decision:** Phil authorized the Nov 5 launch prompt after work hours and was not in the implementation session. Each grill answer is the prompt's recommended answer.

1. **Unit tests.** Unit tests live in `apps/web` (`vitest`, `src/**/*.{test,spec}.{js,ts}`, `bun run test:unit`), and CI runs them. Claude leaf ports use `bun run --cwd apps/web test:unit`. `claude-build` installs `apps/web` first. Claude cannot `bun install`.
2. **JSON bodies.** `express.json()` is mounted on `/api` only. Other paths do not parse JSON bodies. `/api` routes still do.
3. **Home route.** The Brief stays at `/` on Kite until [NEWS-200](https://informedcrew.atlassian.net/browse/NEWS-200). This change does not take `/`.

`$lib/brief` exports Brief card fixtures, `/api/feedback` bodies, less-like-this and remove-seed URLs, and a fetch mock for [NEWS-196](https://informedcrew.atlassian.net/browse/NEWS-196)–[NEWS-199](https://informedcrew.atlassian.net/browse/NEWS-199). No TopicBrief. Hosting stays the VPS and Tailscale. informed-brain stays unattached. No Map or Signals chrome. [NEWS-195](https://informedcrew.atlassian.net/browse/NEWS-195) (Map/Signals nav guard, piece (d)) is **Done**. Phil squash-merged PR #237 as `4664366`. Issue 236 is closed. The guard is on `main`. NEWS-194 does not change the guard. [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170) stays In Progress.

**Why:** Leaf ports need a harness and fixtures, and a global JSON parser would read bodies for shell and Kite pages.

**What it rules out:** Taking `/` in this change, porting TopicBrief, E2E, deleting Kite, Vercel, informed-brain, empty Map/Signals chrome, and letting Claude install dependencies.

## 2026-11-05 — SPA shell framework, hosting, and route split (NEWS-170 piece a)

**Decision:** Phil approved [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170) on Nov 2, chose the five-way split on Nov 5, and said launch piece (a) now. He was not in this session. Each grill question below takes the launch prompt's recommended answer, recorded as Phil's answer. [VISION.md](VISION.md) is unchanged: the running app stays the topic Brief until a later piece replaces that view. This change is the shell only.

1. **Framework.** SvelteKit (Svelte 5) with `@sveltejs/adapter-node`, the same shape as Kite. Phil's answer: SvelteKit, so Brief components, `FeedbackButtons`, and the Brief end-to-end suite port with the least rewrite in piece (b). adapter-node, not adapter-static, because Express already serves Kite's `handler.js` on one port, and a reload has to get the shell page from that handler.
2. **Hosting.** The shell stays on the VPS. Tailscale-only. The same Express serves it on one port. It does not move to Vercel. Phil chose all-VPS on Oct 30. Vercel would need a public path to a Tailscale-only API. Revisit once Briefs reaches parity.
3. **Where it lives.** A new `apps/web` workspace beside `apps/kite`. Kite keeps serving every view that has not moved, including the Brief. The two are routed side by side.
4. **How traffic splits.** Express sends a path the shell owns to the shell build and every other page to Kite, one route at a time. One port. A Kite view is removed only after its replacement passes the same end-to-end suite. That removal is piece (e).
5. **Placeholder.** `/shell` and `/shell/deep`. A minimal shell home and one deep link that survives reload. No Brief UI. The Brief stays at `/` on Kite. No Map, Signals, Finance, Situation, or Listen link.

The shell reads and writes only through the one API (`mvp/server`). This placeholder adds no data path. informed-brain over MCP stays unattached until Phil says go.

Pieces, in order, each its own pull request: (a) this shell; (b) Briefs module parity, blocked by (a); (c) Story Desk at its own link, blocked by (b); (d) a nav test that no Map or Signals route or tab exists, blocked by (a), and it can run beside (b) and (c); (e) remove the Kite Brief view after Phil sees (b). (b) through (e) are not filed in this change.

**Why:** The shell has to exist before Briefs can move, and the framework had to be written down before that code. Kite is already SvelteKit, so piece (b) should not start from a second UI stack.

**What it rules out:** A second repository, Vercel for this shell, adapter-static, taking `/` away from Kite in this change, a Brief UI in the shell, empty Map or Signals chrome, a second API, attaching informed-brain, and removing any Kite view.

## 2026-11-05 — /feedback list, citation links, and the stubbed end-to-end check (NEWS-192)

**Decision:** Ship the Feedback list and the citation links from these grill answers. The launch prompt took every recommended answer (Wednesday 2026-11-04, after 6 PM ET). [VISION.md](VISION.md) is unchanged. `/api/feedback` is unchanged. The triage prompt and `TRIAGE_JEV_BUDGET` (300) are unchanged.

1. **Where the link lives.** In the Brief refresh bar, immediately after Filtered out. One place. The label is Feedback. It is not in the footer and not on Topics.
2. **Edit on the list.** Like and Not relevant use the same toggle, comment box, 500-character counter, Save, and Cancel as on a card. Switching the other choice updates the saved choice and opens the comment box. Edit comment opens that box without changing the choice. The pressed button on the list does not remove the entry.
3. **Delete confirm.** Delete asks inline, “Delete?” with Yes and No, inside the entry. There is no browser confirm dialog.
4. **Citation for a deleted entry.** The advisory reason text stays. The `feedback:<id>` link becomes the plain words “feedback removed”. That check uses the one shared load of saved feedback. There is not a separate request for each citation.
5. **Highlight.** Opening `/feedback#<id>` scrolls that entry into view, focuses it, and marks it briefly. When reduced motion is requested, the mark does not animate and the scroll does not smooth-scroll.
6. **Order and paging.** Newest first, as the list from the server already is. No paging. One entry per story keeps the list small.

**Why:** The store ([NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)), the prompt citation ([NEWS-190](https://informedcrew.atlassian.net/browse/NEWS-190)), and the card buttons ([NEWS-191](https://informedcrew.atlassian.net/browse/NEWS-191), `a212d92`, PR #233) had no list and no way to open a cited entry.

**What it rules out:** A second link placement, a browser confirm dialog, a request per citation, paging in this change, a server API change, feeding this feedback to News Desk Bot, and any change to [VISION.md](VISION.md).

## 2026-11-04 — Like / Not relevant on Brief cards: card state rules (NEWS-191)

**Decision:** The feedback UI is split: NEWS-191 is part a (buttons and comment box on Brief cards, Claude) and NEWS-192 is part b (`/feedback` page, citation links, E2E, Cursor). [VISION.md](VISION.md) is unchanged. `mvp/server` behavior is unchanged.

1. **Where.** A small component, `FeedbackButtons`, on every expanded Approved card and every Filtered card, next to Less like this. It only calls `/api/feedback`, so it can move to the SPA ([NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170)) as is. No new Kite store, no shared state outside the component file, no new dependency.
2. **One load.** The first card to mount does one `GET /api/feedback`. Every card shares it and matches by `itemId`. If the load fails, the next card to mount tries again. A click waits for that load first, so it never POSTs over feedback it has not seen.
3. **Click rules.** No saved entry: the click POSTs `{ itemId, signal }`. A saved entry with the other signal: PATCH the signal. The active button again: DELETE the entry. Buttons are `aria-pressed` toggles. A failed request leaves the buttons as they were and shows the error in place.
4. **Comment.** Opens after a POST or a switch. Save PATCHes `{ comment }`, Cancel closes with no request. The counter is live and the field stops at 500, the server limit. A server error for a client error (4xx) is shown as is, and the typed text is kept. A 5xx shows a generic line, so server internals stay out of the UI.
5. **Not a mute.** Not relevant never hides a story. Less like this stays the hard mute.

**Why:** The store and routes ([NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)) and the prompt hint ([NEWS-190](https://informedcrew.atlassian.net/browse/NEWS-190)) had no way to be fed from the Brief.

**What it rules out:** A Kite store for feedback, a second GET per card, DELETE-and-POST to switch a choice, a `/feedback` page or citation links in this change, and E2E in this change.

## 2026-11-04 — Claude follow-up commits are claude[bot], and Claude may edit its own PR (NEWS-193)

**Decision:** Copy kindling's KIN-118/KIN-119 fix ([philga7/kindling PR #45](https://github.com/philga7/kindling/pull/45), merged `907fd00`). The NEWS-193 prompt took the recommended answers (Wednesday 2026-11-04, after 6 PM ET). [VISION.md](VISION.md) is unchanged.

1. **Commit path.** `claude-build` allows Edit, Write, `git add`, and `git commit`. The only pushes allowed are the exact commands `git push origin HEAD` and `git push -u origin HEAD`, with no flags. A bare `git push` is not allowed, and neither is `Bash(git push:*)`. Those two commands push the current branch. If that branch is `main`, the push is rejected by the ruleset below. Neither `claude[bot]` nor `github-actions[bot]` is a bypass actor. Pushes to `main`, force pushes, and remote branch deletes stay disallowed, including a force flag after the remote name, a refspec onto `main`, and `git push --delete`. No personal access token. Follow-up commits go out as `claude[bot]` on the action's app token, so CI and Claude Review run on them. This replaces the part of the [2026-10-31](#2026-10-31--claude-builds-small-builder-claude-tickets-on-claude-mention-via-github-news-180) and [2026-11-01](#2026-11-01--one-claude-mention-starts-only-claude-build-the-builder-runs-node---test-and-bun-scripts-and-opens-its-own-prs-news-184-news-185-news-186-news-187-news-188) decisions that left commit and push on the action wrapper and kept Edit and Write off the allow list.
2. **allowed_bots.** Stays the explicit list `cursor[bot],claude[bot]`. `github-actions[bot]` is not added. Never `*`.
3. **`gh pr edit`.** Allowed on `claude-build` only, as `Bash(gh pr edit:*)`. The own-pull-request and title-and-body limit on `gh pr edit` is advisory. The tool pattern cannot see the pull request number or a later flag such as `--base`, `--add-reviewer`, or `--add-label`. `claude-review` does not get `gh pr edit`. `gh pr merge` and `gh pr review` stay disallowed.
4. **Settings.** No Actions approval setting change in this change. If a post-merge follow-up is still held, Phil decides whether to change the setting.
5. **Guardrails that stay.** No admin permission, no merge tool, and `--max-turns` at least 100. The rule that workflow files go to Cursor, and the work-hours hold, are advisory. Edit and Write are not limited by path or by the clock. The active ruleset `main requires CI` requires a pull request onto `main` and blocks force-pushes (`non_fast_forward`). This change does not edit that ruleset.

**Why:** PR #230 follow-ups `5b72f0d` and `7b7aff5` were pushed as `github-actions[bot]`. CI waited on "Approve and run", and claude-review failed with "Workflow initiated by non-human actor: github-actions (type: Bot)". kindling stopped seeing held runs after the same allow-list change.

**What it rules out:** `allowed_bots: "*"`, a bare `git push`, `Bash(git push:*)`, adding `github-actions[bot]` before a run shows that actor, a personal access token, `gh pr edit` on the review job, merge or review tools, pushes to `main`, force pushes, remote branch deletes, an admin permission, and a repo Settings or ruleset change in this pull request.

## 2026-11-02 — Claude builder max-turns is 100 (NEWS-190)

**Decision:** `--max-turns 100`. **Why:** Real Small tickets (about 3 TDD tasks plus docs) need more than 30 turns; 30 only fit one-line smoke tests. **What it rules out:** A 30-turn cap. [VISION.md](VISION.md) is unchanged.

## 2026-11-02 — Feedback store shape, one entry per item, and routes (NEWS-169)

**Decision:** Ship the store and routes for Like / Not relevant from these grill answers. Phil said go and took every recommended answer (Monday 2026-11-02; he is off, and the work-hours hold does not apply). [VISION.md](VISION.md) is unchanged. Buttons, the `/feedback` page, and prompt injection are not in this change.

1. **What an entry stores.** `mvp/data/feedback.json` holds `{ entries, updatedAt }`. Each entry is `{ id, itemId, signal: "like" | "not_relevant", comment, ts, snapshot }`. `comment` is trimmed and at most 500 characters (empty when omitted). `snapshot` is `{ headline, source, url, topics: [{ id, name }] }`, taken when the entry is saved: headline from the article title (publisher title, then "Untitled", when the title is blank); `source` is the outlet domain (lowercased, a leading `www.` and one trailing `.` removed) or the article's `sourceKind` when there is no domain; `url` is `publisherUrl` when it is `http:` or `https:`, otherwise `canonicalUrl`; `topics` come from the triage record when one exists, otherwise the article's `topicIds`, with names read from `topics.json` without seeding that file (a missing topic keeps its id as the name).
2. **Routes.** `POST /api/feedback`, `GET /api/feedback` (newest `ts` first), `PATCH /api/feedback/:id` (signal and comment only; `id`, `itemId`, `ts`, and `snapshot` stay), `DELETE /api/feedback/:id`. Session required, same as the other `/api` routes. `400` when the comment is over 500 characters or the signal is not `like` or `not_relevant`. `404` when `itemId` is not an article, or when the feedback `id` is unknown.
3. **One entry per item.** A new POST for the same `itemId` replaces the old entry (new `id`, new `ts`, new snapshot). `201` when it is new, `200` when it replaces.
4. **Store writes.** The same atomic temp-file-and-rename plus in-process queue the other `mvp/data` stores use (`writeJsonAtomic` and `enqueueFileWrite`).
5. **Not relevant is not a mute.** It never writes a mute rule or an undesired topic. "Less like this" stays the hard mute ([2026-10-23 — Take verdict, blocklist, and Like / Not relevant](#2026-10-23--take-verdict-blocklist-and-like--not-relevant)).
6. **News Desk Bot.** No. The 2026-10-23 decision already rules out feeding this feedback to News Desk Bot story spotting.

The triage prompt and `TRIAGE_JEV_BUDGET` (300) are unchanged. [NEWS-190](https://informedcrew.atlassian.net/browse/NEWS-190) injects selected feedback and cites `feedback:<id>`. [NEWS-191](https://informedcrew.atlassian.net/browse/NEWS-191) adds the buttons, the list page, and the end-to-end check.

**Why:** Brief items roll off, and the later selector (same source or topic) and list page still need to say what was liked. One editable entry per story matches a soft signal the operator can change. The route shape matches the topics API.

**What it rules out:** Sending this feedback to News Desk Bot, treating Not relevant as a mute, keeping more than one entry per item, and changing the triage prompt or the 300-call cap in this change.

## 2026-11-02 — the Claude build job installs lockfile dependencies before Claude (NEWS-189)

**Decision:** `claude-build` installs dependencies from the lockfiles in a workflow step before Claude starts. Phil said go and took every recommended answer (Sunday evening 2026-11-01; the work-hours hold did not apply).

1. **Where:** `actions/setup-node` with the npm cache, then `npm ci` at the repo root and `npm ci --prefix mvp/server`, before the Claude step.
2. **What:** only what `npm test` and `npm run test:kite` need. Kite stays on the existing frozen `bun install`.
3. **Allow list:** Claude still cannot install anything. `npm install`, `npm ci`, `bun install`, npx, and curl stay forbidden. The job runs `npm ci`. `Bash(npm ci)` is not an allowed tool.

This replaces the [NEWS-180](https://informedcrew.atlassian.net/browse/NEWS-180) allowance that left `npm ci` as the one network install Claude could run. Claude does not run it.

[VISION.md](VISION.md) is unchanged. This is dev tooling, not the product direction.

**Why:** Smoke test 2 (issue #222, PR #223) let Claude run `npm test`, which failed at once with `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`. Nothing installed `mvp/server` dependencies before Claude, and Claude cannot install them.

**What it rules out:** Letting Claude run `npm ci` or `npm install`; installing `_legacy/` or other workspaces on this job.

## 2026-11-01 — one @claude mention starts only claude-build; the builder runs node --test and bun scripts and opens its own PRs (NEWS-184, NEWS-185, NEWS-186, NEWS-187, NEWS-188)

**Decision:** One `@claude` mention starts only `claude-build`. The builder runs `node --test` and bun scripts, and opens its own pull requests as `claude[bot]`. Phil said go and took every recommended answer (Sunday 2026-11-01). One pull request, not two.

1. **Ruleset field:** the checked-in pull request rule includes `"required_reviewers": []`, where the live ruleset already has it. No rule behavior change. Phil's dry run of the existing apply script should then show no difference. No script change.
2. **Bun:** the build job installs Bun 1.4.3 with `oven-sh/setup-bun` and runs `bun install --frozen-lockfile --cwd apps/kite` before Claude. `bun install` stays disallowed for Claude.
3. **One job:** `claude-build` owns every `@claude` mention. The mention job is removed. Automatic review stays on `pull_request` only.
4. **Node tests:** the allow list adds `Bash(node --test)` and `Bash(node --test:*)` only. Not `Bash(node:*)`. Edit and Write stay as they are. No `Bash(git:*)`. npx, curl, and installs stay out.
5. **Pull request authorship:** issue #219's run did not fail for lack of `gh pr create` or a token. Tag mode's prompt told Claude to post a compare link. The workflow now tells Claude to run `gh pr create`, and `track_progress: true` keeps tag mode so the action's app token still commits as `claude[bot]`. No new personal access token. No token input on the action.

[VISION.md](VISION.md) is unchanged. This is dev tooling, not the product direction.

**Why:** The first smoke test (issue #219, Actions run 41274247667) could not run `node --test`, posted a compare link instead of opening a pull request (so PR #220 was not authored by `claude[bot]`), and a mention started two jobs. The checked-in ruleset omitted an empty `required_reviewers` list, so the dry run always differed. Phil can approve a `claude[bot]` pull request without the admin bypass.

**What it rules out:** A second Claude job on `@claude`; telling Claude to comment instead of installing bun; `Bash(node:*)` or `Bash(git:*)`; a personal access token or a token input so the pull request is authored as someone else; switching issues to agent mode to dodge the compare-link prompt (that mode does not create the `claude[bot]` branch); agents applying the ruleset.

## 2026-11-01 — main requires a PR, one approval, PR title and build checks; squash by PR title; no bot bypass (NEWS-178)

**Decision:** `main` requires a pull request, one approval, approval of the latest push, the **PR title** check, and **MVP build & typecheck**. A later push dismisses earlier approvals. Only squash merges are allowed, and the squash commit title is the pull request title. Force-pushes and deleting `main` are blocked. The only human bypass is the repository admin role, and only when merging a pull request. No bot or GitHub App is a bypass actor. The release deploy key remains a bypass actor so the release job can still push `chore(release)`. Phil answered the grill with the recommended answers (Sunday 2026-11-01). The deploy key is kept in addition so [NEWS-124](https://informedcrew.atlassian.net/browse/NEWS-124)'s release push still has a bypass once a pull request is required.

1. **Required checks:** `MVP build & typecheck` and `PR title`, both from GitHub Actions.
2. **Pull request:** required. Without it a green branch can land on `main` by push.
3. **Approvals:** 1, and the latest push must be approved by someone else. The repository admin bypasses on pull requests only.
4. **Bypass:** admin role in pull-request mode, plus the existing release deploy key. Agents never use the admin bypass.
5. **Force-push and deletion:** both blocked.
6. **Stale approvals:** dismissed on push.
7. **Merge methods:** squash only.
8. **Squash defaults:** title `PR_TITLE`, message `PR_BODY`.
9. **How Phil applies it:** `.github/rulesets/main-requires-ci.json` and `scripts/apply-repo-settings.sh` (dry-run unless `--apply`).
10. **Claude review of builder pull requests:** `claude[bot]` is an allowed bot on the automatic review job.

[VISION.md](VISION.md) is unchanged. This is dev tooling, not the product direction.

**Why:** Bots must not merge their own green pull requests. The PR title check has to be required or a non-conventional squash title lands on `main` and cuts no release. The squash title has to be the pull request title or a one-commit pull request keeps its commit subject.

**What it rules out:** A bot or GitHub App bypass; merging with zero approvals; merge commits and rebase merges onto `main`; direct pushes and force-pushes by people; an admin bypass of direct pushes; agents applying the ruleset or using the bypass.

## 2026-10-31 — Claude builds Small builder-claude tickets on @claude mention via GitHub (NEWS-180)

**Decision:** Claude builds Small `builder-claude` tickets on `@claude` mention via GitHub; never merges; no auto-opened issues. Phil answered the grill with the recommended answers (Saturday 2026-10-31; the work-hours hold did not apply).

1. **Triggers:** `issue_comment`, `pull_request_review_comment`, and `pull_request_review` (`submitted`), plus `issues` (`opened`) only when the body contains `@claude`. No label or assignee triggers, so nothing auto-starts.
2. **Model:** the action default. Do not pin it with `claude_args --model`. Superseded for the model pin by the [2026-11-09](#2026-11-09--claude-builder-pins-sonnet-and-pr-review-pins-opus) decision. The builder now pins Sonnet.
3. **Max turns:** `--max-turns 100` (was 30 until 2026-11-02).
4. **Allowed tools:** the allow list is the repo npm test, lint, typecheck, and build scripts, plus read-only git status, diff, log, and show. Commit and push stay on the action's own wrapper. No network installs beyond `npm ci`.
5. **Concurrency:** one run per issue or PR, with cancel-in-progress off.
6. **CI reads:** `actions: read`, read-only, so Claude can see failing checks on its own pull requests.
7. **Work-hours hold:** leave it to Phil. The hold is a guideline. The workflow has no time-guard step. Only an `@claude` mention from an owner, member, or collaborator starts a run.

[VISION.md](VISION.md) is unchanged. This is dev tooling, not the product direction.

**Why:** A collaborator can ask Claude to build a Small ticket and get a pull request, with the same OAuth secret as the review workflow, without a second automation that opens issues or merges.

**What it rules out:** Label, assignee, and schedule triggers; auto-opened issues; merging, approving, pushing to `main`, or auto-merge from the workflow; pinning a model; a weekday time-guard step; `allowed_bots` and `allowed_non_write_users`; `pull_request_target`; checkout of an untrusted ref.

## 2026-10-31 — Pre-AI config blocklist and per-source criteria (NEWS-168)

**Decision:** Ship [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168) from these grill answers. Each one is "Recommended, adopted (Phil can override in review)."

1. **Placement:** On each candidate before the Topics mute pass, before duplicate grouping of the keyword survivors (including a duplicate of an already-kept story), and before scrape, Jev, and Brief-summary work. A blocklisted copy of a kept story is `blocklist:<term>`, not a duplicate. A muted copy stays `muted:<id>` and is not added to the kept story's members. Recommended, adopted (Phil can override in review).
2. **Matching:** Case-insensitive on title plus snippet; word-boundary by default; `substring: true` opts into contains; no plural suffixes. Recommended, adopted (Phil can override in review).
3. **Config:** `blocklist` array of strings or `{ term, substring }` at top level and per source in `mvp/server/config/radar-sources.json`; optional per-source `criteria` (≤500 characters). A bad entry throws with file path, JSON path, and reason. Recommended, adopted (Phil can override in review).
4. **Topics mute stays separate.** Machine reason `blocklist:<term>`. Advisory `criteriaRef` for that drop is `rule:blocklist:<term>`. Recommended, adopted (Phil can override in review).
5. **Per-source criteria** is in this change, capped at 500 characters, cited as `source:<id>` when it drove a Jev judgment (not on blocklist-only drops). Recommended, adopted (Phil can override in review).
6. **Shipped list** is `"blocklist": []`. Example terms live in [TRIAGE.md](TRIAGE.md). No starter terms in the committed config. Recommended, adopted (Phil can override in review).
7. **Approach** was SDD. Recommended, adopted (Phil can override in review).

**Why:** Cheap junk can leave the pipeline before Jev and scraping spend. Topics mutes stay operator-driven; blocklist is config-only until a later UI. Per-source criteria gives curated RSS sources a short scoring note without changing topic keywords.

**What it rules out:** In-app blocklist editing, learned or AI-suggested blocklists, changing how Topics mutes work ([NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87)), seeding blocklist terms without Phil, and folding Like / Not relevant ([NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)) into this ticket.

## 2026-10-31 — Spec and plain-English changelog stay, with a narrower rule (NEWS-175)

**Decision:** Keep both steps. Update [PRODUCT_SPEC.md](PRODUCT_SPEC.md) only when what a reader can do changes. Do not bump Last checked when the spec is unchanged. Keep [WHATS_NEW.md](WHATS_NEW.md). Write what is true at merge, or one line **No user-visible change.** for a tooling change. Deploy steps and post-merge steps stay in the pull request body. The next ship-loop pull request corrects a WHATS_NEW or PRODUCT_SPEC line that is no longer true, and lists that correction under "Also in this PR". Do not roll this out to other repos yet. Revisit after informed-news runs 5 more pull requests under this rule. Phil was not in the grill. Each answer is "Recommended, adopted (Phil can override in review)."

**Why:** Five pull requests merged after the Oct 26 trial landed on main (#210–#214). They carry seven ticket keys (NEWS-172, NEWS-173, NEWS-109, NEWS-110, NEWS-111, NEWS-112, NEWS-181) plus one keyless tooling pull request (#212). #207–#209 merged before that trial commit, so they are outside the count. Real scenario edits on #210, #211, #213, and #214 matched the product. The only Last checked bump with no scenario change was #212, which is the diff noise the trial asked about. #214's note said a laptop or phone could not open the Brief yet. That was true at merge and false later the same day, after Tailscale Serve was turned on. The failure was describing a post-merge step as the reader's present, not the changelog step itself.

**What it rules out:** A Last checked bump on an unchanged spec, changelog lines that describe steps still to be done after merge, a separate ticket for every stale line, and copying this rule to other repos on this evidence alone.

## 2026-10-31 — Private-network access and runbook (NEWS-111, NEWS-112, NEWS-181)

**Decision:** [VISION.md](VISION.md)'s direction did not change: still the topic Brief until the SPA. Ship [NEWS-111](https://informedcrew.atlassian.net/browse/NEWS-111), [NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112), and [NEWS-181](https://informedcrew.atlassian.net/browse/NEWS-181) from these grill answers. Each one is "Recommended, adopted (Phil can override in review)."

1. **Serve on the host:** Tailscale runs on the VPS host, not in the container, and serves the app with `tailscale serve`. Recommended, adopted (Phil can override in review).
2. **MagicDNS URL:** The app is reached on one MagicDNS HTTPS URL on the tailnet. Recommended, adopted (Phil can override in review).
3. **Cookie rule:** The session cookie is `Secure` only when the immediate peer is trusted and the request is HTTPS. Trusted means loopback or a non-public address (RFC1918, IPv4 link-local, IPv6 ULA), because Docker's proxy is the peer inside the container. A public address is ignored. Plain HTTP on localhost still logs in. `NODE_ENV` does not force `Secure`. Recommended, adopted (Phil can override in review).
4. **Bind check:** The runbook's public-access checks include `ss -ltnp` showing port 3001 on `127.0.0.1` only, and a failed request to the VPS public IP on 3001. Phil runs them. Recommended, adopted (Phil can override in review).
5. **Single env file:** One env file at `/opt/informed-news/.env`, mode `600`, owner `deploy:deploy`, outside the image. No Tailscale auth key in it. Recommended, adopted (Phil can override in review).
6. **Repo path:** `/opt/informed-news`, branch `main`, owner `deploy`. Recommended, adopted (Phil can override in review).
7. **No override file:** The laptop uses the same compose command with `INFORMED_NEWS_ENV_FILE=./mvp/.env`. Recommended, adopted (Phil can override in review).
8. **Image tag:** The image defaults to `informed-news:local`; CI uses `informed-news:ci`. Recommended, adopted (Phil can override in review).

**Why:** Anyone on Phil's private network can read the Brief, as on a laptop, and the public internet cannot. Refresh, Topics, Filtered out, and other changes still ask for the password. The runbook is [RUNBOOK.md](RUNBOOK.md). The container is up on the VPS and published on `127.0.0.1` only. Tailscale Serve is not configured: the deploy user cannot change it, so that command is Phil's. Laptop and phone checks remain his.

**Update (later on 2026-10-31):** Phil turned Tailscale Serve on after merge. It is tailnet only and proxies to the app on the machine. A laptop or phone needs Tailscale installed. The steps, including an SSH tunnel fallback, are in [RUNBOOK.md](RUNBOOK.md).

**What it rules out:** A public URL, a public bind, a second compose override file, a Tailscale key in the app env file, and forcing `Secure` cookies by `NODE_ENV` (which would break plain-HTTP localhost login).

## 2026-10-29 — Hosting ahead of NEWS-168/169; container grill (NEWS-109, NEWS-110)

**Decision:** On 2026-10-27 Phil reordered hosting ([NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109)–[NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112)) ahead of [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168) and [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169). [VISION.md](VISION.md)'s direction did not change: still the topic Brief until the SPA; hosting is how that Brief stays up. Ship NEWS-109 and NEWS-110 from these grill answers:

1. **Image:** multi-stage `node:22-bookworm-slim`, `npm ci` in the build stage, non-root `node` at runtime.
2. **One port in the image:** Kite is built in the image and served by Express on one port. `npm run dev` stays two processes.
3. **Data volume:** Named volume `informed-news-data` mounted at `/app/mvp/data`. The Dockerfile creates that directory and `chown`s it to `node`.
4. **Health:** `GET /healthz` returns 200, no auth, no outside calls. Compose healthcheck `30s` / `5s` / `3` / `20s`.
5. **SearXNG URL:** SearXNG is reached only via `SEARXNG_URL` on the shared Docker network. Never default to localhost inside the container.
6. **SearXNG soft-fail:** `SEARXNG_URL` unset → Google News RSS only, one startup warning. An error or timeout skips SearXNG with one warning per refresh. The refresh still finishes.
7. **Topic search default:** Topic search stays on unless `TOPIC_SEARCH_ENABLED` says otherwise. Compose does not set that variable; the env file passes it through.
8. **Secrets:** Secrets only in the local env file, GitHub secrets, or the VPS env file. `.dockerignore` excludes `.env*` except `.env.example`, plus `mvp/data`, `node_modules`, and `.git`.
9. **Bind:** The published port is bound to `127.0.0.1` on the host. Inside the container the process listens on `0.0.0.0` so the published port works. Tailscale is NEWS-111.
10. **Compose isolation:** Compose project `name: informed-news`. Nothing is shared with Nanobot except the external network `nanobot-mem0`.
11. **CI timing:** CI builds and starts the container with no `timeout-minutes` and records build and start seconds.
12. **Deploy gate:** Deploy only after CI is green, and only when `VPS_HOST`, `VPS_SSH_KEY`, and `TS_AUTHKEY` are all set. Never print secret values. Deploying does not merge. If any secret is missing, the PR body lists the commands instead.

**Why:** An always-on Brief needs a container and a soft SearXNG path before Tailscale and the runbook; the citation-guard reorder had parked hosting after NEWS-169, and Phil pulled it forward.

**What it rules out:** A second SearXNG, a public port, secrets in the image, and failing the refresh because SearXNG is down.

## 2026-10-27 — Court-record checks grill (NEWS-173)

**Decision:** Ship [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173) from the 2026-10-27 grill answers:

1. **Scope:** Reporter citations and CourtListener / RECAP URLs only. Display scope only: marks on cards, no new pipeline stage.
2. **Unresolved is Unverified:** A court cite that cannot be resolved shows **Unverified citation**, using the same advisory wording as an unverified link.
3. **Procedural flag, not a status:** A resolved record that is a procedural disposition carries a `procedural` flag and shows “Dismissed on procedure, not on the merits.” It is never a refutation and never a new status.
4. **Token:** `COURTLISTENER_API_TOKEN` in `mvp/.env`, server-only, optional. Empty skips court checks.
5. **Cache:** `citation-court-cache.json` under `mvp/data/`, retained 7 days with the other citation stores.
6. **URL equivalence:** Trailing slash, http vs https, and `utm_*` tags are equivalent. A mismatch and a missing source both still show unverified.
7. **Fail closed:** Timeouts, errors, and a missing token leave items unverified and never block a refresh.
8. **Install script and bun:** The install script does not download bun. If bun is missing it exits and says to install bun 1.4.3.
9. **Wider Google News hostname matching deferred:** Matching Google News hosts other than news.google.com is not part of this ticket.

**Why:** A court mark should say what we could not confirm without implying a ruling on the merits.

**What it rules out:** Verified / false badges for court records, treating procedural dismissals as refutations, blocking refresh on a CourtListener failure, and live network in tests.

## 2026-10-27 — Citation guard grill (NEWS-172)

**Decision:** Ship [NEWS-172](https://informedcrew.atlassian.net/browse/NEWS-172) from the 2026-10-27 grill answers:

1. **Fetched that run:** Same-hash stored text counts when this run registers it into the per-run source store. No re-HTTP scrape solely for the guard.
2. **Source definition:** Kept scraped body, duplicate-cluster member bodies, RSS/body text when that is what we have, and saved post text that is article content. An unresolved Google News URL is **not** a source.
3. **Unmatched links and quotes:** Keep and mark **unverified**; never present as fact; do not silently drop.
4. **Debunked:** No new badge. Without a linked refuting source among fetched sources, show **unconfirmed**. Transparency’s “no verified / false badge” stands.
5. **Scope now:** Pull quote, perspectives, talking points, timeline, card summaries, living-update notes. Not: parked claims-desk UI, Transparency copy, Topics form fields.
6. **Quote normalization:** Whitespace + curly/straight quote marks only. Case-sensitive. Ellipses and `[bracketed]` insertions are not normalized. Match against full stored source text.
7. **Per-run source store:** New gitignored file under `mvp/data/` via the shared JSON write helper. Retention **7 days** (align with Brief full-story / summary cache).
8. **Check log:** Persist under `mvp/data/`, keyed by story/article id; survives restart; old stories without a log still load. Fold match status into Brief / full-story payloads. Brief UI: unverified / unconfirmed marks only. Screen reader: polite advisory (“unverified link”, “unverified quote”, “unconfirmed”).
9. **NEWS-173 hook:** Citation `kind` on each checked item (`url` | `quote` | `claim`, reserve `court`) + resolver registry (kind → check). Source records: `url`, `text`, `fetchedAt`/`runId`, `contentHash`. Shared terminal states: `match` | `mismatch` | `missing-source` (display: unverified / unconfirmed as above).
10. **When:** Both refresh and on-demand generation. Failed checks mark items and continue — never block a refresh.

Clean-room: do not copy CaseCite (Elastic License 2.0). Court checks remain [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173).

**Why:** Nothing quoted or linked should appear as fact unless a source retrieved in that run backs it.

**What it rules out:** Silent drops of unmatched items, verified/false/debunked badges, blocking refresh on check failure, live network in citation tests, and CaseCite ports.

## 2026-10-27 — Triage advisory verdict + Approved / Filtered / All

**Decision:** Ship [NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167). Each triage record keeps the machine layer (`status` / `reason`, with `reason: null` when kept) and, on new writes, an optional advisory layer: `verdict` (`approved` \| `filtered`), `confidence` (0–1), `reasonText` (prose ≤300), and `criteriaRef` (one string). All four are present together or all absent; pre-NEWS-167 rows omit them (no backfill). `criteriaRef` is one driving rule: non-AI `rule:mute:<id>`, `rule:duplicate`, `rule:budget` (and later `rule:blocklist:<term>`); Jev `global` \| `topic:<id>` \| `source:<id>`. Non-AI drops use `confidence: 1`. The Brief refresh bar gets an **Approved / Filtered / All** toggle beside the existing `/filtered` link: default **Approved**, ephemeral (not persisted). **Filtered** shows last-refresh drops with an advisory reason expander; `/filtered` (Filtered out) stays as the spot-check page. This supersedes the 2026-10-23 note that kept items still only carry `reason: null` as the live story for "why" — machine `reason: null` on kept remains, and advisory `reasonText` is now written on new records.

**Why:** Dropped items already had a machine reason; the gap was a prose / confidence / criteria record on both kept and dropped for the Brief, without a second scoring path or new Jev questions.

**What it rules out:** Backfilling old rows, persisting the Brief toggle, mixing Filtered cards into topic ranks, replacing `/filtered`, adding Jev questions for the advisory fields, and treating advisory text as ground truth.

## 2026-10-26 — Product spec and plain-English changelog on every ship-loop PR (trial)

**Decision:** Phil approved a trial on October 26, 2026. Every ship-loop pull request updates [PRODUCT_SPEC.md](PRODUCT_SPEC.md) in the same pull request as the code, so that file stays a plain-language list of what the product does now: features and user scenarios, with no implementation detail. The same pull request adds an entry to [WHATS_NEW.md](WHATS_NEW.md) for what changed for a reader of the app, or states that there is no user-visible change. `CHANGELOG.md` stays the semantic-release log and is not hand-edited for these notes. Review this trial after 5 tickets have merged since it landed ([NEWS-175](https://informedcrew.atlassian.net/browse/NEWS-175)). That review includes whether bumping **Last checked**, when the spec did not change, is worth the diff.

**Why:** Pipeline docs describe how refresh and scoring work. A reader of the app, and an agent about to change it, need a short list of what the product does and what just changed for that reader.

**What it rules out:** Using `CHANGELOG.md` as the reader-facing note, and merging a behavior change while `PRODUCT_SPEC.md` still describes the old product.

## 2026-10-26 — PR titles are Conventional Commits naming every ticket key

**Decision:** A PR title is a Conventional Commit with every ticket key in the scope, e.g. `fix(NEWS-131, NEWS-155, NEWS-174): …`. It takes the highest bump type in the batch: breaking (`!`) > `feat` > `fix` / `perf` > no-release types. If every ticket is a no-release type, use the first ticket's type. A title with no key is allowed only for an untracked `docs`, `chore`, `ci`, `test`, `style`, or `build` change. A **PR title** workflow (`scripts/check-pr-title.mjs`, no new dependencies) enforces this and re-runs when the title is edited. Phil adds it to the ruleset as a required check after it lands on `main`. Multi-ticket PRs still squash, with one Conventional Commit per ticket on the branch. Merge with the PR title as the squash subject (`gh pr merge --subject`, or the repo's squash default set to the PR title). Rules in [CONTRIBUTING.md](../CONTRIBUTING.md#squash-merges-and-semantic-release-harn-10) ([NEWS-155](https://informedcrew.atlassian.net/browse/NEWS-155)).

**Why:** semantic-release and the changelog read only the squash subject on `main`. [PR #191](https://github.com/philga7/informed-news/pull/191) (`NEWS-119, NEWS-120: …`) cut no release. [PR #205](https://github.com/philga7/informed-news/pull/205) squashed as `docs(NEWS-165): …` and the NEWS-171 subject never reached `main`. GitHub's default squash title for a one-commit PR is that commit's subject, not the checked PR title.

**What it rules out:** Keys only in the subject or a trailing `(NEWS-N)`, titles that leave out a key in the batch, a third-party title action or commitlint dependency, and rebase-merging multi-ticket PRs.

## 2026-10-26 — Citation guard after the verdict view

**Decision:** Phil approved [NEWS-172](https://informedcrew.atlassian.net/browse/NEWS-172) (citation guard: every link, link-backed claim, and quote in a Brief or update must match a source fetched that run, or show as unverified) and [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173) (court citations via CourtListener citation lookup and RECAP). They run in that order right after [NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167) and before [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168). The rest of the combined order is unchanged, so hosting is now item 8 and the SPA item 9 ([ROADMAP.md](ROADMAP.md#combined-order-oct-23-2026-citation-guard-added-oct-26)).

**Why:** It puts Phil's evidence standard into code: nothing quoted or linked appears as fact unless a source retrieved in that run backs it. Court checks build on the per-run source store that NEWS-172 adds.

**What it rules out:** Copying CaseCite code (Elastic License 2.0; NEWS-172 is clean-room), live CourtListener calls in CI, and treating a procedural dismissal as refuting a claim.

## 2026-10-23 — The running app stays the topic Brief until the SPA

**Decision:** Until [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170), the running product is the Kite Brief plus `mvp/server`: topics drive sources and filtering, there is no review queue, Jev scores in triage, and Ollama writes Brief verbiage for stories that are shown. Today's pipeline order is the one in [TRIAGE.md](TRIAGE.md).

**Why:** Epic L already shipped that path. The SPA is a later module swap, and agents were treating feature docs as the only place a binding choice could live.

**What it rules out:** Putting a review queue back on the default path, and treating the SPA as the product that is already running.

## 2026-10-23 — Take verdict, blocklist, and Like / Not relevant

**Decision:** Take three Radaric items on the Brief side, in this order: persist a triage verdict, confidence, reason, and criteria reference, with an Approved / Filtered / All view ([NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167)); a config blocklist that runs before any AI call ([NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168)); Like / Not relevant, with an optional comment, fed into later triage prompts ([NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)). Like / Not relevant steers this app's triage prompts only. It does not feed News Desk Bot story spotting. "Less like this" stays the hard mute. The advisory fields are not the live triage record — machine `status` / `reason` are. *(NEWS-167 shipped 2026-10-27: advisory fields on new writes; see [2026-10-27](#2026-10-27--triage-advisory-verdict--approved--filtered--all).)*

**Why:** Dropped items already carry a reason, and "Less like this" already creates hard mutes. The gap is a verdict on kept items, a cheap blocklist in front of Jev, and a soft signal that can be edited.

**What it rules out:** A second scoring path, training a model on the feedback, and sending that feedback to the bot that spots stories.

## 2026-10-23 — Fold the rest of Radaric into tickets that already exist

**Decision:** Source presets and OPML import fold into parked [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67). Watchers (plain language, hourly / daily / weekly, through topic search) fold into [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84) and wait for hosting. Cross-publisher clustering folds into [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) and is designed inside Story Desk.

**Why:** Those ideas already had a home. New tickets would split one source-admin surface, one watcher surface, and one grouping design.

**What it rules out:** A new epic for presets, a new epic for watchers, and a clustering feature beside Story Desk.

## 2026-10-23 — Defer category chips and YouTube; skip X, merged articles, and Track a question

**Decision:** Defer category chips and YouTube channels until the three triage items have shipped. Skip X as a Radaric ingest, skip cloning merged-article writing, and skip Track a question. Track a question belongs to informed-brain.

**Why:** Chips and YouTube are extra source surface. X history already has a separate path ([BIRDCLAW.md](BIRDCLAW.md)). Merged-article writing and a question tracker are different products.

**What it rules out:** Building those five in the news-section queue.

## 2026-10-23 — The SPA lives in this repo

**Decision:** The SPA shell is [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170), in philga7/informed-news. It replaces Kite one view at a time: Briefs, then Story Desk. Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)) and Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)) stay on hold with no empty tabs. The Briefs module matches today's Brief on keyboard, filters, shared links, and accessibility before that Kite view is removed. `apps/kite` keeps serving a view until its replacement passes the same end-to-end suite. Framework, folder, hosting, and the route split are recorded in the [2026-11-05 SPA shell entry](#2026-11-05--spa-shell-framework-hosting-and-route-split-news-170-piece-a). The guardrails in this entry still stand.

**Why:** A second repo would split the Brief store from Story Desk. Kite's keyboard, filter, shared-link, and accessibility work is the bar the replacement has to clear.

**What it rules out:** A new repository, a thinner Briefs module that drops that bar, and empty Map or Signals links.

## 2026-10-23 — Story grouping is designed once, inside Story Desk

**Decision:** Story Desk is the one place cross-publisher grouping is designed. Group approved items only. A group needs at least 2 distinct publishers. Precision is at least 80% on 30 labeled items. Phil labels that set. Groups link to Briefs. Today's duplicate grouping stays as [TRIAGE.md](TRIAGE.md) specifies it (same URL, same headline, or similar headlines before Jev). That step is dedupe of one story. It is not this grouper.

**Why:** Triage already collapses syndication copies. A second clusterer for "same developing story across outlets" would fork the design, and an unlabeled precision number cannot be checked.

**What it rules out:** A separate clustering project, writing merged articles, an agent labeling its own clusters, and removing the triage duplicate step.

## 2026-10-23 — The raw layer has no AI

**Decision:** RSS and topic-search ingest stay free of model calls. Watcher query expansion is a scoring step on [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84), used when watchers are built after hosting.

**Why:** The raw layer is the feed of items. Scoring is where Jev, and later a watcher query expansion, spend model calls.

**What it rules out:** An LLM on RSS or topic-search ingest.

## 2026-10-23 — One API, one MCP, and bot reachability is open

**Decision:** One API and one MCP server sit in front of raw, scoring, and output. The SPA and the bots are clients. Bot reachability is open until hosting [NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109) through [NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112) chooses how a bot reaches a Tailscale-only MCP. The app scores FLASH, PRIORITY, and ROUTINE. The bots deliver those alerts. That scoring build is unscheduled.

**Why:** Two APIs or two alert scorers would split the same items. The network path depends on the hosting design, which is not started.

**What it rules out:** A Story Desk-only server, a public MCP URL chosen in this decision, and a second alert system in the bots.

## 2026-10-23 — News section order, hosting after the feedback loop

**Decision:** The combined order is [NEWS-131](https://informedcrew.atlassian.net/browse/NEWS-131) and [NEWS-155](https://informedcrew.atlassian.net/browse/NEWS-155), then [NEWS-165](https://informedcrew.atlassian.net/browse/NEWS-165) and [NEWS-171](https://informedcrew.atlassian.net/browse/NEWS-171), then [NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167), [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168), and [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169), then hosting [NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109) through [NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112), then the SPA candidate [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170). [NEWS-139](https://informedcrew.atlassian.net/browse/NEWS-139), [NEWS-128](https://informedcrew.atlassian.net/browse/NEWS-128), and [NEWS-121](https://informedcrew.atlassian.net/browse/NEWS-121) stay on the dev-tooling queue after item 2 and do not block items 3 through 7. Hosting gates the Story Desk MCP, Watchers, and Epics B and C. The [NEWS-93](https://informedcrew.atlassian.net/browse/NEWS-93) design stands: Hostinger, the existing SearXNG, Tailscale only, a chmod-restricted env file, and no v1 backups beyond the Docker volume. Epic B ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)), Epic C ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)), and cross-domain correlation (no ticket; it needs stored history) stay on hold.

**Why:** The Oct 10 hosting deferral waited on all remaining product work. The news section is the work that should land before the VPS, and the MCP is useless to the bots until that VPS is up.

**What it rules out:** Starting the SPA, Signals, Map, or Watchers before hosting, and holding hosting until every later idea is done.
