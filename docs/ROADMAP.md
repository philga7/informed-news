# NEWS roadmap (agent pointer)

Single place for **item ordering**. Jira remains the status source of truth; this file is the preferred sequence when a new thread asks “what’s next?”

Tracker: **NEWS** on [informedcrew.atlassian.net](https://informedcrew.atlassian.net). Prefer JQL `project = NEWS`.

Historical plan (A–G + H story seeds): [`.cursor/plans/osint_jira_pivot_d6b40f87.plan.md`](../.cursor/plans/osint_jira_pivot_d6b40f87.plan.md).

## Current next

| Order | Key | Summary |
|-------|-----|---------|
| **1** | [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) | Brief source breadth (pubs + categories) |
| 1a | [NEWS-54](https://informedcrew.atlassian.net/browse/NEWS-54) | Lock curated publisher list (3–5) + config |
| 1b | [NEWS-55](https://informedcrew.atlassian.net/browse/NEWS-55) | Ingest curated publishers into article store |
| 1c | [NEWS-56](https://informedcrew.atlassian.net/browse/NEWS-56) | Map owned articles into Kite categories |

Start at **NEWS-54** unless the user names another key. Do not open Epics **B–G** until 53 is Done (or the user explicitly reorders).

## Sequence (build order)

| Status | Epic | Key | Notes |
|--------|------|-----|--------|
| Done | A. Kite presentation | [NEWS-33](https://informedcrew.atlassian.net/browse/NEWS-33) | Shell + owned brief path |
| Done | H. Owned rich brief clusters | [NEWS-48](https://informedcrew.atlassian.net/browse/NEWS-48) | Expand sections (sources → enrich → images) |
| **Active** | Brief source breadth | [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) | Was “parallel H”; now the default next after H |
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
