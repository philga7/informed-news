# Informed News (MVP)

**Copyright © 2025 Sandiebeach LLC. All Rights Reserved.**  
**Proprietary Software — See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md)**

Greenfield MVP for Citizen Free Press (CFP) ingest, Ollama framing classification, and a thin React UI. Data lives in local JSON files — not Supabase.

**Flow:** CFP RSS → publisher scrape → classify framing → display titles, dual citations, and scores.

## Stack

| Layer | Path | Role |
|-------|------|------|
| API | `mvp/server` | Express: auth, fetch, classify, articles |
| UI | `mvp/web` | React + Vite (login, feed, framing detail) |
| Data | `mvp/data/*.json` | Flat-file article + meta store (gitignored) |

## Quick start

```bash
cp mvp/.env.example mvp/.env
# Set MVP_PASSWORD, SESSION_SECRET, OLLAMA_API_KEY (and optional CFP_FEED_URL / FETCH_LIMIT)

npm install
npm run install:all
npm run dev
```

- UI: http://localhost:5174  
- API: http://localhost:3001 (`GET /health`)

`npm run dev` starts the MVP only (server + web). The old OSINT monolith is not on this path.

## Smoke test

Follow **[mvp/SMOKE.md](mvp/SMOKE.md)**: login → Refresh CFP → Classify new → confirm dual links (CFP + Original) and framing scores.

## Environment

See `mvp/.env.example`:

- `MVP_PASSWORD` / `MVP_PASSWORD_HASH` — single-password session auth  
- `SESSION_SECRET` — cookie signing  
- `OLLAMA_API_KEY` / `OLLAMA_MODEL` — framing classify  
- `CFP_FEED_URL` / `FETCH_LIMIT` — RSS fetch defaults  
- `PORT` — API port (default `3001`)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | MVP server + web |
| `npm run install:all` | Install `mvp/server` and `mvp/web` deps |
| `npm run typecheck` | Typecheck both packages |
| `npm run build` | Build the web client |

## Versioning & CI

Process model matches HARN: **`main` + short-lived branches**, Conventional Commits, PR CI, semantic-release on merge to `main`.

- **Version line:** stay on **`0.x`** until an intentional `1.0.0` (baseline tag `v0.1.0`). See [CONTRIBUTING.md](CONTRIBUTING.md).
- **CI:** PRs to `main` run MVP install → typecheck → build.
- **Release:** merge to `main` re-validates, then semantic-release (`npmPublish: false`).
- **Release ≠ deploy:** GitHub Release/tag is versioning only. Runtime is local MVP and/or Vercel (or other host) — not performed by the Release workflow.

## Hosting (Vercel)

Root [`vercel.json`](vercel.json) deploys the **MVP web UI** (`mvp/web` → static `mvp/web/dist`). It installs `mvp/web` deps so Vite/`tsc` are available at build time.

| Concern | Where |
|---------|--------|
| **Web UI** | Vercel (Git integration; preview + production) |
| **API** | Local `mvp/server` (`npm run server` / `npm run dev`) — not ported to Vercel serverless |
| **Versioning** | GitHub Release via semantic-release (does not deploy) |

`_legacy/vercel.json` is historical only and is not the deploy entrypoint.

## Legacy code

The previous OSINT / Supabase / Express monolith lives under **[`_legacy/`](_legacy/)** for reference. It is not the default app and must not be wired into `mvp/`.

## Security chore (separate)

SSH key files `informed_news` / `informed_news.pub` may still exist in the repo history. **Rotate those keys and untrack them** as a dedicated security task (they are listed in `.gitignore` going forward). Do not treat them as part of the MVP runtime path.

## Agent guidelines

See **[agents.md](agents.md)** for how AI agents should work in this repository (MVP-first).
