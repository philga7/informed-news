# Product route map (NEWS-42)

Informed News product surfaces vs reserved future layers. **Do not ship empty Finance / Situation / Listen tabs** until those epics deliver data.

## Shipped (live)

| Path | Surface | Notes |
|------|---------|--------|
| `/` | **Brief** (home / analysis feed) | Default `npm run dev` entry. Owned brief via `mvp/server`. **Topic Brief ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88), [NEWS-89](https://informedcrew.atlassian.net/browse/NEWS-89), [BRIEF.md](BRIEF.md)):** under **Your topics**, one section per desired topic (Core then Watch) with the top 3 triage-kept stories, a **More (N)** toggle, and a "Nothing new: …" line for quiet topics; cards carry an AI summary ("AI summary — not ground truth") or "Full text unavailable", `+N outlets`, and an `Official statement` badge. Cards can expand or use **Full story** to load cached/on-demand talking points, timeline, supported topic extras, and deterministic source context; AI-generated material is labelled **"AI-assisted — not ground truth"**, and living changes show **Updated: …**. An expanded card also offers **Less like this** ([NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90), session): add an undesired topic for the story's subject or block its outlet; matching stories are hidden the next time the Brief loads and filtered out from the next refresh. A refresh bar shows last / next refresh, a **N filtered out** / **Filtered out** link to `/filtered`, provider notices, and a **Refresh** button (session; otherwise "Log in on Topics to refresh"). Opening or marking a story read records it as seen (session). Sources are CFP + curated RSS and topic search, triaged against your topics. There is no review step, no accepted-claims lead, and no Accept: what shows is decided by topics, triage, and mute rules. The plain Kite `StoryList` only renders as a fallback — the empty-store fixture story, shared-article deep links, and single-page mode. Header / empty-state **Add story** (session, [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98)) saves a story you found under one desired topic; it is pinned first in that section with an **Added by you** badge, and its expanded card offers **Remove** instead of Less like this. Story **Unaccept** is gone from Kite. |
| `/about` | Product intro overlay | IntroScreen via Brief shell (not funding/methodology). |
| `/transparency` | **Transparency** | Public funding, methodology, corrections, and team ([NEWS-32](https://informedcrew.atlassian.net/browse/NEWS-32)). Footer link. No login. |
| `/topics` | **Topics** (operator topic list) | Session-required. Operator topic list ([NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85), Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) via `/api/topics`. **Core** / **Watch** / **Undesired** sections with add / edit / remove and **Move to Core** / **Move to Watch**; each topic has description / keywords / search query / notes (traps / exclusions) / extra full-story sections (desired only). The `map` extra is intentionally not generated or displayed because the Kite Brief has no map section. Keyword & outlet mutes via the shared `/api/brief/mutes` rules (**mute always wins** over desired topics). Topics drive topic search ([NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86)), triage ([NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87)), and the Brief's sections ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88)). Logging in here also enables the Brief's Refresh button, seen marks, on-demand summaries, and on-demand full stories. Footer link. Login hints across the app (Brief Refresh, Filtered out, Add story) read **Log in on Topics** and link here. |
| `/feedback` | **Feedback** (Like / Not relevant list) | Session-required ([NEWS-192](https://informedcrew.atlassian.net/browse/NEWS-192)). Lists saved Like and Not relevant entries, newest first, from `GET /api/feedback`: headline, outlet, story link, topics, choice, comment, and time. Switch a choice, edit the comment, or delete after an inline Yes / No. Reached from the Brief refresh bar (**Feedback**), beside Filtered out. No footer link. Without a session it says “Log in on Topics to see feedback.” A `feedback:<id>` citation in an advisory reason links to `/feedback#<id>`. A deleted entry leaves the reason text and shows “feedback removed”. |
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

## SPA ownership (NEWS-170)

The shell is a second UI beside Kite, served on the same port. `/shell` stays the placeholder. `/` remains the Kite Brief until [NEWS-200](https://informedcrew.atlassian.net/browse/NEWS-200). Kite keeps every view below, including the Brief. Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)) and Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)) stay on hold: no route, no tab, no shell link. The [NEWS-42](https://informedcrew.atlassian.net/browse/NEWS-42) guardrail still stands: no empty tabs.

Express answers `/api/*`, `/health`, and `/healthz` itself. A path in the "Owned by the shell now" table goes to the shell. Every path not in that table stays on Kite, including the shipped table and the `/radar` redirect. The shell's client files are served under `/shell/_app`, not Kite's `/_app`.

### Owned by the shell now

| Path | Surface | Notes |
|------|---------|--------|
| `/shell` | Shell home | Placeholder. Not the Brief. `/` remains the Kite Brief until [NEWS-200](https://informedcrew.atlassian.net/browse/NEWS-200). Links back to the Brief and to `/shell/deep`. No Brief UI. |
| `/shell/deep` | Deep link | Reloading this address returns this page. Proves a shell link survives a reload. |

`/shell` does not match a longer prefix such as `/shellish`. A path under `/shell/` that the shell does not know is still the shell's (its own not-found), not a Kite page.

### Still on Kite

Every path not in the "Owned by the shell now" table stays on Kite, including the shipped table and the `/radar` redirect. That includes `/`, `/about`, `/transparency`, `/topics`, `/feedback`, `/filtered`, `/contribute`, and the category routes. None of these move in this change.

### Later, not routed in this change

| Piece | What | Blocked by |
|-------|------|------------|
| (b) | Briefs module parity (keyboard, filters, shared links, accessibility, `FeedbackButtons`) and the Brief end-to-end suite ported and green. Filed as [NEWS-194](https://informedcrew.atlassian.net/browse/NEWS-194) through [NEWS-200](https://informedcrew.atlassian.net/browse/NEWS-200): foundation, then leaf ports, then assembly and the single E2E gate. A link from the Kite Brief to `/shell` has to be a full page load, because Kite's client router would otherwise treat `/shell` as a batch id. `/` does not move in this change. | (a) |
| (c) | Story Desk at its own link, [NEWS-201](https://informedcrew.atlassian.net/browse/NEWS-201). The path is not chosen here. `/desk` stays reserved for Voice ([NEWS-39](https://informedcrew.atlassian.net/browse/NEWS-39)). | (b) |
| (d) | A nav test that no Map or Signals route or tab exists, [NEWS-195](https://informedcrew.atlassian.net/browse/NEWS-195). **Done**. Phil squash-merged PR #237 as `4664366`. Issue 236 is closed. The guard is on `main`. NEWS-194 does not change the guard. [NEWS-170](https://informedcrew.atlassian.net/browse/NEWS-170) stays In Progress. | (a) |
| (e) | Remove the Kite Brief view: [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202) removes the Kite Brief routes, then [NEWS-203](https://informedcrew.atlassian.net/browse/NEWS-203) is Kite Brief cleanup, after (b) passes the same end-to-end suite and Phil sees (b). | (b) |

The shell talks only to the one API. This placeholder does not call it. There is no second data path.

## Explicit non-goals for this shell

- No Finance / Situation / Listen items in header, footer, or category nav until data ships
- Category chips (World, USA, …) remain brief categories, not product epics
- Kagi Apps launcher stays gated off ([docs/KAGI_SERVICE_CLEANUP.md](KAGI_SERVICE_CLEANUP.md))

## Related

- Owned brief API: [OWNED_BRIEF.md](OWNED_BRIEF.md)
- Epic H (rich story sections): [NEWS-48](https://informedcrew.atlassian.net/browse/NEWS-48) — Done
- Epic I (Developing desk): [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) — Done (v1), parked; `/radar` retired
- Epic L (topic-driven Brief): [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)
