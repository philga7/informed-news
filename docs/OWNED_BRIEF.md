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

Batch id is always `owned-latest`. Category slug `world` / UUID `00000000-0000-4000-8000-000000000001` (matches Kite’s default `/world/latest` route).

## Source data

- Prefer articles in `mvp/data/articles.json` (CFP / xcancel + framing).
- Cluster-level enrichments are stored separately in `mvp/data/cluster-enrichments.json` (generated via `POST /api/enrich`).
- If the store is **empty**, the adapter returns a single **fixture** story so Brief still loads.
- Adapter: `mvp/server/src/services/kiteBriefAdapter.ts` (groups by `clusterId`, maps framing summary → `short_summary`).

## Regenerate from ingest

1. `npm run dev` (or server alone).
2. Log in against the MVP API (session cookie) — e.g. `curl` to `POST /api/login` (see [MVP_API_COMPAT.md](MVP_API_COMPAT.md)).
3. `POST /api/fetch` (optional `limit`) then optionally `POST /api/classify`.
4. After classify, `POST /api/enrich` to generate cluster-level enrichments (persisted to `mvp/data/cluster-enrichments.json`).
5. Reload Kite Brief — Inbox stories reflect the store (fixture disappears once any article exists).

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
