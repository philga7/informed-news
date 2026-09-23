# Owned brief (Kite ↔ mvp/server)

Informed News serves the Kite shell from **our** brief API by default — not `https://kite.kagi.com` (CC BY-NC).

## Direction (Epic J — in progress)

Product next is the **claims / evidence** desk ([NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)): Brief will lead with **accepted claims** plus **linked story clusters** for context; Radar becomes a **claim inbox**. Stories remain ingest/cluster **input**. Until those APIs ship, this document describes the **live story-desk** path (Accept / Track / Mute on `clusterId`). Honesty invariant for claims: status + evidence only — no Verified badges ([CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md)).

**Store foundation ([NEWS-70](https://informedcrew.atlassian.net/browse/NEWS-70)):** Claim/evidence JSON stores + status derivation are landed in `mvp/server`; HTTP APIs and Brief/Radar UI remain NEWS-74+.

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

Batch id is always `owned-latest`. Category slug `world` / UUID `00000000-0000-4000-8000-000000000001` (matches Kite’s default `/world/latest` route).

## Source data

- Prefer articles in `mvp/data/articles.json` (CFP / xcancel + framing; curated RSS via Developing desk).
- Cluster-level enrichments are stored separately in `mvp/data/cluster-enrichments.json` (generated via `POST /api/enrich`).
- If the store is **empty**, the adapter returns a single **fixture** story so Brief still loads (first-run / smoke).
- If the store has articles but **none are Accepted**, Brief returns **no stories** — not the fixture.
- Adapter: `mvp/server/src/services/kiteBriefAdapter.ts` (groups by `clusterId`, maps framing summary → `short_summary`).

### Membership (Developing desk — NEWS-57 / NEWS-65 / NEWS-66)

Brief shows **Accepted** clusters only (membership in `mvp/data/brief-membership.json`). Accept/Unaccept via session APIs (`POST /api/brief/accept`, `POST /api/brief/unaccept`; see [MVP_API_COMPAT.md](MVP_API_COMPAT.md)). Cluster keys match Radar and enrich: real `clusterId`, or `solo:{articleId}` when unclustered.

- **Accepted multi-member cluster:** all current and future articles sharing that `clusterId` appear on Brief without re-Accept.
- **Accepted solo key:** only that article appears while it stays unclustered (`solo:{articleId}`). If a later fetch merges it into a shared `clusterId`, v1 does **not** remap membership — Accept the new cluster key again (known gap; association = same key only).
- **Global mute** ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)): Accepted clusters that match a mute rule are **excluded from Brief** even though membership remains. Unaccept is unchanged; removing the rule restores Brief eligibility.
- **Manual seed stories** (NEWS-66): Accepted by definition, not on Radar; Unaccept drops from Brief (see below).
- **Radar** (`/radar`) is the triage lane for fresh CFP + curated RSS before Accept. See [ROADMAP.md](ROADMAP.md).

### Tracking developing stories (NEWS-59)

**Track ≠ Accept.** They are independent operator flags with separate stores:

| Action | Store | Effect |
|--------|-------|--------|
| **Accept** (`POST /api/brief/accept`) | `mvp/data/brief-membership.json` | Cluster appears on Brief (`/`). |
| **Track** (`POST /api/brief/track`) | `mvp/data/tracked-stories.json` | Operator watches for **new members after ingest**; does **not** put the cluster on Brief by itself. |

Cluster keys match Accept and Radar: real `clusterId`, or `solo:{articleId}` when unclustered. **Untrack** (`POST /api/brief/untrack`) ≠ **Unaccept**; **Unaccept** ≠ **Untrack**. Same solo-merge gap as Accept — if a tracked solo key merges into a shared `clusterId`, v1 does not remap; Track the new key again.

**Default Track on Accept/seed:** `POST /api/brief/accept` and manual seed (`POST /api/brief/seed` / `createManualSeed`) both call `trackCluster` after accept (idempotent). Explicit Untrack is still allowed afterward.

**Alert path (`pendingUpdate` — NEWS-61):** After successful `POST /api/fetch`, `syncTrackedAfterFetch` compares each entry’s member count (articles whose `briefClusterKey` equals the tracked `clusterId`) to `memberCountSnapshot`. When count grows → `pendingUpdate: true` (snapshot is **not** bumped until ack/view). A new Track sets snapshot to the current count and `pendingUpdate: false`. To clear an update, Kite calls `POST /api/brief/tracked/ack` (body `{ clusterId }`) which sets `pendingUpdate: false` and bumps `memberCountSnapshot` to the current member count. UI: Radar **Tracked** rows show an **Update** dot + **Dismiss**, and the Brief footer **Radar** link shows a small dot/count when any tracked entry is pending.

