# AI Agent Guidelines for Informed News

## Project overview

Informed News is pivoting to an OSINT-oriented product shell:

1. **UI:** Vendored Kite soft fork under `apps/kite/` (MIT) — default `npm run dev` entry
2. **API / pipeline:** `mvp/server` — CFP / curated RSS / topic-search ingest, JSON store, Ollama framing (X history via [birdclaw](docs/BIRDCLAW.md), not xcancel)
3. **Owned brief:** Pipeline output maps into the Kite Brief (not Kagi-hosted `kite.json` long-term)
4. **Archived:** `_legacy/mvp-web/` (former React feed, NEWS-46) — reference only; not started by default scripts

`_legacy/` (including the OSINT/Supabase monolith and `mvp-web`) is historical — never the default `npm run dev` path.

## Architecture

```
apps/kite (SvelteKit Brief UI)
    ← owned brief adapter on mvp/server (topic Brief: sections per topic, docs/BRIEF.md)
mvp/server (Express)
    → mvp/data/*.json
    refresh (timer every REFRESH_INTERVAL_HOURS + startup catch-up + POST /api/fetch, single-flight):
    → CFP RSS + publisher scrape (+ curated RSS)
    → topic search: Google News RSS + local SearXNG (docs/TOPIC_SEARCH.md)
    → triage: keyword/mute → dedupe → Jev headline → scrape survivors → Jev body (docs/TRIAGE.md)
    → Brief summaries: Ollama, shown stories only (top 3 per topic at refresh, rest on demand)
    → Ollama Cloud (framing)
```

The server starts an auto-refresh scheduler (`startRefreshScheduler` in `mvp/server/src/index.ts`) that spends real API budget (CFP, search, Jev, Ollama). Set `REFRESH_INTERVAL_HOURS=off` when you need the server up without refreshing. `npm run test:e2e:kite` and the Kite integration suite use their own hermetic stack (`e2e/stack/`: own ports, seeded temp data dir, generated env file with refresh off and no AI keys) — never the dev server, `mvp/data` or `mvp/.env`. `npm test` in `mvp/server` runs through `src/testing/withTempDataDir.ts`, which points `MVP_DATA_DIR` at a fresh temp dir and fails the run if any test leaves files there, so a test that forgets a store stub or temp path is caught instead of touching `mvp/data`. Running a test file directly with `node --test` skips that net; wrap it the same way (`node --import tsx src/testing/withTempDataDir.ts node --import tsx --test <file>`). `createApp` never starts timers.

### Layout

```
apps/
└── kite/            # Vendored kite-public @ pinned SHA (see UPSTREAM.md)
mvp/
├── server/          # Express API (auth, fetch, classify, articles) — keep
├── data/            # Runtime JSON (gitignored)
├── .env.example
└── SMOKE.md         # API smoke (classify + citations)
docs/
├── UPSTREAM_KITE.md
└── AGENT_SKILLS.md   # Portable repo-local skills recipe
.cursor/skills/         # Cursor agent skills (shape → gate → build)
_legacy/
├── mvp-web/         # Archived React feed (NEWS-46) — not product UI
└── …                # Retired OSINT/Supabase stacks — reference only
```

## Default commands

