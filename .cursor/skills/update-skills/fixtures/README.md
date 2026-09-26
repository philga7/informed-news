Fixture layout for `check.mjs --fixtures`.

- `repo/` is the fake repository root passed to `--repo-root`.
- `upstream/<skill-name>/` is the matching upstream tree that `--fixtures` uses instead of GitHub.
- Fixture mode is always offline and must not hit the network.

Expected fixture outcomes:

- `current-match` -> `locked (current)`
- `outdated-skill` -> `locked (outdated)` with `SKILL.md` drift plus one extra local file difference
- `repo-local-skip` -> `repo-local-skip (not-checked)`

Example:

```bash
node .cursor/skills/update-skills/scripts/check.mjs \
  --repo-root .cursor/skills/update-skills/fixtures/repo \
  --fixtures .cursor/skills/update-skills/fixtures \
  --json
```
