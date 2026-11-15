#!/usr/bin/env bash
# Move the VPS checkout to a release tag (vX.Y.Z), detached. Idempotent.
# Run from the checkout (or set REPO_DIR). Does not restart anything.
set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
	echo "usage: scripts/vps-update-checkout.sh TAG" >&2
	exit 2
fi
tag="$1"
cd "${REPO_DIR:-.}"

# Untracked files (qa.env, .env.bak, postgres.env.bak) live in the checkout on
# purpose. Only tracked changes block a move; git checkout itself refuses if a
# move would overwrite an untracked file.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
	echo "working tree is not clean (tracked changes); refusing to move" >&2
	exit 1
fi

git fetch --tags origin >&2

if ! git rev-parse -q --verify "refs/tags/${tag}^{commit}" >/dev/null; then
	echo "tag ${tag} not found after fetch" >&2
	exit 1
fi

old_sha="$(git rev-parse HEAD)"
old_desc="$(git describe --tags --always "$old_sha")"
new_sha="$(git rev-parse "refs/tags/${tag}^{commit}")"

if [ "$old_sha" = "$new_sha" ]; then
	git checkout --detach --quiet "$new_sha"
	echo "already at ${tag} (${new_sha}); nothing to do"
	exit 0
fi

if ! git merge-base --is-ancestor "$old_sha" "$new_sha"; then
	echo "${tag} is not a fast-forward from ${old_sha} (${old_desc}); refusing" >&2
	exit 1
fi

git checkout --detach --quiet "$new_sha"
echo "old: ${old_sha} (${old_desc})"
echo "new: ${new_sha} (${tag})"
