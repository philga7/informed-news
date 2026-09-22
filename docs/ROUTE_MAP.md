# Product route map (NEWS-42)

Informed News product surfaces vs reserved future layers. **Do not ship empty Finance / Situation / Listen tabs** until those epics deliver data.

## Shipped (live)

| Path | Surface | Notes |
|------|---------|--------|
| `/` | **Brief** (home / analysis feed) | Default `npm run dev` entry. Owned brief via `mvp/server`. After Developing desk (NEWS-65/66): **Accepted** clusters only (incl. manual seeds); not the full article store. Header / empty-state **Add story** (session) → manual seed modal ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)). Story chrome **Unaccept** for accepted stories (required for manual seeds — they never appear on Radar). |
| `/about` | Product intro overlay | IntroScreen via Brief shell (not funding/methodology). |
| `/transparency` | **Transparency** | Public funding, methodology, corrections, and team ([NEWS-32](https://informedcrew.atlassian.net/browse/NEWS-32)). Footer link. No login. |
| `/radar` | **Radar** (triage / headline lane) | Session-required. CFP + curated RSS v1. Footer link (not a header product tab). **Accept / Unaccept** per cluster ([NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)) → Brief. **Track / Untrack** beside Accept ([NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59)) — Track = alerts when a cluster gains members; does not Accept. **Tracked** section lists watched clusters (including muted tracked clusters with a muted label); Accepted + tracked → **Open on Brief** (`/`). **Mute** ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)): keyword (+ optional source) rules; muted clusters hidden from the main lane with **Hidden N** when `hiddenMutedCount > 0`; add/list/delete via session mute APIs. Epic: [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57). |
| `/contribute` | Feed contribution | Upstream-oriented contribute wizard. |
| `/world/latest` (and other category routes) | Brief category views | Feed categories — not product “layer” tabs. |

## Planned (Developing desk — NEWS-57)

Desk v1 actions on `/radar` are live: **Accept** ([NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)), **Track / Untrack** + **Tracked** section ([NEWS-59](https://informedcrew.atlassian.net/browse/NEWS-59)), **Mute** ([NEWS-60](https://informedcrew.atlassian.net/browse/NEWS-60)). **Manual seeds** and Brief **Unaccept** are live on `/` ([NEWS-66](https://informedcrew.atlassian.net/browse/NEWS-66)). Remaining desk polish: in-app alert badge for `pendingUpdate` ([NEWS-61](https://informedcrew.atlassian.net/browse/NEWS-61)). Brief shows accepted clusters only, minus global mute. No additional product routes yet.

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
