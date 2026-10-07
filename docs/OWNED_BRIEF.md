# Owned brief (Kite ↔ mvp/server)

Informed News serves the Kite shell from **our** brief API by default — not `https://kite.kagi.com` (CC BY-NC).

## Topic Brief (default story path)

The Brief is the **topic-driven Brief** ([Epic L](https://informedcrew.atlassian.net/browse/NEWS-84)): your topics (`/topics`) → search (Google News RSS + SearXNG) → triage (keyword/mute → dedupe → Jev headline → scrape → Jev body) → Brief by topic (top 3 per topic, Ollama summaries for shown stories) → full stories (tap to expand). Stories triage drops are visible on `/filtered`. A non-empty article store makes the Brief's stories come from **triage's kept stories, grouped by your desired topics** ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88)) — there is no review queue and no Accept / Track step. Sections, summaries, seen stories, and the refresh timer / Refresh button are covered in **[BRIEF.md](BRIEF.md)**. The earlier story desk and claims desk are parked — see [Parked: story desk and claims desk](#parked-story-desk-and-claims-desk).

## Default path

1. `npm run dev` starts `mvp/server` (:3001) and Kite (:5173).
2. Kite’s SvelteKit proxy (`apps/kite/src/lib/server/proxy.ts`) calls  
   `KITE_API_BASE` or, if unset, `http://127.0.0.1:3001/api`.
3. Public routes on the server (no login):

| Method | Path | Role |
|--------|------|------|
| GET | `/api/batches/latest` | Live batch metadata |
| GET | `/api/batches/latest/claims` | **Parked (no UI, NEWS-91).** Accepted claims for the retired Brief claims lead ([NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)); server-only, no Kite proxy |
| GET | `/api/batches/:batchId` | Same for `owned-latest` |
| GET | `/api/batches/:batchId/claims` | **Parked (no UI, NEWS-91).** Same; `:batchId` must be `owned-latest` or `latest` |
| GET | `/api/batches/:batchId/categories` | The single **Brief** category |
| GET | `/api/batches/:batchId/categories/:categoryId/stories` | Topic Brief stories (all visible, Brief order) |
| GET | `/api/brief/overview` | Topic sections, More split, quiet topics, refresh status ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88)) |
| GET | `/api/categories/metadata` | Kite category metadata: the single core **Brief** category |
| GET | `/api/chaos/history` | Always `[]` (no chaos index on the owned brief; `/api/batches/:batchId/chaos` stays 404 = "not available") |

Batch id is always `owned-latest`. Category slug `world` (named **Brief**) / UUID `00000000-0000-4000-8000-000000000001` (matches Kite’s default `/world/latest` route). Session routes the Brief also calls: `POST /api/brief/seen`, `POST /api/brief/stories/:articleId/summary`, `POST /api/brief/stories/:articleId/full`, `POST /api/fetch` (Refresh) — see [MVP_API_COMPAT.md](MVP_API_COMPAT.md).

## Source data

- Prefer articles in `mvp/data/articles.json` (CFP / xcancel + framing; curated RSS from `radar-sources.json`; topic search rows).
- Cluster-level enrichments are stored separately in `mvp/data/cluster-enrichments.json` (generated via `POST /api/enrich`).
- If the store is **empty**, the adapter returns a single **fixture** story so Brief still loads (first-run / smoke).
- If the store has articles, the Brief is the **topic Brief**: triage kept stories (`mvp/data/triage.json`) composed by `mvp/server/src/services/topicBrief.ts` and mapped by `topicBriefToKiteStories` in `kiteBriefAdapter.ts`, with AI summaries from `mvp/data/brief-summaries.json` ([BRIEF.md](BRIEF.md)). No kept stories → no stories, not the fixture.
- Topic Brief full stories are separately cached by kept article id in `mvp/data/brief-full-stories.json`. A hydrated `ok` record adds rich fields to the public story response; missing, unavailable, and failed records remain explicit glue state for Kite's on-demand control. The cache does not share the legacy cluster-enrichment key space.
- The fixture path in `kiteBriefAdapter.ts` still groups by `clusterId` and maps the framing summary → `short_summary`.

### Global mute (NEWS-60)

**Mute ≠ Untrack.** Mute is a global veto on what the operator sees on the Brief; it does not remove track or accept state.

| Action | Store | Effect |
|--------|-------|--------|
| **Add mute** (`POST /api/brief/mutes`) | `mvp/data/mute-rules.json` | Keyword (+ optional source) rule; case-insensitive substring match on headline/title text; optional `source` also matches publisher domain/name. |
| **Remove mute** (`DELETE /api/brief/mutes/:id`) | same | Drops one rule by id. |

**Rule shape:** `{ id, keyword, source: string \| null, createdAt }`. Duplicate keywords with different sources are allowed.

**Match:** A cluster is muted when **any** member article matches a rule (keyword in title/text; when `source` is set on the rule, source must also match).

**Brief:** the topic Brief re-checks mute rules (and undesired topics) every time it is read, so a new rule hides matching kept stories at once. The fixture path (`filterArticlesForBrief` / owned resolve) skips muted clusters.

**Parked desk:** the parked Radar feed and claim feeds still omit muted clusters / claims and report `hiddenMutedCount` ([NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75)); tracked muted clusters appear on `GET /api/brief/tracked` with `muted: true`.

