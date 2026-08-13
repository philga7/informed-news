# AI Agent Guidelines for Informed News (MVP)

## Project overview

Informed News MVP is a greenfield app that:

1. Fetches Citizen Free Press (CFP) RSS items and scrapes publisher pages
2. Stores articles as local JSON (`mvp/data/`)
3. Classifies framing via Ollama Cloud
4. Shows a thin React UI: password login, feed, dual citations (CFP + Original), framing scores

**Primary architecture is the MVP.** The former OSINT / Supabase monolith under `_legacy/` is historical only — do not treat it as the default product path or wire it into `mvp/`.

## Architecture

```
mvp/web (React + Vite)
    → /api proxy → mvp/server (Express)
                      → mvp/data/*.json
                      → CFP RSS + publisher scrape
                      → Ollama Cloud (framing)
```

### Layout

```
mvp/
├── server/          # Express API (auth, fetch, classify, articles)
│   └── src/
│       ├── auth/    # Password + cookie session
│       ├── store/   # JSON article/meta store
│       ├── services/# RSS, scrape, Ollama framing, classify
│       └── index.ts
├── web/             # React UI (login, feed, article cards)
├── data/            # Runtime JSON (gitignored except .gitkeep)
├── .env.example
└── SMOKE.md         # E2E smoke checklist
_legacy/             # Retired OSINT stack — reference only
```

## Default commands

- `npm run dev` — start MVP server + web (root entrypoint)
- `npm run install:all` — install both MVP packages
- `npm run typecheck` — typecheck server and web
- Smoke path: [mvp/SMOKE.md](mvp/SMOKE.md)

Do **not** assume root `src/`, `backend/`, or Supabase are the live app; those live under `_legacy/` if present.

## Agent responsibilities

### Code generation

- Use TypeScript with strict checking
- Prefer functional React components with hooks
- Keep the UI thin: call `mvp/web/src/api.ts`; put business logic in `mvp/server`
- Match existing MVP patterns (session cookie auth, JSON store, framing honesty banner)
- Handle loading and error states in the UI
- Do not reintroduce Supabase, multi-tenant orgs, or OSINT topic/watch/indicator models into `mvp/`

### Data & API

- Persist via `mvp/server` store helpers (`articleStore`, `metaStore`) — flat JSON files
- Protect mutating/list APIs with session middleware (`requireApiSession`)
- Env vars load from `mvp/.env` (see `mvp/.env.example`)
- Dual citations: every article should expose `cfpUrl` and `publisherUrl` when scrape succeeds

### Framing / AI

- Classification goes through existing Ollama framing services
- Always treat framing as AI-assisted analysis, not ground truth (honesty copy in UI)
- Do not invent alternate model stacks without an explicit request

### Security

- Never commit secrets (`.env`, API keys, passwords)
- SSH key files `informed_news` / `informed_news.pub` are a **separate** rotate-and-untrack chore — not MVP runtime
- Prefer `MVP_PASSWORD_HASH` over plaintext password in shared environments

## When adding features

1. Types in `mvp/server/src/types` (and web `types` if UI needs them)
2. Store or service changes under `mvp/server`
3. Routes in `mvp/server/src/index.ts` (or auth router)
4. Thin UI updates under `mvp/web/src`
5. Update `mvp/SMOKE.md` / root README if the operator path changes

## Prohibited (unless explicitly requested)

- Making `_legacy/` the default `npm run dev` target
- Calling Supabase from the MVP
- Porting full OSINT workflows (topics, watch items, indicators, scan, claims) into MVP without a new product decision
- Committing `mvp/data/*.json` or `.env` files

## Jira

Informed News work uses the **NEWS** project on Atlassian (`informedcrew.atlassian.net`). Prefer JQL `project = NEWS`.

## Decision order

1. Keep the MVP path working (dev + smoke)
2. Type safety
3. Thin UI / server-side logic
4. Clear errors and honesty about AI framing
5. Avoid scope creep from `_legacy/`
