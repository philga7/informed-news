# Agent skills stack (portable recipe)

Repo-local Cursor skills under `.cursor/skills/`. Everything stays in **this** repository — do not install with `-g` / into `~/.cursor/skills/` as part of this recipe.

Copy this file into another project, run the install commands from that project’s root, and paste the gate blurb into that project’s `AGENTS.md` (swap tracker / product invariants).

## Loop

```
find-skills → grill-me → frontend-design / prototype / image-to-code
        → gate (tracker item)
        → subagent-driven-development
        → news-ship-loop
        → agent-browser / diagnosing-bugs
        → skill-creator / mcp-builder
```

1. **Shape first** — pressure-test and prototype until scope is sharp. Do not start product implementation from a vague idea.
2. **Gate** — create/update a tracker item only when scope, UX direction, and open questions are resolved. (Informed News: **NEWS** on Atlassian.)
3. **Build / ship** — implement via SDD, then `/news-ship-loop` for Jira status + PR/merge/Done.
4. **Product invariants win** — skills do not override `AGENTS.md` / project rules.

Mid-epic: do not re-grill finished work. New discoveries → additional tickets (or edits to open ones). See “Adopting mid-epic” in the integration plan notes below.

## Inventory

| Skill | Stage | Upstream |
|-------|--------|----------|
| `find-skills` | Shape | [vercel-labs/skills](https://github.com/vercel-labs/skills) |
| `grill-me` + `grilling` | Shape | [mattpocock/skills](https://github.com/mattpocock/skills) |
| `frontend-design` | Shape | [anthropics/skills](https://github.com/anthropics/skills) |
| `prototype` | Shape | mattpocock/skills |
| `image-to-code` | Shape | [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) |
| `subagent-driven-development` | Build | [obra/superpowers](https://github.com/obra/superpowers) |
| `news-ship-loop` | Ship | Informed News (repo-local) |
| `agent-browser` | Verify | [vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) |
| `diagnosing-bugs` | Verify | mattpocock/skills |
| `skill-creator` | Package | anthropics/skills |
| `mcp-builder` | Package | anthropics/skills |

Licenses: keep each skill’s `LICENSE` / `LICENSE.txt` (MIT / Apache-2.0 mix).

## Install (target repo root, no `-g`)

```bash
npx skills add vercel-labs/skills --skill find-skills -a cursor --copy -y
npx skills add mattpocock/skills --skill grill-me --skill grilling --skill prototype --skill diagnosing-bugs -a cursor --copy -y
npx skills add anthropics/skills --skill frontend-design --skill skill-creator --skill mcp-builder -a cursor --copy -y
npx skills add vercel-labs/agent-browser -a cursor --copy -y
npx skills add https://github.com/Leonxlnx/taste-skill --skill image-to-code -a cursor --copy -y
npx skills add obra/superpowers --skill subagent-driven-development -a cursor --copy -y
```

If the CLI writes to `.agents/skills/`, move that tree to `.cursor/skills/` and remove `.agents/skills` so only one discovery path is committed:

```bash
mkdir -p .cursor/skills
mv .agents/skills/* .cursor/skills/
rmdir .agents/skills
rmdir .agents 2>/dev/null || true
```

Normalize the `image-to-code` directory name to match frontmatter `name: image-to-code` if the install uses a different folder name.

### Refresh / update

Re-run the same `npx skills add …` commands from the repo root, then re-consolidate into `.cursor/skills/` if needed. Commit the updated `skills-lock.json` (written by the CLI) alongside skill trees so the lockfile matches what’s installed.

## Optional: `agent-browser` CLI

The skill under `.cursor/skills/agent-browser/` is a stub. For scripted browser verification, install the CLI in the target environment (do **not** vendor the binary into git):

```bash
# Example: project-local
npm i -D agent-browser
npx agent-browser install   # Chrome for Testing
```

Or install globally / use `npx agent-browser` per the upstream README. Coexists with Cursor’s `cursor-ide-browser` MCP (IDE tabs vs scripted CLI).

## Invoke

In Cursor Agent chat: `/skill-name` (e.g. `/grill-me`) or `@` attach. Model-invoked skills may auto-apply when relevant; `grill-me` is user-invoked (`disable-model-invocation: true`).

## Copy into another repo

1. Copy this file to the other repo as `docs/AGENT_SKILLS.md`.
2. From **that** repo’s root, run the install block above.
3. Paste the gate section from `AGENTS.md` (Agent skill loop), swapping tracker name and product invariants.
4. Commit `.cursor/skills/**`, this doc, and the AGENTS update in **that** repo only.

## Adopting mid-epic

| Situation | Action |
|-----------|--------|
| Completed / accepted items | Leave them |
| Vague / unstarted ideas | Shape loop before implementation |
| New need from grilling | Additional tracker item |
| Change to an open item | Edit that issue |
| Rework of shipped work | Explicit follow-up ticket for the delta |

## Informed News notes

- Tracker: **NEWS** (`informedcrew.atlassian.net`). Prefer JQL `project = NEWS`.
- Product path: `npm run dev` → Kite Brief + `mvp/server`. Prototypes stay off that default entrypoint.
- Skills do not replace [AGENTS.md](../AGENTS.md) rules or `.cursor/rules/`.
- Ship ritual: `/news-ship-loop` + `.cursor/rules/news-ship-loop.mdc`.
