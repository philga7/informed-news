---
name: update-skills
description: Check whether copied skills under `.cursor/skills/` are stale, summarize the drift, and ask before refreshing them. Use this whenever the user asks if skills are up to date, wants to refresh skills, invokes `/update-skills`, or mentions skill lockfile drift.
---

# Update Skills

Use this skill for the repo-local freshness workflow.

## Workflow

1. Run the read-only checker first.
2. Present the report, including any repo-local skips and any outdated skills.
3. Stop and ask the user to choose: update all, pick specific skills, or update none. Never apply changes without explicit approval.
4. If the user says yes, run `scripts/apply.sh --i-was-approved <skill> ...` for only the chosen skills.
5. Show the resulting `git status` and lockfile delta. Do not commit unless the user explicitly asks.

## Guardrails

- Keep `scripts/check.mjs` read-only.
- Treat `news-ship-loop` and `update-skills` as repo-local and skip them in checks.
- `scripts/apply.sh` must refuse to run unless the approval flag is present.
