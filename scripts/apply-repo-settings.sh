#!/usr/bin/env bash
# Compare GitHub with the checked-in main ruleset and squash defaults.
# Dry-run unless Phil passes --apply with his own admin gh login.
# No tokens in this file. gh uses the caller's existing login.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ruleset_file="${root}/.github/rulesets/main-requires-ci.json"
repo="philga7/informed-news"
ruleset_id="24903925"
apply=0

if [[ $# -gt 1 ]]; then
	echo "usage: scripts/apply-repo-settings.sh [--apply]" >&2
	exit 2
fi
if [[ $# -eq 1 ]]; then
	case "$1" in
	--apply) apply=1 ;;
	*)
		echo "usage: scripts/apply-repo-settings.sh [--apply]" >&2
		exit 2
		;;
	esac
fi

echo "Comparing GitHub settings for ${repo} with the checked-in ruleset. No writes unless --apply."

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

gh api "repos/${repo}/rulesets/${ruleset_id}" >"${tmpdir}/live-ruleset.json"
gh api "repos/${repo}" >"${tmpdir}/live-repo.json"

RULESET_FILE="$ruleset_file" \
	LIVE_RULESET="${tmpdir}/live-ruleset.json" \
	LIVE_REPO="${tmpdir}/live-repo.json" \
	NORM_DIR="$tmpdir" \
	node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';

const drop = [
	'id',
	'source_type',
	'source',
	'node_id',
	'created_at',
	'updated_at',
	'current_user_can_bypass',
	'_links',
];

function sortValue(value) {
	if (Array.isArray(value)) {
		const items = value.map(sortValue);
		if (items.every((item) => item && typeof item === 'object' && !Array.isArray(item) && 'type' in item)) {
			return items.sort((a, b) => String(a.type).localeCompare(String(b.type)));
		}
		if (
			items.every((item) => item && typeof item === 'object' && !Array.isArray(item) && 'actor_type' in item)
		) {
			return items.sort((a, b) => String(a.actor_type).localeCompare(String(b.actor_type)));
		}
		return items;
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((key) => [key, sortValue(value[key])]),
		);
	}
	return value;
}

const checked = JSON.parse(readFileSync(process.env.RULESET_FILE, 'utf8'));
const live = JSON.parse(readFileSync(process.env.LIVE_RULESET, 'utf8'));
for (const key of drop) delete live[key];
writeFileSync(`${process.env.NORM_DIR}/checked-ruleset.json`, `${JSON.stringify(sortValue(checked), null, 2)}\n`);
writeFileSync(`${process.env.NORM_DIR}/normalized-live-ruleset.json`, `${JSON.stringify(sortValue(live), null, 2)}\n`);

const repoJson = JSON.parse(readFileSync(process.env.LIVE_REPO, 'utf8'));
const liveSquash = {
	squash_merge_commit_message: repoJson.squash_merge_commit_message,
	squash_merge_commit_title: repoJson.squash_merge_commit_title,
};
const expectedSquash = {
	squash_merge_commit_message: 'PR_BODY',
	squash_merge_commit_title: 'PR_TITLE',
};
writeFileSync(`${process.env.NORM_DIR}/live-squash.json`, `${JSON.stringify(sortValue(liveSquash), null, 2)}\n`);
writeFileSync(`${process.env.NORM_DIR}/expected-squash.json`, `${JSON.stringify(sortValue(expectedSquash), null, 2)}\n`);
EOF

echo "Ruleset ${ruleset_id} (live vs .github/rulesets/main-requires-ci.json):"
if ! diff -u --label "live ruleset" --label "checked-in ruleset" \
	"${tmpdir}/normalized-live-ruleset.json" "${tmpdir}/checked-ruleset.json"; then
	true
else
	echo "ruleset: no difference"
fi

echo "Squash defaults (live vs PR_TITLE / PR_BODY):"
if ! diff -u --label "live squash defaults" --label "checked-in squash defaults" \
	"${tmpdir}/live-squash.json" "${tmpdir}/expected-squash.json"; then
	true
else
	echo "squash defaults: no difference"
fi

if [[ "$apply" -eq 0 ]]; then
	echo "Dry run. Nothing was changed. Re-run with --apply to PUT the ruleset and PATCH the squash defaults."
	exit 0
fi

echo "Applying ruleset ${ruleset_id} and squash defaults on ${repo}."
cd "$root"
gh api -X PUT repos/philga7/informed-news/rulesets/24903925 --input .github/rulesets/main-requires-ci.json
gh api -X PATCH repos/philga7/informed-news \
	-f squash_merge_commit_title=PR_TITLE \
	-f squash_merge_commit_message=PR_BODY
