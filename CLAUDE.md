# CLAUDE.md — informed-news

Repo-specific notes. Shared rules live in `~/.claude/CLAUDE.md`. Product invariants in `AGENTS.md` win over everything here.

## What this is

Informed News: an OSINT-oriented product shell. The operator's topics drive sources and filtering. When the image is served, `/` is the shell Brief and Kite still owns the other pages. `npm run dev` is unchanged (server plus Kite, because `WEB_BUILD_DIR` is unset). `mvp/server` owns the pipeline and owned-brief adapter.

Jira: project **NEWS** (informedcrew.atlassian.net, cloudId `ebcd227d-1f6d-4a54-a6d7-cfe70e377a50`). Details are in `.cursor/rules/jira-news.mdc`. Ordering lives in `docs/ROADMAP.md`.

## Stack

- **API / pipeline:** `mvp/server` — Node 22, TypeScript, Express. Flat JSON under `mvp/data/` (gitignored).
- **UI:** `apps/kite` — Bun 1.4.3, SvelteKit (vendored kite-public soft fork).
- **E2E:** Playwright (`npm run test:e2e:kite`) stays local — hermetic `e2e/stack/`, not CI.
- **Release:** semantic-release on merge to `main` (Conventional Commit squash title sets the bump).
- **CI:** `.github/workflows/ci.yml` job `MVP build & typecheck` (typecheck, shell install, check, build, and `test:shell-build`, server tests, `test:kite`, Kite unit + check + build).

Do not revive `_legacy/` (including `_legacy/mvp-web`) as the default `npm run dev` path. Do not call Supabase from the live path.

## Commands

```bash
npm run install:all          # mvp/server + apps/kite (Bun)
npm run dev                  # mvp/server :3001 + Kite :5173
npm run typecheck            # mvp/server
npm test                     # mvp/server (temp MVP_DATA_DIR net)
npm run test:kite            # provenance / config-contract tests at repo root
cd apps/kite && bun run test:unit
cd apps/kite && bun run check
cd apps/kite && bun run build
npm run test:e2e:kite        # local only; hermetic stack, not CI
```

Set `REFRESH_INTERVAL_HOURS=off` when you need the server up without spending refresh budget.

## Layout

| Path | Role |
|---|---|
| `apps/kite/` | Kite UI (SvelteKit). Owns the pages other than the shell Brief. `npm run dev` still serves it at `/` |
| `apps/web/` | Shell Brief at `/` and `/latest/…` when the image is served. `/shell` stays the placeholder. Unit tests live there. Kite still owns the other pages. `npm run dev` is still Kite plus the server |
| `mvp/server/` | Express API + pipeline |
| `mvp/data/` | Runtime JSON (never commit) |
| `mvp/.env` | Secrets (never commit); see `mvp/.env.example` |
| `docs/ROADMAP.md` | Preferred item order; Jira wins on disagreement, except the 2026-11-12 next-wave pause |
| `docs/PRODUCT_SPEC.md` | What the product does now, in plain language (updated when behavior changes) |
| `docs/WHATS_NEW.md` | Reader-facing changelog (not semantic-release `CHANGELOG.md`) |
| `docs/` | Brief, triage, owned-brief, birdclaw, etc. |
| `.cursor/skills/` | Repo skills; `news-ship-loop` is the ship entry point |
| `AGENTS.md` | Product invariants for agents |
| `tests/` | Root `node --test` contracts (wired via `test:kite`) |
| `_legacy/` | Historical only — not the default product path |

## Ship-loop conventions

The full ritual is in `.cursor/skills/news-ship-loop/SKILL.md`. Repo skills win over legacy `.cursor/rules/` where they conflict; `AGENTS.md` still wins over skills on product invariants.

