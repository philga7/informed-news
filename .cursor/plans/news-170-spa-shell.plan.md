# NEWS-170 piece (a): SPA shell and Express route split

Spec: [docs/DECISIONS.md](../../docs/DECISIONS.md) (2026-11-05 SPA shell entry) and [docs/ROUTE_MAP.md](../../docs/ROUTE_MAP.md) (SPA ownership). Those files are already committed. Do not rewrite the grill answers.

Approach: SDD. Piece (a) only. Do not port Brief parity, mount Story Desk, add a Map/Signals nav guard test, or remove any Kite view.

VISION.md direction does not change. Do not edit it.

## Global constraints

- Workspace folder is `apps/web`. Do not add a root npm script named `web` or `dev:mvp-web`. `tests/dev-entrypoint.test.js` and `tests/retire-mvp-web.test.js` forbid that. `npm run dev` stays `server` + `kite` only.
- Shell paths: `/shell` and `/shell/deep` only. `shellOwnsPath` is true for `/shell` and any path that starts with `/shell/`. It is false for `/`, `/shellish`, `/topics`, `/api`, `/healthz`, `/map`, `/signals`, `/finance`, `/situation`, `/listen`, `/desk`.
- Express answers `/api/*`, `/health`, and `/healthz` before either UI handler. A shell-owned path never reaches Kite. Every other page reaches Kite when `kiteHandler` is set. With no `kiteHandler`, `GET /` stays `{ message: 'Informed News MVP server' }`.
- The shell pages are static. No `fetch`, no new API route, no second data path. No links to Map, Signals, Finance, Situation, Listen, or Desk.
- Svelte 5, SvelteKit 2, Vite 7, `@sveltejs/adapter-node`. Match the major versions already in `apps/kite/package.json`. Read `.cursor/skills/svelte5-best-practices/SKILL.md` before writing components. Imports at the top of the file. No Kagi trademarks. Do not copy Kite's dependency tree.
- `WEB_BUILD_DIR` mirrors `KITE_BUILD_DIR`: unset, empty, or whitespace means no shell handler. A set dir that fails to load exits the process with code 1, same as Kite.
- Do not commit `node_modules`, `apps/web/build`, `.svelte-kit`, `.env`, or `mvp/data/*.json`. Add `apps/web/build` to `.gitignore` next to `apps/kite/build`.
- One Conventional Commit for the code in this task: `feat(NEWS-170): SPA shell and Express route split`. Do not amend the docs commit that recorded the grill.

## Task 1: Shell app, Express split, and tests

TDD. Write the failing tests first, run them, then implement.

Files:

- `mvp/server/src/serveShell.ts` — `shellOwnsPath(pathname: string): boolean` and `shellHandlerPath(env: NodeJS.ProcessEnv): string | null` (`WEB_BUILD_DIR` + `handler.js`). Same empty/whitespace rules as `kiteHandlerPath` in `serveKite.ts`.
- `mvp/server/src/serveShell.test.ts` — path ownership cases listed above, plus the env cases from `serveKite.test.ts`.
- `mvp/server/src/serveShellMount.test.ts` — follow `serveKiteMount.test.ts`. With both handlers:
  - `GET /shell` and `GET /shell/deep` and `GET /shell/missing` hit the shell handler only.
  - `GET /`, `GET /topics`, `GET /transparency`, `GET /map`, `GET /signals` hit the kite handler only.
  - `GET /healthz` is Express `{ status: 'ok' }`.
  - `POST /api/fetch` is 401 and neither handler sees it.
  - With shell handler and no kite handler, `GET /` is still the JSON message and `GET /shell` is the shell.
  - Existing `serveKiteMount.test.ts` stays green.
- `CreateAppDeps.shellHandler?: RequestHandler` in `mvp/server/src/app.ts`. Mount after every API route and before `kiteHandler`: if the path is not shell-owned, `next()`; otherwise call the shell handler and do not fall through.
- `mvp/server/src/index.ts` loads the shell handler the same way as Kite (`pathToFileURL`) and passes it to `createApp`.
- `apps/web` SvelteKit app:
  - `package.json` name `informed-news-shell`, private, `"type": "module"`. Scripts: `dev`, `build`, `check` (`svelte-kit sync && svelte-check --tsconfig ./tsconfig.json`). Dev dependencies only: `@sveltejs/adapter-node`, `@sveltejs/kit`, `@sveltejs/vite-plugin-svelte`, `svelte`, `svelte-check`, `typescript`, `vite`, at the same ranges as `apps/kite/package.json`.
  - `svelte.config.js` uses adapter-node. `vite.config.ts` uses the SvelteKit plugin only (no Tailwind).
  - `src/app.html` is a minimal document (`lang="en"`, title Informed News). No theme script, no manifest.
  - `src/routes/+layout.svelte` renders a `<main>` and `{@render children()}`.
  - `src/routes/shell/+page.svelte`: one `h1` "Informed News", a paragraph that this is the shell and the Brief is still the home page, a link to `/` with visible text `Brief`, a link to `/shell/deep` with visible text `Deep link`. `<svelte:head>` title `Informed News shell`.
  - `src/routes/shell/deep/+page.svelte`: one `h1` "Shell deep link", a paragraph that reloading this address stays on this page, a link to `/shell` with visible text `Shell home`. Title `Shell deep link`.
  - No other routes. No `src/routes/+page.svelte` (the shell does not own `/`).
