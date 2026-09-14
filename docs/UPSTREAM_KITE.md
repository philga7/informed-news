# Upstream sync: Kite (`apps/kite/`)

Informed News vendors [kagisearch/kite-public](https://github.com/kagisearch/kite-public) (MIT) as a soft fork under `apps/kite/`.

## Current pin

Read the source of truth: [`apps/kite/UPSTREAM.md`](../apps/kite/UPSTREAM.md).

## How to bump

1. Clone or fetch upstream and choose a commit SHA to pin (prefer a release/merge on `main`, not a moving branch tip for long periods).
2. Replace tree contents (no nested `.git`):

   ```bash
   TMP=$(mktemp -d)
   git clone https://github.com/kagisearch/kite-public.git "$TMP/kite-public"
   git -C "$TMP/kite-public" checkout <SHA>
   rsync -a --delete \
     --exclude='.git' \
     --exclude='node_modules' \
     --exclude='.svelte-kit' \
     --exclude='build' \
     --exclude='dist' \
     --exclude='coverage' \
     --exclude='.github' \
     --exclude='.env' \
     --exclude='UPSTREAM.md' \
     --exclude='.env.example' \
     "$TMP/kite-public/" apps/kite/
   ```

3. Update `apps/kite/UPSTREAM.md` with the new SHA and date.
4. Update root [`THIRD_PARTY.md`](../THIRD_PARTY.md) and [`NOTICE`](../NOTICE) if the upstream copyright year or notice text changed.
5. Reinstall and smoke (Bun required for `apps/kite/bun.lock`):

   ```bash
   npm run install:kite
   cp -n apps/kite/.env.example apps/kite/.env
   npm run kite
   # open http://localhost:5173
   npm run test:kite
   npx playwright install chromium   # once per machine
   npm run test:e2e:kite
   ```

6. Open a PR that only bumps the pin (+ any required glue). Avoid drive-by rewrites of upstream files.

## License notes

- **Front-end source** in `apps/kite/`: MIT (see `apps/kite/LICENSE`).
- **Default brief data**: owned adapter from `mvp/server` — see [OWNED_BRIEF.md](OWNED_BRIEF.md).
- **Optional** remote Kagi data (`kite.kagi.com`): CC BY-NC — set `KITE_API_BASE=https://kite.kagi.com/api` only for private non-commercial smoke; not the product default.