Session CRUD: `GET /api/brief/mutes`, `POST /api/brief/mutes` `{ keyword, source? }`, `DELETE /api/brief/mutes/:id`. See [MVP_API_COMPAT.md](MVP_API_COMPAT.md).

### Manual Brief seed (NEWS-66)

> Manual seeds (**Add story**) and story **Unaccept** are still present but are **not** part of the topic Brief: seeds are stored and Accepted but do not appear on `/`, because the topic Brief shows triage kept stories only and triage skips manual seeds. Their future is owned by [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98).

Operators can add a story by hand:

1. **UI:** Brief header or empty-state **Add story** → modal (title required; note and URLs optional) → `POST /api/brief/seed` via the Kite proxy (`apps/kite/src/routes/api/brief/seed/+server.ts`). Session required (log in on `/topics`).
2. **API:** `POST /api/brief/seed` with body `{ title: string; note?: string; urls?: string[] }` → `{ ok: true, articleId, clusterId, acceptedClusterIds }`. Invalid title or non-http(s) URLs → `400`. See [MVP_API_COMPAT.md](MVP_API_COMPAT.md).
3. **Persistence:** Stored in `mvp/data/articles.json` as `sourceKind: 'manual'`. Identity: `canonicalUrl = manual://seed/{uuid}` → article `id`; `clusterId = id` (membership key is the real id, not `solo:`). Optional URLs become `citations[]`; first URL also sets `publisherUrl`. Operator note → `snippet`; `bodyText` stays null (`bodyStatus: 'not_applicable'`).
4. **Accepted immediately:** `createManualSeed` upserts the article and calls `acceptCluster(clusterId)` in the same request, and tracks the cluster by default.
5. **Not triaged:** triage skips manual seeds, and the parked Radar feed (`buildRadarFeed`) excludes `sourceKind: 'manual'`.
6. **Honest Brief copy:** the adapter prefers the operator note (`snippet`) for `short_summary`; when empty, fixed copy: `Operator-seeded story — no publisher body yet.` (never title-only silence).
7. **Unaccept:** `POST /api/brief/unaccept` with the story's `clusterId` removes Brief membership; the seed row may remain in `articles.json` (no hard-delete in v1).

## Parked: story desk and claims desk

Before Epic L the Brief was a review flow: Radar (`/radar`) triaged fresh CFP + curated RSS, the operator **Accepted** story clusters and claims onto the Brief, **Tracked** developing ones, and the Brief led with an accepted-claims section. [NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88) stopped membership from gating the Brief, and [NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91) retired the rest of the flow from the default path:

- **Kite:** `/radar` redirects (`307`) to `/topics`; the footer Radar link and tracked-update badge, the Brief accepted-claims lead, and the Kite proxies for the Radar, claims, and Accept / Track routes are gone. Login hints now say **Log in on Topics**.
- **Refresh:** a refresh no longer syncs tracked stories, so tracked entries are not flagged `pendingUpdate` automatically. Claims extraction was never part of refresh; it runs only when `POST /api/claims/extract` / `POST /api/claims/enrich` are called by hand ([CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md#running-claims-manually)).
- **Server and data stay:** every `mvp/server` route for Radar, claims, accept, track, membership, and the review queue still exists (session-gated, callable on `:3001`), and the stores remain under `mvp/data/` (`brief-membership.json`, `tracked-stories.json`, `claims.json`, `evidence-links.json`, `claim-membership.json`, `tracked-claims.json`, `claim-review-queue.json`, `claim-enrichments.json`). Nothing is deleted or migrated. Route status is in [MVP_API_COMPAT.md](MVP_API_COMPAT.md).
- **Honesty invariant (binding if the desk returns):** status + evidence only — Accept ≠ truth; no Verified badges; TypeSafe / Jev = judgment-of-record, Ollama = candidates and verbiage only ([CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md)).

## Regenerate from ingest

1. `npm run dev` (or server alone). The server refreshes on its own at startup when due and then every `REFRESH_INTERVAL_HOURS` (default 3) — see [BRIEF.md](BRIEF.md#refresh).
2. To refresh now: log in on `/topics` and press **Refresh** on the Brief, or log in against the MVP API (session cookie — e.g. `curl` to `POST /api/login`, see [MVP_API_COMPAT.md](MVP_API_COMPAT.md)) and `POST /api/fetch` (optional `limit`).
3. Reload Kite Brief — sections per desired topic from triage's kept stories. The fixture disappears once any article exists; a non-empty store with no kept stories shows an empty Brief (with the "Nothing new:" line when you have topics).

`POST /api/classify` and `POST /api/enrich` (cluster enrichments in `mvp/data/cluster-enrichments.json`) still run on demand, but topic Brief cards use their separate [NEWS-89](https://informedcrew.atlassian.net/browse/NEWS-89) full-story path instead.

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

> **Topic Brief stories (NEWS-88 / NEWS-89)** use `title`, `short_summary`, `articles[]` / `domains` from the card's links, `primary_image` from the kept article's image (caption falls back to the headline, credit to the domain), and the `informed_*` fields listed in [MVP_API_COMPAT.md](MVP_API_COMPAT.md#topic-brief-news-88). A cached NEWS-89 full story additionally hydrates its supported rich fields (`talking_points`, timeline, suggested Q&A, deterministic perspectives / quote, and requested topic extras); no empty fields or map data are emitted. The fields below otherwise describe the fixture / cluster path.

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
