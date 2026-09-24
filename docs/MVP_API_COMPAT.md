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
| GET | `/api/articles` | Session | Newest-first list + meta (CFP / xcancel / curated RSS store). Each article may include `sourceTier` (`primary` \| `sensor`; absent → `sensor`) ([NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)). |
| GET | `/api/articles/:id` | Session | One article including classification fields and optional `sourceTier` |
| POST | `/api/fetch` | Session | Unified CFP + curated RSS + optional xcancel refresh ([NEWS-55](https://informedcrew.atlassian.net/browse/NEWS-55)). Response includes `tiers: { sensor, primary }` — each tier has `fetched` and `upserted` counts for articles upserted in **this run** ([NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)) — plus `cfp`, `curated`, `xcancel`, `clustered`, `clusters`. Persisted articles carry `sourceTier` (`primary` \| `sensor`; default `sensor`). Tier config: [RADAR_SOURCES.md](RADAR_SOURCES.md). |
| POST | `/api/classify` | Session | Batch **story framing** for unclassified items — not claim judgment-of-record (see `/api/claims/extract`) |
| POST | `/api/classify/:id` | Session | Reclassify one article (framing only) |
| POST | `/api/enrich` | Session | Batch cluster enrichment (AI-assisted). Optional body/query: `{ limit?: number, force?: boolean }` |
| POST | `/api/claims/extract` | Session | Batch claim extraction: Ollama propose + TypeSafe judge ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)). Optional body/query: `{ limit?: number, force?: boolean, articleIds?: string[] }` → `{ ok, limit, attempted, proposed, judged, persistedClaims, persistedEvidence, needsReview, failed, articlesProcessed, claims, evidence, reviewQueued }`. Batch mode (no `articleIds`) selects **sensor-tier articles first**, then fills with primaries under `limit` ([NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)). Persisted evidence links copy `sourceTier` from the source article. Low-confidence claims enqueue to `claim-review-queue.json`. |
| GET | `/api/radar` | Session | Developing desk triage feed: clustered CFP + curated RSS; each cluster includes `accepted` from membership and `tracked` / optional `pendingUpdate` from the track store. Muted clusters are omitted from `clusters`; response includes `hiddenMutedCount` ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)). |
| GET | `/api/brief/membership` | Session | Brief membership snapshot: `{ ok, acceptedClusterIds, updatedAt }` |
| POST | `/api/brief/accept` | Session | Idempotent accept onto Brief; body `{ clusterId: string }` → `{ ok, acceptedClusterIds }`. Also tracks the cluster by default ([NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59)). |
| POST | `/api/brief/unaccept` | Session | Idempotent remove from Brief; body `{ clusterId: string }` → `{ ok, acceptedClusterIds }` |
| POST | `/api/brief/track` | Session | Idempotent track developing story (Track ≠ Accept); body `{ clusterId: string }` → `{ ok, entries: TrackedEntry[] }`; `400` on missing/empty `clusterId` |
| POST | `/api/brief/untrack` | Session | Idempotent remove from tracked; body `{ clusterId: string }` → `{ ok, entries: TrackedEntry[] }`; `400` on missing/empty `clusterId` |
| GET | `/api/brief/tracked` | Session | Tracked snapshot: `{ ok, entries: TrackedEntry[], updatedAt }` where `TrackedEntry = { clusterId, trackedAt, memberCountSnapshot, pendingUpdate, muted? }`. `muted` is `true` when the cluster matches a global mute rule ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)). |
| POST | `/api/brief/tracked/ack` | Session | Clear a tracked update after view/dismiss (NEWS-61). Body `{ clusterId: string }` → `{ ok: true, entries: TrackedEntry[] }`. `400` on missing/empty `clusterId`; `401` when unauthenticated. Server clears `pendingUpdate` and bumps `memberCountSnapshot` to the current member count. |
| GET | `/api/brief/mutes` | Session | Global mute rules: `{ ok, rules: MuteRule[], updatedAt }` where `MuteRule = { id, keyword, source: string \| null, createdAt }` ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)) |
| POST | `/api/brief/mutes` | Session | Add mute rule; body `{ keyword: string; source?: string }` → `{ ok, rules: MuteRule[] }`; `400` on missing/empty `keyword`. Keyword is trimmed; duplicate keywords with different sources are allowed. |
| DELETE | `/api/brief/mutes/:id` | Session | Remove mute rule by id → `{ ok, rules: MuteRule[] }` |
| POST | `/api/brief/seed` | Session | Create Accepted manual Brief story ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)); body `{ title: string; note?: string; urls?: string[] }` → `{ ok, articleId, clusterId, acceptedClusterIds }`; `400` on missing title or invalid URLs. Also tracks the seed cluster by default ([NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59)). |

Public Kite brief routes under `/api/batches…` are **in addition** to this surface (NEWS-44); they are not a replacement for `/api/articles`. Brief **content** is accepted-only after [NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65), minus **global mute** ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)); membership routes above gate what appears on `/`. Manual seeds are Accepted on create and excluded from Radar. Track / Untrack are independent of Accept / Unaccept ([NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59)); Accept and seed track by default. Mute hides clusters on Radar and vetoes Brief eligibility without auto-untrack; tracked muted clusters still appear on `GET /api/brief/tracked` with `muted: true`. After `POST /api/fetch`, tracked entries may get `pendingUpdate: true` when member count grows — badge UX is [NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61).

## Guarantees

- Default `npm run dev` still starts **`mvp/server`** alongside Kite.
- Empty `XCANCEL_PROFILES` / missing `x-profiles.json` does not break CFP fetch.
- Framing/classify stays on this API; Kite Brief consumes adapted JSON via the owned-brief adapter, not by deleting these endpoints.
- Retiring the React feed (`_legacy/mvp-web`, NEWS-46) must not remove these routes.

## Planned (Epic J — not frozen yet)

Claim desk routes under [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69) will be added here when shipped (do not invent clients against these until listed in **Frozen routes**):

- `GET /api/claims/radar` — claim inbox ([NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74))
- Claim Accept / Track / Mute / ack on `claimId` (parallel to brief story membership; [NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75))

**Store-only ([NEWS-70](https://informedcrew.atlassian.net/browse/NEWS-70)):** Runtime data files under `mvp/data/`: `claims.json`, `evidence-links.json`, `claim-membership.json`, `tracked-claims.json`, `claim-review-queue.json` (extract writes the review queue; radar/accept HTTP still planned).

**Extract pipeline ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)):** Shipped — `POST /api/claims/extract` (session-gated) runs Ollama propose + TypeSafe judge batch; see **Frozen routes**. Claim status stays code-derived per [NEWS-70](https://informedcrew.atlassian.net/browse/NEWS-70).

**TypeSafe spine ([NEWS-71](https://informedcrew.atlassian.net/browse/NEWS-71)):** Server-side TypeSafe client + claim judge question library (`typesafeClaimQuestions.ts`) + confidence gates landed; wired through extract ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)).

Story `/api/radar` and `/api/brief/*` remain during transition. Judgment-of-record for claims is TypeSafe, not `POST /api/classify`. See [ROADMAP.md](ROADMAP.md), [CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md).

## Out of scope

- Making `/api/articles` public without a session
- Replacing this API with Crucix or a new gateway (later epics)
- Perfect parity with every historical `_legacy/mvp-web` client quirk
- Claim “Verified” / truth-verdict endpoints
