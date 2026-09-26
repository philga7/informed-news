# NEWS-80 — `/update-skills` portable freshness skill

## Goal

Ship a **repo-local** Cursor skill `update-skills` that checks whether copied skills under `.cursor/skills/` match their upstreams (via `skills-lock.json`), summarizes drift at **middle depth**, **always asks** before applying refreshes, and ships **dry-run fixtures** for offline regression. Portable via `docs/AGENT_SKILLS.md` like the rest of the skills recipe.

**Jira:** [NEWS-80](https://informedcrew.atlassian.net/browse/NEWS-80)  
**Spec authority:** NEWS-80 acceptance criteria (this plan argues from that ticket).  
**Branch:** `feat/news-80-update-skills`

## Global Constraints

- Skills live under `.cursor/skills/` only (no `-g` / `~/.cursor`). If the Skills CLI writes `.agents/skills/`, consolidate into `.cursor/skills/` and remove `.agents/skills`.
- **Never** run applying updates (`npx skills update`, re-`add` that overwrites trees) without in-session user approval. Check/summarize scripts must be read-only by default.
- Repo-local skills are listed in `docs/AGENT_SKILLS.md` under a **Repo-local skills** section; the checker **must** skip those names. Initial list: `news-ship-loop`, `update-skills`.
- Middle-depth summaries: for each outdated skill, summarize `SKILL.md` delta (short prose) **and** list other changed relative paths; do not dump full file diffs unless the user asks to expand.
- Do **not** change `docs/ROADMAP.md` Current next away from NEWS-79; this is tooling/meta.
- Do not commit secrets; do not push/PR/merge unless the user asks (news-ship-loop).
- Dry-run / fixture mode must not hit the network.
- Prefer Node or bash scripts that run with repo-available tooling (no new runtime deps unless already present). Prefer `node` for JSON + hashing.

## Context

- Lockfile: repo-root `skills-lock.json` (`source`, `sourceType`, `skillPath`, `computedHash` per skill).
- Install recipe: `docs/AGENT_SKILLS.md`.
- `npx skills update` applies immediately — there is no CLI dry-run; this skill exists because of that gap.
- Upstream sources are GitHub packages (`owner/repo` or full URL); compare against default branch tip for the skill directory that contains `skillPath`.

## Architecture

```
.cursor/skills/update-skills/
  SKILL.md                 # agent workflow: check → report → ask → apply
  scripts/check.mjs        # read-only inventory + compare (+ --fixtures)
  scripts/summarize.mjs    # middle-depth summary helpers (or merged into check)
  scripts/apply.sh         # ONLY invoked after user says yes; CLI + consolidate
  fixtures/                # offline trees for tests
  tests/run-fixtures.mjs   # asserts detect outdated / skip local / no-apply default
```

Check algorithm (live):

1. Parse `skills-lock.json`.
2. Parse repo-local names from `docs/AGENT_SKILLS.md` (**Repo-local skills** section — bullet list of backtick skill names).
3. For each lock entry not in the local set:
   - Resolve local dir `.cursor/skills/<name>/`.
   - Fetch upstream skill tree into a temp dir (GitHub: clone/`sparse-checkout` or equivalent of the directory containing `SKILL.md` from `skillPath`).
   - Compare file sets + content hashes (sha256 of file bytes; paths relative to skill root).
   - Emit status: `current` | `outdated` | `missing-local` | `check-failed`.
4. For `outdated`, produce middle-depth summary (SKILL.md prose + other changed paths list).

Apply path (SKILL.md only after approval):

- Prefer `npx skills add <source> --skill <name> -a cursor --copy -y` (or `npx skills update <name> -p -y` then consolidate).
- Consolidate `.agents/skills/*` → `.cursor/skills/` if needed.
- Leave commit to the user / existing git rules.

## Task 1: Docs section stub + check inventory (skip local)

**Files:**
- `docs/AGENT_SKILLS.md` — add **Repo-local skills** section listing `news-ship-loop` and `update-skills` (with one-line rationale each). Do not yet add full inventory row for update-skills if Task 5 owns that; **this task must create the section** the parser depends on.
- `.cursor/skills/update-skills/scripts/check.mjs` — start of the checker:
  - CLI: `node check.mjs --repo-root <path> [--json]`
  - Load lockfile; load local-skiplist from AGENT_SKILLS.md
  - Emit inventory: each skill → `locked` | `repo-local-skip` | `unlocked-dir` (dirs under `.cursor/skills` with no lock entry)
  - No network in this task yet; comparison can be stubbed as `not-checked`
- `.cursor/skills/update-skills/scripts/parse-local-skills.mjs` (or functions inside check.mjs) — parse the Repo-local section

**Tests (lightweight):** run check against this repo; assert `news-ship-loop` is `repo-local-skip` and a locked skill (e.g. `find-skills`) appears as locked/`not-checked`.

**Commit:** yes, focused message for NEWS-80 Task 1.

## Task 2: Upstream compare + middle-depth summary

**Depends on:** Task 1

**Files:**
- Extend `scripts/check.mjs` with live compare (default branch of `source` GitHub repo; skill directory derived from `skillPath`).
- Summary output: for outdated skills, print:
  1. Short SKILL.md change summary (use `diff` unified hunks reduced to a 5–15 line prose/bullet summary of what instructions changed — not the full patch by default)
  2. Bullet list of other relative paths that differ (added/removed/changed)
- Support `--skill <name>` to check one skill.
- Support env/flag `--offline` that refuses network (exit non-zero if live compare requested without fixtures).

**Failure handling:** network/API failures → `check-failed` with reason; do not treat as outdated.

**Tests:** at least one unit-style test with **mocked** local+upstream temp dirs (can live under `fixtures/` early) proving outdated detection and SKILL.md + other-files listing. Full fixture suite is Task 4; this task needs enough coverage that compare logic is proven.

**Commit:** yes.

## Task 3: SKILL.md workflow + apply helper (ask-first)

**Depends on:** Task 2

**Files:**
- `.cursor/skills/update-skills/SKILL.md` — pushy description (trigger on “are skills up to date”, “refresh skills”, `/update-skills`, skills lockfile drift). Body:
  1. Run check (read-only)
  2. Present report
  3. **Stop and ask** all / pick / none — never apply without explicit yes
  4. On yes: run apply helper for chosen skills only
  5. Show resulting `git status` / lockfile delta; do not commit unless user asks
- `.cursor/skills/update-skills/scripts/apply.sh` — applies one or more skill names via Skills CLI + consolidate `.agents` → `.cursor`; refuse to run if stdin/flag does not pass `--i-was-approved` (or equivalent guard so agents cannot casually invoke it)

**Commit:** yes.

## Task 4: Dry-run fixtures + fixture runner

**Depends on:** Tasks 1–2 (can parallel conceptual with 3; implement after 3 if apply docs reference fixtures)

**Files:**
- `.cursor/skills/update-skills/fixtures/` — minimal fake repo root with:
  - `skills-lock.json`
  - `docs/AGENT_SKILLS.md` (Repo-local section)
  - `.cursor/skills/` local trees
  - `upstream/` trees used as compare source when `--fixtures` is set
  - Cases: (a) current match, (b) outdated SKILL.md + extra file, (c) repo-local skip
- `.cursor/skills/update-skills/tests/run-fixtures.mjs` — runs check in `--fixtures` mode; asserts statuses and that apply is **not** invoked
- Document expected outputs in `fixtures/README.md`

**Commit:** yes.

## Task 5: Wire portable docs + AGENTS cheat sheet

**Depends on:** Tasks 3–4

**Files:**
- `docs/AGENT_SKILLS.md` — inventory row for `update-skills` (Package/Maintain stage, Informed News / portable recipe); Refresh section points to `/update-skills` as the preferred check-then-ask path; keep install block for upstream skills unchanged except note that `update-skills` is copied with the recipe (manual copy of the skill tree, not `npx skills add`)
- `AGENTS.md` — skill cheat sheet row for `/update-skills`
- Ensure Repo-local section still lists both locals

**Commit:** yes.

## Pre-flight conflict scan (controller)

| Pair / task | Shared surface | Check |
|-------------|----------------|-------|
| T1 ↔ T5 | `docs/AGENT_SKILLS.md` | T1 creates Repo-local section; T5 adds inventory + refresh pointer. No contradiction if T5 does not delete the section. |
| T2 ↔ T4 | `fixtures/`, check.mjs | T2 may add a minimal mock; T4 owns full fixture suite — T4 may extend, not rewrite compare API. |
| T3 ↔ T2 | apply vs check | Apply is separate binary/script; check remains read-only. |
| T3 self | SKILL.md vs apply.sh | Ask-first in SKILL.md matches `--i-was-approved` guard on apply. |
| T4 self | fixtures vs tests | Tests assert skip-local + outdated + no apply. |

**Ruling:** If T2 and T4 both touch fixtures, T2 only adds the minimum needed to prove compare; T4 owns final fixture layout — prefer T4 extending T2’s paths over renaming.

## Done when

- NEWS-80 acceptance criteria satisfied on `feat/news-80-update-skills`
- Fixture tests pass
- Final SDD whole-branch review clean
- Stop for news-ship-loop push/PR (user ask)
