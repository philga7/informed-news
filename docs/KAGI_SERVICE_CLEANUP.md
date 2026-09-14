# Kagi service cleanup (NEWS-47)

Informed News vendors kite-public (MIT) but does **not** operate Kagi Search / Maps / Translate / sync backends. After product chrome (NEWS-45) and owned brief (NEWS-44), leftover service UX is gated off.

Flags live in [`apps/kite/src/lib/features.ts`](../apps/kite/src/lib/features.ts). Default: all `false`.

| Surface | Decision | Notes |
|---------|----------|-------|
| Settings → Account / sync | **Hide** | Would sign in to Kagi Search and store data on Kagi servers |
| Settings → Reading Level + “Upgrade to Kagi” | **Hide** | Kagi Translate simplify + billing paywall |
| “Translated with Kagi Translate” link | **Hide** | Data-language selector footer |
| Maps → Kagi / Auto→Kagi | **Remove** | Default Google; keep Google / OSM / Apple |
| Header App Navigation (“Kagi Apps”) | **Hide** | Links to kagi.com products |
| Story Ask Assistant | **Hide** | Deep-link to kagi.com/assistant |
| About → Mobile Apps | **Hide** | Kagi News App Store / Play listings |
| Contribute / onboarding “Kagi News” / staff copy | **Relabel** | Via `brand.ts` overrides |
| Time Travel subscriber copy | **Relabel** | Via `brand.ts` |
| MIT LICENSE / NOTICE / THIRD_PARTY | **Keep** | Upstream attribution unchanged |

Optional third-party: users may still open Google / OSM / Apple maps from story locations — those are generic external tools, not Informed News accounts.
