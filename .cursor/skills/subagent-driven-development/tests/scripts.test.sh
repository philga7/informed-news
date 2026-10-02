#!/usr/bin/env bash
# Smoke-test the SDD helper scripts (sdd-workspace, task-brief,
# review-package) in a throwaway git repo. Uses only bash, git, awk, and
# coreutils so it runs the same on a plain Linux VM (CI, Cloud Agents) as on
# macOS.
#
# Usage: bash .cursor/skills/subagent-driven-development/tests/scripts.test.sh
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
scripts=$(cd "$here/../scripts" && pwd)
pass=0

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { pass=$((pass + 1)); echo "ok - $*"; }

for s in sdd-workspace task-brief review-package; do
  [ -x "$scripts/$s" ] || fail "$s is not executable"
  head -n 1 "$scripts/$s" | grep -qx '#!/usr/bin/env bash' || fail "$s does not use #!/usr/bin/env bash"
done
ok "scripts are executable bash"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$tmp"
git init -q
git config user.email sdd-test@example.com
git config user.name sdd-test
git config commit.gpgsign false

cat > plan.md <<'PLAN'
# Example plan

## Task 1: First

alpha

```markdown
## Task 2: heading inside a fence is not a task boundary
```

## Task 2: Second

beta

## Task 10: Tenth

gamma
PLAN
git add plan.md
git commit -q -m "add plan"
base=$(git rev-parse HEAD)

root=$(git rev-parse --show-toplevel)
ws=$("$scripts/sdd-workspace" plan.md)
[ "$ws" = "$(cd "$root/.superpowers/sdd/plan" && pwd)" ] || fail "sdd-workspace printed $ws"
[ "$(cat "$root/.superpowers/sdd/.gitignore")" = "*" ] || fail "workspace .gitignore is not '*'"
[ -z "$(git status --porcelain)" ] || fail "workspace shows up in git status"
ok "sdd-workspace creates a self-ignoring per-plan directory"

if "$scripts/sdd-workspace" missing.md >/dev/null 2>&1; then
  fail "sdd-workspace accepted a missing plan"
else
  [ $? -eq 2 ] || fail "sdd-workspace missing plan exit code"
fi
ok "sdd-workspace rejects a missing plan"

"$scripts/task-brief" plan.md 1 >/dev/null
b1="$ws/task-1-brief.md"
grep -q alpha "$b1" || fail "task 1 brief missing its body"
grep -q 'heading inside a fence' "$b1" || fail "task 1 brief split on a fenced heading"
if grep -qE 'beta|gamma' "$b1"; then fail "task 1 brief leaked other tasks"; fi
ok "task-brief extracts task 1 and ignores fenced headings"

"$scripts/task-brief" plan.md 2 >/dev/null
b2="$ws/task-2-brief.md"
grep -q beta "$b2" || fail "task 2 brief missing its body"
if grep -qE 'alpha|gamma' "$b2"; then fail "task 2 brief leaked other tasks"; fi
"$scripts/task-brief" plan.md 10 >/dev/null
grep -q gamma "$ws/task-10-brief.md" || fail "task 10 brief missing its body"
ok "task-brief keeps task 2 and task 10 distinct from task 1"

if "$scripts/task-brief" plan.md 99 >/dev/null 2>&1; then
  fail "task-brief accepted a missing task"
else
  [ $? -eq 3 ] || fail "task-brief missing task exit code"
fi
ok "task-brief exits 3 for a missing task"

echo one > a.txt
git add a.txt
git commit -q -m "first change"
echo two >> a.txt
git commit -q -am "second change"
head=$(git rev-parse HEAD)

out=$("$scripts/review-package" plan.md "$base" "$head")
pkg="$ws/review-$(git rev-parse --short "$base")..$(git rev-parse --short "$head").diff"
[ -s "$pkg" ] || fail "review package not written at $pkg"
case "$out" in *"2 commit(s)"*) ;; *) fail "review-package summary: $out" ;; esac
for want in '## Commits' 'first change' 'second change' '## Files changed' '## Diff' '+two'; do
  grep -qF -- "$want" "$pkg" || fail "review package missing: $want"
done
ok "review-package covers every commit in BASE..HEAD"

if "$scripts/review-package" plan.md not-a-rev "$head" >/dev/null 2>&1; then
  fail "review-package accepted a bad BASE"
else
  [ $? -eq 2 ] || fail "review-package bad BASE exit code"
fi
ok "review-package rejects a bad BASE"

echo "all $pass checks passed"