- `npm run install:all` — `mvp/server` and `apps/kite` (Bun)
- `npm run dev` — **mvp/server + Kite** (UI http://localhost:5173, API :3001)
- `npm run typecheck` — `mvp/server`
- `npm run test:kite` — provenance + default-entrypoint + retire-mvp-web checks
- `npm run test:e2e:kite` — Playwright Brief smoke (own seeded stack, Kite :5174)
- `cd apps/kite && bun run check` — svelte-check (expect 0 errors, 0 warnings); `bun run test:unit` / `bun run test:integration` — Kite vitest

Do **not** treat `_legacy/` (including `_legacy/mvp-web`) as the primary product UI.

## Agent responsibilities

### Code generation

- Prefer changes in `apps/kite` wrappers / Informed News glue over rewriting upstream kite files
- Put pipeline/business logic in `mvp/server`; keep UI thin
- TypeScript with strict checking where the package already uses it
- Do not reintroduce Supabase, multi-tenant orgs, or full OSINT topic/watch/indicator models into the live path
- Do not revive `_legacy/mvp-web` into the default product path without an explicit product decision

### Data & API

- Persist via `mvp/server` store helpers — flat JSON files
- Protect mutating/list APIs with session middleware (`requireApiSession`)
- Env vars load from `mvp/.env` (see `mvp/.env.example`)
- Dual citations on articles when scrape succeeds (`cfpUrl`, `publisherUrl`)
- Compat surface: [docs/MVP_API_COMPAT.md](docs/MVP_API_COMPAT.md)

### Framing / AI

- Story framing/classify still goes through existing Ollama framing services (legacy path)
- Epic **J** claims desk (parked, NEWS-91): TypeSafe = judgment-of-record; Ollama = propose candidates + verbiage only ([docs/CLAIMS_DISCERNMENT.md](docs/CLAIMS_DISCERNMENT.md))
- Always treat AI-assisted analysis as not ground truth — status/evidence, not verdicts
- Do not invent alternate model stacks without an explicit request

### Security

- Never commit secrets (`.env`, API keys, passwords)
- SSH key files `informed_news` / `informed_news.pub` are a separate rotate-and-untrack chore
- Prefer `MVP_PASSWORD_HASH` over plaintext password in shared environments
- Keep MIT attribution (`NOTICE`, `THIRD_PARTY.md`, `apps/kite/LICENSE`); do not ship Kagi trademarks as product chrome (NEWS-45)
- Default brief API is owned `mvp/server` adapter ([docs/OWNED_BRIEF.md](docs/OWNED_BRIEF.md)); `kite.kagi.com` is opt-in CC BY-NC only
- Product routes: Brief `/` + Transparency `/transparency` + Topics `/topics` (session) + Filtered out `/filtered` (session); Finance/Situation/Listen reserved in docs only ([docs/ROUTE_MAP.md](docs/ROUTE_MAP.md), NEWS-42)
- Leftover Kagi Maps / Translate / account-sync UX stays gated off ([docs/KAGI_SERVICE_CLEANUP.md](docs/KAGI_SERVICE_CLEANUP.md), NEWS-47)

## When adding features

1. Prefer Brief / shell work under `apps/kite` (minimize upstream churn) + docs
2. Pipeline types/services under `mvp/server`
3. Routes live in `mvp/server/src/app.ts` (`createApp`) (plus auth router)
4. Update README / this file / smoke docs when the operator path changes

## Prohibited (unless explicitly requested)

- Making `_legacy/` or `_legacy/mvp-web` the default `npm run dev` target
- Calling Supabase from the live path
- Porting full OSINT workflows into the product without a new epic decision
- Committing `mvp/data/*.json` or `.env` files
- Defaulting the product UI at `kite.kagi.com` CC BY-NC data after owned-brief work (NEWS-44)

## Jira

Informed News work uses the **NEWS** project on Atlassian (`informedcrew.atlassian.net`). Prefer JQL `project = NEWS`. Skills that need an issue tracker (e.g. `/code-review` fetching the spec) read [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

**Item ordering:** [docs/ROADMAP.md](docs/ROADMAP.md). Product direction: [docs/VISION.md](docs/VISION.md). Binding choices: [docs/DECISIONS.md](docs/DECISIONS.md). **Current next:** Epic **L** [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84) topic-driven brief (topics → search → triage → Brief → full stories, no review queue): [NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85)–[NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91), [NEWS-99](https://informedcrew.atlassian.net/browse/NEWS-99), [NEWS-100](https://informedcrew.atlassian.net/browse/NEWS-100), [NEWS-102](https://informedcrew.atlassian.net/browse/NEWS-102), [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98), [NEWS-104](https://informedcrew.atlassian.net/browse/NEWS-104), [NEWS-115](https://informedcrew.atlassian.net/browse/NEWS-115), and [NEWS-117](https://informedcrew.atlassian.net/browse/NEWS-117) Done; Epic L has only Later rows left. Epic **K** [NEWS-118](https://informedcrew.atlassian.net/browse/NEWS-118), [NEWS-114](https://informedcrew.atlassian.net/browse/NEWS-114), [NEWS-122](https://informedcrew.atlassian.net/browse/NEWS-122) (CFP publisher-URL scrape single deadline), [NEWS-94](https://informedcrew.atlassian.net/browse/NEWS-94) (primary-source plumbing), [NEWS-95](https://informedcrew.atlassian.net/browse/NEWS-95) (Topics follow-ups), [NEWS-97](https://informedcrew.atlassian.net/browse/NEWS-97) ("WORLD" label on topic Brief cards), [NEWS-101](https://informedcrew.atlassian.net/browse/NEWS-101) (full-story unavailable UI feedback), [NEWS-103](https://informedcrew.atlassian.net/browse/NEWS-103) (require green CI before merge), [NEWS-105](https://informedcrew.atlassian.net/browse/NEWS-105) (e2e coverage gaps for Filtered out + Less like this), [NEWS-107](https://informedcrew.atlassian.net/browse/NEWS-107) (app test reads the real mvp/data stores), [NEWS-125](https://informedcrew.atlassian.net/browse/NEWS-125) (Less like this keyboard/focus + 409 e2e), [NEWS-108](https://informedcrew.atlassian.net/browse/NEWS-108) (group refresh-runner deps in `CreateAppDeps`), [NEWS-126](https://informedcrew.atlassian.net/browse/NEWS-126) (story cards expose expand state and keyboard selection to assistive tech), [NEWS-124](https://informedcrew.atlassian.net/browse/NEWS-124) (ruleset: `main` requires CI; no direct pushes), [NEWS-129](https://informedcrew.atlassian.net/browse/NEWS-129) (keyboard story selection announced in a polite live region), [NEWS-130](https://informedcrew.atlassian.net/browse/NEWS-130) (shared article view title is plain text, not a dead toggle), [NEWS-133](https://informedcrew.atlassian.net/browse/NEWS-133) (keyboard selection follows the rendered topic Brief cards), [NEWS-134](https://informedcrew.atlassian.net/browse/NEWS-134) (Enter on a focused button or link activates that control, not the j / k selection), [NEWS-135](https://informedcrew.atlassian.net/browse/NEWS-135) (shared article view: j / k select nothing, so Enter / o / x can't collapse the shared story), [NEWS-136](https://informedcrew.atlassian.net/browse/NEWS-136) (shared article view: a blurred card reveals on click and Enter instead of being a dead button), [NEWS-137](https://informedcrew.atlassian.net/browse/NEWS-137) (plain story list and single-page mode: j / k / G / gg walk the rendered cards), [NEWS-138](https://informedcrew.atlassian.net/browse/NEWS-138) (keyboard selection stays on its story when the Brief list changes), [NEWS-140](https://informedcrew.atlassian.net/browse/NEWS-140) (shared article view: a shared link whose story isn't found leaves the shared view with a not-found notice), [NEWS-141](https://informedcrew.atlassian.net/browse/NEWS-141) (Kite's keyword filter blurs / hides topic Brief cards), [NEWS-146](https://informedcrew.atlassian.net/browse/NEWS-146) (an opened topic Brief card doesn't hide or blur when its summary loads), [NEWS-142](https://informedcrew.atlassian.net/browse/NEWS-142) (plain list linked-story treatment lands on the linked card), and [NEWS-143](https://informedcrew.atlassian.net/browse/NEWS-143) (keyboard selection names a blurred card by its filter keywords and reveals it on Enter / o), [NEWS-144](https://informedcrew.atlassian.net/browse/NEWS-144) (in-app re-follow of a last-handled shared URL after `updateUrl`), [NEWS-147](https://informedcrew.atlassian.net/browse/NEWS-147) (Adjust filters opens Filters tab), [NEWS-145](https://informedcrew.atlassian.net/browse/NEWS-145) (polite info/success toasts), and [NEWS-148](https://informedcrew.atlassian.net/browse/NEWS-148) (blurred cards hide title from assistive tech), [NEWS-149](https://informedcrew.atlassian.net/browse/NEWS-149) (expand all skips blurred cards), [NEWS-150](https://informedcrew.atlassian.net/browse/NEWS-150) (open-card filter carry across Brief reload), [NEWS-116](https://informedcrew.atlassian.net/browse/NEWS-116) (Topics/Add story generic 5xx copy), [NEWS-119](https://informedcrew.atlassian.net/browse/NEWS-119) (shared store write helper), [NEWS-120](https://informedcrew.atlassian.net/browse/NEWS-120) (triage write-back patches only its own fields), [NEWS-132](https://informedcrew.atlassian.net/browse/NEWS-132) (pin conventional-changelog-conventionalcommits to ^9.3.1), [NEWS-151](https://informedcrew.atlassian.net/browse/NEWS-151) (topic Brief filter carry out of `$derived`), [NEWS-152](https://informedcrew.atlassian.net/browse/NEWS-152) (remaining stores on the shared JSON write helper), and [NEWS-153](https://informedcrew.atlassian.net/browse/NEWS-153) (re-classify when triage scrapes the first usable body), and [NEWS-154](https://informedcrew.atlassian.net/browse/NEWS-154) (topic Brief: closing every open card clears open-time keyword-filter decisions) Done; [NEWS-157](https://informedcrew.atlassian.net/browse/NEWS-157) + [NEWS-158](https://informedcrew.atlassian.net/browse/NEWS-158) (brief-seen / updateMeta onto enqueueFileWrite) Done; [NEWS-159](https://informedcrew.atlassian.net/browse/NEWS-159) + [NEWS-156](https://informedcrew.atlassian.net/browse/NEWS-156) (usable-body rule / headline-only classify after body) Done; [NEWS-160](https://informedcrew.atlassian.net/browse/NEWS-160) (retire unused `createFilterMatcher`) + [NEWS-161](https://informedcrew.atlassian.net/browse/NEWS-161) (batch classify single-flight) Done; [NEWS-123](https://informedcrew.atlassian.net/browse/NEWS-123) (retire xcancel ingest; use [birdclaw](docs/BIRDCLAW.md)) Done; [NEWS-162](https://informedcrew.atlassian.net/browse/NEWS-162) Done; [NEWS-165](https://informedcrew.atlassian.net/browse/NEWS-165) + [NEWS-171](https://informedcrew.atlassian.net/browse/NEWS-171) (VISION / DECISIONS and the 0.x release rule, PR #205) and [NEWS-131](https://informedcrew.atlassian.net/browse/NEWS-131) + [NEWS-155](https://informedcrew.atlassian.net/browse/NEWS-155) + [NEWS-174](https://informedcrew.atlassian.net/browse/NEWS-174) (ship-loop links, Conventional Commit PR titles, Topics copy, PR #207) Done. [NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167) (triage verdict and Approved / Filtered / All view) Done; [NEWS-172](https://informedcrew.atlassian.net/browse/NEWS-172) (citation guard) Done; [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173) (CourtListener / RECAP court checks) Done. **Current next** is [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168), then [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169). [NEWS-139](https://informedcrew.atlassian.net/browse/NEWS-139), [NEWS-128](https://informedcrew.atlassian.net/browse/NEWS-128), and [NEWS-121](https://informedcrew.atlassian.net/browse/NEWS-121) stay on that dev-tooling queue and do not block the news section. Hosting [NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109)–[NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112) comes after [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169) and before the SPA ([NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170)); the app runs locally until then. Epic **K** [NEWS-83](https://informedcrew.atlassian.net/browse/NEWS-83) stays open as bug intake. Epic **J** Done and the claims desk **parked** by L ([NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91): no Radar page, no Brief claims lead; server APIs and stored claims remain; extraction runs only when called manually). Desk v1 (**NEWS-57**) Done-demo complete and parked; Later children parked. Discernment: [docs/CLAIMS_DISCERNMENT.md](docs/CLAIMS_DISCERNMENT.md). Ask before parked Later or Epic **B**. Do not pick parked B–G epics unless the user reorders.

**AI split (Epic J, parked but binding):** TypeSafe / Jev = structured judgments (Choice / Score / Noul + confidence). Ollama = claim-candidate proposal + Brief verbiage only — not classifier-of-record for claims. No Verified badges or claim verdicts.

## Agent skill loop

Repo-local skills live under `.cursor/skills/` (see [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md)). Skills are the up-to-date source of truth for agent workflows; where a skill and a legacy `.cursor/rules/` entry conflict, the **skill wins**. Product invariants in this file still win over skills. Mid-epic: do not re-grill finished work; new discoveries become additional NEWS items.

1. **Shape first:** `/find-skills` → `/grill-me` → `/frontend-design` and/or `/prototype` / `/image-to-code` until scope is sharp. Do not start product implementation from a vague idea.
2. **Gate:** create or update a **NEWS** issue only when scope, UX direction, and open questions are resolved.
3. **Build:** `/tdd` or `/subagent-driven-development` per `/news-ship-loop` Approach → `/agent-browser` / `/diagnosing-bugs` → `/skill-creator` / `/mcp-builder` as needed.
4. **Ship:** `/news-ship-loop` — In Progress → (chosen approach) → update `docs/PRODUCT_SPEC.md` and `docs/WHATS_NEW.md` in the same PR → Claude Code review → resolve findings → merge when asked → Done → delete SDD plan. Trial approved 2026-10-26; review after 5 tickets have merged since it landed, including whether a Last checked bump on an unchanged spec is worth the diff ([docs/DECISIONS.md](docs/DECISIONS.md)).
5. **Product invariants still win** (Kite + `mvp/server`, no `_legacy/` default, no Supabase on the live path). Keep throwaway prototypes off the default `npm run dev` entrypoint.

### Skill cheat sheet

| Invoke | Does | When |
|--------|------|------|
| `/find-skills` | Searches/installs skills from the open ecosystem | “Is there a skill for X?” / missing capability |
| `/grill-me` | Relentless interview to sharpen a plan (uses companion `grilling`) | Idea or design is fuzzy; before tickets |
| `/frontend-design` | Pushes distinctive UI direction; avoids generic AI look | New or reshaped UI |
| `/prototype` | Throwaway code to answer one design/logic question | Sanity-check state model or UI variants |
| `/image-to-code` | Generate/analyze design images, then match in code | Vision-led frontend from mocks/refs |
| `/subagent-driven-development` | Fresh implementer subagent per task + review loop | Executing a **grilled** multi-step plan |
| `/tdd` | Red → green loop; tests at agreed seams through public interfaces | Building a feature or fixing a bug test-first |
| `/codebase-design` | Deep-module vocabulary (module, interface, seam, adapter) + design-it-twice | Shaping a module interface or deciding where a seam goes |
| `/svelte5-best-practices` | Svelte 5 runes, snippets, SvelteKit load/SSR patterns | Writing Kite components (leave upstream legacy-syntax files alone) |
| `/code-review` | Two parallel reviews of a diff: repo standards + code smells, and spec (the NEWS ticket) | Before opening a PR; "review since `main`" |
| `/playwright-best-practices` | Playwright locators, waiting, fixtures, flaky-test fixes | Writing or debugging `test:e2e:kite` specs (keep the hermetic `e2e/stack/`) |
| `/news-ship-loop` | NEWS Jira In Progress → PR/merge → Done + plan cleanup | Starting/finishing a NEWS-* item or merging its PR (only ship entry point) |
| `/fix-ci` | Find failing PR checks, inspect logs, apply focused fixes | PR CI red; used from `/news-ship-loop` CI-green step |
| `/get-pr-comments` | Summarize review comments on the active PR | Addressing PR feedback |
| `/make-pr-easy-to-review` | Clean noisy history / improve PR description without behavior changes | Before asking for review |
| `/deslop` | Remove AI-generated slop from the branch diff | After agent-heavy edits |
| `/verify-this` | Prove a falsifiable claim with baseline vs treatment evidence | “Did this fix it?” / verify before Done |
| `/weekly-review` | Weekly authored-commit synthesis | Status / retro |
| `/what-did-i-get-done` | Authored-commit summary for a time window | Status updates |
| `/osint` | Source credibility, verification, privacy/ethics | News analysis / OSINT planning |
| `/seo` | Metadata, headings, alt text, technical SEO | Landing / marketing pages |
| `/devops-risk-reducer` | CI/CD, secrets, deploy/rollback risk | Workflows, infra, deploy scripts |
| `/database-sage` | Schema, indexes, migrations, ORM pitfalls | SQL / models / migrations |
| `/update-skills` | Check copied skills for freshness | Refreshing repo-local skills with the portable recipe |
| `/agent-browser` | Scripted browser CLI (stub skill; install CLI separately) | Inspect/verify pages outside IDE browser |
| `/diagnosing-bugs` | Gated debug loop: repro → minimize → fix → regression | Hard bugs / “why is this broken/slow?” |
| `/skill-creator` | Author/improve skills and run evals | Packaging a workflow for reuse |
| `/mcp-builder` | Guide to build/test MCP servers | Adding a new MCP integration |
| `/jev` | When to call the `jev` MCP tools (TypeSafe Jev typed judgments) | Verify claims vs evidence, screen fetched text, classify/rerank/decide by meaning (dev tooling, not the product pipeline) |

Full install/copy recipe and licenses: [docs/AGENT_SKILLS.md](docs/AGENT_SKILLS.md).

## Decision order

1. Keep `npm run dev` → Kite Brief + `mvp/server` healthy
2. Type safety on the live path (`mvp/server`, `apps/kite`)
3. Thin UI / server-side pipeline logic
4. Clear errors and honesty about AI framing
5. Avoid scope creep from `_legacy/`
