# NEWS roadmap (agent pointer)

Single place for **item ordering**. Jira remains the status source of truth; this file is the preferred sequence when a new thread asks “what’s next?”

Tracker: **NEWS** on [informedcrew.atlassian.net](https://informedcrew.atlassian.net). Prefer JQL `project = NEWS`.

Historical plan (A–G + H story seeds): [`.cursor/plans/osint_jira_pivot_d6b40f87.plan.md`](../.cursor/plans/osint_jira_pivot_d6b40f87.plan.md).  
Claims spine plan: [`.cursor/plans/claims_evidence_spine_8f4cde15.plan.md`](../.cursor/plans/claims_evidence_spine_8f4cde15.plan.md).

## Current next

| Order | Key | Summary |
|-------|-----|---------|
| **1** | [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69) | **J. Claims / evidence desk (conflict)** |
| 1a | [NEWS-70](https://informedcrew.atlassian.net/browse/NEWS-70) | Claim + evidence stores and status derivation (no verdicts) — **Done** |
| 1b | [NEWS-71](https://informedcrew.atlassian.net/browse/NEWS-71) | TypeSafe client + claim question library + confidence gates — **Done** |
| 1c | [NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72) | Ollama propose candidates + TypeSafe judge extract pipeline — **Done** |
| 1d | [NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73) | Primary vs sensor source tiers + conflict primary starter set — **Done** |
| 1e | [NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74) | Claim Radar API + Kite claim inbox UI — **Done** |
| 1f | [NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75) | Accept / Track / Mute / badge on claimId — **Done** |
| 1g | [NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76) | Brief hybrid: accepted claims + linked clusters + Ollama verbiage — **Done** |
| **1h** | [NEWS-77](https://informedcrew.atlassian.net/browse/NEWS-77) | **Docs + ROADMAP pointer** *(this file)* *(next)* |

**Product direction:** re-center on **claims + evidence** for conflict/geopolitics; **stories demote to input**. TypeSafe / Jev = structured judgments; Ollama = candidate proposal + Brief verbiage only. Hybrid UI: Radar = claim inbox; Brief = accepted claims + linked story clusters. Honesty: **status + evidence**, no Verified badges / claim verdicts. Discernment: [CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md).

Ask before starting parked Later desk work under [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) or Epic **B** ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)). Do not open Epics **B–G** unless the user explicitly reorders.

### Prior: Developing desk v1 (Done-demo)

| Order | Key | Summary |
|-------|-----|---------|
| — | [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) | **I. Developing desk** (radar → accept → track/mute) — v1 Done-demo complete |
| | [NEWS-54](https://informedcrew.atlassian.net/browse/NEWS-54)–[NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61), [NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)–[NEWS-68](https://informedcrew.atlassian.net/browse/NEWS-68) | Story-desk Done children |
| Parked | [NEWS-56](https://informedcrew.atlassian.net/browse/NEWS-56), [NEWS-62](https://informedcrew.atlassian.net/browse/NEWS-62), [NEWS-63](https://informedcrew.atlassian.net/browse/NEWS-63), [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67) | **[Later][Parked]** pending claims spine |
| Superseded | [NEWS-64](https://informedcrew.atlassian.net/browse/NEWS-64) | Claims/disagreements on tracked clusters → Epic J |

### Story-desk membership (still live until claim cutover)

| Surface | What appears |
|--------|----------------|
| **Radar** | Auto triage: fresh CFP + curated RSS clusters (headline lane). No manual seeds in v1. |
| **Brief** | **Accepted** clusters only, minus **global mute**; new articles that share an accepted `clusterId` join Brief automatically. **Manual seeds** ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)): title / note / optional URL(s), `sourceKind: manual`, Accepted by definition (not on Radar). |

- **Accept** = Brief membership (from Radar). One verb — not a separate “Promote.”
- **Manual seed** = Accept without ingest parent; **Unaccept** drops from Brief (hard-delete not required in v1).
- **Mute** = global veto (Radar hide + Brief ineligible).
- **Track** = alerts only; may default on at Accept / manual seed.
- No auto live/breaking classifier in v1. Brief is the home / analysis feed (not framed by time of day).

**Radar v1 sources:** CFP + curated RSS starter set ([docs/RADAR_SOURCES.md](RADAR_SOURCES.md)) — 14 curated feeds + CFP. File config only until [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67) (parked). Epic J adds **primary vs sensor** tiers ([NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)).

Former [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) (Brief source breadth) was **absorbed** into NEWS-57.

## Sequence (build order)

| Status | Epic | Key | Notes |
|--------|------|-----|--------|
| Done | A. Kite presentation | [NEWS-33](https://informedcrew.atlassian.net/browse/NEWS-33) | Shell + owned brief path |
| Done | H. Owned rich brief clusters | [NEWS-48](https://informedcrew.atlassian.net/browse/NEWS-48) | Expand sections (sources → enrich → images) |
| Superseded | Brief source breadth | [NEWS-53](https://informedcrew.atlassian.net/browse/NEWS-53) | Absorbed into NEWS-57 |
| Done (v1) | I. Developing desk | [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) | Story Radar → Accept → track/mute; Later parked |
| **Current** | J. Claims / evidence desk | [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69) | Claims spine; before B–G |
| Parked | B. Crucix raw layer | [NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34) | After Epic J; primary evidence candidate |
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
5. Do not start NEWS-57 Later/Parked children or B–G while Epic J is current next unless the user reorders.
