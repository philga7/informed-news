# Informed News (MVP)

**Copyright © 2025 Sandiebeach LLC. All Rights Reserved.**  
**Proprietary Software — See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md)**

Greenfield MVP for multi-source ingest (Citizen Free Press + optional xcancel profiles), Ollama framing classification, and a thin React UI. Data lives in local JSON files — not Supabase.

**Flow:** CFP RSS (+ optional xcancel) → classify framing → one feed with source chips, dual citations, and scores.

## Stack

| Layer | Path | Role |
|-------|------|------|
| API | `mvp/server` | Express: auth, fetch, classify, articles |
| UI | `mvp/web` | React + Vite (login, feed, framing detail) |
| Data | `mvp/data/*.json` | Flat-file article + meta store (gitignored) |

## Quick start

```bash
cp mvp/.env.example mvp/.env
# Set MVP_PASSWORD, SESSION_SECRET, OLLAMA_API_KEY
# Optional: CFP_FEED_URL / FETCH_LIMIT; XCANCEL_PROFILES (or mvp/data/x-profiles.json)

npm install
npm run install:all
npm run dev
```

- UI: http://localhost:5174  
- API: http://localhost:3001 (`GET /health`)

`npm run dev` starts the MVP only (server + web). The old OSINT monolith is not on this path.

## Smoke test

Follow **[mvp/SMOKE.md](mvp/SMOKE.md)**: login → **Refresh** → Classify new → confirm source chips, citation links, and framing. CFP-only when profiles are empty; with handles configured, confirm xcancel items as well.

## Environment

See `mvp/.env.example`:

- `MVP_PASSWORD` / `MVP_PASSWORD_HASH` — single-password session auth  
- `SESSION_SECRET` — cookie signing  
- `OLLAMA_API_KEY` / `OLLAMA_MODEL` — framing classify  
- `CFP_FEED_URL` / `FETCH_LIMIT` — CFP RSS fetch defaults  
- `XCANCEL_PROFILES` — optional comma-separated handles (empty = CFP-only)  
- `XCANCEL_PER_PROFILE_LIMIT` / `XCANCEL_FETCH_DELAY_MS` — xcancel polite fetch knobs  
- Optional file: `mvp/data/x-profiles.json` (gitignored; see `x-profiles.example.json`)  
- `PORT` — API port (default `3001`)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | MVP server + web |
| `npm run install:all` | Install `mvp/server` and `mvp/web` deps |
| `npm run typecheck` | Typecheck both packages |
| `npm test` | MVP server unit tests |
| `npm run build` | Build the web client |

## Versioning & CI

Process model matches HARN: **`main` + short-lived branches**, Conventional Commits, PR CI, semantic-release on merge to `main`.

- **Version line:** stay on **`0.x`** until an intentional `1.0.0` (baseline tag `v0.1.0`). See [CONTRIBUTING.md](CONTRIBUTING.md).
- **CI:** PRs to `main` run MVP install → typecheck → test → build.
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

## Next (NEWS)

[NEWS-1](https://informedcrew.atlassian.net/browse/NEWS-1) (MVP rebuild) and **[NEWS-12](https://informedcrew.atlassian.net/browse/NEWS-12)** (multi-source CFP + xcancel) are done. Sequenced follow-on — no product change in this note:

- **[NEWS-13](https://informedcrew.atlassian.net/browse/NEWS-13)** Deeper original text — rewrite-before-build
- **[NEWS-14](https://informedcrew.atlassian.net/browse/NEWS-14)** Cross-source corroboration — rewrite-before-build

Plan: [`.cursor/plans/mvp_mission_epics_048f89b7.plan.md`](.cursor/plans/mvp_mission_epics_048f89b7.plan.md)

## Legacy code

The previous OSINT / Supabase / Express monolith lives under **[`_legacy/`](_legacy/)** for reference. It is not the default app and must not be wired into `mvp/`.

## Security chore (separate)

SSH key files `informed_news` / `informed_news.pub` may still exist in the repo history. **Rotate those keys and untrack them** as a dedicated security task (they are listed in `.gitignore` going forward). Do not treat them as part of the MVP runtime path.

## Agent guidelines

See **[agents.md](agents.md)** for how AI agents should work in this repository (MVP-first).
