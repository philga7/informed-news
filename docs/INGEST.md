# Ingest contract

How an agent posts to the site. An agent is any program given a token, such as a bot. Grok Bot is the first agent, and the contract is not tied to it. One route takes every kind of item: stories, story updates (entries), Breaking items, CFP items, the CFP footer, and Morning items. The same route serves moving a story into the site (see [Moving a story](#moving-a-story)) and the ongoing posts. Decided in [DECISIONS.md](DECISIONS.md) (2026-11-16 ingest contract, 2026-11-23 NEWS-228, 2026-11-24 NEWS-262). The code is in `mvp/server/src/ingest/` and `mvp/server/src/store/postgres/ingestStore.ts`.

Users do not use this route. They read and write through session routes in the site, which share the same store and field rules (built with the UI steps in [ROADMAP.md](ROADMAP.md#ui-build-sequence-2026-11-16)).

This is version 1 of the contract. A breaking change would come at a new path, `/api/v2/ingest`, and this path keeps working.

## Setup

- Set `INGEST_TOKEN` in the env file (`mvp/.env`): a random string of at least 32 characters, for example `openssl rand -hex 32`. It is separate from user sign-in and is never logged. Today this one token is the one agent's token. Giving each agent its own token is decided and not built yet (see [Decided, not built yet](#decided-not-built-yet)).
- The site is reachable only over Tailscale, so an agent must be on the tailnet to post.
- The Postgres settings must be in the env file too. The route applies the dashboard schema on first use.
- With no token, or a token shorter than 32 characters, every request answers **503**. With no database, a request with the right token answers **503** (a wrong token still answers **401**). The rest of the server runs as before.

## Requests

Every request sends `Authorization: Bearer <INGEST_TOKEN>` (the word Bearer in any case). No session cookie is needed or used. A missing or wrong token answers **401**, and the body is not read.

| Request | What it does |
|---|---|
| `POST /api/ingest` with one item `{ "kind": …, … }` | Stores one item |
| `POST /api/ingest` with `{ "items": [ … ] }` | Stores 1 to 100 items in order, each in its own transaction. An entry can follow its story in the same batch. One request writes up to 2,000 rows, nested rows included; a larger batch is refused whole with **422** |
| `GET /api/ingest/<kind>/<id>` | Reads back what the site holds for one item. The CFP footer's id is its day |

The body may be up to 1 MB. A larger body answers **413**; send a smaller batch. A body that is not JSON answers **400**, and one that cannot be read (such as an unsupported charset) answers with its own 4xx status.

### Results

One item answers with its status and `{ "kind", "id", "outcome" }`. A batch always answers **200** with `{ "results": [ … ] }`, one per item in order, each with `index`, `status`, and `outcome` or `error`, plus `kind` and `id` whenever the item's own fields name them. One bad item does not stop the others.

| Status | Outcome or reason | Meaning |
|---|---|---|
| 201 | `created` | New item stored |
| 200 | `unchanged` | The same id with the same content was already stored. Nothing changed |
| 200 | `updated` | A story, one of its nested rows, or a CFP footer changed |
| 409 | `conflict` | The id is already stored with different content (fixed kinds), a nested id belongs to another story, or a story's role or hub would change |
| 422 | `invalid` | The item breaks a rule. `error` says which field and why |
| 422 | `missing` | The item refers to a story, entry, source, category or user that does not exist |
| 503 | `unavailable` | The database cannot be reached. Retry later |
| 500 | `error` | Unexpected. The server log has a line without the item's content |

Errors never contain SQL text.

## Ids and retries

Every item carries its own `id`: 1 to 200 letters, digits, `.`, `_`, `:` or `-`, for example `grok:story:musk-spacex`. Ids are the agent's. The site never makes one for an item an agent posts. (The site makes the ids for what users write in the site.)

- **Story:** created, or its own fields are replaced by the new post. Its role and hub cannot change.
- **Entry, Breaking item, CFP item, Morning item:** fixed once stored. Sending the same id again with the same content changes nothing. Different content is a 409. To correct one, post a new item with a new id.
- **CFP footer:** one per day. A new note for a day replaces the old.

A retry of anything is always safe.

## Times

A time must carry its zone. Accepted: `2026-11-23T18:45:00-05:00`, `2026-11-23T18:45:00-0500`, `2026-11-23 23:45:00Z`, `2026-11-23t23:45z`. Seconds and fractions are optional. A time with no zone is refused. Times are stored in UTC. A calendar date is `YYYY-MM-DD`.

## Labels and fixed values

Values are sent in the lowercase form the database stores. The definitions are in [DECISIONS.md](DECISIONS.md) (2026-11-16, "Status labels are a fixed list").

| Field | Values |
|---|---|
| Entry and Breaking `label` | `official_ruling`, `official`, `on_record`, `reported`, `working`, `single_outlet`, `claim_no_new_evidence`, `claim_no_evidence_shown` |
| Story `status` | `developing`, `active`, `stalled`, `waiting` |
| Story `role` | `hub`, `branch` |
| CFP `status` | `working`, `unconfirmed` |
| Morning `card` | `bluf`, `weather`, `market`, `osint` |
| Entry `precision` | `time`, `day` |

## Kinds

Unknown fields are refused, so a misspelt field shows up as an error. Optional fields may be left out or sent as `null`.

### `story`

| Field | Type | Notes |
|---|---|---|
| `id` | id | Required |
| `role` | `hub` or `branch` | Required. Cannot change later |
| `hubId` | story id | Required for a branch, absent for a hub. Cannot change later |
| `title` | text | Required |
| `status` | story status | Required |
| `nowSummary`, `cadence`, `unchangedNote`, `earlierSummary`, `sourcesNote`, `threadUrl` | text | Optional. `cadence` is free text such as "twice daily, 9 AM and 9 PM" |
| `nowUpdatedAt`, `lastCheckedAt`, `nextCheckAt` | time | Optional |
| `ownerUserId` | user id | Optional. Makes the story private to that user (see below) |
| `sources` | list of `{ id, outlet, title?, url?, publishedOn?, via?, groupLabel?, note? }` | One row per cited article. `publishedOn` is a date |
| `tags` | list of `{ slug, name }` | `slug` is lowercase letters, digits and single hyphens |
| `categoryIds` | list of category ids | Categories must already exist |
| `dates` | list of `{ id, startsOn, endsOn?, label }` | Next dates. Dates, not times |
| `panels` | list of `{ id, kind, title, payload, sort? }` | See Panels |
| `links` | list of `{ toStoryId, note }` | Related stories, with a one-line reason |

Nested rows are created or updated by their own id (tags by slug, links by the story they point at). Nothing is deleted by leaving it out of a later post. A nested id that already belongs to another story is a 409. Each nested list holds up to 200 rows.

### `entry` (a story update)

| Field | Type | Notes |
|---|---|---|
| `id` | id | Required |
| `storyId` | story id | Required. The story must exist |
| `precision` | `time` or `day` | Required |
| `occurredAt` | time, or a date when `precision` is `day` | Required |
| `occurredUntil` | same form | Optional end of a range, such as Nov 3 to 4 |
| `headline` | text, up to 200 characters | Required |
| `label` | entry label | Required |
| `body` | text | Optional. The headline and change bullets carry the update |
| `changes` | list of text | Up to 10 short bullets of up to 280 characters each |
| `sources` | list of `{ sourceId?, url?, label? }` | A citation that names a story source (`sourceId`) may leave out `url` and `label`. They are copied from that source: its URL (which may be empty) and its outlet. A citation with no `sourceId` needs both |
| `tags` | list of `{ slug, name }` | Up to 20. A new slug is added to the story's tags. A known slug keeps its name |

### `breaking`

| Field | Type | Notes |
|---|---|---|
| `id` | id | Required |
| `occurredAt` | time | Required |
| `headline` | text, up to 200 characters | Required |
| `label` | entry label | Required |
| `sourceName`, `via`, `url` | text | Optional |
| `storyId` | story id | Optional. The ping opens this story |
| `entryId` | entry id | Optional. Needs `storyId`, and must be an entry of that story |

A Breaking item may point at a private story. Users other than its owner and the admin (the `OPERATOR_EMAIL` account) will not see it; that rule is applied when the Breaking block is built.

### `cfp_item`

| Field | Type | Notes |
|---|---|---|
| `id` | id | Required |
| `roundupAt` | time | Required |
| `title` | text | Required |
| `url`, `topic`, `sourceName` | text | Optional |
| `status` | `working` or `unconfirmed` | Optional |

### `cfp_day_note` (the CFP footer)

| Field | Type | Notes |
|---|---|---|
| `day` | date | Required. The day the note is filed under. It is also the id |
| `stillWorking`, `dropped` | text | One line each. Optional |

### `morning`

| Field | Type | Notes |
|---|---|---|
| `id` | id | Required |
| `card` | `bluf`, `weather`, `market` or `osint` | Required |
| `body` | text | Required. The card's text |
| `link` | text | Optional |
| `postedAt` | time | Required |
| `data` | object | Optional. Its shape depends on the card (below). A BLUF card carries no data |

**Weather** `data`, the grid on the Weather card:

```json
{
  "unit": "F",
  "issuedAt": "2026-11-20T06:32:00-05:00",
  "alertsAt": "2026-11-19T21:59:00-05:00",
  "days": ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"],
  "locations": [
    {
      "name": "Dahlonega",
      "now": { "temp": 53, "conditions": "clear", "rainChancePct": 16 },
      "days": [
        { "high": 57, "low": 51 },
        { "high": 51, "low": 40 },
        { "high": 50, "low": 39 },
        { "high": 53, "low": 27 }
      ],
      "note": "Fri night 35, patchy frost (NWS)",
      "alert": "Freeze Watch: lows to 29, 2-8 AM Sat"
    }
  ]
}
```

`unit` is `F` or `C`. `days` holds 1 to 10 dates, and each location has one high and low per day, in the same order. There are 1 to 12 locations. `now`, `alertsAt`, `note` and `alert` are optional.

**Market** `data`: `{ "quotes": [ { "label": "S&P", "value": 7520.93, "changePct": -0.38 } ], "notes": ["Needs attention: SPG, RSI 79.6, trim candidate."] }`. There are 1 to 20 quotes, `changePct` is optional, and there are up to 6 notes.

**OSINT** `data`: `{ "watch": "Whether US aircraft return to UK bases." }`, the card's "Watch:" line. Optional.

Text in `data` is up to 500 characters a field, and `data` is up to 32 KB.

### Panels

A story panel's `payload` is checked by its `kind`:

- `seats`: `{ "segments": [ { "name": "Bloc A", "value": 58 } ], "threshold": 61, "note": "Ten seats undecided" }`. There are 1 to 20 segments, values are 0 or more, and `threshold` and `note` are optional.
- Any other kind: any JSON object up to 32 KB.

## Private stories

A story post with `ownerUserId` is private to that user. The id must be an existing account. A disabled account still has an id and is accepted. A later post may change the owner or clear it, which makes the story shared.

A private story cannot have branches. A branch cannot be private, a branch cannot sit under a private hub, and a hub that has branches cannot be made private. Each of these is a 422. This is settled ([DECISIONS.md](DECISIONS.md#2026-11-23--the-per-user-answers-branches-admin-visibility-following-and-who-builds-the-controls-news-260)).

Today's single token can read every private story back through `GET /api/ingest/story/<id>`. Once each agent has its own token, an agent reads back the private stories it wrote. In the site, the admin (the account named by `OPERATOR_EMAIL`) sees every private story, whoever wrote it, including the ones Grok Bot writes. Any other user sees only their own.

## Moving a story

A story moves from Grok Bot's page into the site one story at a time, and only when Phil is ready to track it in the site. Until then, the page stays the source for that story.

1. The agent writes the page's content in this contract's JSON itself. The site never reads the page.
2. It posts the story, then the page's whole timeline as entries, each with a stable id, in batches.
3. It reads the story back to check what the site holds.
4. From then on, the agent posts new updates to the site and stops updating the page. Marking the page as moved is done on the agent's side.

The site keeps no "moved" flag: a story that is in the site has moved. Posting a page's data as a fixture, to check the contract or build the UI against, is not a move.

## Decided, not built yet

Decided in [DECISIONS.md](DECISIONS.md#2026-11-24--agent-contract-user-api-deletes-moving-stories-and-hosting-news-262). None of this works yet. Each part comes with its own ticket: [ROADMAP.md](ROADMAP.md#ui-build-sequence-2026-11-16) rows 5a to 5c, and the JSON Schema as a follow-up outside the sequence.

- **One token per agent.** Each agent gets its own token, which can be turned off on its own, and every row records who wrote it (`written_by`). `INGEST_TOKEN` is then removed, and the token Grok Bot holds is re-issued as its own.
- **A list read.** The stories an agent may see (every shared story, plus the private ones it wrote), each with its status, last-checked and next-check times, and its latest entry, in pages.
- **Corrections.** A correction is a new entry that may name, in `corrects`, an entry of the same story. Until then, post a new entry with a new id, as above.
- **Soft removes.** An agent may remove an item it wrote, a story included, with a reason. The stored item is kept; readers see "Removed on <date>: <reason>" in its place, and a removed story drops out of readers' lists. An agent never edits a fixed item or removes another writer's item.
- **Hard deletes** are made only by the admin, for the reasons listed in the decision, and never through this contract.
- **A published JSON Schema** of this contract, generated from `parse.ts`.

## Examples

```bash
curl -sS https://<host>/api/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" -H 'Content-Type: application/json' \
  -d '{"items":[
    {"kind":"story","id":"grok:story:musk-spacex","role":"hub","title":"Democratic proposals to curb Musk and SpaceX","status":"developing",
     "sources":[{"id":"grok:src:axios-1103","outlet":"Axios","url":"https://example.com/axios"}]},
    {"kind":"entry","id":"grok:entry:musk-spacex:1103","storyId":"grok:story:musk-spacex","precision":"day",
     "occurredAt":"2026-11-03","occurredUntil":"2026-11-04","headline":"Democrats vow probes of Musk businesses",
     "label":"reported","changes":["Probes vowed"],"sources":[{"sourceId":"grok:src:axios-1103"}],
     "tags":[{"slug":"probes","name":"#probes"}]}
  ]}'

curl -sS https://<host>/api/ingest/story/grok:story:musk-spacex -H "Authorization: Bearer $INGEST_TOKEN"
```
