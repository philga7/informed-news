# Vision

Informed News is one OSINT product in [philga7/informed-news](https://github.com/philga7/informed-news). This file is the target. Binding choices live in [DECISIONS.md](DECISIONS.md). Ordering lives in [ROADMAP.md](ROADMAP.md).

When the image is served, the running Brief is the SPA Briefs module at `/`, with `mvp/server`. `npm run dev` still serves Kite at `/`. Kite Brief code remains in the repo until [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202) and [NEWS-203](https://informedcrew.atlassian.net/browse/NEWS-203). The operator's topics drive sources and filtering. Jev scores stories in triage. Ollama writes Brief verbiage for stories that are shown. There is no review queue. Today's triage order is [TRIAGE.md](TRIAGE.md): config blocklist, mute and keywords, duplicate grouping (including duplicate-of-already-kept) on the keyword survivors, a Jev headline check, survivor scrape, then a Jev body check. Nothing in that path calls Ollama.

The shape of the target follows the [Menon Lab stack](https://themenonlab.blog/blog/osint-shadowbroker-crucix-thinkcreate-intel-stack) (raw, then scoring, then output).

## Three layers

**Raw.** RSS and topic search (Google News RSS and local SearXNG). Later, Epic B Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)) and Epic C Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)). The raw layer has no AI. Watcher query expansion is a scoring step on [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84), after hosting, and is not part of ingest.

**Scoring.** The triage verdict and the Filtered view ([NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167)), then Story Desk context over time. Jev does this scoring.

**Output.** Briefs in the app. Telegram delivery stays with the bots. Ollama writes Brief verbiage for stories that are shown.

## One API and one MCP

One API (`mvp/server`) and one MCP server sit in front of all three layers. The SPA and the bots are clients of both. Hosting is Tailscale-only (private network: anyone on it can read the Brief; refresh, Topics, Filtered out, and other changes still ask for the password); the steps are in [RUNBOOK.md](RUNBOOK.md) and the 2026-10-31 private-network access entry in [DECISIONS.md](DECISIONS.md). How a bot reaches the MCP over that private network is decided when the MCP ships.

## SPA shell

One SPA shell in this repo replaces Kite one view at a time. When the image is served, the running Brief is the Briefs module at `/`. `npm run dev` still serves Kite at `/`. Kite Brief code remains in the repo until [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202) and [NEWS-203](https://informedcrew.atlassian.net/browse/NEWS-203). Each module has its own link:

- Briefs (at `/` when the image is served)
- Story Desk ([NEWS-201](https://informedcrew.atlassian.net/browse/NEWS-201); not shipped)
- Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)), on hold
- Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)), on hold

Story Desk has not shipped and is paused until the UI build is sequenced (see UI direction below). The Briefs module matches the Kite Brief (keyboard, filters, shared links, accessibility) before [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202) removes that view. Map and Signals have not shipped and get no chrome until their epics have data.

## Alerts

The app scores alerts as FLASH, PRIORITY, or ROUTINE. News Desk Bot and Election Desk Bot deliver them. The app does not grow a second alert system. Scoring those tiers is the model. The build is unscheduled, and it waits behind the news section.

## News section first

The news section is Briefs, the three triage items ([NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167), [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168), [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)), and Story Desk. News section first. Story Desk is paused until the UI build is sequenced. Signals, Map, and cross-domain correlation stay on hold. Correlation has no ticket. It needs stored history from both raw layers.

## UI direction

Phil approved this on Nov 12, 2026. Informed News becomes an OSINT-style news dashboard: dark and minimalist. The reference sites are [grok.com/dashboard](https://grok.com/dashboard), [cfbtrack.com](https://cfbtrack.com), and [stocknear.com](https://stocknear.com).

The site has to beat Phil's current setup, which is Telegram pings plus developing stories kept as Grok Bot chats and Pages. It wins on three things:

1. A one-glance overview.
2. Stories that update in place, with a timeline and what changed since you last looked.
3. Visible sources and filters.

Telegram stays for pings. Each ping deep-links to the new entry on the site.

The home screen, the story page, the per-tracker new count, CFP, and the morning messages are recorded in [DECISIONS.md](DECISIONS.md). The data layer is proposed there, not decided. Feature tickets stay on hold until the UI build tickets are sequenced ([ROADMAP.md](ROADMAP.md)).
