---
name: news-ship-loop
description: >-
  Informed News ship ritual for NEWS Jira items: transition In Progress, run
  SDD (or focused build), confirm follow-up Jira items with the user, push/open
  PR, squash-merge to main when asked, mark Done, delete the SDD plan. Use when
  starting or finishing a NEWS-* ticket, opening/merging a feature PR, closing
  an epic after children are Done, or when the user says ship / merge the PR /
  close the ticket.
---

# NEWS ship loop

Codifies how Informed News work moves through **Jira ↔ git ↔ GitHub**. Does not replace product invariants in `AGENTS.md` or Atlassian connection details in `.cursor/rules/jira-news.mdc`.

**Companion skills / rules**

| Piece | Role |
|-------|------|
| `/subagent-driven-development` | Build + review loop on a feat branch |
| `/requesting-code-review` | Final whole-branch reviewer template (`code-reviewer.md`) |
| `/finishing-a-development-branch` | SDD's finish menu — this skill's §3 decides how it ends here (PR + squash-merge, never a local merge to `main`) |
| `/using-git-worktrees` | SDD's isolation step (skipped in a Cloud Agent) |
| `.cursor/rules/jira-news.mdc` | Always `project = NEWS` + `cloudId` |
| `.cursor/rules/no-subagent-timers.mdc` | End turn on background Tasks; no timer waits |
| § Commit and PR conventions (below) | Commit/PR formatting when those steps run |
| § Cloud agent notes (below) | What changes when no Jira MCP / no human is present |

## When to use

- User names a **NEWS-*** item to implement (often with `/subagent-driven-development`)
- User asks to **open / merge a PR** for that work
- User asks to **close / Done** a story or epic after ship
- Controller would otherwise improvise Jira status or merge steps

## Hard stops (ask first)

Same spirit as SDD: do **not** push to a shared branch, open a PR, or merge to `main` unless the user asked (or an explicit standing instruction in the same turn). Marking Jira **Done** after a successful merge the user requested is part of this skill.

**Also ask first:** creating new NEWS issues from review leftovers — propose, wait for confirm, then file (see § Follow-up Jira gate).

## Atlassian defaults

- MCP: `user-Atlassian-MCP-Server` (or project Atlassian MCP) — OAuth, local Cursor only; see § Cloud agent notes
- Site: `https://informedcrew.atlassian.net`
- **cloudId:** `ebcd227d-1f6d-4a54-a6d7-cfe70e377a50` — pass on every call
- Project: **NEWS** only
- Common transitions (team-managed): **In Progress** `id=21`, **Done** `id=41` — if a transition fails, call `getTransitionsForJiraIssue` and use the matching id

## Loop

```
gate ticket ready
  → In Progress
  → plan + feat branch + /subagent-driven-development
  → follow-up Jira gate (propose → user confirms → file or none)
  → (user) push + PR
  → (user) squash-merge + delete branch
  → Done
  → delete SDD plan from main
  → (optional) epic Done when all children Done
```

### 1. Start work on a NEWS story

0. If the user did not name a key, pick from [docs/ROADMAP.md](../../docs/ROADMAP.md) (not from open To Do alone).
1. Fetch the issue (`searchJiraIssuesUsingJql` / `getJiraIssue`) — confirm summary, acceptance, parent epic.
2. Transition to **In Progress** (`transitionJiraIssue` with transition id `21`, or looked-up equivalent). Cloud mode: skip and list it in the PR body.
3. Sync `main`, create `feat/news-<N>-…` (never implement on `main` without explicit consent).
4. Write/commit the SDD plan under `.cursor/plans/` if using SDD; run `scripts/sdd-workspace` + ledger.
5. Execute `/subagent-driven-development` until final review is clean. Obey **no-subagent-timers**.

### 2. Follow-up Jira gate (before ship)

After SDD final review is clean (or a focused build is ready to ship), **before** push/PR/merge — and again when presenting finish options if anything new appeared:

1. Triage leftovers that must not die with the branch:
   - Final-review Critical/Important items parked or deferred as out-of-scope for this PR
   - Deferred minors that need product tracking
   - Mid-epic discoveries that should become additional NEWS items (per `AGENTS.md` / roadmap rules)
   - Infra / process gaps found while shipping (e.g. CI not gating merges)
