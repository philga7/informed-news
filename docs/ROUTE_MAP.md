# Product route map (NEWS-42)

Informed News product surfaces vs reserved future layers. **Do not ship empty Finance / Situation / Listen tabs** until those epics deliver data.

## Shipped (live)

| Path | Surface | Notes |
|------|---------|--------|
| `/` | **Brief** (home / analysis feed) | Default `npm run dev` entry. Owned brief via `mvp/server`. After Developing desk (NEWS-65/66): **Accepted** clusters only (incl. manual seeds); not the full article store. |
| `/about` | Product intro overlay | IntroScreen via Brief shell (not funding/methodology). |
| `/transparency` | **Transparency** | Public funding, methodology, corrections, and team ([NEWS-32](https://informedcrew.atlassian.net/browse/NEWS-32)). Footer link. No login. |
| `/radar` | **Radar** (triage / headline lane) | Session-required. CFP + curated RSS v1. Footer link (not a header product tab). **Accept / Unaccept** control per cluster ([NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)) → Brief; Track = alerts; Mute = global. Epic: [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57). |
| `/contribute` | Feed contribution | Upstream-oriented contribute wizard. |
| `/world/latest` (and other category routes) | Brief category views | Feed categories — not product “layer” tabs. |

## Planned (Developing desk — NEWS-57)

Remaining NEWS-57 desk actions (Track, Mute, manual seeds) ship on `/radar` and Brief — no additional product routes yet. **Accept** is live on Radar ([NEWS-65](https://informedcrew.atlassian.net/browse/NEWS-65)); Brief shows accepted clusters only.

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
