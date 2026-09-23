# Informed News

**Copyright © 2025 Sandiebeach LLC. All Rights Reserved.**  
**Proprietary Software — See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md)**

Product UI is the vendored **Kite** shell (`apps/kite/`, MIT). Pipeline and framing stay in **`mvp/server`**. The old React feed is archived at `_legacy/mvp-web/` (NEWS-46).

## Stack

| Layer | Path | Role |
|-------|------|------|
| UI | `apps/kite` | SvelteKit Brief shell (default `npm run dev`) |
| API | `mvp/server` | Express: auth, fetch, classify, articles |
| Data | `mvp/data/*.json` | Flat-file article + meta store (gitignored) |
| Archived UI | `_legacy/mvp-web` | Former React feed — not on the product path |

## Quick start

```bash
cp mvp/.env.example mvp/.env
# Set MVP_PASSWORD, SESSION_SECRET, OLLAMA_API_KEY (API / classify)

cp apps/kite/.env.example apps/kite/.env
# Default brief = mvp/server owned adapter (see docs/OWNED_BRIEF.md).
# Optional CC BY-NC: set KITE_API_BASE=https://kite.kagi.com/api

npm install
npm run install:all   # requires Bun for apps/kite
npm run dev
```

- **UI (Kite Brief):** http://localhost:5173  
- **API:** http://localhost:3001 (`GET /health`)

`npm run dev` starts **mvp/server + Kite**. The old OSINT monolith and archived React feed under `_legacy/` are not on this path.

CFP / xcancel / framing stay on the MVP API while Kite is the shell — frozen surface: [docs/MVP_API_COMPAT.md](docs/MVP_API_COMPAT.md).

## Smoke test

- **Product UI:** open http://localhost:5173 after `npm run dev` (or `npm run test:e2e:kite`).
- **API compat:** `GET /health` + session `GET /api/articles` (see [docs/MVP_API_COMPAT.md](docs/MVP_API_COMPAT.md)).
- **API checklist:** [mvp/SMOKE.md](mvp/SMOKE.md) covers classify + citations against `mvp/server`.

## Environment

See `mvp/.env.example` for the API:

- `MVP_PASSWORD` / `MVP_PASSWORD_HASH` — single-password session auth  
- `SESSION_SECRET` — cookie signing  
- `OLLAMA_API_KEY` / `OLLAMA_MODEL` — framing classify  
- `CFP_FEED_URL` / `FETCH_LIMIT` — CFP RSS fetch defaults  
- `XCANCEL_PROFILES` — optional comma-separated handles (empty = CFP-only)  
- `XCANCEL_PER_PROFILE_LIMIT` / `XCANCEL_FETCH_DELAY_MS` — xcancel polite fetch knobs  
- Optional file: `mvp/data/x-profiles.json` (gitignored; see `x-profiles.example.json`)  
- `PORT` — API port (default `3001`)

Kite UI env: `apps/kite/.env.example`. Owned brief: [docs/OWNED_BRIEF.md](docs/OWNED_BRIEF.md). API compat: [docs/MVP_API_COMPAT.md](docs/MVP_API_COMPAT.md). Route map: [docs/ROUTE_MAP.md](docs/ROUTE_MAP.md). Kagi service cleanup: [docs/KAGI_SERVICE_CLEANUP.md](docs/KAGI_SERVICE_CLEANUP.md). Sync / license: [docs/UPSTREAM_KITE.md](docs/UPSTREAM_KITE.md), [THIRD_PARTY.md](THIRD_PARTY.md).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | **Default:** mvp/server + Kite UI (:5173) |
| `npm run kite` | Kite UI only |
| `npm run server` | API only |
| `npm run install:all` | Install server and kite (Bun) |
| `npm run install:kite` | Install `apps/kite` only |
| `npm run typecheck` | Typecheck `mvp/server` |
| `npm test` | MVP server unit tests |
| `npm run test:kite` | Kite provenance + default-entrypoint checks |
| `npm run test:e2e:kite` | Playwright: Brief loads on :5173 |
| `npm run build` | Build archived `_legacy/mvp-web` (current Vercel artifact) |

## Versioning & CI

Process model matches HARN: **`main` + short-lived branches**, Conventional Commits, PR CI, semantic-release on merge to `main`.

- **Version line:** stay on **`0.x`** until an intentional `1.0.0` (baseline tag `v0.1.0`). See [CONTRIBUTING.md](CONTRIBUTING.md).
- **CI:** PRs to `main` run install → typecheck → test → kite provenance → build.
- **Release:** merge to `main` re-validates, then semantic-release (`npmPublish: false`).
- **Release ≠ deploy:** GitHub Release/tag is versioning only.

## Hosting (Vercel)

Root [`vercel.json`](vercel.json) still deploys the **archived** `_legacy/mvp-web` static build until a later hosting cutover to Kite. Local product UI is Kite.

| Concern | Where |
|---------|--------|
| **Local product UI** | `apps/kite` via `npm run dev` |
| **Vercel (today)** | `_legacy/mvp-web` → `_legacy/mvp-web/dist` |
| **API** | Local `mvp/server` — not on Vercel serverless |
| **Versioning** | GitHub Release via semantic-release |

## Roadmap (NEWS)

Agent-facing order of work: **[docs/ROADMAP.md](docs/ROADMAP.md)** — **Current next:** Epic J claims/evidence desk ([NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)); desk v1 Done-demo ([NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57)); ask before parked Later or Epic [NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34). Discernment: [docs/CLAIMS_DISCERNMENT.md](docs/CLAIMS_DISCERNMENT.md).

Done so far: Epic A ([NEWS-33](https://informedcrew.atlassian.net/browse/NEWS-33)), Epic H ([NEWS-48](https://informedcrew.atlassian.net/browse/NEWS-48)), desk v1 under NEWS-57. NEWS-53 absorbed into NEWS-57. Plans: [`.cursor/plans/osint_jira_pivot_d6b40f87.plan.md`](.cursor/plans/osint_jira_pivot_d6b40f87.plan.md), [`.cursor/plans/claims_evidence_spine_8f4cde15.plan.md`](.cursor/plans/claims_evidence_spine_8f4cde15.plan.md).

## Legacy code

Previous OSINT / Supabase / Express monolith and archived personal-feed React UI: **[`_legacy/`](_legacy/)** (React feed: [`_legacy/mvp-web/`](_legacy/mvp-web/)).

## Security chore (separate)

SSH key files `informed_news` / `informed_news.pub` may still exist in repo history. **Rotate and untrack** as a dedicated task (listed in `.gitignore`).

## Agent guidelines

See **[agents.md](agents.md)** for how AI agents should work in this repository.
