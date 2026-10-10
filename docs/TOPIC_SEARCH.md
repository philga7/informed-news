# Topic search ingest (NEWS-86)

Part of Epic **L** ([NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) — topics → search → triage → Brief. Ticket: [NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86). Topics themselves: `GET /api/topics` ([NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85), [MVP_API_COMPAT.md](MVP_API_COMPAT.md)).

## What it does

On every refresh (timer, startup catch-up, Kite **Refresh** button, or `POST /api/fetch` — [BRIEF.md](BRIEF.md#refresh)), after CFP, curated RSS, and xcancel, `mvp/server` searches each **desired** topic (`kind: 'desired'`; undesired topics are never searched):

- **Query:** `topic.searchQuery.trim() || topic.name`.
- **Both providers every refresh:** Google News RSS and a local SearXNG instance run side by side per topic (3 topics in flight at once).
- **Merged:** within a topic, a SearXNG result and a Google result are one story when they share the canonicalized publisher URL, **or** the same publisher domain + normalized title. The merged story keeps the direct publisher URL (from SearXNG) as `canonicalUrl` and the Google link as `googleNewsUrl`. Across topics, the same story found by several topics becomes one article carrying all their `topicIds`.
- **48h window:** dated results older than 48 hours are dropped. Undated SearXNG results are kept with `publishedAt: null` (NEWS-87 dates them from page metadata at scrape time or drops them).
- **≤20 new per topic:** newest first, undated last.
- **Skip seen:** a story whose canonical, publisher, or Google URL already exists in the store is skipped — not re-tagged with new topics. The stored article only gets `searchSeenAt` set to the run time, so the article prune counts it as still seen ([BRIEF.md](BRIEF.md#retention), [NEWS-117](https://informedcrew.atlassian.net/browse/NEWS-117)).

Constants live in `mvp/server/src/services/topicSearchConfig.ts` (window, per-topic cap, concurrency, timeouts: Google News 15s, SearXNG 20s).

New stories are upserted as articles with `sourceKind: 'search'`, `sourceTier: 'sensor'`, `bodyStatus: 'pending'` (no body scrape at ingest — NEWS-87 scrapes triage survivors only), and `snippet` = SearXNG `content` when present, else `''`. Provenance fields:

| Field | Meaning |
|-------|---------|
| `topicIds` | Desired topic ids that found this story in the refresh that created it |
| `searchProviders` | `('google_news' \| 'searxng')[]` that returned it |
| `googleNewsUrl` | Google News article link (`?oc=…` stripped) or `null` |

## Behavior after ingest

Search rows are **triaged** at the end of every refresh ([NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87), [TRIAGE.md](TRIAGE.md)): each gets a kept or dropped record in `mvp/data/triage.json`.

- **Kept search rows are shown in the Brief** under their topic ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88), [BRIEF.md](BRIEF.md)) and get their Brief summary through that path only.
- **Survivors only get resolved and scraped:** a search row that passes the triage headline check has its Google link resolved to the publisher URL, its body scraped, and (if undated) its date read from page metadata — still undated → dropped `undated`. Rows that fail triage stay `bodyStatus: 'pending'` with no live resolution.
- **Stored and listed:** search rows are in the shared article store and returned by `GET /api/articles` and `POST /api/fetch` (top-level `articles`). The parked `GET /api/radar` feed shows only `cfp` / `rss` rows.
- **Not clustered:** search rows always get `clusterId: null` and are never grouped with other articles, so they cannot re-key an existing story or bridge two clusters. (Triage does its own duplicate grouping; it does not set `clusterId`.)
- **Skipped by Ollama batches:** the batch endpoints `POST /api/classify`, `POST /api/enrich`, and `POST /api/claims/extract` (without `articleIds`) skip search rows. Explicit per-id calls (`POST /api/classify/:id`, `POST /api/claims/extract` with `articleIds`) are unchanged.
- **No body scrape and no live Google link resolution at ingest** — both happen in triage, for survivors only.

These guards stay in place after NEWS-88.

## Google News RSS

Per topic: `https://news.google.com/rss/search?q=<encodeURIComponent(query + ' when:2d')>&hl=en-US&gl=US&ceid=US:en`.

Item links are opaque `news.google.com/rss/articles/CBMi…` URLs, not publisher URLs. Until resolved, a Google-only story uses the Google link as its `canonicalUrl` (and `googleNewsUrl`), with `publisherUrl` = a cached resolution or `null` — the same shape as CFP items (aggregator URL as identity, publisher URL alongside).

**Link resolution** (`services/googleNewsResolve.ts`) decodes a Google link to the publisher URL via the article page signature + Google's `batchexecute` endpoint. Successful resolutions are cached by article id in `mvp/data/google-news-url-cache.json` (gitignored). Ingest never calls the resolver — it only reads the cache. Triage (NEWS-87) resolves headline-check survivors only, several in parallel; cache writes are serialized and atomic so concurrent resolutions don't lose entries.

`batchexecute` is an **undocumented** internal Google endpoint — a gray area that may break or be rate-limited without notice. Any resolver failure returns `null` and the Google link stays the identity.

## SearXNG setup

SearXNG runs as a local Docker container using the committed config at `mvp/searxng/settings.yml`:

- `server.limiter: false` — the bot limiter must stay off; `mvp/server` sends only an `Accept: application/json` header and would otherwise be blocked.
- `search.formats` includes `json` — required for `format=json`.
- `server.secret_key` is a placeholder; the real key comes from `SEARXNG_SECRET` at `docker run` and is never committed.

From the repo root:

```bash
docker run -d --name informed-searxng --restart unless-stopped \
  -p 127.0.0.1:8888:8080 \
  -v "$(pwd)/mvp/searxng:/etc/searxng" \
  -e SEARXNG_SECRET="$(openssl rand -hex 32)" \
  searxng/searxng:2026.9.29-4e2c1ea7f
```

- The port is bound to **localhost only** (`127.0.0.1:8888`) — do not expose it.
- The image tag is pinned; bump it deliberately (tags on [Docker Hub](https://hub.docker.com/r/searxng/searxng/tags)) rather than using `latest`.
- Logs warn about a missing `limiter.toml` and missing `X-Forwarded-For` / `X-Real-IP` headers; both are harmless with the limiter off.

Quick check:

```bash
curl 'http://127.0.0.1:8888/search?q=test&categories=news&format=json' | head -c 300
```

Stop / remove: `docker rm -f informed-searxng`.

Query sent per topic: `GET <base>/search?q=<query>&categories=news&format=json&language=en-US`. `time_range` is **never** sent (it silently drops engines that do not support it); the 48h window is applied server-side instead.

The Bing News engine is broken upstream (reported as unresponsive with an HTTP connection error) — left as-is; the other news engines (Brave, DuckDuckGo, Google News, Reuters, Wikinews, …) still answer.

## Env

In `mvp/.env` (see `mvp/.env.example`):

| Variable | Behavior |
|----------|----------|
| `TOPIC_SEARCH_ENABLED` | Default on. `false` / `0` / `off` / `no` (case-insensitive) disables topic search entirely — both providers reported `disabled`. |
| `SEARXNG_URL` | Unset → `http://127.0.0.1:8888`. Set to an empty string → SearXNG `disabled` (Google News still runs). Otherwise the base URL (trailing `/` trimmed). |

## Failure behavior

- Either provider down (container not running, timeout, non-2xx, bad JSON) → the error is recorded for that topic and the refresh continues. Topic search never fails `POST /api/fetch`; CFP failure still does, as before.
- A SearXNG that hangs (rather than refusing the connection) is cut off by the 20s timeout per topic, so it can add up to 20s × ceil(desired topics / 3) to `POST /api/fetch`.
- Per-provider status is stored in `mvp/data/meta.json` under `topicSearch` (`{ at, providers }`) and returned in the `POST /api/fetch` response `topicSearch` block ([MVP_API_COMPAT.md](MVP_API_COMPAT.md)). Each provider reports `{ state, topicsAttempted, topicsFailed, items, errors }` with `state` one of `ok` \| `partial` (some topics failed) \| `down` (all attempted topics failed) \| `disabled`; `errors` holds at most 5 `"<topicId>: <message>"` entries.
- `topicSearch.skipped` is `true` when no search ran: topic search disabled, no desired topics, or the topics file unreadable. With no desired topics, providers report `ok` with `topicsAttempted: 0`; with an unreadable topics file, enabled providers report `down`.
- `topicSearch.errors` (top level) holds run-level errors that are not tied to one provider/topic: topics file unreadable, article store read or upsert failure, or an unexpected topic-search exception. Provider/topic failures go in each provider's `errors` instead.
- `npm run dev` does **not** need SearXNG running — without it, SearXNG reports `down` (when desired topics exist; otherwise the run is skipped) and Google News results still land.
- The Brief refresh bar shows "SearXNG unavailable" / "Google News unavailable" when a provider is `down`, and "… partly failed" when it is `partial` ([BRIEF.md](BRIEF.md#refresh)).

## Trade-offs

- SearXNG is a meta-search proxy over Google, Brave, DuckDuckGo, and others, so the two providers are **not fully independent** — Google News can surface through both. The merge step dedupes overlap; it does not add true source diversity.
- Google News RSS is free and needs no key but gives opaque links; SearXNG gives direct publisher URLs and snippets but needs a local container and inherits upstream engine breakage.
