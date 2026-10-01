# Triage pipeline (NEWS-87)

Part of Epic **L** ([NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) — topics → search → triage → Brief. Ticket: [NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87). Inputs: topics ([NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85), `GET /api/topics`) and topic search rows ([NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86), [TOPIC_SEARCH.md](TOPIC_SEARCH.md)).

Triage decides which new stories are worth a reader's attention. It does **not** put anything in the Brief yet — kept stories are only recorded. Showing them in the Brief by topic is [NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88).

## When it runs

At the end of every refresh (`POST /api/fetch`): CFP → curated RSS → xcancel → topic search → clustering → **triage**. It runs inline (4 story groups in flight at once); there is no separate timer yet (NEWS-88).

**Candidates** are articles that:

- come from any source except manual Brief seeds (`sourceKind` `cfp`, `rss`, `xcancel`, or `search`),
- are within the last **48 hours** (`publishedAt`, or `fetchedAt` when there is no date), and
- have no triage record yet, or only a non-final one (see drop reasons).

Older articles that were never triaged are left alone and get no record.

## Pipeline order

Cheapest step first. A story only moves on if it passes the step before, so off-topic, muted, and trash stories never reach scraping. Nothing in this path calls Ollama, and claims extraction is not part of it.

1. **Mute and keyword pass (free).**
   - Shared mute rules (`/api/brief/mutes`, same matching as Radar) are checked first, then **undesired** topics. An undesired topic matches when its name or a keyword appears in the headline, publisher headline, or snippet. A keyword with a dot and no spaces (e.g. `dailymail.co.uk`) also blocks that outlet and its subdomains; a leading `www.` is ignored. Match → `muted:<ruleOrTopicId>`. **Mute always wins** over desired topics.
   - Then **desired** topics: a topic is a candidate when its name or a keyword appears in the same text. Topic search rows also keep the desired topics that found them. Other sources need a keyword hit — no hit → `off_topic`. At most 6 candidate topics per story.
   - Topic keywords match whole words. A keyword with no lowercase letters (`ICE`, `DOGE`, `F-250`) is case-sensitive, so `ICE` doesn't hit "ice cream"; others are case-insensitive. A keyword ending in a letter also matches simple endings (`s`, `es`, `n`, `an`, `ian`, `i` — `tariff` matches "tariffs", `Israel` matches "Israeli").
2. **Duplicate grouping (free).** Stories are grouped when they share a URL (or one links to the other), carry the same normalized headline on any outlet (syndication; headlines of 3+ words only, so "Live updates" doesn't merge), or have very similar headlines within a shared topic. If a group matches a story already kept earlier in the window, every new member becomes a `duplicate` of it with no Jev call. Otherwise the group picks a representative: primary-tier source first, then one with a direct publisher link, then one with a scraped body, then the longer snippet, then the earliest date.
3. **Headline check (one Jev call).** The representative's headline, publisher, snippet (first 300 characters), and date go to Jev. See [Jev questions](#jev-questions).
4. **Survivor prep.** Only stories that pass the headline check, and only rows still waiting for a scrape (`bodyStatus: 'pending'`, e.g. topic search rows) touch the network: a Google-only link is resolved to the publisher URL, the publisher page is scraped for the body, and an undated story gets its date from page metadata. A topic search story that is still undated → `undated`; a page date older than 48 hours → `stale`. Other sources fall back to `fetchedAt` and are never `undated`.
5. **Body check (one more Jev call).** Only when the story has its body (`bodyStatus: 'ok'`, from this scrape or from ingest) and budget remains. Same questions, with the first 3,000 characters of the body added; a drop verdict here replaces the headline verdict. If the body is blocked or unavailable, the call fails, or the budget is spent, the story is **kept on the headline verdict** with `bodyChecked: false` (NEWS-88 will show "full text unavailable").

When a story is kept, the other members of its group become `duplicate` of it. If the representative is dropped as `clickbait`, `opinion`, `rewrite`, `sponsored`, `undated`, or `stale`, up to **2** alternates from the group are tried in turn. `off_topic`, `muted:*`, and `not_significant` stop the group (same event, same answer). If nothing in the group is kept, the untried members become `duplicate` of the representative.

## Drop reasons

Every candidate ends **kept** (`reason: null`) or **dropped** with one reason. Final records are not looked at again; non-final ones are re-triaged on the next refresh while the story is still in the window.

| Reason | Final | Meaning |
|--------|-------|---------|
| `muted:<id>` | Yes | Matched a mute rule or undesired topic (by keyword, outlet, or Jev). `<id>` is the rule or topic id. |
| `off_topic` | Yes | No desired topic matched, or Jev found it isn't really about any candidate topic. |
| `duplicate` | Yes | Same story as another article; `duplicateOf` names it. |
| `clickbait` | Yes | Clickbait or rage bait. |
| `opinion` | Yes | Opinion or commentary presented as news. |
| `rewrite` | Yes | Rewrite, aggregation, or "what to know" roundup with no new reporting. |
| `sponsored` | Yes | Sponsored content, deals, shopping, stock tips, or listicles. |
| `not_significant` | Yes | Only matched **watch** topics and wasn't significant enough for any of them. |
| `undated` | Yes | Topic search story with no date from the feed or the page. |
| `stale` | Yes | Page date is older than the 48-hour window. |
| `not_scored_budget` | **No** | This refresh's Jev budget ran out before the story was checked. |
| `not_scored_error` | **No** | Jev unavailable (no `TYPESAFE_API_KEY`) or the call failed. |

Nothing unscored is ever kept, and nothing over budget is silently dropped.

## Jev questions

Each Jev call is one TypeSafe `systemOne` request (via the existing `TYPESAFE_API_KEY` / `TYPESAFE_MODEL`) that asks, in plain terms:

- **Topic relevance**, per candidate topic: "Is this story substantively about <topic>?" — a passing mention counts as no. Needs 0.5 or higher.
- **Undesired match**, per undesired topic (up to 10): "Is this story about <topic> (a subject the reader excluded)?" — judged on the topic's description, so it catches stories the keywords miss. 0.6 or higher → `muted:<topicId>`, even if it is also relevant.
- **Story kind**: news, official statement, clickbait, opinion, rewrite, or sponsored. Clickbait / opinion / rewrite / sponsored with confidence 0.6 or higher → dropped with that reason; at lower confidence the story is not dropped for its kind.
- **Significance** on a 0–2 scale (routine → notable → must-know). **Watch** topics below 1.4 are removed from the story's topics; if none are left → `not_significant`. **Core** topics are never significance-gated.

Rules are applied in that order: undesired, then relevance, then story kind, then significance. A failed call still counts toward the budget.

These are AI-assisted judgments, not ground truth.

### `official` label

When Jev says (with confidence 0.6 or higher) that a kept story is an official or primary statement — government, court, company filing, press release, or reporting that is mainly that statement — the record gets `labels: ['official']`. The label only appears on kept stories. It does **not** bypass relevance, undesired, or significance checks.

## Budget priority

Groups are scheduled round-robin across topics — core topics first, then watch topics, each in topics-list order — newest story first within a topic, so one busy topic can't eat the budget. A Jev call is reserved before it is made, so concurrent groups never overspend. When the budget runs out, the current story and the rest of its group get `not_scored_budget` and are retried on the next refresh.

## Outlet breadth

A kept story's `outletCount` is how many distinct outlets ran it: distinct publisher domains across the kept story and its duplicates, with outlets that published the identical headline (syndication, e.g. MSN and Yahoo reprints) counted as one. When a later refresh adds duplicates to an already-kept story, its `memberIds` and `outletCount` are updated.

## Env

In `mvp/.env` (see `mvp/.env.example`):

| Variable | Behavior |
|----------|----------|
| `TRIAGE_ENABLED` | Default on. `false` / `0` / `off` / `no` (trimmed, case-insensitive) disables triage; the run is reported `skipped: true`. |
| `TRIAGE_JEV_BUDGET` | Jev calls per refresh. Non-negative integer; unset or invalid → `300`. `0` means every story that reaches Jev is `not_scored_budget`. |
| `TRIAGE_SUMMARY_BUDGET` | Summaries per refresh. Non-negative integer; unset or invalid → `60`. Read and reported here, but **enforced by NEWS-88** (summaries are generated there). |
| `TYPESAFE_API_KEY` / `TYPESAFE_MODEL` | Existing TypeSafe settings. Without a key, no Jev calls are made: stories that would reach Jev get `not_scored_error` and the run error `TypeSafe not configured`. |

Other limits are constants in `mvp/server/src/services/triageConfig.ts` (48h window, concurrency 4, 6 candidate / 10 undesired topics per call, 2 promotions, Jev thresholds, snippet and body lengths, similar-headline thresholds).

## What's stored where

- **`mvp/data/triage.json`** (gitignored) — `{ records, updatedAt }`, one record per article id: `status` (`kept` \| `dropped`), `reason`, `stage` (`keyword` \| `dedupe` \| `headline` \| `survivor` \| `body` \| `budget`), `final`, `topicIds` (kept: the topics Jev confirmed; dropped: the candidate topics considered), `labels`, `duplicateOf`, `memberIds` and `outletCount` (kept only), `significance`, `bodyChecked`, `jevCalls` (total across refreshes), `triagedAt`. Records for articles no longer in the article store are pruned on write.
- **Article store** — survivors that were resolved or scraped are written back: `publisherUrl`, `publisherDomain`, an added publisher citation, `bodyText`, `bodyStatus`, `publisherTitle`, image fields, and `publishedAt` when it was empty. `id` and `canonicalUrl` never change.
- **`mvp/data/meta.json` → `triage`** — the last run summary: `{ at, skipped, candidates, kept, dropped, byReason, jev: { budget, used, errors }, summaryBudget, errors }`. `byReason` counts this run's drops, with every `muted:<id>` counted under `muted`. `errors` holds at most 5 messages.

The same summary (without `at`) is returned by `POST /api/fetch` as `triage` ([MVP_API_COMPAT.md](MVP_API_COMPAT.md)).

## `GET /api/triage`

Session required. Returns `{ ok: true, run, records }`:

- `run` — `meta.json` → `triage`, or `null` before the first run.
- `records` — newest `triagedAt` first, at most 500, each a triage record plus the article's `title`, `canonicalUrl`, `publisherUrl`, `publisherDomain`, `publishedAt`, and `sourceKind` (all `null` if the article is gone).

```bash
curl -s -b /tmp/mvp-cookies http://127.0.0.1:3001/api/triage
```

## Failure behavior

- Triage never fails a refresh. A CFP failure still fails `POST /api/fetch`, as before.
- Topics or articles unreadable → run `skipped: true` with the error. Mute rules unreadable → triage continues with no mute rules. Triage store unreadable → starts empty. Each is recorded in `errors`.
- A Jev failure on one story marks it and the rest of its group `not_scored_error` and counts in `jev.errors`; other groups continue.
- Store write failures (triage, articles, meta) are caught into `errors`.

## Interim limits

- **Kept stories are not shown in the Brief yet** — that is NEWS-88. Until then they are visible only through `GET /api/triage`.
- **Filtered-out view** (browse dropped stories with their reasons) is [NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90).
- **Topic edits don't re-triage final records** while they are in the window. A new or changed topic only affects stories triaged after the edit.
- **Summary budget** is defined and reported but not enforced until NEWS-88.
- The NEWS-86 guards on topic search rows stay in place (not clustered, not on Radar, skipped by Ollama batch endpoints) — see [TOPIC_SEARCH.md](TOPIC_SEARCH.md).
