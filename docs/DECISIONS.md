# Decisions

Binding choices for Informed News. Newest first. When one of these changes, update this file in the same change as [ROADMAP.md](ROADMAP.md) and Jira. What the product does now, in plain language, is [PRODUCT_SPEC.md](PRODUCT_SPEC.md). Pipeline detail remains in [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84), [TRIAGE.md](TRIAGE.md), and [BRIEF.md](BRIEF.md). The target is [VISION.md](VISION.md).

## 2026-10-31 — Spec and plain-English changelog stay, with a narrower rule (NEWS-175)

**Decision:** Keep both steps. Update [PRODUCT_SPEC.md](PRODUCT_SPEC.md) only when what a reader can do changes. Do not bump Last checked when the spec is unchanged. Keep [WHATS_NEW.md](WHATS_NEW.md). Write what is true at merge, or one line **No user-visible change.** for a tooling change. Deploy steps and post-merge steps stay in the pull request body. The next ship-loop pull request corrects a WHATS_NEW or PRODUCT_SPEC line that is no longer true, and lists that correction under "Also in this PR". Do not roll this out to other repos yet. Revisit after informed-news runs 5 more pull requests under this rule. Phil was not in the grill. Each answer is "Recommended, adopted (Phil can override in review)."

**Why:** Five pull requests merged after the Oct 26 trial landed on main (#210–#214). They carry seven ticket keys (NEWS-172, NEWS-173, NEWS-109, NEWS-110, NEWS-111, NEWS-112, NEWS-181) plus one keyless tooling pull request (#212). #207–#209 merged before that trial commit, so they are outside the count. Real scenario edits on #210, #211, #213, and #214 matched the product. The only Last checked bump with no scenario change was #212, which is the diff noise the trial asked about. #214's note said a laptop or phone could not open the Brief yet. That was true at merge and false later the same day, after Tailscale Serve was turned on. The failure was describing a post-merge step as the reader's present, not the changelog step itself.

**What it rules out:** A Last checked bump on an unchanged spec, changelog lines that describe steps still to be done after merge, a separate ticket for every stale line, and copying this rule to other repos on this evidence alone.

## 2026-10-31 — Private-network access and runbook (NEWS-111, NEWS-112, NEWS-181)

**Decision:** [VISION.md](VISION.md)'s direction did not change: still the topic Brief until the SPA. Ship [NEWS-111](https://informedcrew.atlassian.net/browse/NEWS-111), [NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112), and [NEWS-181](https://informedcrew.atlassian.net/browse/NEWS-181) from these grill answers. Each one is "Recommended, adopted (Phil can override in review)."

1. **Serve on the host:** Tailscale runs on the VPS host, not in the container, and serves the app with `tailscale serve`. Recommended, adopted (Phil can override in review).
2. **MagicDNS URL:** The app is reached on one MagicDNS HTTPS URL on the tailnet. Recommended, adopted (Phil can override in review).
3. **Cookie rule:** The session cookie is `Secure` only when the immediate peer is trusted and the request is HTTPS. Trusted means loopback or a non-public address (RFC1918, IPv4 link-local, IPv6 ULA), because Docker's proxy is the peer inside the container. A public address is ignored. Plain HTTP on localhost still logs in. `NODE_ENV` does not force `Secure`. Recommended, adopted (Phil can override in review).
4. **Bind check:** The runbook's public-access checks include `ss -ltnp` showing port 3001 on `127.0.0.1` only, and a failed request to the VPS public IP on 3001. Phil runs them. Recommended, adopted (Phil can override in review).
5. **Single env file:** One env file at `/opt/informed-news/.env`, mode `600`, owner `deploy:deploy`, outside the image. No Tailscale auth key in it. Recommended, adopted (Phil can override in review).
6. **Repo path:** `/opt/informed-news`, branch `main`, owner `deploy`. Recommended, adopted (Phil can override in review).
7. **No override file:** The laptop uses the same compose command with `INFORMED_NEWS_ENV_FILE=./mvp/.env`. Recommended, adopted (Phil can override in review).
8. **Image tag:** The image defaults to `informed-news:local`; CI uses `informed-news:ci`. Recommended, adopted (Phil can override in review).

**Why:** Anyone on Phil's private network can read the Brief, as on a laptop, and the public internet cannot. Refresh, Topics, Filtered out, and other changes still ask for the password. The runbook is [RUNBOOK.md](RUNBOOK.md). The container is up on the VPS and published on `127.0.0.1` only. Tailscale Serve is not configured: the deploy user cannot change it, so that command is Phil's. Laptop and phone checks remain his.

**Update (later on 2026-10-31):** Phil turned Tailscale Serve on after merge. It is tailnet only and proxies to the app on the machine. A laptop or phone needs Tailscale installed. The steps, including an SSH tunnel fallback, are in [RUNBOOK.md](RUNBOOK.md).

**What it rules out:** A public URL, a public bind, a second compose override file, a Tailscale key in the app env file, and forcing `Secure` cookies by `NODE_ENV` (which would break plain-HTTP localhost login).

## 2026-10-29 — Hosting ahead of NEWS-168/169; container grill (NEWS-109, NEWS-110)

**Decision:** On 2026-10-27 Phil reordered hosting ([NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109)–[NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112)) ahead of [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168) and [NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169). [VISION.md](VISION.md)'s direction did not change: still the topic Brief until the SPA; hosting is how that Brief stays up. Ship NEWS-109 and NEWS-110 from these grill answers:

1. **Image:** multi-stage `node:22-bookworm-slim`, `npm ci` in the build stage, non-root `node` at runtime.
2. **One port in the image:** Kite is built in the image and served by Express on one port. `npm run dev` stays two processes.
3. **Data volume:** Named volume `informed-news-data` mounted at `/app/mvp/data`. The Dockerfile creates that directory and `chown`s it to `node`.
4. **Health:** `GET /healthz` returns 200, no auth, no outside calls. Compose healthcheck `30s` / `5s` / `3` / `20s`.
5. **SearXNG URL:** SearXNG is reached only via `SEARXNG_URL` on the shared Docker network. Never default to localhost inside the container.
6. **SearXNG soft-fail:** `SEARXNG_URL` unset → Google News RSS only, one startup warning. An error or timeout skips SearXNG with one warning per refresh. The refresh still finishes.
7. **Topic search default:** Topic search stays on unless `TOPIC_SEARCH_ENABLED` says otherwise. Compose does not set that variable; the env file passes it through.
8. **Secrets:** Secrets only in the local env file, GitHub secrets, or the VPS env file. `.dockerignore` excludes `.env*` except `.env.example`, plus `mvp/data`, `node_modules`, and `.git`.
9. **Bind:** The published port is bound to `127.0.0.1` on the host. Inside the container the process listens on `0.0.0.0` so the published port works. Tailscale is NEWS-111.
10. **Compose isolation:** Compose project `name: informed-news`. Nothing is shared with Nanobot except the external network `nanobot-mem0`.
11. **CI timing:** CI builds and starts the container with no `timeout-minutes` and records build and start seconds.
12. **Deploy gate:** Deploy only after CI is green, and only when `VPS_HOST`, `VPS_SSH_KEY`, and `TS_AUTHKEY` are all set. Never print secret values. Deploying does not merge. If any secret is missing, the PR body lists the commands instead.

**Why:** An always-on Brief needs a container and a soft SearXNG path before Tailscale and the runbook; the citation-guard reorder had parked hosting after NEWS-169, and Phil pulled it forward.

**What it rules out:** A second SearXNG, a public port, secrets in the image, and failing the refresh because SearXNG is down.

## 2026-10-27 — Court-record checks grill (NEWS-173)

**Decision:** Ship [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173) from the 2026-10-27 grill answers:

1. **Scope:** Reporter citations and CourtListener / RECAP URLs only. Display scope only: marks on cards, no new pipeline stage.
2. **Unresolved is Unverified:** A court cite that cannot be resolved shows **Unverified citation**, using the same advisory wording as an unverified link.
3. **Procedural flag, not a status:** A resolved record that is a procedural disposition carries a `procedural` flag and shows “Dismissed on procedure, not on the merits.” It is never a refutation and never a new status.
4. **Token:** `COURTLISTENER_API_TOKEN` in `mvp/.env`, server-only, optional. Empty skips court checks.
5. **Cache:** `citation-court-cache.json` under `mvp/data/`, retained 7 days with the other citation stores.
6. **URL equivalence:** Trailing slash, http vs https, and `utm_*` tags are equivalent. A mismatch and a missing source both still show unverified.
7. **Fail closed:** Timeouts, errors, and a missing token leave items unverified and never block a refresh.
8. **Install script and bun:** The install script does not download bun. If bun is missing it exits and says to install bun 1.4.3.
9. **Wider Google News hostname matching deferred:** Matching Google News hosts other than news.google.com is not part of this ticket.

**Why:** A court mark should say what we could not confirm without implying a ruling on the merits.

**What it rules out:** Verified / false badges for court records, treating procedural dismissals as refutations, blocking refresh on a CourtListener failure, and live network in tests.

## 2026-10-27 — Citation guard grill (NEWS-172)

**Decision:** Ship [NEWS-172](https://informedcrew.atlassian.net/browse/NEWS-172) from the 2026-10-27 grill answers:

1. **Fetched that run:** Same-hash stored text counts when this run registers it into the per-run source store. No re-HTTP scrape solely for the guard.
2. **Source definition:** Kept scraped body, duplicate-cluster member bodies, RSS/body text when that is what we have, and saved post text that is article content. An unresolved Google News URL is **not** a source.
3. **Unmatched links and quotes:** Keep and mark **unverified**; never present as fact; do not silently drop.
4. **Debunked:** No new badge. Without a linked refuting source among fetched sources, show **unconfirmed**. Transparency’s “no verified / false badge” stands.
5. **Scope now:** Pull quote, perspectives, talking points, timeline, card summaries, living-update notes. Not: parked claims-desk UI, Transparency copy, Topics form fields.
6. **Quote normalization:** Whitespace + curly/straight quote marks only. Case-sensitive. Ellipses and `[bracketed]` insertions are not normalized. Match against full stored source text.
7. **Per-run source store:** New gitignored file under `mvp/data/` via the shared JSON write helper. Retention **7 days** (align with Brief full-story / summary cache).
8. **Check log:** Persist under `mvp/data/`, keyed by story/article id; survives restart; old stories without a log still load. Fold match status into Brief / full-story payloads. Brief UI: unverified / unconfirmed marks only. Screen reader: polite advisory (“unverified link”, “unverified quote”, “unconfirmed”).
9. **NEWS-173 hook:** Citation `kind` on each checked item (`url` | `quote` | `claim`, reserve `court`) + resolver registry (kind → check). Source records: `url`, `text`, `fetchedAt`/`runId`, `contentHash`. Shared terminal states: `match` | `mismatch` | `missing-source` (display: unverified / unconfirmed as above).
10. **When:** Both refresh and on-demand generation. Failed checks mark items and continue — never block a refresh.

Clean-room: do not copy CaseCite (Elastic License 2.0). Court checks remain [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173).

**Why:** Nothing quoted or linked should appear as fact unless a source retrieved in that run backs it.

**What it rules out:** Silent drops of unmatched items, verified/false/debunked badges, blocking refresh on check failure, live network in citation tests, and CaseCite ports.

## 2026-10-27 — Triage advisory verdict + Approved / Filtered / All

**Decision:** Ship [NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167). Each triage record keeps the machine layer (`status` / `reason`, with `reason: null` when kept) and, on new writes, an optional advisory layer: `verdict` (`approved` \| `filtered`), `confidence` (0–1), `reasonText` (prose ≤300), and `criteriaRef` (one string). All four are present together or all absent; pre-NEWS-167 rows omit them (no backfill). `criteriaRef` is one driving rule: non-AI `rule:mute:<id>`, `rule:duplicate`, `rule:budget` (and later `rule:blocklist:<term>`); Jev `global` \| `topic:<id>` \| `source:<id>`. Non-AI drops use `confidence: 1`. The Brief refresh bar gets an **Approved / Filtered / All** toggle beside the existing `/filtered` link: default **Approved**, ephemeral (not persisted). **Filtered** shows last-refresh drops with an advisory reason expander; `/filtered` (Filtered out) stays as the spot-check page. This supersedes the 2026-10-23 note that kept items still only carry `reason: null` as the live story for "why" — machine `reason: null` on kept remains, and advisory `reasonText` is now written on new records.

**Why:** Dropped items already had a machine reason; the gap was a prose / confidence / criteria record on both kept and dropped for the Brief, without a second scoring path or new Jev questions.

**What it rules out:** Backfilling old rows, persisting the Brief toggle, mixing Filtered cards into topic ranks, replacing `/filtered`, adding Jev questions for the advisory fields, and treating advisory text as ground truth.

## 2026-10-26 — Product spec and plain-English changelog on every ship-loop PR (trial)

**Decision:** Phil approved a trial on October 26, 2026. Every ship-loop pull request updates [PRODUCT_SPEC.md](PRODUCT_SPEC.md) in the same pull request as the code, so that file stays a plain-language list of what the product does now: features and user scenarios, with no implementation detail. The same pull request adds an entry to [WHATS_NEW.md](WHATS_NEW.md) for what changed for a reader of the app, or states that there is no user-visible change. `CHANGELOG.md` stays the semantic-release log and is not hand-edited for these notes. Review this trial after 5 tickets have merged since it landed ([NEWS-175](https://informedcrew.atlassian.net/browse/NEWS-175)). That review includes whether bumping **Last checked**, when the spec did not change, is worth the diff.

**Why:** Pipeline docs describe how refresh and scoring work. A reader of the app, and an agent about to change it, need a short list of what the product does and what just changed for that reader.

**What it rules out:** Using `CHANGELOG.md` as the reader-facing note, and merging a behavior change while `PRODUCT_SPEC.md` still describes the old product.

## 2026-10-26 — PR titles are Conventional Commits naming every ticket key

**Decision:** A PR title is a Conventional Commit with every ticket key in the scope, e.g. `fix(NEWS-131, NEWS-155, NEWS-174): …`. It takes the highest bump type in the batch: breaking (`!`) > `feat` > `fix` / `perf` > no-release types. If every ticket is a no-release type, use the first ticket's type. A title with no key is allowed only for an untracked `docs`, `chore`, `ci`, `test`, `style`, or `build` change. A **PR title** workflow (`scripts/check-pr-title.mjs`, no new dependencies) enforces this and re-runs when the title is edited. Phil adds it to the ruleset as a required check after it lands on `main`. Multi-ticket PRs still squash, with one Conventional Commit per ticket on the branch. Merge with the PR title as the squash subject (`gh pr merge --subject`, or the repo's squash default set to the PR title). Rules in [CONTRIBUTING.md](../CONTRIBUTING.md#squash-merges-and-semantic-release-harn-10) ([NEWS-155](https://informedcrew.atlassian.net/browse/NEWS-155)).

**Why:** semantic-release and the changelog read only the squash subject on `main`. [PR #191](https://github.com/philga7/informed-news/pull/191) (`NEWS-119, NEWS-120: …`) cut no release. [PR #205](https://github.com/philga7/informed-news/pull/205) squashed as `docs(NEWS-165): …` and the NEWS-171 subject never reached `main`. GitHub's default squash title for a one-commit PR is that commit's subject, not the checked PR title.

**What it rules out:** Keys only in the subject or a trailing `(NEWS-N)`, titles that leave out a key in the batch, a third-party title action or commitlint dependency, and rebase-merging multi-ticket PRs.

## 2026-10-26 — Citation guard after the verdict view

**Decision:** Phil approved [NEWS-172](https://informedcrew.atlassian.net/browse/NEWS-172) (citation guard: every link, link-backed claim, and quote in a Brief or update must match a source fetched that run, or show as unverified) and [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173) (court citations via CourtListener citation lookup and RECAP). They run in that order right after [NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167) and before [NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168). The rest of the combined order is unchanged, so hosting is now item 8 and the SPA item 9 ([ROADMAP.md](ROADMAP.md#combined-order-oct-23-2026-citation-guard-added-oct-26)).

**Why:** It puts Phil's evidence standard into code: nothing quoted or linked appears as fact unless a source retrieved in that run backs it. Court checks build on the per-run source store that NEWS-172 adds.

**What it rules out:** Copying CaseCite code (Elastic License 2.0; NEWS-172 is clean-room), live CourtListener calls in CI, and treating a procedural dismissal as refuting a claim.

## 2026-10-23 — The running app stays the topic Brief until the SPA

**Decision:** Until [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170), the running product is the Kite Brief plus `mvp/server`: topics drive sources and filtering, there is no review queue, Jev scores in triage, and Ollama writes Brief verbiage for stories that are shown. Today's pipeline order is the one in [TRIAGE.md](TRIAGE.md).

**Why:** Epic L already shipped that path. The SPA is a later module swap, and agents were treating feature docs as the only place a binding choice could live.

**What it rules out:** Putting a review queue back on the default path, and treating the SPA as the product that is already running.

## 2026-10-23 — Take verdict, blocklist, and Like / Not relevant

**Decision:** Take three Radaric items on the Brief side, in this order: persist a triage verdict, confidence, reason, and criteria reference, with an Approved / Filtered / All view ([NEWS-167](https://informedcrew.atlassian.net/browse/NEWS-167)); a config blocklist that runs before any AI call ([NEWS-168](https://informedcrew.atlassian.net/browse/NEWS-168)); Like / Not relevant, with an optional comment, fed into later triage prompts ([NEWS-169](https://informedcrew.atlassian.net/browse/NEWS-169)). Like / Not relevant steers this app's triage prompts only. It does not feed News Desk Bot story spotting. "Less like this" stays the hard mute. The advisory fields are not the live triage record — machine `status` / `reason` are. *(NEWS-167 shipped 2026-10-27: advisory fields on new writes; see [2026-10-27](#2026-10-27--triage-advisory-verdict--approved--filtered--all).)*

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
