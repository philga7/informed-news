# Triage pipeline (NEWS-87)

Part of Epic **L** ([NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) — topics → search → triage → Brief. Ticket: [NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87). Inputs: topics ([NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85), `GET /api/topics`) and topic search rows ([NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86), [TOPIC_SEARCH.md](TOPIC_SEARCH.md)).

Triage decides which new stories are worth a reader's attention. Kept stories are what the Brief shows, grouped by topic ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88), [BRIEF.md](BRIEF.md)).

## When it runs

In every refresh — the auto-refresh timer, the startup catch-up, the Kite **Refresh** button, or `POST /api/fetch` ([BRIEF.md](BRIEF.md#refresh)): CFP → curated RSS → xcancel → topic search → clustering → **triage** → Brief summaries. It runs inline (4 story groups in flight at once).

**Candidates** are articles that:

- come from any source except manual Brief seeds (`sourceKind` `cfp`, `rss`, `xcancel`, or `search`; a seed gets its own kept record when saved, [BRIEF.md](BRIEF.md#added-stories-seeds)),
- are within the last **48 hours** (`publishedAt`, or `fetchedAt` when there is no date), and
- have no triage record yet, or only a non-final one (see drop reasons).

Older articles that were never triaged are left alone and get no record.

## Pipeline order

Cheapest step first. A story only moves on if it passes the step before, so off-topic, muted, and trash stories never reach scraping. Nothing in this path calls Ollama, and claims extraction is not part of it.

1. **Mute and keyword pass (free).**
   - Shared mute rules (`/api/brief/mutes`) are checked first, then **undesired** topics. An undesired topic matches when its name or a keyword appears in the headline, publisher headline, or snippet. A keyword with a dot and no spaces (e.g. `dailymail.co.uk`) also blocks that outlet and its subdomains; a leading `www.` and a trailing `.` are ignored, and punycode TLDs (`xn--…`) count as hostnames. Match → `muted:<ruleOrTopicId>`. **Mute always wins** over desired topics.
   - Then **desired** topics: a topic is a candidate when its name or a keyword appears in the same text. Topic search rows also keep the desired topics that found them. Other sources need a keyword hit — no hit → `off_topic`. At most 6 candidate topics per story.
   - Mute rules match as substrings; undesired-topic keywords match on word boundaries with plural endings only (`raid` mutes "raids", but `Ira` doesn't mute "Iran"); desired-topic keywords also accept inflections and demonyms.
   - Topic keywords match whole words. A keyword with no lowercase letters (`ICE`, `DOGE`, `F-250`) is case-sensitive, so `ICE` doesn't hit "ice cream"; others are case-insensitive. A keyword ending in a letter also matches endings: undesired topics only `s` / `es`; desired topics `s`, `es`, `n`, `an`, `ian`, `i`, each optionally followed by `s` (`tariff` matches "tariffs", `Israel` matches "Israeli" and "Israelis", `Iran` matches "Iranians").
2. **Duplicate grouping (free).** Stories are grouped when they share a URL (or one links to the other), carry the same normalized headline on any outlet (syndication; headlines of 3+ words only, so "Live updates" doesn't merge), or have very similar headlines within a shared topic. If a group matches a story already kept earlier in the window, every new member becomes a `duplicate` of it with no Jev call. Otherwise the group picks a representative: primary-tier source first, then one with a direct publisher link, then one with a scraped body, then the longer snippet, then the earliest date.
3. **Headline check (one Jev call).** The representative's headline, publisher, snippet (first 300 characters), and date go to Jev. See [Jev questions](#jev-questions).
4. **Survivor prep.** Only stories that pass the headline check, and only rows still waiting for a scrape (`bodyStatus: 'pending'`, e.g. topic search rows) touch the network: a Google-only link is resolved to the publisher URL, the publisher page is scraped for the body, and an undated story gets its date from page metadata. A topic search story that is still undated → `undated`; a page date older than 48 hours → `stale`. Other sources fall back to `fetchedAt` and are never `undated`.
5. **Body check (one more Jev call).** Only when the story has its body (`bodyStatus: 'ok'`, from this scrape or from ingest) and budget remains. Same questions, with the first 3,000 characters of the body added; a drop verdict here replaces the headline verdict. If the body is blocked or unavailable, the call fails, or the budget is spent, the story is **kept on the headline verdict** with `bodyChecked: false`. Its Brief summary is written from the kept story's body when it has one, else from a duplicate member's body, else — for a post with no page to scrape — from the post text when it is at least 120 characters; with none of these, the card shows "Full text unavailable" ([BRIEF.md](BRIEF.md#summaries)).

When a story is kept, the untried members of its group become `duplicate` of it. If the representative is dropped as `clickbait`, `opinion`, `rewrite`, `sponsored`, `undated`, or `stale`, up to **2** alternates from the group are tried in turn. When an alternate is kept, members already tried and dropped keep their own reason; only untried members become `duplicate`. The kept record's `memberIds` lists the whole group (including dropped alternates), so read each member's own record for its status. `off_topic`, `muted:*`, and `not_significant` stop the group (same event, same answer). If nothing in the group is kept, the untried members become `duplicate` of the representative.

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
| `not_scored_error` | **No** | Jev unavailable (no `TYPESAFE_API_KEY`) or the headline call failed. |

Nothing unscored is ever kept, and nothing over budget is silently dropped.

## Jev questions

Each Jev call is one TypeSafe `systemOne` request (via the existing `TYPESAFE_API_KEY` / `TYPESAFE_MODEL`) that asks, in plain terms:

- **Topic relevance**, per candidate topic: "Is this story substantively about <topic>?" — a passing mention counts as no. Needs 0.5 or higher.
- **Undesired match**, per undesired topic (up to 10): "Is this story about <topic> (a subject the reader excluded)?" — judged on the topic's description, so it catches stories the keywords miss. 0.6 or higher → `muted:<topicId>`, even if it is also relevant. **Outlet-only** undesired topics — every keyword is a hostname such as `dailymail.co.uk` (dotted abbreviations like `U.S.` or `D.C.` don't count), e.g. the outlet blocks **Less like this** creates ([BRIEF.md](BRIEF.md#less-like-this)) — are not asked about here and don't use up the 10 slots; they still mute by outlet in step 1.
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
| `TRIAGE_SUMMARY_BUDGET` | Ollama Brief summary calls per refresh. Non-negative integer; unset or invalid → `60`. Reported here as `summaryBudget` and **enforced by the Brief's refresh-time summaries** ([BRIEF.md](BRIEF.md#summaries)); failed calls count. |
| `TYPESAFE_API_KEY` / `TYPESAFE_MODEL` | Existing TypeSafe settings. Without a key, no Jev calls are made: stories that would reach Jev get `not_scored_error` and the run error `TypeSafe not configured`. |

Other limits are constants in `mvp/server/src/services/triageConfig.ts` (48h window, concurrency 4, 6 candidate / 10 undesired topics per call, 2 promotions, Jev thresholds, snippet and body lengths, similar-headline thresholds).

## What's stored where

- **`mvp/data/triage.json`** (gitignored) — `{ records, updatedAt }`, one record per article id: `status` (`kept` \| `dropped`), `reason`, `stage` (`keyword` \| `dedupe` \| `headline` \| `survivor` \| `body` \| `budget` \| `manual` — an operator seed, written by Add story rather than a run), `final`, `topicIds` (kept: the topics Jev confirmed; dropped: the candidate topics considered), `labels`, `duplicateOf`, `memberIds` and `outletCount` (kept only), `significance`, `bodyChecked`, `jevCalls` (total across refreshes), `triagedAt`. Records for articles no longer in the article store are pruned on write; for seed records, only once they are older than the window ([Seeds and concurrent refreshes](#seeds-and-concurrent-refreshes)).
- **Article store** — survivors that were resolved or scraped are written back: `publisherUrl`, `publisherDomain`, an added publisher citation, `bodyText`, `bodyStatus`, `publisherTitle`, image fields, and `publishedAt` when it was empty. `id` and `canonicalUrl` never change.
- **`mvp/data/meta.json` → `triage`** — the last run summary: `{ at, skipped, candidates, kept, dropped, byReason, jev: { budget, used, errors }, summaryBudget, errors }`. `byReason` counts this run's drops, with every `muted:<id>` counted under `muted`. `errors` holds at most 5 messages, plus any store-write errors (triage, articles, meta), which are always appended.

The same summary (without `at`) is returned by `POST /api/fetch` as `triage` ([MVP_API_COMPAT.md](MVP_API_COMPAT.md)).

## `GET /api/triage`

Session required. Returns `{ ok: true, run, records }`:

- `run` — `meta.json` → `triage`, or `null` before the first run.
- `records` — newest `triagedAt` first, at most 500, each a triage record plus the article's `title`, `canonicalUrl`, `publisherUrl`, `publisherDomain`, `publishedAt`, and `sourceKind` (all `null` if the article is gone).

```bash
curl -s -b /tmp/mvp-cookies http://127.0.0.1:3001/api/triage
```

## Filtered out view

Ticket: [NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90). The Kite page **`/filtered`** (session) lists what triage dropped and why, for spot checks and trust. Nothing on it needs action, and there is no "Show anyway". It is linked from the Brief refresh bar (**N filtered out** when the last run dropped any, else **Filtered out** — [BRIEF.md](BRIEF.md#refresh)) and from the Topics page (**See what was filtered out**). Without a login it shows "Log in on Topics to see filtered stories", linking to `/topics`.

- **Last refresh** (default): every record with `status: 'dropped'` whose `triagedAt` equals the last run's `at` (`meta.json` → `triage`). Every record a run writes gets that run's time, so this is exactly what the latest refresh dropped. No run yet → nothing listed ("No refresh has triaged stories yet.").
- **Last 48 hours**: dropped records with `triagedAt` in the last 48 hours (the triage window), across refreshes.

The page shows a run line (`Last refresh 3:40 PM: 120 candidates, 18 kept, 102 dropped`, or "Last refresh did not triage stories" plus its first error for a skipped run), a row of reason counts that jump to their group, and one group per reason in this order, empty groups omitted:

| Group | Label |
|-------|-------|
| `muted:<id>` (any) | Muted |
| `off_topic` | Off-topic |
| `clickbait` | Clickbait |
| `opinion` | Opinion |
| `rewrite` | Rewrite / roundup |
| `sponsored` | Sponsored |
| `not_significant` | Not significant |
| `duplicate` | Duplicate |
| `undated` | Undated |
| `stale` | Too old |
| `not_scored_budget` | Not scored (budget) |
| `not_scored_error` | Not scored (error) |

Within a group, newest `publishedAt` first (undated last). A group shows 20 stories, then **Show all (N)**. Each story shows its headline (linked to the publisher URL, else the canonical URL), outlet, age, and the candidate topics that still exist, plus:

- **Muted by: …** — the mute rule's keyword (with ` (<source>)` when the rule has one) or the undesired topic's name; "Removed rule or topic" when neither exists any more.
- **Duplicate of: …** — the story it duplicates (linked), or "Article no longer stored".
- **Retried next refresh** — for the non-final reasons (`not_scored_budget`, `not_scored_error`).
- A dropped record whose article is gone shows "Article no longer stored" as its headline.

The page says: "Reasons from story scoring are AI-assisted judgments, not ground truth."

### `GET /api/triage/filtered`

Session required. `?scope=last` (default; anything other than `window` means `last`) or `?scope=window`. Returns `{ ok: true, scope, run, counts, items }`:

- `run` — `meta.json` → `triage`, or `null` before the first run.
- `counts` — items per reason group (`muted`, `off_topic`, …); groups with none are absent.
- `items` — every matching dropped record (no cap), sorted by group order, then newest `publishedAt` (undated last), then article id. Each: `{ articleId, title, url, publisherDomain, publishedAt, sourceKind, reason, group, final, stage, mutedBy, topics, duplicateOf, triagedAt }`. Article fields are `null` when the article is gone; `url` is `publisherUrl ?? canonicalUrl`, or `null` unless it is an `http:` / `https:` URL (same for `duplicateOf.url`). `mutedBy` is `{ kind: 'rule' | 'topic', id, label }` for `muted:<id>` reasons, else `null`. `topics` is `[{ id, name }]` for the record's topics that still exist, in topics-list order. `duplicateOf` is `{ articleId, title, url }` or `null`.
- Mute rules unreadable → the view still loads with no rules, as triage does; rule-muted items then show "Removed rule or topic" ([NEWS-104](https://informedcrew.atlassian.net/browse/NEWS-104)).
- Any other store read failure → `500 { ok: false, error }`. The page shows the server's message only for `400` / `409`; every other failure (5xx included) shows "Filtered stories could not be loaded right now."

```bash
curl -s -b /tmp/mvp-cookies 'http://127.0.0.1:3001/api/triage/filtered?scope=window'
```

## Failure behavior

- Triage never fails a refresh. A CFP failure still fails `POST /api/fetch`, as before.
- Topics, articles, or the triage store unreadable → run `skipped: true` with the error: no Jev calls, no scraping, nothing written except the run summary. A missing `triage.json` is not an error (first run starts empty). Mute rules unreadable → triage continues with no mute rules. Each is recorded in `errors`.
- An unexpected error mid-run is recorded in `errors` and the run is reported `skipped: true` (counts zeroed, Jev calls already spent still reported); the run summary is still written. If triage itself throws out of the refresh, the failure summary is written to `meta.json` → `triage` as well.
- A Jev headline failure (an error result or a thrown call) marks that story and its untried group members `not_scored_error`; a body failure keeps the headline verdict with `bodyChecked: false`. Both count in `jev.errors`; other groups continue.
- Store write failures (triage, articles, meta) are caught into `errors`.

### Seeds and concurrent refreshes

Add story and Remove ([BRIEF.md](BRIEF.md#added-stories-seeds)) write `triage.json` outside the refresh run; every triage write shares one serialized read-modify-write queue ([NEWS-115](https://informedcrew.atlassian.net/browse/NEWS-115)):

- **The disk decides which seeds exist.** When a run writes, seed records come from the store on disk at that moment; the run's copy wins only for its dedupe growth (`memberIds`, `outletCount`). A seed saved mid-run survives; a seed removed mid-run stays removed.
- **Remove during a refresh.** The run's duplicates of a seed that is no longer on disk (ones it already had and ones it found this run) are not written back, so those stories are triaged again on their own next refresh, as Remove intends.
- **Dangling duplicates.** A stored `duplicate` record whose target has no triage record any more is triaged again at the next refresh (if still in the window) instead of staying final. The Filtered out view already tolerates a missing target ("Article no longer stored" when the article is gone too).
- **Orphan seed records.** A seed record whose article is no longer in the article store is pruned once it is older than the 48-hour window (or its `triagedAt` doesn't parse). Younger ones are kept, so a seed saved mid-run (whose article the run never read) is never pruned by mistake.
- **Duplicate check at save.** It runs once on the triage read and again inside the serialized triage write, against the articles read just before that write, so a story a refresh keeps just before the seed is written is still refused when its headline matches, or its URL as stored then. **Accepted:** a refresh writes its triage records before the articles it resolved (publisher URL, body), so a URL-only match resolved in that same moment can be missed; and a refresh that started *before* the seed was saved doesn't dedupe its new stories against it. Either way the same story can show twice (the seed and a triaged card) until one is seen or removed.
- **Non-atomic save — accepted.** The seed article is written before its triage record. If the triage write fails (or the second duplicate check refuses), the article stays with no record: never triaged (manual), never shown, the same state a removed seed leaves. A retry saves a new article. The article store has no retention prune, so such articles stay until a prune is added.

## Limits

- **Kept stories are shown in the Brief** by topic ([BRIEF.md](BRIEF.md)); dropped stories are on the [Filtered out view](#filtered-out-view); `GET /api/triage` still lists every record.
- **Topic edits don't re-triage final records** while they are in the window. A new or changed topic only affects stories triaged after the edit. The Brief does re-check mute rules and undesired topics when it is read, and drops a kept story whose topics are all deleted or undesired.
- The NEWS-86 guards on topic search rows stay in place (not clustered, skipped by Ollama batch endpoints) — see [TOPIC_SEARCH.md](TOPIC_SEARCH.md).
