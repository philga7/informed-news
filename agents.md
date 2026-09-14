# AI Agent Guidelines for Informed News

## Project overview

Informed News is pivoting to an OSINT-oriented product shell:

1. **UI:** Vendored Kite soft fork under `apps/kite/` (MIT) — default `npm run dev` entry
2. **API / pipeline:** `mvp/server` — CFP (+ optional xcancel) ingest, JSON store, Ollama framing
3. **Owned brief:** Epic A follow-ons map pipeline output into the Kite Brief (not Kagi-hosted `kite.json` long-term)
4. **Frozen:** `mvp/web` (old React feed) — still typechecks; not the default UI (archive later: NEWS-46)

`_legacy/` is historical OSINT/Supabase only — never the default `npm run dev` path.

## Architecture

```
apps/kite (SvelteKit Brief UI)
    ← (brief / static data; owned adapter coming)
mvp/server (Express)
    → mvp/data/*.json
    → CFP RSS + publisher scrape (+ optional xcancel)
    → Ollama Cloud (framing)
```

`mvp/web` remains in-tree until NEWS-46 but is **not** started by `npm run dev`.

### Layout

```
apps/
└── kite/            # Vendored kite-public @ pinned SHA (see UPSTREAM.md)
mvp/
├── server/          # Express API (auth, fetch, classify, articles) — keep
├── web/             # Frozen React UI — optional `npm run dev:mvp-web`
├── data/            # Runtime JSON (gitignored)
├── .env.example
└── SMOKE.md         # Legacy MVP feed smoke (API still useful)
docs/
└── UPSTREAM_KITE.md
_legacy/             # Retired stacks — reference only
```

## Default commands

- `npm run install:all` — `mvp/server`, `mvp/web` (typecheck), and `apps/kite` (Bun)
- `npm run dev` — **mvp/server + Kite** (UI http://localhost:5173, API :3001)
- `npm run typecheck` — server + frozen `mvp/web`
- `npm run test:kite` — provenance + default-entrypoint checks
- `npm run test:e2e:kite` — Playwright Brief smoke
- Optional: `npm run dev:mvp-web` — old React feed (not product path)

Do **not** treat `_legacy/` or `mvp/web` as the primary product UI.

## Agent responsibilities

### Code generation

- Prefer changes in `apps/kite` wrappers / Informed News glue over rewriting upstream kite files
- Put pipeline/business logic in `mvp/server`; keep UI thin
- TypeScript with strict checking where the package already uses it
- Do not reintroduce Supabase, multi-tenant orgs, or full OSINT topic/watch/indicator models into the live path

### Data & API

- Persist via `mvp/server` store helpers — flat JSON files
- Protect mutating/list APIs with session middleware (`requireApiSession`)
- Env vars load from `mvp/.env` (see `mvp/.env.example`)
- Dual citations on articles when scrape succeeds (`cfpUrl`, `publisherUrl`)

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
- Leftover Kagi Maps / Translate / account-sync UX stays gated off ([docs/KAGI_SERVICE_CLEANUP.md](docs/KAGI_SERVICE_CLEANUP.md), NEWS-47)

## When adding features

1. Prefer Brief / shell work under `apps/kite` (minimize upstream churn) + docs
2. Pipeline types/services under `mvp/server`
3. Routes in `mvp/server/src/index.ts` (or auth router)
4. Update README / this file / smoke docs when the operator path changes

## Prohibited (unless explicitly requested)

- Making `_legacy/` or frozen `mvp/web` the default `npm run dev` target
- Calling Supabase from the live path
- Porting full OSINT workflows into the product without a new epic decision
- Committing `mvp/data/*.json` or `.env` files
- Defaulting the product UI at `kite.kagi.com` CC BY-NC data after owned-brief work (NEWS-44)

## Jira

Informed News work uses the **NEWS** project on Atlassian (`informedcrew.atlassian.net`). Prefer JQL `project = NEWS`. Epic A: NEWS-33.

## Decision order

1. Keep `npm run dev` → Kite Brief + `mvp/server` healthy
2. Type safety (including frozen `mvp/web` until archived)
3. Thin UI / server-side pipeline logic
4. Clear errors and honesty about AI framing
5. Avoid scope creep from `_legacy/`