**Radar:** Tracked section on `/radar` lists watched clusters; Track / Untrack beside Accept. If a tracked cluster is Accepted, primary action opens Brief `/` (expand lives there). See [ROUTE_MAP.md](ROUTE_MAP.md).

### Global mute (NEWS-60)

**Mute ≠ Untrack.** Mute is a global veto on what the operator sees in the headline lane and on Brief; it does not remove track or accept state.

| Action | Store | Effect |
|--------|-------|--------|
| **Add mute** (`POST /api/brief/mutes`) | `mvp/data/mute-rules.json` | Keyword (+ optional source) rule; case-insensitive substring match on headline/title text; optional `source` also matches publisher domain/name. |
| **Remove mute** (`DELETE /api/brief/mutes/:id`) | same | Drops one rule by id. |

**Rule shape:** `{ id, keyword, source: string \| null, createdAt }`. Duplicate keywords with different sources are allowed.

**Match:** A cluster is muted when **any** member article matches a rule (keyword in title/text; when `source` is set on the rule, source must also match).

**Brief:** `filterArticlesForBrief` / owned resolve path skips muted clusters even if Accepted or manual seed.

**Radar:** Muted clusters are omitted from the main headline list. Response includes `hiddenMutedCount` (total muted clusters, including tracked). **Tracked override:** muted clusters that are still tracked appear in the Radar **Tracked** section with a muted indicator; alerts / `pendingUpdate` are not cleared by mute alone.

Session CRUD: `GET /api/brief/mutes`, `POST /api/brief/mutes` `{ keyword, source? }`, `DELETE /api/brief/mutes/:id`. `GET /api/brief/tracked` adds `muted: boolean` per entry. See [MVP_API_COMPAT.md](MVP_API_COMPAT.md).

### Manual Brief seed (NEWS-66)

Operators can add a story directly to Brief without going through Radar ingest:

1. **UI:** Brief header or empty-state **Add story** → modal (title required; note and URLs optional) → `POST /api/brief/seed` via the Kite proxy (`apps/kite/src/routes/api/brief/seed/+server.ts`). Session required (same cookie as Accept).
2. **API:** `POST /api/brief/seed` with body `{ title: string; note?: string; urls?: string[] }` → `{ ok: true, articleId, clusterId, acceptedClusterIds }`. Invalid title or non-http(s) URLs → `400`. See [MVP_API_COMPAT.md](MVP_API_COMPAT.md).
3. **Persistence:** Stored in `mvp/data/articles.json` as `sourceKind: 'manual'`. Identity: `canonicalUrl = manual://seed/{uuid}` → article `id`; `clusterId = id` (membership key is the real id, not `solo:`). Optional URLs become `citations[]`; first URL also sets `publisherUrl`. Operator note → `snippet`; `bodyText` stays null (`bodyStatus: 'not_applicable'`).
4. **Accepted immediately:** `createManualSeed` upserts the article and calls `acceptCluster(clusterId)` in the same request — no separate Accept step.
5. **Not on Radar:** `buildRadarFeed` excludes `sourceKind: 'manual'`; triage stays CFP + curated RSS only.
6. **Honest Brief copy:** Adapter prefers the operator note (`snippet`) for `short_summary`; when empty, fixed copy: `Operator-seeded story — no publisher body yet.` (never title-only silence).
7. **Unaccept on Brief:** Manual seeds never appear on Radar, so Brief exposes **Unaccept** on story chrome (header/card). `POST /api/brief/unaccept` with the story’s `clusterId` removes Brief membership; the seed row may remain in `articles.json` (no hard-delete in v1).

## Regenerate from ingest

1. `npm run dev` (or server alone).
2. Log in against the MVP API (session cookie) — e.g. `curl` to `POST /api/login` (see [MVP_API_COMPAT.md](MVP_API_COMPAT.md)).
3. `POST /api/fetch` (optional `limit`) then optionally `POST /api/classify`.
4. After classify, `POST /api/enrich` to generate cluster-level enrichments (persisted to `mvp/data/cluster-enrichments.json`).
5. Accept clusters from Radar (or via `POST /api/brief/accept`).
6. Reload Kite Brief — Inbox shows **Accepted** stories only. The fixture disappears once any article exists; a non-empty store with zero Accepted clusters shows an empty Brief.

## Opt-in Kagi data (dev only)

```bash
# apps/kite/.env — CC BY-NC; not the product default
KITE_API_BASE=https://kite.kagi.com/api
```

Documented in [THIRD_PARTY.md](../THIRD_PARTY.md). Do not use as the commercial product content source.

