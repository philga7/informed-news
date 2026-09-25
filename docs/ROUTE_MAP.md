# Product route map (NEWS-42)

Informed News product surfaces vs reserved future layers. **Do not ship empty Finance / Situation / Listen tabs** until those epics deliver data.

## Shipped (live)

| Path | Surface | Notes |
|------|---------|--------|
| `/` | **Brief** (home / analysis feed) | Default `npm run dev` entry. Owned brief via `mvp/server`. **Hybrid ([NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)):** leads with **Accepted claims** (public `GET /api/batches/.../claims`) — status/evidence chips, expand linked headlines + optional Ollama verbiage (“AI-assisted — not ground truth”), session **Unaccept**; **Accepted stories** `StoryList` secondary below (NEWS-65/66 accepted clusters incl. manual seeds). Claims lead on story views only — not onthisday, specialty widgets (NHL/NFL/crypto/etc.), or shared-article deep links. Header / empty-state **Add story** (session) → manual seed modal ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)). Story chrome **Unaccept** for accepted stories (required for manual seeds — they never appear on Radar). Accept claims on `/radar`, not Brief. |
| `/about` | Product intro overlay | IntroScreen via Brief shell (not funding/methodology). |
| `/transparency` | **Transparency** | Public funding, methodology, corrections, and team ([NEWS-32](https://informedcrew.atlassian.net/browse/NEWS-32)). Footer link. No login. |
| `/radar` | **Radar** (claim inbox + story triage) | Session-required. **Primary:** claim inbox from `GET /api/claims/radar` — **Needs review** + **Claims** lists with status/evidence/confidence chips; expandable linked headlines per claim ([NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74)). **Needs review** ([NEWS-78](https://informedcrew.atlassian.net/browse/NEWS-78)): per-card **Mark reviewed** (`POST /api/claims/review/dismiss`) and header **Mark all reviewed** (confirm → `POST /api/claims/review/dismiss-all`) — dequeue-only; UI labels are **not** “Dismiss” (Tracked alerts keep **Dismiss**). **Accept** also clears the card from Needs review (server auto-dequeue). Claim cards: **Accept / Unaccept** + **Track / Untrack** ([NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75)); Accept default-tracks (Track-on-Accept) → accepted claims appear on Brief `/` ([NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)). **Tracked claims** section lists watched claims with **Update** dot + **Dismiss** when `pendingUpdate`. **Secondary:** collapsible **Headline clusters** from story `GET /api/radar` (CFP + curated RSS) — **Accept / Unaccept** per cluster ([NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)) → Brief accepted stories; **Track / Untrack** beside Accept ([NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59)). **Tracked stories** section lists watched story clusters (including muted tracked clusters with a muted label); pending updates show **Update** + **Dismiss** ([NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61)). Accepted story clusters + tracked → **Open on Brief** (`/`). Optional session `POST /api/claims/enrich` for Ollama claim verbiage (not on Accept path). Footer **Radar** link dot/count = sum of pending claim + story tracked updates. **Mute** ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)): shared keyword (+ optional source) rules via `/api/brief/mutes`; muted claims omitted from claim lists **and** Brief claims feed; muted clusters hidden from headline clusters; **Hidden N** when `hiddenMutedCount > 0`. Accept ≠ truth — status chips only, no Verified. Epic: [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57), [NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69). |
| `/contribute` | Feed contribution | Upstream-oriented contribute wizard. |
| `/world/latest` (and other category routes) | Brief category views | Feed categories — not product “layer” tabs. |

## Planned (Developing desk — NEWS-57)

Desk v1 actions on `/radar` are live for **stories** and **claims**: **Accept** ([NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65) / [NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75)), **Track / Untrack** + **Tracked** sections ([NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59) / [NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75)), **Mute** ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60) — shared rules apply to both lanes), plus the in-app `pendingUpdate` alert badge/dismiss flow ([NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61)). **Manual seeds** and Brief **Unaccept** are live on `/` ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)). Brief hybrid ([NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)): accepted **claims** lead + accepted **story** clusters secondary, minus global mute. No additional product routes yet.

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
- Epic I (Developing desk): [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57) — `/radar`
