# Decisions

Binding choices for Informed News. Newest first. When one of these changes, update this file in the same change as [ROADMAP.md](ROADMAP.md) and Jira. What the product does now, in plain language, is [PRODUCT_SPEC.md](PRODUCT_SPEC.md). Pipeline detail remains in [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84), [TRIAGE.md](TRIAGE.md), and [BRIEF.md](BRIEF.md). The target is [VISION.md](VISION.md).

## 2026-10-26 — Product spec and plain-English changelog on every ship-loop PR (trial)

**Decision:** Phil approved a trial on October 26, 2026. Every ship-loop pull request updates [PRODUCT_SPEC.md](PRODUCT_SPEC.md) in the same pull request as the code, so that file stays a plain-language list of what the product does now: features and user scenarios, with no implementation detail. The same pull request adds an entry to [WHATS_NEW.md](WHATS_NEW.md) for what changed for a reader of the app, or states that there is no user-visible change. `CHANGELOG.md` stays the semantic-release log and is not hand-edited for these notes. Review this trial after 5 tickets have merged since it landed. No Jira issue was filed for the trial itself.

**Why:** Pipeline docs describe how refresh and scoring work. A reader of the app, and an agent about to change it, need a short list of what the product does and what just changed for that reader.

**What it rules out:** Using `CHANGELOG.md` as the reader-facing note, and merging a behavior change while `PRODUCT_SPEC.md` still describes the old product.

## 2026-10-23 — The running app stays the topic Brief until the SPA

**Decision:** Until [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170), the running product is the Kite Brief plus `mvp/server`: topics drive sources and filtering, there is no review queue, Jev scores in triage, and Ollama writes Brief verbiage for stories that are shown. Today's pipeline order is the one in [TRIAGE.md](TRIAGE.md).

**Why:** Epic L already shipped that path. The SPA is a later module swap, and agents were treating feature docs as the only place a binding choice could live.

**What it rules out:** Putting a review queue back on the default path, and treating the SPA as the product that is already running.

## 2026-10-23 — Take verdict, blocklist, and Like / Not relevant

**Decision:** Take three Radaric items on the Brief side, in this order: persist a triage verdict, confidence, reason, and criteria reference, with an Approved / Filtered / All view ([NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167)); a config blocklist that runs before any AI call ([NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168)); Like / Not relevant, with an optional comment, fed into later triage prompts ([NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)). Like / Not relevant steers this app's triage prompts only. It does not feed News Desk Bot story spotting. "Less like this" stays the hard mute. These fields are the future record, not the live triage record. Kept items today still follow [TRIAGE.md](TRIAGE.md) (`reason: null` when kept).

**Why:** Dropped items already carry a reason, and "Less like this" already creates hard mutes. The gap is a verdict on kept items, a cheap blocklist in front of Jev, and a soft signal that can be edited.

**What it rules out:** A second scoring path, training a model on the feedback, and sending that feedback to the bot that spots stories.

## 2026-10-23 — Fold the rest of Radaric into tickets that already exist

**Decision:** Source presets and OPML import fold into parked [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67). Watchers (plain language, hourly / daily / weekly, through topic search) fold into [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84) and wait for hosting. Cross-publisher clustering folds into [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) and is designed inside Story Desk.

**Why:** Those ideas already had a home. New tickets would split one source-admin surface, one watcher surface, and one grouping design.

**What it rules out:** A new epic for presets, a new epic for watchers, and a clustering feature beside Story Desk.

## 2026-10-23 — Defer category chips and YouTube; skip X, merged articles, and Track a question

**Decision:** Defer category chips and YouTube channels until the three triage items have shipped. Skip X as a Radaric ingest, skip cloning merged-article writing, and skip Track a question. Track a question belongs to informed-brain.

**Why:** Chips and YouTube are extra source surface. X history already has a separate path ([BIRDCLAW.md](BIRDCLAW.md)). Merged-article writing and a question tracker are different products.

**What it rules out:** Building those five in the news-section queue.

## 2026-10-23 — The SPA lives in this repo

