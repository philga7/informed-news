# NEWS roadmap (agent pointer)

Single place for **item ordering**. Jira remains the status source of truth; this file is the preferred sequence when a new thread asks “what’s next?”

Tracker: **NEWS** on [informedcrew.atlassian.net](https://informedcrew.atlassian.net). Prefer JQL `project = NEWS`.

Historical plan (A–G + H story seeds): [`.cursor/plans/osint_jira_pivot_d6b40f87.plan.md`](../.cursor/plans/osint_jira_pivot_d6b40f87.plan.md).  
Claims spine plan: [`.cursor/plans/claims_evidence_spine_8f4cde15.plan.md`](../.cursor/plans/claims_evidence_spine_8f4cde15.plan.md).

## Current next

**Epic L. Topic-driven brief** ([NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) — product pivot grilled 2026-09-28. The operator's topic list drives sources and filtering; AI triages cheaply (Jev) and writes only for shown stories (Ollama); no review queue. Full decisions live in the epic description.

| Order | Key | Summary |
|-------|-----|---------|
| 1 | [NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85) | Topics store, API, and Topics page (seeded with 23 topics) — **Done** |
| 2 | [NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86) | Topic search ingest: Google News RSS + self-hosted SearXNG, merged — **Done** |
| 3 | [NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87) | Triage pipeline: dedupe, keyword + Jev headline gates, survivor-only scrape, budget caps, drop reasons — **Done** ([docs/TRIAGE.md](TRIAGE.md)) |
| 4 | [NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88) | Brief by topic: top 3 per topic, summaries for shown stories only, scheduled + manual refresh — **Done** ([docs/BRIEF.md](BRIEF.md)) |
| 5 | [NEWS-89](https://informedcrew.atlassian.net/browse/NEWS-89) | Full stories: tap-to-expand, automatic worth-it bar, topic sections, living updates — **Done** ([docs/BRIEF.md](BRIEF.md)) |
| 6 | [NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90) | Filtered out view (`/filtered`) + "Less like this" feedback — **Done** ([docs/TRIAGE.md](TRIAGE.md), [docs/BRIEF.md](BRIEF.md)) |
| 7 | [NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91) | Retire review flow from default path; park claims desk; update docs — **Done** ([docs/OWNED_BRIEF.md](OWNED_BRIEF.md#parked-story-desk-and-claims-desk)) |
| 8 | [NEWS-99](https://informedcrew.atlassian.net/browse/NEWS-99) | Prune the Brief summaries store — **Done** ([docs/BRIEF.md](BRIEF.md#retention)) |
| 9 | [NEWS-100](https://informedcrew.atlassian.net/browse/NEWS-100) | Prune the Brief full-stories store (shipped with NEWS-99) — **Done** ([docs/BRIEF.md](BRIEF.md#retention)) |
| 10 | [NEWS-102](https://informedcrew.atlassian.net/browse/NEWS-102) | Share significant-update helper between Brief seen gate and full-story auto bar — **Done** ([docs/BRIEF.md](BRIEF.md)) |
| 11 | [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98) | Manual seeds (Add story) on the topic Brief, pinned first with Remove; Unaccept retired from Kite — **Done** ([docs/BRIEF.md](BRIEF.md#added-stories-seeds)) |
| 12 | [NEWS-104](https://informedcrew.atlassian.net/browse/NEWS-104) | Less like this + Filtered out polish (NEWS-90 follow-ups: keyboard/focus, 409 after collapse, mute-store fallback, 5xx copy, hostname check) — **Done** ([docs/BRIEF.md](BRIEF.md#less-like-this), [docs/TRIAGE.md](TRIAGE.md#filtered-out-view)) |
| **13** | [NEWS-115](https://informedcrew.atlassian.net/browse/NEWS-115) | Manual seed triage edge cases (NEWS-98 follow-ups: Remove vs concurrent refresh, orphan seed records, non-atomic save) *(next)* |
| — | [NEWS-93](https://informedcrew.atlassian.net/browse/NEWS-93) | Always-on hosting decision — **Done** (see [Always-on hosting](#always-on-hosting-news-93)) |
| Hosting | [NEWS-109](https://informedcrew.atlassian.net/browse/NEWS-109) | Dockerfile + Compose for API and Kite with `mvp/data` volume |
| Hosting | [NEWS-110](https://informedcrew.atlassian.net/browse/NEWS-110) | Wire `SEARXNG_URL` / `TOPIC_SEARCH` to the existing Hostinger SearXNG (after NEWS-109) |
| Hosting | [NEWS-111](https://informedcrew.atlassian.net/browse/NEWS-111) | Expose via Tailscale only (no public bind); keep `MVP_PASSWORD` |
| Hosting | [NEWS-112](https://informedcrew.atlassian.net/browse/NEWS-112) | Env-file layout + short Hostinger runbook |
| Later | [NEWS-92](https://informedcrew.atlassian.net/browse/NEWS-92) | USAspending contract awards source for company Watch topics |

**First milestone:** NEWS-85 → 86 → 87 → 88 → 89 (all Done) — open the app and get a filtered, topic-grouped Brief with tap-to-expand full stories and no review step. NEWS-91 then retired the review flow: `/radar` redirects to `/topics`, refresh no longer syncs tracked stories, and the claims desk is parked.

### Always-on hosting (NEWS-93)

Decided 2026-10-09; nothing deployed yet. Today the app runs on the operator laptop, so scheduled refresh only happens while it is up. The decision:

- **Host:** the Hostinger VPS, in Docker next to Nanobot, as a separate Compose project.
- **Search:** reuse the SearXNG already running on that VPS; no second instance.
- **Access:** Tailscale only (no public URL), with the existing `MVP_PASSWORD` login as a second lock.
- **Secrets:** a chmod-restricted env file on the VPS, outside the image.
- **Backups:** none for v1 beyond the Docker volume holding `mvp/data`.
- **Not this round:** public URL, multi-user accounts, Render.

The build is the four Hosting rows above, all under Epic L: NEWS-109 first (NEWS-110 depends on it), then NEWS-110, NEWS-111 and NEWS-112. [NEWS-113](https://informedcrew.atlassian.net/browse/NEWS-113) was a duplicate of NEWS-110 and is closed. NEWS-115 is *(next)* for product work.

Epic **K** ([NEWS-83](https://informedcrew.atlassian.net/browse/NEWS-83)) stays open as the bug intake from the operator walkthrough: open [NEWS-94](https://informedcrew.atlassian.net/browse/NEWS-94) primary-source plumbing, [NEWS-95](https://informedcrew.atlassian.net/browse/NEWS-95) Topics follow-ups, [NEWS-97](https://informedcrew.atlassian.net/browse/NEWS-97) "WORLD" label on topic Brief cards, [NEWS-101](https://informedcrew.atlassian.net/browse/NEWS-101) full-story unavailable UI feedback, [NEWS-103](https://informedcrew.atlassian.net/browse/NEWS-103) require green CI before merge, [NEWS-105](https://informedcrew.atlassian.net/browse/NEWS-105) e2e coverage gaps for Filtered out + Less like this, [NEWS-107](https://informedcrew.atlassian.net/browse/NEWS-107) app test reads the real mvp/data stores (plus a temp `MVP_DATA_DIR` safety net for `npm test`), [NEWS-108](https://informedcrew.atlassian.net/browse/NEWS-108) group refresh-runner deps in `CreateAppDeps`, [NEWS-114](https://informedcrew.atlassian.net/browse/NEWS-114) publisher scrape timeout doesn't cover a stalled body read, [NEWS-116](https://informedcrew.atlassian.net/browse/NEWS-116) Topics page and Add story show raw server error text on 5xx. [NEWS-96](https://informedcrew.atlassian.net/browse/NEWS-96) (svelte-check 0/0, hermetic e2e/integration stack, no skipped tests) shipped with NEWS-88 — **Done**. [NEWS-106](https://informedcrew.atlassian.net/browse/NEWS-106) (app tests' refresh runner used the real full-story store and Ollama) — **Done**. Still ask before parked Later under [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) or Epic **B** ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)).

Epic **J** ([NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)) is **Done**; its claims desk is **parked** by Epic L ([NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91)): no Radar page, no Brief claims lead, no Accept / Track in the UI. Server APIs and stored claims remain; extraction runs only when called manually ([docs/CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md)).

### Complete: J. Claims / evidence desk

| Order | Key | Summary |
|-------|-----|---------|
| — | [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69) | **J. Claims / evidence desk (conflict)** — **Done** |
| 1a | [NEWS-70](https://informedcrew.atlassian.net/browse/NEWS-70) | Claim + evidence stores and status derivation (no verdicts) — **Done** |
| 1b | [NEWS-71](https://informedcrew.atlassian.net/browse/NEWS-71) | TypeSafe client + claim question library + confidence gates — **Done** |
| 1c | [NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72) | Ollama propose candidates + TypeSafe judge extract pipeline — **Done** |
| 1d | [NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73) | Primary vs sensor source tiers + conflict primary starter set — **Done** |
| 1e | [NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74) | Claim Radar API + Kite claim inbox UI — **Done** |
| 1f | [NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75) | Accept / Track / Mute / badge on claimId — **Done** |
| 1g | [NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76) | Brief hybrid: accepted claims + linked clusters + Ollama verbiage — **Done** |
| 1h | [NEWS-77](https://informedcrew.atlassian.net/browse/NEWS-77) | Docs + ROADMAP pointer — **Done** |
| — | [NEWS-78](https://informedcrew.atlassian.net/browse/NEWS-78) | Mark reviewed: dequeue Needs review + Accept clears queue — **Done** |
| — | [NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79) | Extract gating: skip muted articles in all modes + primary-first batch (low-value gate not shipped) — **Done** |

**Product direction (superseded by Epic L, NEWS-84):** Epic J re-centered on **claims + evidence** with Radar as a claim inbox. Epic L replaced the review-desk model with a topic-driven, no-review Brief; the claims desk is parked. Still binding: TypeSafe / Jev = structured judgments; Ollama = verbiage only; honesty = **status + evidence**, no Verified badges / verdicts. Discernment: [CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md).

### Prior: Developing desk v1 (Done-demo)

| Order | Key | Summary |
|-------|-----|---------|
| — | [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) | **I. Developing desk** (radar → accept → track/mute) — v1 Done-demo complete |
| | [NEWS-54](https://informedcrew.atlassian.net/browse/NEWS-54)–[NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61), [NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)–[NEWS-68](https://informedcrew.atlassian.net/browse/NEWS-68) | Story-desk Done children |
| Parked | [NEWS-56](https://informedcrew.atlassian.net/browse/NEWS-56), [NEWS-62](https://informedcrew.atlassian.net/browse/NEWS-62), [NEWS-63](https://informedcrew.atlassian.net/browse/NEWS-63), [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67) | **[Later][Parked]** pending claims spine |
| Superseded | [NEWS-64](https://informedcrew.atlassian.net/browse/NEWS-64) | Claims/disagreements on tracked clusters → Epic J |

### Retired (NEWS-91)

The story-desk flow (Radar triage → **Accept** onto the Brief → **Track** / **Mute**) and the claims desk are off the default path. Epic L's topic Brief decides what shows; there is no Accept step. What stays: the `mvp/server` routes and `mvp/data` stores for Radar, claims, accept, track, and membership (parked, no UI — [docs/MVP_API_COMPAT.md](MVP_API_COMPAT.md)), global **Mute** (shared with triage), manual seeds / **Add story** (moved onto the topic Brief by [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98), which also retired story **Unaccept** from Kite; its server route is parked), and the curated feeds in [docs/RADAR_SOURCES.md](RADAR_SOURCES.md), which refresh still ingests (CFP + 14 curated feeds). No auto live/breaking classifier. The Brief is the home / analysis feed (not framed by time of day).

Former [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) (Brief source breadth) was **absorbed** into NEWS-57.

## Sequence (build order)

| Status | Epic | Key | Notes |
|--------|------|-----|--------|
| Done | A. Kite presentation | [NEWS-33](https://informedcrew.atlassian.net/browse/NEWS-33) | Shell + owned brief path |
| Done | H. Owned rich brief clusters | [NEWS-48](https://informedcrew.atlassian.net/browse/NEWS-48) | Expand sections (sources → enrich → images) |
| Superseded | Brief source breadth | [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) | Absorbed into NEWS-57 |
| Done (v1), parked | I. Developing desk | [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) | Story Radar → Accept → track/mute; retired from the default path by NEWS-91; Later parked |
| Done, parked | J. Claims / evidence desk | [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69) | Claims spine shipped; desk parked by NEWS-91 (APIs + data remain) |
| **Active** | L. Topic-driven brief | [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84) | Topics → search (Google News + SearXNG) → triage → Brief → full stories; no review queue |
| Open | K. Operator review fixes | [NEWS-83](https://informedcrew.atlassian.net/browse/NEWS-83) | Bug intake from operator walkthrough; close when list empty |
| Parked | B. Crucix raw layer | [NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34) | Next build-order candidate after L; ask first |
| Parked | C. Geospatial raw layer | [NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35) | build-order-3 |
| Parked | D. QA harness skeleton | [NEWS-36](https://informedcrew.atlassian.net/browse/NEWS-36) | build-order-4; later: [NEWS-31](https://informedcrew.atlassian.net/browse/NEWS-31) archives |
| Parked | E. Bias / threat classification | [NEWS-37](https://informedcrew.atlassian.net/browse/NEWS-37) | build-order-5 |
| Parked | F. Phase 1 TTS | [NEWS-38](https://informedcrew.atlassian.net/browse/NEWS-38) | build-order-6 |
| Parked | G. Phase 2 voice desk | [NEWS-39](https://informedcrew.atlassian.net/browse/NEWS-39) | build-order-7 |

## Agent rules of thumb

1. Read this file before inventing a “next ticket” from open To Do alone.
2. Confirm live status with Jira (`statusCategory != Done`); if this file and Jira disagree, **Jira wins** and update this file in the same change set when you learn the board moved.
3. Ship via `/news-ship-loop`. Mid-epic discoveries → new NEWS items, not silent rewrites of Done work.
4. Product path stays Kite Brief + `mvp/server` ([AGENTS.md](../AGENTS.md)).
5. Ask before NEWS-57 Later/Parked children or Epics **B–G** — do not start them from open To Do alone.
