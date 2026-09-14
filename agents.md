# AI Agent Guidelines for Informed News

## Project overview

Informed News is pivoting to an OSINT-oriented product shell:

1. **UI:** Vendored Kite soft fork under `apps/kite/` (MIT) — default `npm run dev` entry
2. **API / pipeline:** `mvp/server` — CFP (+ optional xcancel) ingest, JSON store, Ollama framing
3. **Owned brief:** Pipeline output maps into the Kite Brief (not Kagi-hosted `kite.json` long-term)
4. **Archived:** `_legacy/mvp-web/` (former React feed, NEWS-46) — reference only; not started by default scripts

`_legacy/` (including the OSINT/Supabase monolith and `mvp-web`) is historical — never the default `npm run dev` path.

## Architecture

```
apps/kite (SvelteKit Brief UI)
    ← owned brief adapter on mvp/server
mvp/server (Express)
    → mvp/data/*.json
    → CFP RSS + publisher scrape (+ optional xcancel)
    → Ollama Cloud (framing)
```

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
└── UPSTREAM_KITE.md
_legacy/
├── mvp-web/         # Archived React feed (NEWS-46) — not product UI
└── …                # Retired OSINT/Supabase stacks — reference only
```

## Default commands

- `npm run install:all` — `mvp/server` and `apps/kite` (Bun)
- `npm run dev` — **mvp/server + Kite** (UI http://localhost:5173, API :3001)
- `npm run typecheck` — `mvp/server`
- `npm run test:kite` — provenance + default-entrypoint + retire-mvp-web checks
- `npm run test:e2e:kite` — Playwright Brief smoke

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

- Classification goes through existing Ollama framing services
- Always treat framing as AI-assisted analysis, not ground truth
- Do not invent alternate model stacks without an explicit request

### Security

- Never commit secrets (`.env`, API keys, passwords)
- SSH key files `informed_news` / `informed_news.pub` are a separate rotate-and-untrack chore
- Prefer `MVP_PASSWORD_HASH` over plaintext password in shared environments
- Keep MIT attribution (`NOTICE`, `THIRD_PARTY.md`, `apps/kite/LICENSE`); do not ship Kagi trademarks as product chrome (NEWS-45)
- Default brief API is owned `mvp/server` adapter ([docs/OWNED_BRIEF.md](docs/OWNED_BRIEF.md)); `kite.kagi.com` is opt-in CC BY-NC only
- Product routes: Brief `/` + Transparency `/transparency`; Finance/Situation/Listen reserved in docs only ([docs/ROUTE_MAP.md](docs/ROUTE_MAP.md), NEWS-42)
- Leftover Kagi Maps / Translate / account-sync UX stays gated off ([docs/KAGI_SERVICE_CLEANUP.md](docs/KAGI_SERVICE_CLEANUP.md), NEWS-47)

## When adding features

1. Prefer Brief / shell work under `apps/kite` (minimize upstream churn) + docs
2. Pipeline types/services under `mvp/server`
3. Routes in `mvp/server/src/index.ts` (or auth router)
4. Update README / this file / smoke docs when the operator path changes

## Prohibited (unless explicitly requested)

- Making `_legacy/` or `_legacy/mvp-web` the default `npm run dev` target
- Calling Supabase from the live path
- Porting full OSINT workflows into the product without a new epic decision
- Committing `mvp/data/*.json` or `.env` files
- Defaulting the product UI at `kite.kagi.com` CC BY-NC data after owned-brief work (NEWS-44)

## Jira

Informed News work uses the **NEWS** project on Atlassian (`informedcrew.atlassian.net`). Prefer JQL `project = NEWS`. Epic A: NEWS-33.

## Decision order

1. Keep `npm run dev` → Kite Brief + `mvp/server` healthy
2. Type safety on the live path (`mvp/server`, `apps/kite`)
3. Thin UI / server-side pipeline logic
4. Clear errors and honesty about AI framing
5. Avoid scope creep from `_legacy/`