2. Present a short list: proposed issue type (Bug / Task / Story), parent epic (prefer Epic **K** [NEWS-83](https://informedcrew.atlassian.net/browse/NEWS-83) for bugs/intake; Epic **L** [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84) or the active epic for in-epic follow-ups), one-line summary, and why — or explicitly **None**.
3. **Do not create issues until the user confirms** which items (all / some / none).
4. After confirmation: create in **NEWS** only, link **Relates** to the shipped key, update [docs/ROADMAP.md](../../docs/ROADMAP.md) (and `AGENTS.md` / `.cursor/rules/news-roadmap.mdc` when Current next changes). Prefer committing those docs on the feat branch before PR; if discovered after merge, include them in the plan-delete cleanup commit on `main`.

Skipping the *ask* is the defect. “None” after an honest triage is success.

### 3. Ship to GitHub (only when asked)

1. Ensure working tree is clean of secrets (never commit `mvp/.env`, `mvp/data/*.json`).
2. `git push -u origin HEAD`.
3. `gh pr create` with:
   - Title referencing NEWS-N
   - Body: Summary + Test plan + `Closes NEWS-N` when the PR fully completes the story
   - If `gh` is not installed (`command -v gh` fails): push the branch and open `https://github.com/philga7/informed-news/compare/main...<branch>?expand=1`, or let the Cloud Agent harness open the PR.
4. When the user asks to **merge**: prefer green CI (`gh pr checks`) before `gh pr merge <n> --squash --delete-branch` (see NEWS-103 for making this a hard refuse-on-red rule).
5. `git checkout main && git pull --ff-only origin main`

### Commit and PR conventions

- Story work: branch `feat/news-<N>-<slug>`, PR title `NEWS-<N>: <summary>`. Squash-merge uses the PR title as the commit subject.
- Everything else: [Conventional Commits](https://www.conventionalcommits.org/) (`docs:`, `chore:`, `fix:`, `feat:`) — semantic-release reads them (`.releaserc.json`, preset `conventionalcommits`).
- PR body: `## Summary` bullets, `## Test plan` checkboxes (what you ran, plus `CI green`), then `Closes NEWS-N` when the story is complete.
- Never force-push a shared branch, never push to `main` directly, never commit secrets.

### 4. Close the Jira item

1. Transition the story to **Done** (`id=41` or looked-up).
2. Delete the SDD plan file from `main` (`.cursor/plans/news-….plan.md`), commit + push that cleanup (same pattern as NEWS-51/52).
3. If the user asks to close a **parent epic**: verify children are Done (JQL), then Done the epic.

### 5. Controllers must not skip

| Step | Skip? |
|------|--------|
| In Progress at start of build | No |
| Follow-up Jira gate ask (propose or None) | No |
| Create follow-ups without user confirm | Yes — stop and ask |
| Done after user-requested merge | No |
| Push/PR/merge without user ask | Yes — stop and ask |
| Plan delete after merge | No (unless user says keep it) |

In a Cloud Agent, the Jira rows above move into the PR body (§ Cloud agent notes); the rest stand.

## Cloud agent notes

You are in **cloud mode** when running as a Cursor Cloud Agent (remote Ubuntu VM started from cursor.com/agents, Slack, GitHub, or a bot integration), or whenever the Atlassian MCP tools are not available in the session. Jira is handled outside the cloud agent. Environment setup, test commands, and what can't run are in `AGENTS.md` § Running in a Cloud Agent.

**Skip in cloud mode — list in the PR body instead:**

| Step | Local | Cloud |
|------|-------|-------|
| Fetch the NEWS issue | Atlassian MCP | Use the key + scope from the request and `docs/ROADMAP.md`; say in the PR body that the issue was not fetched |
| In Progress / Done transitions | `transitionJiraIssue` | Do not call — list under "Jira (handled outside the cloud agent)" |
| Follow-up Jira gate | Propose → user confirms → file | Do the triage, but do not file; list each proposal (type, parent epic, summary, why) or **None** |
| ROADMAP / AGENTS / `news-roadmap.mdc` status edits | After Jira changes | Do not mark items Done or advance Current next; list the edits to make once Jira is updated |
| Push + PR | When the user asks | The request that started the run is the ask: push the feat branch and open a PR. **Never merge**, never push to `main` |
| Plan delete after merge | On `main` after merge | Leave the plan; list "delete `.cursor/plans/<plan>.md` after merge" |

**Build path:** use `/subagent-driven-development` when the harness has a subagent / Task tool. Otherwise use the **focused build** fallback: implement the plan's tasks yourself in order on the feat branch, keep the SDD ledger (`scripts/sdd-workspace`), run the test commands each task names, then review the whole branch yourself against `.cursor/skills/requesting-code-review/code-reviewer.md` using `scripts/review-package`. State which path ran in the PR body.

**PR body additions (cloud mode):**

```markdown
## Build path
SDD with subagents | Focused build (no subagent tool) — <why>

## Jira (handled outside the cloud agent)
- NEWS-N: move to In Progress → Done when this PR merges
- Proposed follow-ups: <type> under <epic> — <summary> — <why> | None
- After merge: delete `.cursor/plans/<plan>.md`; ROADMAP edits: <list>

## Not verified in the cloud VM
- <suites that could not run and why>; CI is the gate
```

Include SDD's "Rulings I made" list in the PR body too.

## Examples

**User:** “Do NEWS-54 via /subagent-driven-development”  
→ In Progress → plan/branch → SDD → follow-up Jira gate → stop at finish options (do not merge until asked).

**User:** “Merge the PR to main”  
→ (if gate not done yet, run it first) → squash-merge → pull main → Done on the NEWS key → remove SDD plan → push cleanup.

**User:** “Close NEWS-48”  
→ confirm children Done → Done on epic.

**After NEWS-89 final review:** propose prune-store / UX bug / tech-debt tickets → user confirms → file NEWS-100–102 (+ ROADMAP) → then ship when asked.

**Cloud Agent:** “Do NEWS-90 via /subagent-driven-development”  
→ no Jira calls → feat branch → SDD (or focused build) → push + PR with Build path, Jira, and Not-verified sections → stop (no merge).
