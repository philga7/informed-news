# Product route map (NEWS-42)

Informed News product surfaces vs reserved future layers. **Do not ship empty Finance / Situation / Listen tabs** until those epics deliver data.

## Shipped (live)

| Path | Surface | Notes |
|------|---------|--------|
| `/` | **Brief** (home / analysis feed) | Shell Brief when the image or the hermetic stack is served. `npm run dev` leaves `WEB_BUILD_DIR` unset, so local vite still serves Kite here. Owned brief via `mvp/server`. **Topic Brief ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88), [NEWS-89](https://informedcrew.atlassian.net/browse/NEWS-89), [BRIEF.md](BRIEF.md)):** under **Your topics**, one section per desired topic (Core then Watch) with the top 3 triage-kept stories, a **More (N)** toggle, and a "Nothing new: …" line for quiet topics. No desired topics says “No topics yet” and links to `/topics`. Topics with nothing new say “No new stories for your topics.” Cards carry an AI summary ("AI summary — not ground truth") or "Full text unavailable", `+N outlets`, and an `Official statement` badge. Opening a card loads a full story when one is not already saved, shows “Loading full story…” while it works, and can show talking points, a timeline, perspectives, a pull quote, and **Updated:**. Cards link to the articles. An expanded card also offers **Less like this** ([NEWS-90](https://informedcrew.atlassian.net/browse/NEWS-90), session): add an undesired topic for the story's subject or block its outlet; matching stories are hidden the next time the Brief loads and filtered out from the next refresh. A refresh bar shows a **N filtered out** / **Filtered out** link to `/filtered`, a **Feedback** link, provider notices, when the Brief last updated, when the next refresh is due, an **Approved / Filtered / All** toggle. A status line shows the app version. Signed out, that line shows the version only and there is no Refresh control. Signed in with the keys off, **Refresh** is disabled and the page says `Provider keys off`. Signed in with the keys on, one click starts one fetch and the button stays disabled until it finishes, and the status line says whether the keys are on and shows the last fetch time and result (`Last fetch succeeded`, `Last fetch failed`, or `No fetch yet`). **Mark as read** and **Mark all as read** record seen marks; a seen story stays until the next successful refresh, then is hidden. Sources are CFP + curated RSS and topic search, triaged against your topics. There is no review step, no accepted-claims lead, and no Accept: what shows is decided by topics, triage, and mute rules. When the image or the hermetic stack is served, an empty store still shows the fixture story list on this shell (one sample story, “Owned brief fixture — CFP sample…”), plus the status line and, when signed in, Refresh. It has no topic sections. Shared article URLs `/latest/…` are this shell. A shared title is plain text, not an expand button. A keyword-matched shared story can still be blurred, and citation marks still render on the shared card when it is not blurred. Single-page mode is this shell’s plain list. Kite’s `StoryList` stays on disk until [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202) and [NEWS-203](https://informedcrew.atlassian.net/browse/NEWS-203) and is not what `/` renders when the image is served. Header / empty-state **Add story** (session, [NEWS-98](https://informedcrew.atlassian.net/browse/NEWS-98)) saves a story you found under one desired topic; it is pinned first in that section with an **Added by you** badge, and its expanded card offers **Remove** instead of Less like this. Story **Unaccept** is gone from Kite. |
| `/about` | Product intro overlay | IntroScreen via Brief shell (not funding/methodology). |
| `/transparency` | **Transparency** | Public funding, methodology, corrections, and team ([NEWS-32](https://informedcrew.atlassian.net/browse/NEWS-32)). Footer link. No login. |
| `/topics` | **Topics** (operator topic list) | Session-required. Operator topic list ([NEWS-85](https://informedcrew.atlassian.net/browse/NEWS-85), Epic L [NEWS-84](https://informedcrew.atlassian.net/browse/NEWS-84)) via `/api/topics`. **Core** / **Watch** / **Undesired** sections with add / edit / remove and **Move to Core** / **Move to Watch**; each topic has description / keywords / search query / notes (traps / exclusions) / extra full-story sections (desired only). The `map` extra is intentionally not generated or displayed because the Kite Brief has no map section. Keyword & outlet mutes via the shared `/api/brief/mutes` rules (**mute always wins** over desired topics). Topics drive topic search ([NEWS-86](https://informedcrew.atlassian.net/browse/NEWS-86)), triage ([NEWS-87](https://informedcrew.atlassian.net/browse/NEWS-87)), and the Brief's sections ([NEWS-88](https://informedcrew.atlassian.net/browse/NEWS-88)). Logging in here enables the shell Brief's Refresh button, seen marks, on-demand summaries, and on-demand full stories. Footer link. Login hints across the app (Filtered out, Add story, and Brief Refresh after a 401) read **Log in on Topics** and link here. Signed out, the Brief status line shows the app version only and there is no Refresh control. |
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

The shell is a second UI beside Kite, served on the same port when `WEB_BUILD_DIR` is set (the Docker image and the hermetic stack). `/` and `/latest/…` are the shell Brief. `/shell` stays the placeholder. Kite keeps every other view. `npm run dev` leaves `WEB_BUILD_DIR` unset, so local vite still serves Kite at `/`. Map ([NEWS-35](https://informedcrew.atlassian.net/browse/NEWS-35)) and Signals ([NEWS-34](https://informedcrew.atlassian.net/browse/NEWS-34)) stay on hold: no route, no tab, no shell link. The [NEWS-42](https://informedcrew.atlassian.net/browse/NEWS-42) guardrail still stands: no empty tabs.

Express answers `/api/*`, `/health`, and `/healthz` itself. A path in the "Owned by the shell now" table goes to the shell when `WEB_BUILD_DIR` is set. Every path not in that table stays on Kite, including `/about`, `/transparency`, `/topics`, `/feedback`, `/filtered`, `/contribute`, dated batch paths, and the `/radar` redirect. The shell's client files are served under `/shell/_app`, not Kite's `/_app`.

### Owned by the shell now

| Path | Surface | Notes |
|------|---------|--------|
| `/` | **Brief** | Shell Brief when the image or the hermetic stack is served. An empty store still shows the fixture story list (one sample story, “Owned brief fixture — CFP sample…”), plus the status line and, when signed in, Refresh. It has no topic sections. Single-page mode is this shell’s plain list. Topic sections sit under **Your topics**. Cards link to articles. Opening a card loads a full story when needed (“Loading full story…”, then timeline, perspectives, pull quote, and **Updated:** when present). **Mark as read** and **Mark all as read** are remembered for the next refresh. The bar shows last and next refresh. Keyboard and filters match, including a blurred shared story whose title stays plain text. |
| `/latest` and `/latest/…` | Shared Brief URLs | Same shell as `/`, including a shared article such as `/latest/world/1`. |
| `/shell` | Shell home | Placeholder. Not the Brief. Links back to the Brief at `/` and to `/shell/deep`. |
| `/shell/deep` | Deep link | Reloading this address returns this page. Proves a shell link survives a reload. |

`/shell` does not match a longer prefix such as `/shellish`. A path under `/shell/` that the shell does not know is still the shell's (its own not-found), not a Kite page.

### Still on Kite

Every path not in the "Owned by the shell now" table stays on Kite, including `/about`, `/transparency`, `/topics`, `/feedback`, `/filtered`, `/contribute`, `/radar` (redirect), dated batch paths, and category routes other than `/latest` and `/latest/…`.

### Later, not routed in this change

| Piece | What | Blocked by |
|-------|------|------------|
| (b) | Briefs module parity (keyboard, filters, shared links, accessibility, `FeedbackButtons`) and the Brief end-to-end suite. Filed as [NEWS-194](https://informedcrew.atlassian.net/browse/NEWS-194) through [NEWS-200](https://informedcrew.atlassian.net/browse/NEWS-200): foundation, then leaf ports, then assembly and the single E2E gate. [NEWS-200](https://informedcrew.atlassian.net/browse/NEWS-200) is **in progress**: `/` and `/latest/…` are the shell Brief when the image or the hermetic stack is served. Leftover Kite links to those Brief URLs are a full page load. Do not teach the Kite router that `/shell` is a batch id. Kite Brief code stays until [NEWS-202](https://informedcrew.atlassian.net/browse/NEWS-202) and [NEWS-203](https://informedcrew.atlassian.net/browse/NEWS-203). | (a) |
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
