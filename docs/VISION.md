# Vision

Informed News is one OSINT product in [philga7/informed-news](https://github.com/philga7/informed-news). This file is the target. Binding choices live in [DECISIONS.md](DECISIONS.md). Ordering lives in [ROADMAP.md](ROADMAP.md).

The product that is running, until [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170), is the Kite Brief plus `mvp/server`. The operator's topics drive sources and filtering. Jev scores stories in triage. Ollama writes Brief verbiage for stories that are shown. There is no review queue. Today's triage order is [TRIAGE.md](TRIAGE.md): mute and keywords, duplicate grouping, a Jev headline check, survivor scrape, then a Jev body check. Nothing in that path calls Ollama.

The shape of the target follows the [Menon Lab stack](https://themenonlab.blog/blog/osint-shadowbroker-crucix-thinkcreate-intel-stack) (raw, then scoring, then output).

## Three layers

**Raw.** RSS and topic search (Google News RSS and local SearXNG). Later, Epic B Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)) and Epic C Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)). The raw layer has no AI. Watcher query expansion is a scoring step on [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84), after hosting, and is not part of ingest.

**Scoring.** The triage verdict and the Filtered view ([NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167)), then Story Desk context over time. Jev does this scoring.

**Output.** Briefs in the app. Telegram delivery stays with the bots. Ollama writes Brief verbiage for stories that are shown.

## One API and one MCP

One API (`mvp/server`) and one MCP server sit in front of all three layers. The SPA and the bots are clients of both. Hosting is Tailscale-only (private network: anyone on it can read the Brief; refresh, Topics, Filtered out, and other changes still ask for the password); the steps are in [RUNBOOK.md](RUNBOOK.md) and the 2026-10-31 entry in [DECISIONS.md](DECISIONS.md). How a bot reaches the MCP over that private network is decided when the MCP ships.

## SPA shell

One SPA shell in this repo replaces Kite one view at a time. Each module has its own link:

- Briefs
- Story Desk
- Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)), on hold
- Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)), on hold

Briefs ships first, then Story Desk. Map and Signals get no chrome until their epics have data. The Briefs module matches the current Brief (keyboard, filters, shared links, accessibility) before that Kite view is removed.

## Alerts

The app scores alerts as FLASH, PRIORITY, or ROUTINE. News Desk Bot and Election Desk Bot deliver them. The app does not grow a second alert system. Scoring those tiers is the model. The build is unscheduled, and it waits behind the news section.

## News section first

The news section is Briefs, the three triage items ([NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167), [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168), [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)), and Story Desk. News section first. Signals, Map, and cross-domain correlation stay on hold. Correlation has no ticket. It needs stored history from both raw layers.
