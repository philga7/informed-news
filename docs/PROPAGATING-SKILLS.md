# Propagating agent skills across repos

The subagent-driven development (SDD) flow runs entirely from files committed in each repo, so it works the same in a local Cursor session and in a Cursor Cloud Agent. This page lists which files are **shared** (copy byte-for-byte between repos) and which each repo **adapts**.

Repos using this setup: `informed-news`, `informed-news-curator`, `course-evaluator`, `kindling`.

## Shared — copy as-is

These files never name a repo, tracker key, test command, or local path. Anything repo-specific is reached indirectly ("the repo's `AGENTS.md`", "the ship-loop skill").

| Path | Upstream | Notes |
|------|----------|-------|
| `.cursor/skills/subagent-driven-development/` (`SKILL.md`, `implementer-prompt.md`, `task-reviewer-prompt.md`, `re-review-prompt.md`, `scripts/sdd-workspace`, `scripts/task-brief`, `scripts/review-package`, `tests/scripts.test.sh`) | [obra/superpowers](https://github.com/obra/superpowers) `skills/subagent-driven-development` | Locally adapted — see below |
| `.cursor/skills/using-git-worktrees/SKILL.md` | obra/superpowers `skills/using-git-worktrees` | Unmodified |
| `.cursor/skills/requesting-code-review/SKILL.md`, `code-reviewer.md` | obra/superpowers `skills/requesting-code-review` | Unmodified |
| `.cursor/skills/finishing-a-development-branch/SKILL.md` | obra/superpowers `skills/finishing-a-development-branch` | Unmodified |
| `.cursor/skills/verification-before-completion/SKILL.md` | obra/superpowers `skills/verification-before-completion` | Unmodified |
| `.cursor/rules/no-subagent-timers.mdc` | Repo-local | End the turn on background subagents; no timer waits |
| `docs/PROPAGATING-SKILLS.md` | Repo-local | This page |

The scripts need only bash, git, awk, and coreutils, and must stay executable (`100755` in `git ls-files -s`). `bash .cursor/skills/subagent-driven-development/tests/scripts.test.sh` checks both.

Portability check (should print nothing):

```bash
rg -n -i 'NEWS-|CURA-|EVAL-|KIN-|informed|kindling|course-evaluator|curator|/Users/|superpowers:' \
  .cursor/skills/subagent-driven-development .cursor/skills/using-git-worktrees \
  .cursor/skills/requesting-code-review .cursor/skills/finishing-a-development-branch \
  .cursor/skills/verification-before-completion \
  .cursor/rules/no-subagent-timers.mdc
```

### Local edits to `subagent-driven-development`

`/update-skills` always reports this skill as outdated. Don't refresh it with `apply.sh`, because that overwrites these edits. Last synced with obra/superpowers at `8ca22db`. To sync again, copy upstream's `scripts/` and prompt files unchanged, then three-way merge `SKILL.md` (`git merge-file`, with the previously vendored upstream copy as the base). After merging, check that upstream didn't overwrite item 3 without a conflict:

1. `superpowers:using-git-worktrees`, `superpowers:requesting-code-review`, `superpowers:finishing-a-development-branch` → repo-relative links (`../<skill>/SKILL.md`).
2. The `executing-plans` alternative → "Inline execution (AGENTS.md fallback build path)". `executing-plans` is not vendored: upstream it pulls in `writing-plans`, `test-driven-development`, `verification-before-completion`, `systematic-debugging`, `using-superpowers`, and its own scripts.
3. "Waiting on dispatched subagents" paragraph and the AwaitShell rationalization row (matches `no-subagent-timers.mdc`).
4. `## Running in a Cloud Agent` section.
5. Example paths neutralized (`.cursor/plans/…`, no `~/` paths).
6. `tests/scripts.test.sh`.
7. Cloud section points at `verification-before-completion` (fallback path and before the PR).

## Repo-specific — adapt in each repo

| File | What to adapt |
|------|---------------|
| `.cursor/skills/<prefix>-ship-loop/SKILL.md` | Tracker key, Atlassian cloudId + transition ids, roadmap path, branch / PR title / commit conventions, compare URL, test commands. Add a `## Cloud agent notes` section with the same structure as `news-ship-loop` (skip Jira transitions and follow-up issue creation; list them in the PR body; build-path fallback; never merge). Point the companion table at the shared skills. |
| `.cursor/rules/<prefix>-ship-loop.mdc`, `.cursor/rules/jira-<prefix>.mdc` | One-line pointer to the ship loop's Cloud agent notes |
| `AGENTS.md` § Running in a Cloud Agent | Runtime version, install command, test-suite table (what needs Docker / services / devices, what CI gates), `gh` fallback, local-only MCP servers, SDD build-path fallback |
| `.cursor/environment.json` + `.cursor/cloud-agent-install.sh` | Idempotent install for the Cloud Agent Build (runs from the repo root) |
| `skills-lock.json` | Add `using-git-worktrees`, `requesting-code-review`, `finishing-a-development-branch`, `verification-before-completion` (same entries as here) |
| `docs/AGENT_SKILLS.md` | Inventory rows + the `npx skills add obra/superpowers …` line |
| CI workflow | Add the `scripts.test.sh` step if the repo has CI |
| `THIRD_PARTY.md` | superpowers MIT notice (create the file if the repo has none) |

| Repo | Ship loop | Tracker | Stack | PR CI |
|------|-----------|---------|-------|-------|
| informed-news | `news-ship-loop` | NEWS | Node 22 + Bun (Kite) | `.github/workflows/ci.yml` |
| informed-news-curator | `cura-ship-loop` | CURA | Python (uv) | None |
| course-evaluator | `eval-ship-loop` | EVAL | Node + Docker Compose | None |
| kindling | `kin-ship-loop` | KIN | Flutter | None |

## Not portable (by design)

- **Secrets** (`.env` files, API keys): use the Cursor Cloud Agents Secrets tab if a cloud run ever needs them.
- **OAuth MCP servers** (Atlassian): Jira steps move to the PR body in cloud mode.
- **Machine-local MCP servers** (key files under `~/.config/`, local binaries, private endpoints): listed per repo in `AGENTS.md`.
- **User-level Cursor rules**: none are relied on; commit / PR conventions live in each ship-loop skill.

## Copy recipe

From the target repo's root, with `informed-news` as the source:

```bash
SRC=../informed-news
for p in subagent-driven-development using-git-worktrees requesting-code-review finishing-a-development-branch verification-before-completion; do
  rm -rf ".cursor/skills/$p"
  cp -R "$SRC/.cursor/skills/$p" ".cursor/skills/$p"
done
cp "$SRC/.cursor/rules/no-subagent-timers.mdc" .cursor/rules/
cp "$SRC/docs/PROPAGATING-SKILLS.md" docs/
bash .cursor/skills/subagent-driven-development/tests/scripts.test.sh
for p in subagent-driven-development using-git-worktrees requesting-code-review finishing-a-development-branch verification-before-completion; do
  diff -r "$SRC/.cursor/skills/$p" ".cursor/skills/$p"
done
```

Then do the repo-specific edits above and commit on a branch.
