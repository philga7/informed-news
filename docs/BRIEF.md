# Brief by topic (NEWS-88)

Part of Epic **L** ([NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) — topics → search → triage → Brief. Ticket: [NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88). Inputs: your topics ([NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85), `/topics`), topic search ([TOPIC_SEARCH.md](TOPIC_SEARCH.md)), and triage's kept stories ([TRIAGE.md](TRIAGE.md)).

Opening the app (`/`) shows a finished Brief grouped by your topics. There is no Accept step: every story triage kept, for a topic you still want, is a candidate. The server refreshes on a timer, and the Brief has a **Refresh** button.

## How the Brief is built

The Brief is composed each time it is read, from triage's kept records (`mvp/data/triage.json`) plus the article, topic, and mute stores.

- **Sections.** One section per **desired** topic that has at least one story: all Core topics first, then all Watch topics, each in your topics-list order. A desired topic with no level counts as Core. Undesired topics never get a section.
- **One section per story.** A kept story can match several topics; it appears once, under the first of its topics in section order that is still desired. A story whose topics have all been deleted or made undesired is not shown.
- **Which stories show.** A kept story shows when its article is still in the store, it is from the last 48 hours (`publishedAt`, or `fetchedAt` when undated), it doesn't match a mute rule or undesired topic *now* (mute edits apply immediately — mute always wins), and it isn't hidden as seen (see below).
- **Ranking within a section.** Significance (0–2, from triage) high to low, unscored last; then more outlets first; then newer first.
- **Top 3 and More.** Each section shows its top 3 cards. A **More (N)** toggle under the section reveals the rest (**Show fewer** hides them again).
- **Quiet topics.** Desired topics with nothing to show are listed on one line at the bottom: `Nothing new: A, B, C` (Core first, then Watch).
- **Empty states.** No desired topics at all → "No topics yet. Add topics to build your Brief." Topics but no stories → "No new stories for your topics." plus the quiet line.
- **Empty article store** (first run) → the old single fixture story renders in the plain list instead; there are no sections or refresh bar.

Each card shows the headline, a summary line (below), `+N outlets` when more than one outlet ran the story (N = outlets − 1), an `Official statement` badge when triage labelled it official, and up to 8 article links: the kept article first, then its duplicates, one per outlet domain.

The Kite category is still slug `world`, now named **Brief**, and the topic sections sit under a "Your topics" heading. The accepted-claims lead still renders above it until NEWS-91.

## Summaries

Summaries are 1–2 neutral sentences written by Ollama **only for stories shown in the Brief**, from the story's own text. They are labelled **"AI summary — not ground truth"** on the card. The prompt asks for facts stated in the text only: no outside context, speculation, evaluative adjectives, or claims that anything is true or verified. Output outside 20–400 characters (after cutting to two sentences) is rejected and recorded as an error.

**Source text**, first match wins:

1. The kept article's scraped body.
2. The scraped body of its first duplicate (in group order).
3. For posts with no page to scrape (e.g. xcancel), the post text when it is at least 120 characters.

The first 3,000 characters are used, with the source article's headline. With no source text the card shows the headline and **"Full text unavailable"** — no Ollama call is made and nothing is invented.

**At refresh:** after each successful refresh, the top 3 stories of every section are summarised, section by section (Core topics first), 2 calls at a time, within `TRIAGE_SUMMARY_BUDGET` calls (default 60). Failed calls count toward the budget. A summary is reused without a call while its source text is unchanged; a failed one is retried next refresh. Stories past the budget are left for on demand.

**On demand:** opening (expanding) a story whose summary is missing asks the server for one — this covers More stories, stories past the budget, and expand-all. The card shows "Summary loads when you open this story" until then, and "Loading summary…" while it runs. On-demand calls don't use the refresh budget but are capped at 30 per hour per server process ("Summary limit reached for this hour. Try again later."). Only stories currently visible in the Brief qualify. You must be logged in; otherwise the card links "Log in on Topics to load summaries".

Without `OLLAMA_API_KEY` no summaries are generated; once a refresh has recorded that, the refresh bar shows "Summaries unavailable (Ollama not configured)".

## Full stories

Every topic Brief card has a **Full story** control. Opening a card also loads its full story when it has not yet been generated (or a prior attempt failed); the expanded card says "Loading full story…" while it works. This session action requires login, and otherwise links to **Topics**. A cached full story is included when the Brief is read, so reopening or revisiting a card does not call Ollama again while its source text is unchanged.

Full stories add source-grounded talking points, a timeline, and suggested questions about what to verify or what remains unknown. Where the source set supports them, cards also show deterministic perspectives and a pull quote; topic settings can request business, technical, action, or history context. The existing **"AI-assisted — not ground truth"** label applies to generated sections. Empty or unsupported sections are omitted rather than filled with guesses. A topic's `map` setting is intentionally omitted: Kite has no map section, and the service neither requests nor emits coordinates or maps.

The server stores one living full story per kept article in `brief-full-stories.json`. It reuses an `ok` record when the member-source hash and requested sections match. When material source changes cause regeneration, it retains prior timeline events, replaces supported current analysis, and shows an **Updated: …** note describing the change. A no-usable-text result is recorded as unavailable without calling Ollama; failures stay retryable.

**At refresh:** after summary generation, the server may generate full stories automatically. The automatic bar requires a material story (Core significance at least 1.0; Watch stories were already significant at triage), either at least three independent outlets or an `official` label, and a new or significantly updated source. It ranks qualifying cards by significance, outlet count, then recency, and limits work to **5 total** and **1 per topic**. Other cards remain available on demand. On-demand full-story generation is independently capped at **20 per hour per server process**.

## Less like this

Ticket: [NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90). An **expanded** topic Brief card has a **Less like this** link (collapsed cards, the fixture story, and the plain `StoryList` don't). It opens a small panel with two options; both write an **undesired** topic to the Topics store, where it shows under **Undesired** on `/topics` and can be edited or removed like any other topic.

- **Not interested in this subject.** **Undesired topic name** is prefilled with the headline, cut on a word boundary to 80 characters (the topic name limit). **Keywords** are optional, comma separated. **Add undesired topic** saves it with the story's headline (cut to 500 characters) as its description, so the triage Jev check can judge later stories against it ([TRIAGE.md](TRIAGE.md#jev-questions)).
- **Block this outlet.** Shown only when the story has a publisher domain that is a hostname such as `bbc.co.uk` (`informed_publisher_domain`). **Block `<domain>`** saves an outlet block: an undesired topic named after the domain with that domain as its only keyword, description "Outlet blocked from the Brief." Triage mutes that outlet and its subdomains by keyword; outlet-only topics (every keyword a hostname; dotted abbreviations like `U.S.` don't count) skip the Jev undesired check. If an undesired topic already blocks the outlet — same domain or a parent domain, ignoring case and a leading `www.` — nothing new is saved and the panel says "`<domain>` is already blocked."

Both kinds get the note `Added with Less like this on: <headline>`. On success the card says `Added "<name>" to undesired topics. Matching stories are hidden the next time the Brief loads, and filtered out from the next refresh.` with a **View Topics** link. Triage applies the topic to stories from the **next refresh**; final records already triaged are not re-triaged. The Brief also re-checks undesired topics each time it is read, so stories already shown that match the new topic (by name, keyword, or outlet) drop out the next time the Brief loads.

It needs a login: otherwise the panel shows "Log in on Topics to use Less like this" linking to `/topics`. A topic name that already exists shows the server's message (`a topic named "…" already exists`); validation errors show the server's message too.

## Seen stories

A story counts as **seen** when you open it or mark it read in the Brief (including **Mark all as read**). Kite sends seen marks to the server in batches about a second later, and right away when you leave the tab. Seen marks need a login; without one they are silently skipped.

- A seen story stays on the page (read styling) until the next successful refresh. After that refresh it is hidden. A story read while a refresh is running hides after the following refresh.
- It comes back if it is **significantly updated** since you saw it: at least **2 more outlets**, or significance up by at least **0.5**. Seeing it again takes a fresh snapshot.
- Before the first successful refresh nothing is hidden.
- Refresh-time summaries skip stories you saw before that refresh started.
- Seen marks are kept for 7 days, and dropped once the story is no longer a kept record.

## Refresh

A refresh runs the whole pipeline: CFP → curated RSS → xcancel → topic search → clustering → triage → tracked-stories sync → Brief summaries → qualifying full stories. The timer, the startup catch-up, and the Refresh button share one runner: a refresh requested while one is running joins it instead of starting another.

**Timer.** The server checks once at startup and then every 5 minutes. A refresh starts when the last successful one finished at least `REFRESH_INTERVAL_HOURS` ago (default 3), or there has never been one (a store from before NEWS-88 uses its last fetch time instead). After a failed refresh it waits 30 minutes before trying again. A stored time that is unreadable or in the future (e.g. after a clock change) counts as missing, so a refresh runs and the 30-minute wait is skipped. A laptop that slept catches up on the first check after it wakes; an always-on host behaves the same. The server log says at startup whether auto-refresh is on and at what interval.

**Refresh bar** (above the sections):

- "Updated 5 min ago" from the last successful refresh, or "Not refreshed yet".
- "Next refresh 3:40 PM" when the timer is on and a refresh has succeeded ("Next refresh due now" once it is overdue).
- A link to the [Filtered out view](TRIAGE.md#filtered-out-view) (`/filtered`, session): **N filtered out** when the last triage run dropped N > 0 stories (overview `filteredOut`), else **Filtered out**. `filteredOut` is the last run's `dropped` count, or `null` before the first run or when that run was skipped.
- **Refresh** button → runs a refresh and reloads the Brief. It shows "Refreshing…" and is disabled while a refresh is running. It needs a login: otherwise it shows "Log in on Topics to refresh" linking to `/topics`. A refresh can take minutes. The bar checks every 10 seconds and reloads the Brief when the refresh finishes in two cases: a refresh was already running when the page loaded, or your Refresh request timed out or failed in a way that may hide a still-running refresh (network error or server error). If 3 checks in a row fail, it stops and shows "Refresh failed. Try again." A timer refresh that starts after the page loaded shows up the next time you reload.
- Notices, in plain language:

| Notice | When |
|--------|------|
| SearXNG / Google News unavailable | That provider failed for every topic last refresh |
| SearXNG / Google News partly failed | That provider failed for some topics |
| Story scoring unavailable (TypeSafe not configured) | No `TYPESAFE_API_KEY`; triage can't score stories |
| N stories not scored (budget) | Triage's Jev budget ran out; retried next refresh |
| Summaries unavailable (Ollama not configured) | The last refresh found no `OLLAMA_API_KEY` |
| Last refresh failed: … | The last refresh failed (e.g. CFP down) |
| Read history unavailable (brief-seen.json unreadable) | The seen file can't be read; nothing is hidden as seen |
| Saved summaries unavailable (brief-summaries.json unreadable) | The summaries file can't be read; cards show no saved summary |

## Env

In `mvp/.env` (see `mvp/.env.example`):

| Variable | Behavior |
|----------|----------|
| `REFRESH_INTERVAL_HOURS` | Hours between auto-refreshes; decimals allowed (`2.5`, `.5`), minimum 0.25. Unset or invalid (including `0.0`, `00`, negatives, `3h`) → 3. Exactly `0`, `off`, `false`, or `no` (trimmed, case-insensitive) turns off the timer **and** the startup catch-up; the Refresh button and `POST /api/fetch` still work. |
| `TRIAGE_SUMMARY_BUDGET` | Ollama summary calls per refresh (non-negative integer; unset or invalid → 60). Now enforced. Doesn't limit on-demand summaries. |
| `OLLAMA_API_KEY` / `OLLAMA_MODEL` | Existing Ollama settings, used for summaries and full-story verbiage. |

Other limits are constants in `mvp/server/src/services/briefConfig.ts` (top 3, 8 links, update thresholds, 7-day seen retention, summary lengths, concurrency, 30/hour on-demand summaries, 20/hour on-demand full stories, refresh check and retry minutes).

`npm run test:e2e:kite` and the Kite integration suite (`bun run test:integration` in `apps/kite`) start their own stack via `e2e/stack/start.mjs`: mvp/server + Kite on separate ports (e2e: Kite 5174 / API 3101; integration: 5175 / 3102), a fresh temp data dir seeded with a fixed topic Brief and a last triage run with dropped stories for the Filtered out view (`e2e/stack/scenarios.mjs`), and a generated env file in place of `mvp/.env` (auto-refresh off, no Ollama / TypeSafe keys, test-only password). They never reuse your dev server or read `mvp/data`, so nothing is skipped for lack of local stories and no budget is spent. The server hooks are `MVP_DATA_DIR` (store directory; process env only) and `MVP_ENV_FILE` (env file instead of `mvp/.env`).

## What's stored where

All gitignored under `mvp/data/`:

- **`brief-summaries.json`** — one summary record per kept article id: `status` (`ok` \| `unavailable` \| `error`), `text`, the source article id and a hash of the source text, `model`, `error`, `generatedAt`, `trigger` (`refresh` \| `on_demand`).
- **`brief-full-stories.json`** — one full-story record per kept article id: `status`, enriched fields, deterministic perspectives / quote, source hash, requested topic sections, model / error, generation metadata, and optional living-update timeline / note.
- **`brief-seen.json`** — one entry per seen article id: `seenAt` plus the outlet count and significance at that time.
- **`meta.json` → `refresh`** — `{ last, lastSuccess }`, each `{ trigger: 'manual' | 'timer' | 'startup', startedAt, completedAt, ok, error }`.
- **`meta.json` → `brief`** — the last refresh's summary and full-story runs: `{ at, summaries: { … }, fullStories: { budget, used, generated, reused, unavailable, errors } }`.

## Routes

| Method | Path | Auth | Role |
|--------|------|------|------|
| GET | `/api/batches/…/categories/…/stories` | Public | All visible Brief stories in Brief order (`limit` ignored) |
| GET | `/api/brief/overview` | Public | Section order, top / More ids, quiet topics, refresh status, notices, `filteredOut` |
| POST | `/api/brief/seen` | Session | Record seen stories |
| POST | `/api/brief/stories/:articleId/summary` | Session | On-demand summary for one visible story |
| POST | `/api/brief/stories/:articleId/full` | Session | Generate or return the visible story's cached full story |
| POST | `/api/brief/stories/:articleId/less-like-this` | Session | Less like this: undesired topic for the subject, or outlet block |
| GET | `/api/triage/filtered` | Session | Filtered out view: dropped stories and why (`scope=last` \| `window`) |
| POST | `/api/fetch` | Session | Manual refresh (also returns `refresh` and `brief`) |

Shapes and status codes: [MVP_API_COMPAT.md](MVP_API_COMPAT.md). Kite proxies these under `apps/kite/src/routes/api/`.

## Failure behavior

- Summary problems never fail a refresh; they are recorded in `meta.json` → `brief`.
- Full-story generation never fails a refresh; automatic-generation errors are recorded in `meta.json` → `brief.fullStories`, and on-demand errors remain retryable from the card.
- A CFP failure still fails the refresh (`POST /api/fetch` → 500); it is recorded as the last refresh and shown as a notice.
- Auto-refresh errors are logged and never stop the server; it starts and serves even if the startup catch-up fails.
- An unreadable `brief-seen.json` or `brief-summaries.json` doesn't break the Brief: it is read as empty and the refresh bar shows "Read history unavailable (brief-seen.json unreadable)" or "Saved summaries unavailable (brief-summaries.json unreadable)". Any other unreadable store (articles, triage, topics, mutes, meta) still fails the Brief request (500).

## Still interim

- **Accept / claims lead.** The accepted-claims lead still renders above the topic sections, and Accept / Unaccept endpoints still exist, but Accept no longer decides what is in the Brief. Manual seeds (Add story) are not triaged, so they don't appear in the topic Brief; the Add story form says so. Retiring the review flow is [NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91).
- The NEWS-86 guards on topic search rows stay ([TOPIC_SEARCH.md](TOPIC_SEARCH.md)); kept search rows get Brief summaries only through this path.
