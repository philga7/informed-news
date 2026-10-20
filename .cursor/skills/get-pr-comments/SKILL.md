---
name: get-pr-comments
description: Fetch and summarize review comments from the active pull request
---

# Get PR comments

## Trigger

Need a concise, actionable summary of feedback on the active pull request.

## Workflow

1. Resolve the active PR for the current branch.
2. Fetch review comments and discussion comments.
3. Group feedback by severity and actionability.
4. Return a concise action list.

## Output

- Grouped feedback summary
- Action list ordered by priority
- Open questions that still need clarification
## Provenance

Copied from [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) (Cursor, MIT License). Do **not** install the Cursor Team Kit plugin for this repo — the local copy under `.cursor/skills/` (and `.cursor/agents/` / `.cursor/rules/` when present) is authoritative. Where a copied skill conflicts with a legacy `.cursor/rules/` entry, the skill wins.

