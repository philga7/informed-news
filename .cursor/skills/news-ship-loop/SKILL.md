---
name: news-ship-loop
description: >-
  Informed News ship ritual for NEWS Jira items: transition In Progress, choose
  /tdd or /subagent-driven-development per Approach rule, confirm follow-up
  Jira items with the user, push/open PR, squash-merge to main when asked, mark
  Done, delete the SDD plan. Use when starting or finishing a NEWS-* ticket,
  opening/merging a feature PR, closing an epic after children are Done, or
  when the user says ship / merge the PR / close the ticket.
---

# NEWS ship loop

Codifies how Informed News work moves through **Jira ↔ git ↔ GitHub**. Does not replace product invariants in `AGENTS.md` or Atlassian connection details in `.cursor/rules/jira-news.mdc`.

**Companion skills / rules**

| Piece | Role |
|-------|------|
| `/tdd` | Focused red → green build (see Approach) |
| `/subagent-driven-development` | Multi-task build + review loop on a feat branch |
| `/fix-ci` | Diagnose and fix failing PR checks (CI-green path) |
| `ci-watcher` agent | Watch PR checks; report pass/fail + failure links |
| `/get-pr-comments` | Summarize review feedback on the active PR |
| `.cursor/rules/jira-news.mdc` | Always `project = NEWS` + `cloudId` |
| `.cursor/rules/no-subagent-timers.mdc` | End turn on background Tasks; no timer waits |
| User git / `gh pr` rules | Commit/PR formatting when those steps run |

This skill stays the **only** entry point for shipping NEWS work. `/fix-ci` and `ci-watcher` are helpers invoked from the CI-green step below — do not treat them as alternate ship rituals.

## When to use

- User names a **NEWS-*** item to implement (often with `/subagent-driven-development`)
- User asks to **open / merge a PR** for that work
- User asks to **close / Done** a story or epic after ship
- Controller would otherwise improvise Jira status or merge steps

## Hard stops (ask first)

Same spirit as SDD: do **not** push to a shared branch, open a PR, or merge to `main` unless the user asked (or an explicit standing instruction in the same turn). Marking Jira **Done** after a successful merge the user requested is part of this skill.

**Also ask first:** creating new NEWS issues from review leftovers — propose, wait for confirm, then file (see § Follow-up Jira gate).

## Atlassian defaults

- MCP: `user-Atlassian-MCP-Server` (or project Atlassian MCP)
- Site: `https://informedcrew.atlassian.net`
- **cloudId:** `ebcd227d-1f6d-4a54-a6d7-cfe70e377a50` — pass on every call
- Project: **NEWS** only
- Common transitions (team-managed): **In Progress** `id=21`, **Done** `id=41` — if a transition fails, call `getTransitionsForJiraIssue` and use the matching id

## Loop

```
gate ticket ready
  → In Progress
  → plan + feat branch + /tdd or /subagent-driven-development
  → follow-up Jira gate (propose → user confirms → file or none)
  → update docs/PRODUCT_SPEC.md and docs/WHATS_NEW.md on the feat branch
  → delete SDD plan on the feat branch
  → (user) push + PR
  → (user) squash-merge + delete branch
  → Done
  → (optional) epic Done when all children Done
```

### 1. Start work on a NEWS story

0. If the user did not name a key, pick from [docs/ROADMAP.md](../../docs/ROADMAP.md) (not from open To Do alone).
1. Fetch the issue (`searchJiraIssuesUsingJql` / `getJiraIssue`) — confirm summary, acceptance, parent epic.
2. Transition to **In Progress** (`transitionJiraIssue` with transition id `21`, or looked-up equivalent).
3. Sync `main`, create `feat/news-<N>-…` (never implement on `main` without explicit consent).
4. **Approach** — before building, choose per ticket and state `ticket → approach → one-line reason`:
   - Use `/tdd` when the ticket touches one module or seam, adds no new public interfaces or dependencies, and fits in about 3 tasks or fewer.
   - Otherwise use `/subagent-driven-development`.
   - In a batch, choose per ticket; mixed batches are fine.
   - An explicit `Approach:` line in the prompt always overrides this rule.
