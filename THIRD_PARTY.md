# Third-party software

This repository includes third-party code under their original licenses. Informed News proprietary code remains under [LICENSE](LICENSE).

## Vendored

### kite-public (Kagi News front end)

| Field | Value |
|-------|-------|
| Location | `apps/kite/` |
| Upstream | https://github.com/kagisearch/kite-public |
| License | MIT |
| Copyright | Copyright (c) 2024 Kagi Search |
| Pinned SHA | `c4fc3b579c3bbdcce5277d1956347131283170e5` |
| Sync docs | [docs/UPSTREAM_KITE.md](docs/UPSTREAM_KITE.md) |

Full MIT text: [`apps/kite/LICENSE`](apps/kite/LICENSE).

### Remote data (optional / not the product default)

Kite’s hosted application data at `https://kite.kagi.com` (e.g. `kite.json`) is licensed separately under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). It is **not** copied into this tree. The default Informed News path serves an **owned** brief from `mvp/server` ([docs/OWNED_BRIEF.md](docs/OWNED_BRIEF.md)). Opt in only via `KITE_API_BASE=https://kite.kagi.com/api` for private non-commercial UI experiments.
