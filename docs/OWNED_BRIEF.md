# Owned brief (Kite ↔ mvp/server)

Informed News serves the Kite shell from **our** brief API by default — not `https://kite.kagi.com` (CC BY-NC).

## Default path

1. `npm run dev` starts `mvp/server` (:3001) and Kite (:5173).
2. Kite’s SvelteKit proxy (`apps/kite/src/lib/server/proxy.ts`) calls  
   `KITE_API_BASE` or, if unset, `http://127.0.0.1:3001/api`.
3. Public routes on the server (no login):

| Method | Path | Role |
|--------|------|------|
| GET | `/api/batches/latest` | Live batch metadata |
| GET | `/api/batches/:batchId` | Same for `owned-latest` |
| GET | `/api/batches/:batchId/categories` | Inbox category |
| GET | `/api/batches/:batchId/categories/:categoryId/stories` | Stories from ingest |

Batch id is always `owned-latest`. Category slug `inbox` / UUID `00000000-0000-4000-8000-000000000001`.

## Source data

- Prefer articles in `mvp/data/articles.json` (CFP / xcancel + framing).
- If the store is **empty**, the adapter returns a single **fixture** story so Brief still loads.
- Adapter: `mvp/server/src/services/kiteBriefAdapter.ts` (groups by `clusterId`, maps framing summary → `short_summary`).

## Regenerate from ingest

1. `npm run dev` (or server alone).
2. Log in against the MVP API (session cookie) — e.g. frozen `npm run dev:mvp-web` or `curl` to `POST /api/login`.
3. `POST /api/fetch` (optional `limit`) then optionally `POST /api/classify`.
4. Reload Kite Brief — Inbox stories reflect the store (fixture disappears once any article exists).

## Opt-in Kagi data (dev only)

```bash
# apps/kite/.env — CC BY-NC; not the product default
KITE_API_BASE=https://kite.kagi.com/api
```

Documented in [THIRD_PARTY.md](../THIRD_PARTY.md). Do not use as the commercial product content source.

## Contract (minimal)

Stories need at least: `title`, `short_summary`, `category`, `articles[]` with `title`, `link`, `domain`, `date`.  
Perfect parity with every Kagi brief field is out of scope (NEWS-44).
