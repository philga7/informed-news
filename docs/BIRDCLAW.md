# X / Twitter history via birdclaw (NEWS-123)

Informed News does **not** scrape X/Twitter (or xcancel mirrors) during refresh. Optional xcancel ingest (`XCANCEL_PROFILES`, `x-profiles.json`, `xcancelFetch`) was retired in [NEWS-123](https://informedcrew.atlassian.net/browse/NEWS-123).

When you need tweet evidence or account history, use **[birdclaw](https://github.com/steipete/birdclaw)** ([docs](https://birdclaw.sh)) as a **local** archive + search tool — not an in-pipeline HTML scrape inside `mvp/server`.

## What birdclaw is for

- Import a Twitter/X archive into a local SQLite database
- Search likes, bookmarks, and archived tweets (FTS5)
- Optional cached live sync through operator-owned transports
- Read-only **MCP** for agents against the local cache (no DMs / no write tools in that path)

It is archive-first and operator-owned. It does not replace CFP, curated RSS, or topic search.

## Operator path (when tweet evidence is needed again)

1. Install and init birdclaw on the machine that holds the archive (see [birdclaw.sh](https://birdclaw.sh)).
2. Import archive (and optionally sync slices you care about):
   ```bash
   birdclaw init
   birdclaw archive find --json
   birdclaw import archive --json
   birdclaw search tweets "your query" --json
   ```
3. Use CLI / local web / MCP to find threads; copy permalinks or quotes into Brief seeds (**Add story**) or notes when the topic Brief needs that evidence.
4. Do **not** reintroduce an xcancel-style mirror scrape into `mvp/server` refresh.

## Legacy store rows

Articles already stored with `sourceKind: 'xcancel'` remain readable (tweet text as body, `bodyStatus: not_applicable`). Refresh no longer creates new ones. Classify and triage still treat that kind as a normal article when present.

## Out of scope here

Wiring birdclaw into the topic Brief pipeline, auto-ingest from SQLite into `articles.json`, or a thin MCP proxy inside Informed News. Prefer docs + local operator use until a later ticket asks for product integration.
