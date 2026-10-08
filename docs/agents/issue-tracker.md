# Issue tracker: Jira (NEWS)

Issues and specs for this repo live in the **NEWS** project on Jira Cloud (`https://informedcrew.atlassian.net`). Use the Atlassian MCP server for all operations; there is no `gh issue` / GitHub Issues workflow here. Full connection details and issue type ids: [`.cursor/rules/jira-news.mdc`](../../.cursor/rules/jira-news.mdc).

## Conventions

- Pass `cloudId: ebcd227d-1f6d-4a54-a6d7-cfe70e377a50` on every call. Scope JQL with `project = NEWS`.
- **Read an issue**: `getJiraIssue` with the key (e.g. `NEWS-91`).
- **List / search issues**: `searchJiraIssuesUsingJql`, e.g. `project = NEWS AND status != Done ORDER BY rank`.
- **Comment on an issue**: `addCommentToJiraIssue`.
- **Change status**: `getTransitionsForJiraIssue`, then `transitionJiraIssue`. Status changes follow the ship ritual in [`.cursor/skills/news-ship-loop/SKILL.md`](../../.cursor/skills/news-ship-loop/SKILL.md); do not invent other transitions.
- **Create an issue**: `createJiraIssue` in NEWS only, and only after the user confirms the proposed issue (see the follow-up Jira gate in `news-ship-loop`).
- **Link issues**: `createIssueLink` (e.g. **Relates** from a follow-up to the shipped key).

## Finding the ticket for a branch or PR

Work references NEWS keys rather than `#123` numbers:

- Commit subjects and squash-merged PR titles start with the key: `NEWS-91: retire review flow …`, `feat(NEWS-52): …`, `fix(news-52): …` (match case-insensitively).
- Feature branches usually carry the key (e.g. `feat/news-90-…`).
- PR bodies use `Closes NEWS-N` when the PR completes the story.
- While a story is in flight, its SDD plan lives at `.cursor/plans/news-<n>-….plan.md`. Read it alongside the Jira issue; the plan is deleted from `main` after Done.

Fetch the issue with `getJiraIssue` and treat its description (plus acceptance criteria and comments) as the spec. Epic context and ordering live in [`docs/ROADMAP.md`](../ROADMAP.md).

## When a skill says "publish to the issue tracker"

Propose the NEWS issue (type, summary, description) to the user and wait for confirmation before calling `createJiraIssue`.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.
