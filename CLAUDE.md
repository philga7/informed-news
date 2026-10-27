# CLAUDE.md — informed-news

Repo-specific notes. Shared rules live in `~/.claude/CLAUDE.md`. Product invariants in `AGENTS.md` win over everything here.

## What this is

Informed News: an OSINT-oriented product shell. The operator's topics drive sources and filtering; the Kite Brief is the product UI; `mvp/server` owns the pipeline and owned-brief adapter.

Jira: project **NEWS** (informedcrew.atlassian.net, cloudId `ebcd227d-1f6d-4a54-a6d7-cfe70e377a50`). Details are in `.cursor/rules/jira-news.mdc`. Ordering lives in `docs/ROADMAP.md`.

## Stack

- **API / pipeline:** `mvp/server` — Node 22, TypeScript, Express. Flat JSON under `mvp/data/` (gitignored).
- **UI:** `apps/kite` — Bun 1.4.3, SvelteKit (vendored kite-public soft fork).
- **E2E:** Playwright (`npm run test:e2e:kite`) stays local — hermetic `e2e/stack/`, not CI.
- **Release:** semantic-release on merge to `main` (Conventional Commit squash title sets the bump).
- **CI:** `.github/workflows/ci.yml` job `MVP build & typecheck` (typecheck, server tests, `test:kite`, Kite unit + check + build).

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
| `apps/kite/` | Brief UI (SvelteKit) |
| `mvp/server/` | Express API + pipeline |
| `mvp/data/` | Runtime JSON (never commit) |
| `mvp/.env` | Secrets (never commit); see `mvp/.env.example` |
| `docs/ROADMAP.md` | Preferred item order; Jira wins on disagreement |
| `docs/` | Brief, triage, owned-brief, birdclaw, etc. |
| `.cursor/skills/` | Repo skills; `news-ship-loop` is the ship entry point |
| `AGENTS.md` | Product invariants for agents |
| `tests/` | Root `node --test` contracts (wired via `test:kite`) |
| `_legacy/` | Historical only — not the default product path |

## Ship-loop conventions

The full ritual is in `.cursor/skills/news-ship-loop/SKILL.md`. Repo skills win over legacy `.cursor/rules/` where they conflict; `AGENTS.md` still wins over skills on product invariants.

- **Order:** take the current next item in `docs/ROADMAP.md` and confirm it in Jira. If they disagree, Jira wins; fix ROADMAP in the same change.
- **Approach** per ticket (`ticket → approach → reason`). TDD for one module/seam, no new public interfaces or dependencies, about 3 tasks or fewer; otherwise SDD. An explicit `Approach:` in the prompt overrides.
- Branch `feat/news-<N>-…` (or `ci/news-<N>-…` for tooling) from `main`. One Conventional Commit per ticket on the branch; the PR title is the squash subject on `main` and names every key, e.g. `fix(NEWS-131, NEWS-155): …`.
- PR body: Summary, a Test plan with every item ticked, and `Closes NEWS-N` when the PR fully completes the story. Tick the CI item only with the green Actions run link.
- Propose discovered tickets (type, epic, one line, why) or "None". File them in NEWS only after Phil confirms.
- **PR flow:** open the PR → Claude Code reviews it → resolve findings (push re-runs the review) → Phil decides. **Never merge** without Phil's ship request.
- Never commit `mvp/data/*.json`, `.env`, or secrets.

## When reviewing a PR

Claude reports findings. It never approves or merges.

- PR title is a Conventional Commit with every `NEWS` key in the scope and the highest bump type in the batch (the **PR title** check enforces the shape; CONTRIBUTING § Squash merges).
- Approach (TDD/SDD) fits the ticket; SDD has a plan file if required.
- Every test-plan item is ticked and backed by evidence.
- CI is green with a GitHub Actions run link (do not tick CI without the link).
- `docs/ROADMAP.md` row updated when the change touches ordering/status.
- No secrets, `.env`, or `mvp/data/*.json` in the diff.
- Follow-up tickets proposed (or explicitly None).
- Product path stays Kite + `mvp/server`; no `_legacy/` default, no Supabase on the live path.
