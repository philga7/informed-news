---
name: news-ship-loop
description: >-
  Informed News ship ritual for NEWS Jira items: transition In Progress, run
  SDD (or focused build), push/open PR, squash-merge to main when asked, mark
  Done, delete the SDD plan. Use when starting or finishing a NEWS-* ticket,
  opening/merging a feature PR, closing an epic after children are Done, or
  when the user says ship / merge the PR / close the ticket.
---

# NEWS ship loop

Codifies how Informed News work moves through **Jira ↔ git ↔ GitHub**. Does not replace product invariants in `AGENTS.md` or Atlassian connection details in `.cursor/rules/jira-news.mdc`.

**Companion skills / rules**

| Piece | Role |
|-------|------|
| `/subagent-driven-development` | Build + review loop on a feat branch |
| `.cursor/rules/jira-news.mdc` | Always `project = NEWS` + `cloudId` |
| `.cursor/rules/no-subagent-timers.mdc` | End turn on background Tasks; no timer waits |
| User git / `gh pr` rules | Commit/PR formatting when those steps run |

## When to use

- User names a **NEWS-*** item to implement (often with `/subagent-driven-development`)
- User asks to **open / merge a PR** for that work
- User asks to **close / Done** a story or epic after ship
- Controller would otherwise improvise Jira status or merge steps

## Hard stops (ask first)

Same spirit as SDD: do **not** push to a shared branch, open a PR, or merge to `main` unless the user asked (or an explicit standing instruction in the same turn). Marking Jira **Done** after a successful merge the user requested is part of this skill.

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
  → plan + feat branch + /subagent-driven-development
  → (user) push + PR
  → (user) squash-merge + delete branch
  → Done
  → delete SDD plan from main
  → (optional) epic Done when all children Done
```

### 1. Start work on a NEWS story

0. If the user did not name a key, pick from [docs/ROADMAP.md](../../docs/ROADMAP.md) (not from open To Do alone).
1. Fetch the issue (`searchJiraIssuesUsingJql` / `getJiraIssue`) — confirm summary, acceptance, parent epic.
2. Transition to **In Progress** (`transitionJiraIssue` with transition id `21`, or looked-up equivalent).
3. Sync `main`, create `feat/news-<N>-…` (never implement on `main` without explicit consent).
4. Write/commit the SDD plan under `.cursor/plans/` if using SDD; run `scripts/sdd-workspace` + ledger.
5. Execute `/subagent-driven-development` until final review is clean. Obey **no-subagent-timers**.

### 2. Ship to GitHub (only when asked)

1. Ensure working tree is clean of secrets (never commit `mvp/.env`, `mvp/data/*.json`).
2. `git push -u origin HEAD`.
3. `gh pr create` with:
   - Title referencing NEWS-N
   - Body: Summary + Test plan + `Closes NEWS-N` when the PR fully completes the story
4. When the user asks to **merge**: `gh pr merge <n> --squash --delete-branch`
5. `git checkout main && git pull --ff-only origin main`

### 3. Close the Jira item

1. Transition the story to **Done** (`id=41` or looked-up).
2. Delete the SDD plan file from `main` (`.cursor/plans/news-….plan.md`), commit + push that cleanup (same pattern as NEWS-51/52).
3. If the user asks to close a **parent epic**: verify children are Done (JQL), then Done the epic.

### 4. Controllers must not skip

| Step | Skip? |
|------|--------|
| In Progress at start of build | No |
| Done after user-requested merge | No |
| Push/PR/merge without user ask | Yes — stop and ask |
| Plan delete after merge | No (unless user says keep it) |

## Examples

**User:** “Do NEWS-54 via /subagent-driven-development”  
→ In Progress → plan/branch → SDD → stop at finish options (do not merge until asked).

**User:** “Merge the PR to main”  
→ squash-merge → pull main → Done on the NEWS key → remove SDD plan → push cleanup.

**User:** “Close NEWS-48”  
→ confirm children Done → Done on epic.
