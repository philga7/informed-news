# NEWS roadmap (agent pointer)

Single place for **item ordering**. Jira remains the status source of truth; this file is the preferred sequence when a new thread asks “what’s next?”

Tracker: **NEWS** on [informedcrew.atlassian.net](https://informedcrew.atlassian.net). Prefer JQL `project = NEWS`.

Historical plan (A–G + H story seeds): [`.cursor/plans/osint_jira_pivot_d6b40f87.plan.md`](../.cursor/plans/osint_jira_pivot_d6b40f87.plan.md).

## Current next

| Order | Key | Summary |
|-------|-----|---------|
| **1** | [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) | **I. Developing desk** (radar → accept → track/mute) |
| 1a | [NEWS-54](https://informedcrew.atlassian.net/browse/NEWS-54) | Lock CFP + curated RSS radar sources (starter set) + config |
| 1b | [NEWS-55](https://informedcrew.atlassian.net/browse/NEWS-55) | Ingest curated RSS into article store |
| 1c | [NEWS-58](https://informedcrew.atlassian.net/browse/NEWS-58) | Radar UI at `/radar` |
| 1d | [NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65) | Accept cluster onto Brief (membership + association) |
| 1e | [NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66) | Manual Brief seed (title / note / optional URLs) |
| 1f | [NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59) | Track developing story (alerts) |
| 1g | [NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60) | Mute undesired topics (global) |
| 1h | [NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61) | In-app alert badge on tracked updates |

Start at **NEWS-54** unless the user names another key. Do not open Epics **B–G** until desk v1 is Done (or the user explicitly reorders).

### Membership (locked 2026-09-18; manual seeds 2026-09-19)

| Surface | What appears |
|--------|----------------|
| **Radar** | Auto triage: fresh CFP + curated RSS clusters (headline lane). No manual seeds in v1. |
| **Brief** | **Accepted** clusters only, minus **global mute**; new articles that share an accepted `clusterId` join Brief automatically. **Manual seeds** ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)): title / note / optional URL(s), `sourceKind: manual`, Accepted by definition (not on Radar). |

- **Accept** = Brief membership (from Radar). One verb — not a separate “Promote.”
- **Manual seed** = Accept without ingest parent; **Unaccept** drops from Brief (hard-delete not required in v1).
- **Mute** = global veto (Radar hide + Brief ineligible).
- **Track** = alerts only; may default on at Accept / manual seed.
- No auto live/breaking classifier in v1. Brief is the home / analysis feed (not framed by time of day).

**Radar v1 sources:** CFP + curated RSS starter set ([docs/RADAR_SOURCES.md](RADAR_SOURCES.md)) — 14 curated feeds + CFP. File config only until [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67) (source admin CRUD). Birdclaw/X ([NEWS-62](https://informedcrew.atlassian.net/browse/NEWS-62)), Telegram ([NEWS-63](https://informedcrew.atlassian.net/browse/NEWS-63)), claims/disagreements ([NEWS-64](https://informedcrew.atlassian.net/browse/NEWS-64)), and Brief categories ([NEWS-56](https://informedcrew.atlassian.net/browse/NEWS-56)) are **Later** — not the Done-demo.

Former [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) (Brief source breadth) was **absorbed** into NEWS-57.

## Sequence (build order)

| Status | Epic | Key | Notes |
|--------|------|-----|--------|
| Done | A. Kite presentation | [NEWS-33](https://informedcrew.atlassian.net/browse/NEWS-33) | Shell + owned brief path |
| Done | H. Owned rich brief clusters | [NEWS-48](https://informedcrew.atlassian.net/browse/NEWS-48) | Expand sections (sources → enrich → images) |
| Superseded | Brief source breadth | [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) | Absorbed into NEWS-57 |
| **Active** | I. Developing desk | [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) | Radar → Accept → track/mute; before B |
| Parked | B. Crucix raw layer | [NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34) | build-order-2 |
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