- `mvp/server/src/spaShellBuild.test.ts` — dynamic-import `apps/web/build/handler.js` (resolve from this file to the repo root) and pass it as `shellHandler` with no kite handler. `GET /shell` is 200 HTML containing `Informed News` and `Brief`. `GET /shell/deep` is 200 HTML containing `Shell deep link`. `GET /` is the JSON message. If the build is missing, fail with the command `bun run build` in `apps/web` (do not skip).
- Run `bun install` in `apps/web` and commit `apps/web/bun.lock`. Build before the build test.
- `npm test` in `mvp/server` must pass (it uses `src/testing/withTempDataDir.ts`; do not point tests at `mvp/data`).

Done when: the tests above pass, `cd apps/web && bun run check` reports 0 errors and 0 warnings, and `bun run build` emits `apps/web/build/handler.js`.

## Task 2: Image, install, CI, and reader docs

Depends on Task 1. Do not change shell behavior.

- `Dockerfile`: a `web-build` stage from `oven/bun:1.4.3`, copy `apps/web`, `bun install --frozen-lockfile && bun run build`. Final stage copies `build`, `node_modules`, and `package.json` to `/app/apps/web/` the same way Kite is copied, before the `chown`. `ENV WEB_BUILD_DIR=/app/apps/web/build`. Keep `KITE_BUILD_DIR` and one `EXPOSE 3001`. Do not add a second process or port.
- `.github/workflows/ci.yml`: after Install Kite, install the shell with `bun install --frozen-lockfile --cwd apps/web`, then `bun run check` and `bun run build` in `apps/web`. The build step must run before `npm test` so `spaShellBuild.test.ts` can load the handler.
- Root `package.json`: `install:shell` is `bun install --frozen-lockfile --cwd apps/web`. Append `&& npm run install:shell` to `install:all`. Do not add a `web` script. Do not change `dev`.
- `.cursor/install-deps.sh`: include `$ROOT/apps/web/bun.lock` in `hash_lockfiles`, and `bun install --frozen-lockfile --cwd apps/web` when that lockfile exists, using the same bun-install fallback the Kite block uses. Keep the skip when the saved hash matches. Do not commit `.cursor/.install-lock-hash`.
- `.cursor/environment.json`: keep `"install": "bash .cursor/install-deps.sh"` and add `"name": "informed-news"`. Do not add a `start` script (the server spends refresh budget).
- `docs/PRODUCT_SPEC.md`: add a short Shell section in plain language. The home page stays the Brief. `/shell` is a shell page, not the Brief, with a way back to the Brief and no Map or Signals tab. `/shell/deep` stays put on reload. Two scenarios. No Express, Svelte, or adapter words. Do not add a Last checked line.
- `docs/WHATS_NEW.md`: at the top of the existing `## 2026-11-05` section, one short paragraph for the shell. Do not claim Brief parity. Do not edit `CHANGELOG.md`.
- `docs/ROADMAP.md` and `AGENTS.md`: mark NEWS-170 piece (a) Done. List (a)–(e) in order. Current next is piece (b) Briefs parity, not filed yet. Keep the sentence shape so `tests/vision-decisions.test.js` can be updated in the same commit: the combined-order numbered lines must still yield the same NEWS key list ending in `NEWS-170` (do not add other keys on a `9. ` line). Replace `**Current next** is [NEWS-170]` with a sentence that still mentions NEWS-170 before the later NEWS-192 done sentence. Update the queue row 83 and the hosting-section copy of that current-next sentence. Update the test assertion that matches `**Current next** is [NEWS-170]` so it matches the new sentence and still checks piece (b).
- `README.md`: one row or sentence that `apps/web` is the shell placeholder and `npm run dev` is still Kite plus the server. `CONTRIBUTING.md` CI bullet: install and build `apps/web` as well as Kite.
- `CLAUDE.md` layout table: one row for `apps/web`. Do not change the Claude workflow install (Claude does not need the shell to build a Kite ticket).

Done when: `npm test` in `mvp/server`, `npm run test:kite`, and `cd apps/web && bun run check` pass. Commit: `feat(NEWS-170): serve the shell beside Kite`. If Task 1 already used the primary feat subject, this subject is fine; do not use a second `feat(NEWS-170): SPA shell and Express route split`.