5. If using SDD: write/commit the SDD plan under `.cursor/plans/`; run `scripts/sdd-workspace` + ledger.
6. Execute the chosen approach until final review is clean. Obey **no-subagent-timers**.
7. **Product spec and what's new** (required, same branch as the code). See § Product spec and what's new. Do this before push, so the pull request contains it.

### 2. Follow-up Jira gate (before ship)

After SDD final review is clean (or a focused build is ready to ship), **before** push/PR/merge — and again when presenting finish options if anything new appeared:

1. Triage leftovers that must not die with the branch:
   - Final-review Critical/Important items parked or deferred as out-of-scope for this PR
   - Deferred minors that need product tracking
   - Mid-epic discoveries that should become additional NEWS items (per `AGENTS.md` / roadmap rules)
   - Infra / process gaps found while shipping (e.g. CI not gating merges)
2. Present a short list: proposed issue type (Bug / Task / Story), parent epic (prefer Epic **K** [NEWS-83](https://informedcrew.atlassian.net/browse/NEWS-83) for bugs/intake; Epic **L** [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84) or the active epic for in-epic follow-ups), one-line summary, and why — or explicitly **None**.
3. **Do not create issues until the user confirms** which items (all / some / none).
4. After confirmation: create in **NEWS** only, link **Relates** to the shipped key, update [docs/ROADMAP.md](../../docs/ROADMAP.md) (and `AGENTS.md` / `.cursor/rules/news-roadmap.mdc` when Current next changes). Commit those docs on the feat branch before PR; if discovered after merge, land them in a small `docs(NEWS-N)` PR (direct pushes to `main` are rejected; see § `main` requires CI).

Skipping the *ask* is the defect. “None” after an honest triage is success.

### Ticket description shape (when creating NEWS issues)

Use plain language. Prefer this shape (keep it short):

```
## Summary
<2–3 sentences: context + goal>

## Size
S | M | L

## Acceptance criteria
- [ ] …

## Edge cases / constraints
- …
```

Focus on why/what, not implementation. Do not invent architecture in the ticket body.

### Product spec and what's new

Trial approved 2026-10-26. Review after 5 tickets have merged since it landed, including whether a **Last checked** bump on an unchanged spec is worth the diff. Recorded in [docs/DECISIONS.md](../../../docs/DECISIONS.md) and [docs/ROADMAP.md](../../../docs/ROADMAP.md).

Every ship-loop pull request updates both files **in the same PR as the code**:

1. [docs/PRODUCT_SPEC.md](../../../docs/PRODUCT_SPEC.md) — plain-language list of what the product does now. Features and user scenarios. No implementation detail. If what a reader can do changed, edit the scenarios. If it did not, bump **Last checked** so the file is still in the diff.
2. [docs/WHATS_NEW.md](../../../docs/WHATS_NEW.md) — one dated entry for what changed for a reader of the app, or the words **No user-visible change.** Newest first. No commit jargon and no ticket-key lists.

Leave semantic-release's `CHANGELOG.md` and its config alone. Do not hand-edit `CHANGELOG.md` to mirror `WHATS_NEW.md`.

The PR test plan includes both items. Tick them only when the diff actually contains the update. The CI item stays unticked until the green Actions run is linked.

### 3. Ship to GitHub (only when asked)

1. Ensure working tree is clean of secrets (never commit `mvp/.env`, `mvp/data/*.json`).
2. Confirm `docs/PRODUCT_SPEC.md` and `docs/WHATS_NEW.md` are updated on this branch (see § Product spec and what's new).
3. `git push -u origin HEAD`.
4. `gh pr create` with:
   - Title referencing NEWS-N
   - Body: Summary + Test plan + `Closes NEWS-N` when the PR fully completes the story
   - Test plan includes:
     - [ ] `docs/PRODUCT_SPEC.md` updated in this PR (scenarios edited, or **Last checked** bumped when behavior did not change)
     - [ ] `docs/WHATS_NEW.md` has a new entry for the reader-visible change, or states **No user-visible change.**
     - [ ] CI green (**MVP build & typecheck**), with the Actions run URL — tick only when that link is present
5. Opening the PR starts **automatic Claude Code review** (`.github/workflows/claude-review.yml`, against `CLAUDE.md` "When reviewing a PR"); resolve findings (push re-runs it) before Phil's ship request — never merge without that request.
6. When the user asks to **merge**:
   1. **CI green** — invoke `/fix-ci` and/or the `ci-watcher` agent (do not improvise a parallel check ritual). Required check: **MVP build & typecheck** (see `main` requires CI). Watch until settled; on failure, `/fix-ci` applies the smallest fix and re-checks.
   2. **Link the green run before ticking CI** — from `gh pr checks` / `gh run view`, record the passing GitHub Actions run URL in the ship notes (and the PR body test-plan CI item). Do **not** mark the CI test-plan box until that green run link is present.
   3. **Refuse merge on red/pending** — do not run `gh pr merge` while a required check is failing, cancelled, or still pending. Tell the user the blocking check names/status and stop. GitHub rejects the merge anyway.
   4. **Only merge when required checks are green** and the green run is linked, then `gh pr merge <n> --squash --delete-branch`.
   5. No override path: nobody can bypass the ruleset except deploy keys (the release job). Merging on red needs the user to change the ruleset themselves; do not do it for them.
7. `git checkout main && git pull --ff-only origin main`

### `main` requires CI

The repository ruleset rejects any update to `main` without a passing **MVP build & typecheck** check, so there are no direct pushes to `main`, for people or agents. Everything, including plan deletes and roadmap fixes, lands through a PR. Details and key rotation: [CONTRIBUTING.md](../../../CONTRIBUTING.md#main-requires-ci-ruleset).

### 4. Close the Jira item

1. Transition the story to **Done** (`id=41` or looked-up).
2. The SDD plan file (`.cursor/plans/news-….plan.md`) should already be gone: delete it as the last commit on the feat branch before the PR merges. If one slipped onto `main`, remove it in a small `chore(NEWS-N)` PR.
3. If the user asks to close a **parent epic**: verify children are Done (JQL), then Done the epic.

### 5. Controllers must not skip

| Step | Skip? |
|------|--------|
| In Progress at start of build | No |
| Follow-up Jira gate ask (propose or None) | No |
| Create follow-ups without user confirm | Yes — stop and ask |
| CI green via `/fix-ci` / `ci-watcher`; green run linked before ticking CI; refuse on red/pending | No |
| Done after user-requested merge | No |
| Push/PR/merge without user ask | Yes — stop and ask |
| Plan delete on the feat branch before merge | No (unless user says keep it) |
| `docs/PRODUCT_SPEC.md` updated in the same PR as the code | No |
| `docs/WHATS_NEW.md` entry (or "No user-visible change.") in that PR | No |
| Hand-edit `CHANGELOG.md` for the reader-facing note | Yes — leave it to semantic-release |

## Examples

**User:** “Do NEWS-54 via /subagent-driven-development”  
→ In Progress → plan/branch → SDD → follow-up Jira gate → update `docs/PRODUCT_SPEC.md` and `docs/WHATS_NEW.md` → stop at finish options (do not merge until asked).

**User:** “Merge the PR to main”  
→ (if gate not done yet, run it first) → plan already deleted on the branch → required checks green → squash-merge → pull main → Done on the NEWS key.

**User:** “Close NEWS-48”  
→ confirm children Done → Done on epic.

**After NEWS-89 final review:** propose prune-store / UX bug / tech-debt tickets → user confirms → file NEWS-100–102 (+ ROADMAP) → then ship when asked.