- **Order:** take the current next item in `docs/ROADMAP.md` and confirm it in Jira. If they disagree, Jira wins; fix ROADMAP in the same change. The 2026-11-12 next-wave pause is the exception: NEWS-201, NEWS-202, NEWS-203, and NEWS-219 through NEWS-223 stay To Do in Jira on purpose until the UI build order is proposed. Dev-tooling NEWS-139, NEWS-128, and NEWS-121 are not paused. Do not start them, and do not rewrite ROADMAP to match that To Do status.
- **Approach** per ticket (`ticket → approach → reason`). TDD for one module/seam, no new public interfaces or dependencies, about 3 tasks or fewer; otherwise SDD. An explicit `Approach:` in the prompt overrides.
- Branch `feat/news-<N>-…` (or `ci/news-<N>-…` for tooling) from `main`. One Conventional Commit per ticket on the branch; the PR title is the squash subject on `main` and names every key, e.g. `fix(NEWS-131, NEWS-155): …`.
- PR body: Summary, a Test plan with every item ticked, and `Closes NEWS-N` when the PR fully completes the story. The test plan includes a `docs/PRODUCT_SPEC.md` update when behavior changed (scenarios edited; leave the file unchanged when it did not; no **Last checked** bump) and a `docs/WHATS_NEW.md` entry for what is true at merge, or **No user-visible change.** Tick the CI item only with the green Actions run link. Do not hand-edit semantic-release `CHANGELOG.md` for that note.
- Propose discovered tickets (type, epic, one line, why) or "None". File them in NEWS only after Phil confirms.
- **PR flow:** open the PR → Claude Code reviews it → resolve findings (push re-runs the review) → Phil decides. **Never merge** without Phil's ship request.
- Never commit `mvp/data/*.json`, `.env`, or secrets.

## Claude-eligible work

Claude builds on GitHub only when someone mentions `@claude`, and only for tickets labeled `builder-claude`. The workflow is `.github/workflows/claude.yml`. It opens a pull request. The builder never approves, never merges, and never enables auto-merge. No GitHub review approval is required, and only Phil merges, on his ship word, after confirming the PR shows as mergeable without the admin bypass.

Which workflow runs:

- A pull request opened, synchronized, reopened, or marked ready for review starts only `.github/workflows/claude-review.yml` job `review` (name `claude-review`). `claude.yml` does not listen to `pull_request`.
- An issue comment or a pull request review comment that contains `@claude`, from an OWNER, MEMBER, or COLLABORATOR, starts only `claude.yml` job `build` (name `claude-build`). `.github/workflows/claude-review.yml` does not listen to those events. The mention job (name `claude-mention`) is removed, so one mention starts one Claude job. `claude-build` answers and opens the pull request.
- A submitted pull request review whose body contains `@claude` starts only `claude-build`.
- An issue opened whose body contains `@claude` starts only `claude-build`. A mention in the title does not. There is no label trigger, assignee trigger, or schedule, and nothing in the workflow opens an issue or posts `@claude` on its own.

Rules for `claude-build`:

