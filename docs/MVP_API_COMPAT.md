# MVP API compat surface (NEWS-43)

While the product UI is Kite (`apps/kite`), **`mvp/server` remains the CFP / xcancel / framing backend**. This document freezes the compat surface so the UI pivot does not silently drop ingest or classify.

Owned brief (public, no login) is documented separately in [OWNED_BRIEF.md](OWNED_BRIEF.md).

## Demo (always)

With `npm run dev` (or `npm run server`):

```bash
curl -s http://127.0.0.1:3001/health
# {"status":"ok","app":"mvp-server"}
```

Session + article JSON:

```bash
curl -s -c /tmp/mvp-cookies -X POST http://127.0.0.1:3001/api/login \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$MVP_PASSWORD\"}"

curl -s -b /tmp/mvp-cookies http://127.0.0.1:3001/api/articles
# { "articles": [ ... ], "meta": { ... } }

# Optional: one article by id when the store is non-empty
curl -s -b /tmp/mvp-cookies "http://127.0.0.1:3001/api/articles/<id>"
```

Kite does **not** need to proxy these routes. Hit the API on `:3001` directly (default `PORT`).

## Frozen routes

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/health` | Public | Liveness; `{ status: "ok", app: "mvp-server" }` |
| GET | `/` | Public | Short server banner JSON |
| POST | `/api/login` | Public | Session cookie |
| POST | `/api/logout` | Public | Clear session |
| GET | `/api/articles` | Session | Newest-first list + meta (CFP / xcancel store) |
| GET | `/api/articles/:id` | Session | One article including classification fields |
| POST | `/api/fetch` | Session | Unified CFP then optional xcancel refresh |
| POST | `/api/classify` | Session | Batch framing for unclassified items |
| POST | `/api/classify/:id` | Session | Reclassify one article |
| POST | `/api/enrich` | Session | Batch cluster enrichment (AI-assisted). Optional body/query: `{ limit?: number, force?: boolean }` |
| GET | `/api/radar` | Session | Developing desk triage feed: clustered CFP + curated RSS; each cluster includes `accepted` from membership |
| GET | `/api/brief/membership` | Session | Brief membership snapshot: `{ ok, acceptedClusterIds, updatedAt }` |
| POST | `/api/brief/accept` | Session | Idempotent accept onto Brief; body `{ clusterId: string }` → `{ ok, acceptedClusterIds }` |
| POST | `/api/brief/unaccept` | Session | Idempotent remove from Brief; body `{ clusterId: string }` → `{ ok, acceptedClusterIds }` |

Public Kite brief routes under `/api/batches…` are **in addition** to this surface (NEWS-44); they are not a replacement for `/api/articles`. Brief **content** is accepted-only after [NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65); membership routes above gate what appears on `/`.

## Guarantees

- Default `npm run dev` still starts **`mvp/server`** alongside Kite.
- Empty `XCANCEL_PROFILES` / missing `x-profiles.json` does not break CFP fetch.
- Framing/classify stays on this API; Kite Brief consumes adapted JSON via the owned-brief adapter, not by deleting these endpoints.
- Retiring the React feed (`_legacy/mvp-web`, NEWS-46) must not remove these routes.

## Out of scope

- Making `/api/articles` public without a session
- Replacing this API with Crucix or a new gateway (later epics)
- Perfect parity with every historical `_legacy/mvp-web` client quirk
