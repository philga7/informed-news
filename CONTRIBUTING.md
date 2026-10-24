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
| `BREAKING CHANGE` / `type!:` | Minor while the line is 0.x (`0.26.30` → `0.27.0`). Major again after 1.0 |
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

- **CI** (`.github/workflows/ci.yml`): every PR into `main` and every push to `main` — install (root, `mvp/server`, `apps/kite`), MVP server typecheck + `npm test`, `npm run test:kite`, Kite `bun run test:unit` + `bun run check`, and product-path `bun run build` in `apps/kite`. No secrets. Fast review feedback; no publish.
- **Release** (`.github/workflows/release.yml`): after merge to `main` — re-validate, then `semantic-release`.

Overlap on validation is intentional: a green PR does not skip the final gate before tagging.

## `main` requires CI (ruleset)

The repository ruleset **main requires CI** (Settings → Rules → Rulesets) requires the CI job **MVP build & typecheck**, reported by GitHub Actions, on every update to `main`:

- A PR can't merge until that check passes on its head commit; pending or red blocks the merge button and `gh pr merge`.
- Direct pushes to `main` are rejected (`push declined due to repository rule violations`), admins included. Land everything, including plan-file cleanups and doc fixes, through a PR.
- The only bypass is **deploy keys**. The Release job checks out with the write deploy key **semantic-release (NEWS-124)**, whose private half is the Actions secret `RELEASE_DEPLOY_KEY`, so its `chore(release)` commit and tag push over SSH. GitHub does not allow the GitHub Actions app as a ruleset bypass on a personal-account repo, so `GITHUB_TOKEN` can't push the release commit.

Rotate the release key:

```bash
ssh-keygen -t ed25519 -N '' -C 'semantic-release deploy key' -f release_key
gh repo deploy-key add release_key.pub --allow-write --title 'semantic-release (NEWS-124)'
gh secret set RELEASE_DEPLOY_KEY < release_key
gh repo deploy-key list            # delete the old key: gh repo deploy-key delete <id>
rm -P release_key release_key.pub
```

Inspect or change the ruleset with an admin token: `gh api repos/philga7/informed-news/rulesets`. If the CI job is renamed, update the required check's context in the ruleset in the same change, or every merge blocks on a check that never reports.

## Release ≠ cloud deploy

| Concern | Where |
|---------|--------|
| **Versioning** | GitHub Release + tag + `CHANGELOG.md` + `package.json` bump via semantic-release |
| **Web UI (Vercel)** | Root `vercel.json` builds/publishes `_legacy/mvp-web` static output until hosting cutover — **not** gated by the Release workflow |
| **API** | Local `mvp/server` (`npm run server` / `npm run dev`). Not hosted on Vercel in this setup. |

`@semantic-release/npm` uses `npmPublish: false` (private app; no npm registry publish). Do not point Vercel at `_legacy/` or restore the legacy monolith as the deploy entrypoint.

### Version line (0.x)

We stay on **`0.x`** until an intentional `1.0.0` product decision (same idea as HARN). Baseline tag: **`v0.1.0`**. Subsequent `feat` / `fix` merges bump within `0.x`.

While the version is 0.x, `.releaserc.json` maps a breaking change (`feat!:` or a `BREAKING CHANGE:` footer) to a minor bump, so that commit does not cut `1.0.0`. `feat:` stays minor and `fix:` stays patch. Remove that `releaseRules` entry in the same change that ships 1.0. After that, a breaking change is a major bump again. The `conventional-changelog-conventionalcommits` pin at `^9.3.1` (NEWS-132) stays; it is what keeps the Features and Bug Fixes sections in the notes.

## Pull request process

1. Branch from `main`
2. Use Conventional Commits locally
3. Ensure `npm run typecheck`, `npm test`, and `npm run build` pass
4. Open a PR into `main`; set the PR title to the intended conventional type (it often becomes the squash title)
5. Reference Jira (`NEWS-…`) when applicable

## Questions?

Open an issue or contact the maintainers.