- Never merge PRs or push to main. Open a PR and stop; Phil decides when it merges.
- Anything under `.github/workflows` goes to Cursor, not Claude.
- Claude builds only tickets labeled `builder-claude`.
- Do not build NEWS-201, NEWS-202, NEWS-203, or NEWS-219 through NEWS-223 while the 2026-11-12 next-wave pause holds. Comment and stop.
- The label is on the NEWS ticket in Jira, which Claude cannot read from GitHub. The issue or comment that mentions `@claude` names the NEWS key, and that mention confirms the label. If no key is named, comment and stop.
- Small means: one area, under about 300 lines, clear acceptance criteria and a test, no auth, secrets, CI, release config, migrations or deploys, and no design call.
- The build job pins `--model claude-sonnet-5-5` in `claude_args`. `--max-turns` stays 100. Small TDD tickets stay on Sonnet. A big or unsplittable ticket may use Opus (`claude-opus-5-5`) as the builder by setting that model for the one run. Use Fable 5.2 (`claude-fable-5-2`) only if a ticket stalls twice on Opus. That switch is not automated. This is a pilot in this repo to judge review quality over a few pull requests.
- If the work grows past Small, stop and comment instead of building.
- TDD, with the failing test first.
- One Conventional Commit per ticket, and a PR title that names every key.
- CI green.
- Update PRODUCT_SPEC and WHATS_NEW when the change is user-visible.
- Follow the work-hours hold: on weekdays 9 AM–6 PM ET, do not commit, push, open or update pull requests, merge, or write to Jira. A GitHub run cannot queue work. On a weekday from 9 AM–6 PM ET, if the mention is not from Phil (`@philga7`, the repo owner), comment that the hold applies and stop. Mention `@claude` again after 6 PM ET. Phil's own mention counts as do it now. The workflow does not enforce the clock. Only an `@claude` mention starts a run.
- The build job installs Node 22 and runs `npm ci` at the repo root and `npm ci --prefix mvp/server` before Claude starts, with the setup-node npm cache. That is what `npm test` and `npm run test:kite` need. `npm ci` and `npm install` stay disallowed for Claude.
- The build job installs Bun 1.4.3 and runs `bun install --frozen-lockfile --cwd apps/kite` before Claude starts. It also installs `apps/web` with `bun install --frozen-lockfile --cwd apps/web` before Claude starts. Claude may run the allowed Kite `bun run` scripts, and may run `bun run --cwd apps/web test:unit` and `bun run --cwd apps/web check`. `bun install` stays disallowed for Claude.
- `node --test` and `node --test …` are allowed, so `tests/*.test.js` can run. Any other `node` command, `Bash(node:*)`, and `Bash(git:*)` stay disallowed. Edit, Write, `git add`, and `git commit` are allowed. The only pushes allowed are `git push origin HEAD` and `git push -u origin HEAD`, with no flags, so a follow-up commit is `claude[bot]` on the action app token. A bare `git push` is not allowed. Pushes to `main`, force pushes, and remote branch deletes stay disallowed. npx, curl, and installs stay disallowed. `gh pr edit` may change only Claude's own pull request title and body.
- Open a PR with `gh pr create` after the push. Do not post a compare link. The author stays claude[bot] via the action's app token. Do not pass a personal access token. The builder never approves, never merges, and never enables auto-merge. No GitHub review approval is required, and only Phil merges, on his ship word, after confirming the PR shows as mergeable without the admin bypass.

## When reviewing a PR

Claude reports findings. It never approves or merges.

The automatic job `claude-review` checks the diff against the acceptance criteria in the linked GitHub issue body and the pull request body first, then checks this pull request against the checklist below. It has no Jira access and does not invent acceptance criteria. It posts pull request comments only. It does not edit code, commit, push, approve, or merge. Its model is `claude-opus-5-5`.

- PR title is a Conventional Commit with every `NEWS` key in the scope and the highest bump type in the batch (the **PR title** check enforces the shape; CONTRIBUTING § Squash merges).
- Approach (TDD/SDD) fits the ticket; SDD has a plan file if required.
- Every test-plan item is ticked and backed by evidence.
- CI is green with a GitHub Actions run link (do not tick CI without the link).
- `docs/ROADMAP.md` row updated when the change touches ordering/status.
- `docs/PRODUCT_SPEC.md` is updated in this PR when behavior changed (scenarios edited). It is left unchanged when behavior did not change. There is no **Last checked** bump.
- `docs/WHATS_NEW.md` has a new dated entry for what is true at merge, or states **No user-visible change.** A line that is no longer true is corrected in this PR. `CHANGELOG.md` is left to semantic-release.
- No secrets, `.env`, or `mvp/data/*.json` in the diff.
- Follow-up tickets proposed (or explicitly None).
- Product path: when the image is served, `/` is the shell Brief and Kite still owns the other pages. `npm run dev` is unchanged. No `_legacy/` default, no Supabase on the live path.

Smoke test 3 (Nov 2026): claude[bot] opened this PR from an @claude issue.
