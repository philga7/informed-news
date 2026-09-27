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

### jev agent skill (dev tooling)

| Field | Value |
|-------|-------|
| Location | `.cursor/skills/jev/` |
| Upstream | https://github.com/jkudish/jev-mcp (`skills/jev/`, npm `@jkudish/jev-mcp`) |
| License | MIT |
| Copyright | Copyright (c) 2026 Joey Kudish |
| Lock | `skills-lock.json` → `jev` |

The skill folder is kept byte-identical to upstream (no in-folder `LICENSE`) so `/update-skills` compares cleanly; the notice lives here. Not part of the product build.

```text
MIT License

Copyright (c) 2026 Joey Kudish

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Remote data (optional / not the product default)

Kite’s hosted application data at `https://kite.kagi.com` (e.g. `kite.json`) is licensed separately under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). It is **not** copied into this tree. The default Informed News path serves an **owned** brief from `mvp/server` ([docs/OWNED_BRIEF.md](docs/OWNED_BRIEF.md)). Opt in only via `KITE_API_BASE=https://kite.kagi.com/api` for private non-commercial UI experiments.