## Contract (minimal)

Stories need at least: `title`, `short_summary`, `category`, `articles[]` with `title`, `link`, `domain`, `date`.  
Perfect parity with every Kagi brief field is out of scope (NEWS-44).

Session-gated CFP/xcancel article + classify routes remain on the same server — see [MVP_API_COMPAT.md](MVP_API_COMPAT.md).

### Owned story fields from the MVP store

The owned brief adapter (`mvp/server/src/services/kiteBriefAdapter.ts`) also fills a small set of **story-level** fields directly from the MVP article store:

- **`domains`**: optional array of `{ name: string }` for each story.  
  - Computed from the unique publisher domains of all member articles in the cluster.  
  - Uses `publisherDomain` when present; otherwise falls back to the hostname of the publisher or canonical URL (stripping `www.`).  
  - If URL parsing fails, the fallback hostname is the literal string `unknown` (so story `domains` is typically present whenever the cluster has member articles).
- **`quote`**: optional pull-quote text for the story, taken from the first non-empty `classification.evidenceQuotes[]` value across cluster members (newest articles are checked first; whitespace is trimmed).
- **`quote_author`**: when a quote is present, this field is always emitted as `null` (reserved for future use). When no usable evidence quote exists, `quote_author` and all other `quote*` fields are omitted from the story.
- **`quote_attribution`**: set when a quote is present; describes where the quote comes from.  
  - Prefers the article’s `publisherTitle` when available, otherwise falls back to the quote source domain.
- **`quote_source_url`**: set when a quote is present; URL pointing to the page the quote was taken from.  
  - Prefers `publisherUrl`, then the first `citations[0].url`, then `canonicalUrl`.
- **`quote_source_domain`**: set when a quote is present; hostname for the quote source, derived from `publisherDomain` or the `quote_source_url` (with the same `unknown` fallback on parse failure).
- **`perspectives`**: optional array of `{ text: string; sources: { name: string; url: string }[] }` describing additional viewpoints on the story.  
  - Built **deterministically (no LLM)** from cluster members: each member with a non-empty `title` or `snippet` becomes one perspective, with `sources[0]` pointing at that member’s domain and URL.  
  - Only emitted for **multi-member clusters** (stories where multiple articles share a `clusterId`); solo-member stories leave `perspectives` undefined rather than an empty array.  
  - Members that lack both title and snippet are simply skipped, so `perspectives.length` may be smaller than the raw member count.

These fields are only populated for the owned brief path; they do not attempt full parity with every Kagi story field, and they intentionally omit empty placeholders (soft-slip for live coverage).
They also include a minimal image mapping so Kite’s story hero can render a primary image when available.

#### Images (owned brief only)

- **`primary_image?: { url: string; caption: string; credit?: string; link?: string }`**: optional story hero image.
  - Selected deterministically from the **first (newest-first)** cluster member that has a non-empty `Article.imageUrl`.
  - **`url`**: `Article.imageUrl`
  - **`caption`**: `Article.imageCaption?.trim() || Article.publisherTitle || Article.title || ''`
  - **`credit`**: `Article.imageCredit || Article.publisherDomain` (omitted when empty)
  - **`link`**: `Article.publisherUrl || Article.canonicalUrl`
  - Omitted entirely when **no** cluster member has an image URL.
- **`articles[].image?: string`**: per-article image URL.
  - Set to `Article.imageUrl` when present; otherwise omitted.

**Attribution note:** `imageCredit` / `imageCaption` are **display hints**, not a license grant. The upstream page’s embedded metadata may not reflect the actual copyright holder or the terms of reuse; treat these fields as best-effort attribution only.

**Soft-slip:** live stories may lack images initially (or indefinitely) depending on publisher pages, scrape success, or blocked bodies; the adapter omits image fields rather than emitting empty placeholders.

### Owned story fields from cluster enrichments

In addition to framing summaries and deterministic story fields, owned brief stories may include **AI-assisted cluster enrichments** sourced from the cluster enrichments store (`mvp/data/cluster-enrichments.json`), generated by `POST /api/enrich`.

These enrichments are **not ground truth** — they are AI-assisted analysis intended to help readers orient quickly, and may be incomplete, outdated, or incorrect.

- **`talking_points?: string[]`**: optional bullet points for the story.
- **`timeline?: { date: string; content: string; date_iso?: string }[]`**: optional timeline entries.
- **`suggested_qna?: { question: string; answer: string }[]`**: optional Q&A prompts and answers.

If a story has no enrichment record, or any of these arrays are empty, the adapter omits that field (it does not emit empty arrays).
