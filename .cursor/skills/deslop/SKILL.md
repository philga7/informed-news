---
name: deslop
description: Remove AI-generated code slop and clean up code style
---

# Remove AI code slop

Check the diff against main and remove AI-generated slop introduced in the branch.

## Focus Areas

- Extra comments that are unnecessary or inconsistent with local style
- Defensive checks or try/catch blocks that are abnormal for trusted code paths
- Casts to `any` used only to bypass type issues
- Deeply nested code that should be simplified with early returns
- Other patterns inconsistent with the file and surrounding codebase

## Guardrails

- Keep behavior unchanged unless fixing a clear bug.
- Prefer minimal, focused edits over broad rewrites.
- Keep the final summary concise (1-3 sentences).

## Provenance

Copied from [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) (Cursor, MIT License). Do **not** install the Cursor Team Kit plugin for this repo — the local copy under `.cursor/skills/` (and `.cursor/agents/` / `.cursor/rules/` when present) is authoritative. Where a copied skill conflicts with a legacy `.cursor/rules/` entry, the skill wins.

