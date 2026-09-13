# Upstream: kite-public

| Field | Value |
|-------|-------|
| Upstream | https://github.com/kagisearch/kite-public |
| License | MIT |
| Pinned SHA | `c4fc3b579c3bbdcce5277d1956347131283170e5` |
| Pinned date | 2026-05-12 |
| Imported | 2026-09-13 (NEWS-40) |

## How we diverge

Vendored soft fork under `apps/kite/`. Prefer Informed News glue outside upstream files (wrappers, root scripts, `docs/`). Do not treat this folder as a nested git remote for daily work.

Current Informed News deltas (keep this list short):

- This `UPSTREAM.md` pin file
- `.env.example` for local UI smoke against public Kite data hosts
- **NEWS-45 branding:** `src/lib/brand.ts` string overrides; `BrandMark.svelte`; header/footer/splash chrome; local `/api/locale` (no Kagi locale proxy); `app.html` / `manifest.json` / `favicon.svg` product identity. MIT notices unchanged at repo root + `LICENSE`.

## Local run (this package)

Requires [Bun](https://bun.sh) (upstream lockfile). Default product entry is root `npm run dev` (server + Kite). Package-only:

```bash
cp apps/kite/.env.example apps/kite/.env   # if missing
npm run install:kite                       # Bun + apps/kite/bun.lock
npm run kite                               # UI only → http://localhost:5173
# or from repo root: npm run dev           # server + Kite
```

## Bump upstream

See [docs/UPSTREAM_KITE.md](../../docs/UPSTREAM_KITE.md).
