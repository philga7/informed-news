# Contributing to Informed News

Thank you for contributing. This project follows the same process model as the test-automation-harness (HARN): **`main` + short-lived feature branches**, Conventional Commits, PR CI, and semantic-release on merge to `main`.

## Development setup

```bash
cp mvp/.env.example mvp/.env
npm install
npm run install:all
npm run dev
```

- UI: http://localhost:5174  
- API: http://localhost:3001  

Smoke checklist: [mvp/SMOKE.md](mvp/SMOKE.md).

```bash
npm run typecheck
npm run build
```

## Branch model

| Branch | Role |
|--------|------|
| **main** | Default branch. PRs merge here. Release workflow runs semantic-release on push. |
| **NEWS-*/…**, **feat/***, **fix/***, **docs/***, **ci/*** | Short-lived branches cut from `main`, merged via PR into `main`. |

There is **no** long-lived `develop` or staging branch.

## Conventional Commits

```
<type>(optional-scope): <subject>
```

Common types:

| Type | Version impact |
|------|----------------|
| `feat` | Minor (`0.1.0` → `0.2.0`) |
| `fix` / `perf` | Patch |
| `BREAKING CHANGE` / `type!:` | Major (`0.x` → `1.0.0` if you leave 0.x, or `1.x` → `2.x`) |
| `docs` / `chore` / `ci` / `test` / `style` / `build` | No release |

### Squash merges and semantic-release (HARN-10)

semantic-release analyzes the **commit subject on `main`**. With squash merges, that subject is the **squash title** at merge time — not nested conventional lines in the body.

| Do | Don't |
|----|--------|
| Set the squash **title** to the bump you intend (`feat:…`, `fix:…`, `ci:…`) | Rely on nested `feat:` lines only in the squash body |
| Keep the squash **body** short; do **not** paste old `chore(release)` messages | Include GitHub’s skip-ci token in the squash body (that can suppress the Release workflow) |
| Prefer a merge commit for very long histories if needed | Use non-conventional squash titles like `Develop (#60)` when you want a version bump |

Bot commits `chore(release): … [skip ci]` are intentional so Release does not loop on its own bump.

## Why both CI and Release?

- **CI** (`.github/workflows/ci.yml`): every PR into `main` — install, MVP typecheck, MVP web build. Fast review feedback; no publish.
- **Release** (`.github/workflows/release.yml`): after merge to `main` — re-validate, then `semantic-release`.

Overlap on validation is intentional: a green PR does not skip the final gate before tagging.

## Release ≠ cloud deploy

| Concern | Where |
|---------|--------|
| **Versioning** | GitHub Release + tag + `CHANGELOG.md` + `package.json` bump via semantic-release |
| **Runtime** | Local MVP (`npm run dev`) and/or Vercel (or other host) — **not** gated by the Release workflow |

`@semantic-release/npm` uses `npmPublish: false` (private app; no npm registry publish).

### Version line (0.x)

We stay on **`0.x`** until an intentional `1.0.0` product decision (same idea as HARN). Baseline tag: **`v0.1.0`**. Subsequent `feat` / `fix` merges bump within `0.x`.

## Pull request process

1. Branch from `main`
2. Use Conventional Commits locally
3. Ensure `npm run typecheck` and `npm run build` pass
4. Open a PR into `main`; set the PR title to the intended conventional type (it often becomes the squash title)
5. Reference Jira (`NEWS-…`) when applicable

## Questions?

Open an issue or contact the maintainers.