**Decision:** The SPA shell is [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170), in philga7/informed-news. It replaces Kite one view at a time: Briefs, then Story Desk. Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)) and Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)) stay on hold with no empty tabs. The Briefs module matches today's Brief on keyboard, filters, shared links, and accessibility before that Kite view is removed. `apps/kite` keeps serving a view until its replacement passes the same end-to-end suite. Framework and folder are recorded in this file before NEWS-170 code. They are still open.

**Why:** A second repo would split the Brief store from Story Desk. Kite's keyboard, filter, shared-link, and accessibility work is the bar the replacement has to clear.

**What it rules out:** A new repository, a thinner Briefs module that drops that bar, and empty Map or Signals links.

## 2026-10-23 — Story grouping is designed once, inside Story Desk

**Decision:** Story Desk is the one place cross-publisher grouping is designed. Group approved items only. A group needs at least 2 distinct publishers. Precision is at least 80% on 30 labeled items. Phil labels that set. Groups link to Briefs. Today's duplicate grouping stays as [TRIAGE.md](TRIAGE.md) specifies it (same URL, same headline, or similar headlines before Jev). That step is dedupe of one story. It is not this grouper.

**Why:** Triage already collapses syndication copies. A second clusterer for "same developing story across outlets" would fork the design, and an unlabeled precision number cannot be checked.

**What it rules out:** A separate clustering project, writing merged articles, an agent labeling its own clusters, and removing the triage duplicate step.

## 2026-10-23 — The raw layer has no AI

**Decision:** RSS and topic-search ingest stay free of model calls. Watcher query expansion is a scoring step on [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84), used when watchers are built after hosting.

**Why:** The raw layer is the feed of items. Scoring is where Jev, and later a watcher query expansion, spend model calls.

**What it rules out:** An LLM on RSS or topic-search ingest.

## 2026-10-23 — One API, one MCP, and bot reachability is open

**Decision:** One API and one MCP server sit in front of raw, scoring, and output. The SPA and the bots are clients. Bot reachability is open until hosting [NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109) through [NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112) chooses how a bot reaches a Tailscale-only MCP. The app scores FLASH, PRIORITY, and ROUTINE. The bots deliver those alerts. That scoring build is unscheduled.

**Why:** Two APIs or two alert scorers would split the same items. The network path depends on the hosting design, which is not started.

**What it rules out:** A Story Desk-only server, a public MCP URL chosen in this decision, and a second alert system in the bots.

## 2026-10-23 — News section order, hosting after the feedback loop

**Decision:** The combined order is [NEWS-131](https://informedcrew.atlassian.net/browse/NEWS-131) and [NEWS-155](https://informedcrew.atlassian.net/browse/NEWS-155), then [NEWS-165](https://informedcrew.atlassian.net/browse/NEWS-165) and [NEWS-171](https://informedcrew.atlassian.net/browse/NEWS-171), then [NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167), [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168), and [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169), then hosting [NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109) through [NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112), then the SPA candidate [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170). [NEWS-139](https://informedcrew.atlassian.net/browse/NEWS-139), [NEWS-128](https://informedcrew.atlassian.net/browse/NEWS-128), and [NEWS-121](https://informedcrew.atlassian.net/browse/NEWS-121) stay on the dev-tooling queue after item 2 and do not block items 3 through 7. Hosting gates the Story Desk MCP, Watchers, and Epics B and C. The [NEWS-93](https://informedcrew.atlassian.net/browse/NEWS-93) design stands: Hostinger, the existing SearXNG, Tailscale only, a chmod-restricted env file, and no v1 backups beyond the Docker volume. Epic B ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)), Epic C ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)), and cross-domain correlation (no ticket; it needs stored history) stay on hold.

**Why:** The Oct 10 hosting deferral waited on all remaining product work. The news section is the work that should land before the VPS, and the MCP is useless to the bots until that VPS is up.

**What it rules out:** Starting the SPA, Signals, Map, or Watchers before hosting, and holding hosting until every later idea is done.
