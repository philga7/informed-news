# Cursor Agent Prompt — Informed News MVP: Jira Backlog Sync

> **Status (2026-08-16):** Reviewed against the locked NEWS mission. **Do not create the six epics as written.** Compatible slices were folded into NEWS-12–14; leftovers are parked on [NEWS-30](https://informedcrew.atlassian.net/browse/NEWS-30). See [mvp_mission_epics_048f89b7.plan.md](mvp_mission_epics_048f89b7.plan.md).

## Instructions for the Agent

You are a Cursor agent with access to the Jira MCP/connector tool for this workspace. Your task is to **review the existing Jira backlog for project key `NEWS`** and **create or update Jira issues** based on the feature concepts below, which are inspired by analysis of existing OSINT and trusted-news platforms (Bellingcat, Ground News, AllSides, Ad Fontes Media, NewsGuard, Media Bias/Fact Check, Readless, Tangle News, PolitiFact/FactCheck.org/Snopes).

**Jira Project Key: `NEWS`**

### Rules of engagement
1. **Use project key `NEWS` for every issue created or referenced.** Do not create issues in any other project.
2. **Search first, then act.** Before creating a new issue, search `project = NEWS` for existing issues with similar summaries or labels (e.g. `project = NEWS AND labels = "trust-scoring"`, or a text search on the keywords below). If a matching issue exists, **update** it (add missing acceptance criteria, adjust description, add labels) instead of duplicating it.
3. **Use consistent structure.** Every issue you create or update must include: a one-line summary, a description with Context / Problem / Proposed Solution / Acceptance Criteria, a suggested issue type (Epic, Story, or Task), and labels.
4. **Group under epics.** Each numbered section below (1–6) should map to one Epic in `NEWS`. The sub-bullets under each are candidate Stories or Tasks nested under that Epic (linked via "Epic Link" / parent field, matching however this Jira instance is configured — check whether it uses classic Epic Links or the new hierarchy/parent field before creating).
5. **Ask before destructive changes.** Never delete or close an existing issue without explicit confirmation from me first. Additions and edits to descriptions/labels/acceptance criteria are fine to do directly.
6. **Tag everything** with the label `informed-news-mvp` plus a feature-specific label (see suggestions per epic).
7. **Report back** with a summary list of issues created vs. updated, including their full Jira keys (e.g. `NEWS-123`), once done.

---

## Feature Backlog to Sync

### Epic 1: OSINT-Style Source Transparency (inspired by Bellingcat)
- **Labels:** `osint`, `methodology`, `trust`
- **Context:** Bellingcat's credibility comes from publishing its verification methodology alongside findings, not just the conclusion.
- **Stories/Tasks to create:**
  - Design and implement a "Methodology" panel attached to each story, showing the verification steps used (source cross-referencing, geolocation, chronolocation, archival links).
  - Build an internal verification checklist/workflow that editors or automated pipelines must complete before a story is marked "Verified."
  - Add permanent archive links (e.g., Wayback Machine style) for every cited primary source to prevent link rot and enable auditability.

### Epic 2: Multi-Source Bias & Coverage Comparison (inspired by Ground News, AllSides)
- **Labels:** `bias-comparison`, `aggregation`
- **Context:** Ground News shows how the same story is covered across outlets and flags "blindspots"; AllSides uses blind surveys plus editorial review for left/center/right ratings.
- **Stories/Tasks to create:**
  - Build a "coverage comparison" UI component showing how many outlets across the political spectrum covered a given story.
  - Implement "blindspot" detection logic: flag stories heavily covered by one side of the spectrum and ignored by others.
  - Integrate or build an internal left/center/right classification pipeline for source-level bias tagging.

### Epic 3: Outlet & Source Trust Scoring (inspired by Ad Fontes Media, NewsGuard, Media Bias/Fact Check)
- **Labels:** `trust-scoring`, `source-rating`
- **Context:** Ad Fontes plots reliability vs. bias visually; NewsGuard scores sources 0–100 on 9 credibility criteria; MBFC maintains a queryable bias database.
- **Stories/Tasks to create:**
  - Design a source trust-score data model (reliability axis + bias axis, 0–100 scale).
  - Build a visual "bias chart" component to plot sources on a reliability-vs-bias grid.
  - Create/import a queryable outlet database with bias and reliability metadata, with an admin workflow to update ratings over time.
  - Document and publish the scoring methodology publicly for transparency (avoid the "black box" criticism aimed at some existing tools).

### Epic 4: Story Deduplication & Synthesis (inspired by Readless, SmartNews)
- **Labels:** `deduplication`, `content-pipeline`
- **Context:** Readless merges near-identical stories across outlets into a single digest rather than just clustering headlines.
- **Stories/Tasks to create:**
  - Build a clustering pipeline (embeddings or NLP similarity) to detect duplicate/near-duplicate coverage of the same event.
  - Generate a synthesized neutral summary per story cluster, with links out to all contributing sources.
  - Add a "signal vs. noise" ranking so heavily-duplicated low-value stories don't dominate the feed.

### Epic 5: Fact/Opinion Separation Format (inspired by Tangle News)
- **Labels:** `editorial-format`, `neutrality`
- **Context:** Tangle structures every story as: neutral facts → curated left/right/center arguments → clearly labeled editorial "take."
- **Stories/Tasks to create:**
  - Define a content schema enforcing three distinct sections per story: Facts, Perspectives (multi-side), Editorial/Opinion (explicitly labeled).
  - Build UI treatment that visually distinguishes factual content from opinion/editorial content (e.g., color band, icon, or badge).
  - Add an editorial disclosure block per story/section (author, funding source, potential conflicts of interest).

### Epic 6: Claim-Level Fact-Checking (inspired by PolitiFact, FactCheck.org, Snopes)
- **Labels:** `fact-check`, `claims`
- **Context:** These sites rule on individual claims (not just outlet-level trust), typically with a rating scale (True/False/Misleading/etc.).
- **Stories/Tasks to create:**
  - Design a claim-level fact-check data model (claim text, verdict scale, evidence links, checker attribution).
  - Build a UI component to attach claim-level fact-check verdicts inline within story bodies.
  - Establish an editorial workflow/queue for submitting, reviewing, and publishing fact-check verdicts.

---

## Additional Cross-Cutting Task (Governance)
- **Labels:** `transparency`, `governance`
- Create one Epic-level Task: "Publish public Transparency Page" — disclosing funding sources, editorial methodology, correction policy, and team bios, modeled on Tangle's and Bellingcat's public transparency practices. Note in the description: sites lacking this (e.g., Courier Newsroom) have faced credibility criticism from watchdogs like NewsGuard.

---

## Execution Checklist for the Agent
- [ ] Connect to Jira and confirm access to project key `NEWS`.
- [ ] Search `project = NEWS` for existing issues matching each epic/story above.
- [ ] Create the 6 epics in `NEWS` (or update if equivalents exist) with the `informed-news-mvp` label plus their specific label.
- [ ] Create/update the nested stories/tasks under each epic, correctly linked via Epic Link or parent field.
- [ ] Add the cross-cutting Transparency Page task under `NEWS`.
- [ ] Return a final summary table: Issue Key (`NEWS-XXX`) | Type | Title | Created/Updated | Epic Parent.
