---
name: update-skills
description: Check whether copied skills under `.cursor/skills/` are stale, summarize the drift, and ask before refreshing them. Use this whenever the user asks if skills are up to date, wants to refresh skills, invokes `/update-skills`, or mentions skill lockfile drift.
---

# Update Skills

Use this skill for the repo-local freshness workflow.

## Workflow

1. Run the read-only checker first. Pass a GitHub token so compares aren't rate-limited (60 unauthenticated requests/hour): `GH_TOKEN="$(gh auth token)" node scripts/check.mjs --repo-root <repo>`.
2. Present the report, including any repo-local skips, any skills kept current through a local override, any override conflicts, and any outdated skills.
3. Stop and ask the user to choose: update all, pick specific skills, or update none. Never apply changes without explicit approval.
4. If the user says yes, run `scripts/apply.sh --i-was-approved <skill> ...` for only the chosen skills.
5. Show the resulting `git status` and lockfile delta. Do not commit unless the user explicitly asks.

## Local overrides

A deliberate repo edit to a copied skill is recorded as `skills-overrides/<skill>.patch` at the repo root (a diff from upstream to the local copy).

- `check.mjs` applies the patch to upstream before comparing, so an edited skill reports `current, local override …` instead of permanently `outdated`. When upstream changes elsewhere, it reports `outdated` with the diff measured past the override. When upstream changes the lines the edit touches, it reports `override-conflict`.
- `apply.sh` re-applies the patch after refreshing, and refuses up front if the skill is in `override-conflict`.
- To record or update an override, edit the skill while it is otherwise current with upstream, then run `GH_TOKEN="$(gh auth token)" node scripts/record-override.mjs --repo-root <repo> <skill>`. If the local copy matches upstream, the script removes any old patch.
- On `override-conflict`: refresh the skill, merge the local edit back in by hand, then re-record. Ask the user before dropping an override.

## Guardrails

- Keep `scripts/check.mjs` read-only.
- Treat `news-ship-loop` and `update-skills` as repo-local and skip them in checks.
- `scripts/apply.sh` must refuse to run unless the approval flag is present.
- Permission-only differences (executable bits) are never recorded as overrides; the checker compares file contents only.
