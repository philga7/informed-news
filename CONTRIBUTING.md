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

**The PR title is the squash subject.** Write it as a Conventional Commit with every ticket key in the scope, e.g. `fix(NEWS-131, NEWS-155, NEWS-174): …`, and the highest bump type in the batch (breaking `!` > `feat` > `fix` / `perf` > no-release types). A multi-ticket PR squashes to one subject on `main`. The per-ticket commits stay in the PR only, so a key that is not in the title is not on `main`. PR #205 squashed as `docs(NEWS-165): …` and lost the NEWS-171 subject this way. PR #191 (`NEWS-119, NEWS-120: …`) was not a Conventional Commit at all and cut no release.

The **PR title** workflow (`.github/workflows/pr-title.yml`, running `scripts/check-pr-title.mjs`) fails a PR whose title breaks that rule. It re-runs when the title is edited. A title without a key passes only for an untracked `docs`, `chore`, `ci`, `test`, `style`, or `build` change, because those cut no release. `feat`, `fix`, `perf`, `refactor`, `revert`, and any breaking `!` title always need keys. Merge with `gh pr merge <n> --squash --subject "<PR title> (#<n>)"`. The checked-in squash default is the pull request title (`squash_merge_commit_title: PR_TITLE`; the body is `PR_BODY`). Phil sets that with `scripts/apply-repo-settings.sh`. Until that apply has been run, pass `--subject` anyway, or a one-commit pull request squashes to its commit subject instead of the checked title.

## Why both CI and Release?

- **CI** (`.github/workflows/ci.yml`): every PR into `main` and every push to `main` — install (root, `mvp/server`, `apps/kite`), MVP server typecheck + `npm test`, `npm run test:kite`, Kite `bun run test:unit` + `bun run check`, and product-path `bun run build` in `apps/kite`. No secrets. Fast review feedback; no publish.
- **Release** (`.github/workflows/release.yml`): after merge to `main` — re-validate, then `semantic-release`.

Overlap on validation is intentional: a green PR does not skip the final gate before tagging.

## `main` requires CI (ruleset)

The repository ruleset **main requires CI** (Settings → Rules → Rulesets, id 24903925) targets the default branch. The checked-in copy is [`.github/rulesets/main-requires-ci.json`](.github/rulesets/main-requires-ci.json). GitHub enforces that file only after Phil applies it (below). The file requires:

- The CI job **MVP build & typecheck** and the **PR title** check, both reported by GitHub Actions (`integration_id` 15368, the id the live ruleset already uses for the build check). **PR title** is required. A pull request cannot merge while either check is missing, pending, or red.
- A pull request before any update to `main`. Direct pushes are rejected (`push declined due to repository rule violations`), admins included. Land everything, including plan-file cleanups and doc fixes, through a PR.
- One approving review, and an approval of the latest push from someone other than the person who pushed it. A later push dismisses earlier approvals.
- Squash as the only merge method onto `main`. The squash commit title is the pull request title.
- No force-push and no deletion of `main`.

The repository admin role (GitHub base role id 5) may bypass these rules when merging a pull request, and only then. That is how Phil can merge his own pull request when he was the last person to push. Agents never use that bypass. No bot and no GitHub App is a bypass actor.

The Release job checks out with the write deploy key **semantic-release (NEWS-124)**, whose private half is the Actions secret `RELEASE_DEPLOY_KEY`, so its `chore(release)` commit and tag push over SSH. That deploy key is a bypass actor (`bypass_mode: always`) so the pull-request rule does not stop the release commit. GitHub does not allow the GitHub Actions app as a ruleset bypass on a personal-account repo, so `GITHUB_TOKEN` can't push the release commit.

Rotate the release key:

```bash
ssh-keygen -t ed25519 -N '' -C 'semantic-release deploy key' -f release_key
gh repo deploy-key add release_key.pub --allow-write --title 'semantic-release (NEWS-124)'
gh secret set RELEASE_DEPLOY_KEY < release_key
gh repo deploy-key list            # delete the old key: gh repo deploy-key delete <id>
rm -P release_key release_key.pub
```

Phil applies or re-checks the ruleset and the squash defaults with his own admin `gh` login. [`scripts/apply-repo-settings.sh`](scripts/apply-repo-settings.sh) prints the diff between GitHub and the checked-in file and changes nothing unless he passes `--apply`. Agents do not run `--apply`.

```bash
scripts/apply-repo-settings.sh
scripts/apply-repo-settings.sh --apply
```

`--apply` runs `gh api -X PUT repos/philga7/informed-news/rulesets/24903925 --input .github/rulesets/main-requires-ci.json` and `gh api -X PATCH repos/philga7/informed-news -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY`.

Inspect the live ruleset with `gh api repos/philga7/informed-news/rulesets/24903925`. If the CI job or the PR title job is renamed, update the required check's context in the ruleset file in the same change, or every merge blocks on a check that never reports.

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
4. Open a PR into `main`; the PR title is a Conventional Commit naming every key and becomes the squash subject (see [Squash merges](#squash-merges-and-semantic-release-harn-10))
5. Reference Jira (`NEWS-…`) in the title scope; one Conventional Commit per ticket on the branch

## Claude-eligible work

Claude builds only Small tickets labeled `builder-claude`, and only when an owner, member, or collaborator writes `@claude`. The rules are in [CLAUDE.md](CLAUDE.md#claude-eligible-work). Claude opens a pull request. Phil merges.

## Questions?

Open an issue or contact the maintainers.
