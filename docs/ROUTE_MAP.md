# Product route map (NEWS-42)

Informed News product surfaces vs reserved future layers. **Do not ship empty Finance / Situation / Listen tabs** until those epics deliver data.

## Shipped (live)

| Path | Surface | Notes |
|------|---------|--------|
| `/` | **Brief** (home / analysis feed) | Default `npm run dev` entry. Owned brief via `mvp/server`. **Topic Brief ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88), [NEWS-89](https://informedcrew.atlassian.net/browse/NEWS-89), [BRIEF.md](BRIEF.md)):** under **Your topics**, one section per desired topic (Core then Watch) with the top 3 triage-kept stories, a **More (N)** toggle, and a "Nothing new: …" line for quiet topics; cards carry an AI summary ("AI summary — not ground truth") or "Full text unavailable", `+N outlets`, and an `Official statement` badge. Cards can expand or use **Full story** to load cached/on-demand talking points, timeline, supported topic extras, and deterministic source context; AI-generated material is labelled **"AI-assisted — not ground truth"**, and living changes show **Updated: …**. An expanded card also offers **Less like this** ([NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90), session): add an undesired topic for the story's subject or block its outlet; matching stories are hidden the next time the Brief loads and filtered out from the next refresh. A refresh bar shows last / next refresh, a **N filtered out** / **Filtered out** link to `/filtered`, provider notices, and a **Refresh** button (session; otherwise "Log in on Topics to refresh"). Opening or marking a story read records it as seen (session). Sources are CFP + curated RSS (+ optional xcancel) and topic search, triaged against your topics. There is no review step, no accepted-claims lead, and no Accept: what shows is decided by topics, triage, and mute rules. The plain Kite `StoryList` only renders as a fallback — the empty-store fixture story, shared-article deep links, and single-page mode. Header / empty-state **Add story** (session) still creates a manual seed ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)) and story **Unaccept** still exists for seeds, but seeds are not triaged, so they don't appear in the topic Brief; their future is [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98). |
| `/about` | Product intro overlay | IntroScreen via Brief shell (not funding/methodology). |
| `/transparency` | **Transparency** | Public funding, methodology, corrections, and team ([NEWS-32](https://informedcrew.atlassian.net/browse/NEWS-32)). Footer link. No login. |
| `/topics` | **Topics** (operator topic list) | Session-required. Operator topic list ([NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85), Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) via `/api/topics`. **Core** / **Watch** / **Undesired** sections with add / edit / remove and **Move to Core** / **Move to Watch**; each topic has description / keywords / search query / notes (traps / exclusions) / extra full-story sections (desired only). The `map` extra is intentionally not generated or displayed because the Kite Brief has no map section. Keyword & outlet mutes via the shared `/api/brief/mutes` rules (**mute always wins** over desired topics). Topics drive topic search ([NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86)), triage ([NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87)), and the Brief's sections ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88)). Logging in here also enables the Brief's Refresh button, seen marks, on-demand summaries, and on-demand full stories. Footer link. Login hints across the app (Brief Refresh, Filtered out, Add story) read **Log in on Topics** and link here. |
| `/filtered` | **Filtered out** (triage drops) | Session-required ([NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90), Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) via `GET /api/triage/filtered?scope=last\|window`. Lists every story the **Last refresh** (or **Last 48 hours**) triage dropped, grouped by reason (Muted, Off-topic, Clickbait, … Not scored), with a run summary line, a reason count row, and per-item outlet / published time / topics / `Muted by: …` / `Duplicate of: …` / `Retried next refresh` for non-final reasons. Spot checks only — no actions ("Show anyway" out of scope). Says reasons are "AI-assisted judgments, not ground truth". Without a session it shows "Log in on Topics to see filtered stories". Reached from the Brief refresh bar (**N filtered out** / **Filtered out**) and the Topics page (**See what was filtered out**); no footer link. |
| `/contribute` | Feed contribution | Upstream-oriented contribute wizard. |
| `/world/latest` (and other category routes) | Brief category views | Feed categories — not product “layer” tabs. |

## Retired

| Path | Was | Now |
|------|-----|-----|
| `/radar` | Radar — claim inbox + story triage ([NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74), [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57), [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)) | `307` redirect to `/topics` ([NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91)); the query string is not forwarded. Needs review, Mark reviewed, Accept, Track, Tracked sections, headline clusters, and the footer **Radar** link / update badge are retired. The server APIs and stored data are parked ([MVP_API_COMPAT.md](MVP_API_COMPAT.md), [CLAIMS_DISCERNMENT.md](CLAIMS_DISCERNMENT.md)). |

## Planned

No additional product routes yet. The Developing desk (Epic I, [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57)) and the claims desk (Epic J) are done and parked; Epic L ([NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) replaced them with the topic-driven Brief.

## Reserved (docs only — no empty chrome)

| Path | Epic when data exists | Guardrail |
|------|----------------------|-----------|
| `/finance` | [NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34) Crucix (B) | Do not add header/nav tab until ≥1 cited signal is shown |
| `/situation` | [NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35) Geo (C) | Do not ship empty Situation chrome |
| `/listen` | [NEWS-38](https://informedcrew.atlassian.net/browse/NEWS-38) TTS (F) | Listen control only when `brief.mp3` (or equivalent) exists |
| `/desk` (optional later) | [NEWS-39](https://informedcrew.atlassian.net/browse/NEWS-39) Voice (G) | Last; never stub in Epic A |

## Explicit non-goals for this shell

- No Finance / Situation / Listen items in header, footer, or category nav until data ships
- Category chips (World, USA, …) remain brief categories, not product epics
- Kagi Apps launcher stays gated off ([docs/KAGI_SERVICE_CLEANUP.md](KAGI_SERVICE_CLEANUP.md))

## Related

- Owned brief API: [OWNED_BRIEF.md](OWNED_BRIEF.md)
- Epic H (rich story sections): [NEWS-48](https://informedcrew.atlassian.net/browse/NEWS-48) — Done
- Epic I (Developing desk): [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) — Done (v1), parked; `/radar` retired
- Epic L (topic-driven Brief): [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)
