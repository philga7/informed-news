# NEWS-263 — one token per agent, with written_by on every row

Approach: SDD, built inline in a Claude session, one fresh sub-agent reviews the whole branch before the PR (CLAUDE.md "SDD in a Claude session"). ROADMAP row 5a. Delete this file on the branch before merge.

Spec: the NEWS-263 ticket, DECISIONS 2026-11-24 (NEWS-262), and Phil's answers of 2026-11-26 (all recommended):

1. Writer columns are nullable in the database; empty means written under `INGEST_TOKEN`. The store always records a writer. `agents add --claim-unattributed` gives every unattributed row (and story creator) to the new agent, in one transaction, and prints counts.
2. Token: `inag_` + 32 random bytes base64url, generated only by the command. Stored as SHA-256 hex, unique index. Lookup by hash, then `timingSafeEqual`. A malformed token is 401 without a database call. No piped tokens.
3. Cut-over: deploy → `agents add --name "Grok Bot" --claim-unattributed` → token into Grok Bot → remove `INGEST_TOKEN`. A still-set `INGEST_TOKEN` is ignored with one warning line (no value). `tests/env-example.test.js` gets a retired-names list. Postgres with no agents: every token 401. No database: 503.
4. Shape: `written_by_agent_id` (FK agents) and `written_by_user_id` (FK users), at most one set. Stories add `created_by_agent_id` / `created_by_user_id`, same rule; a story has a creator exactly when it has a writer. Store write functions take a required `Writer` (`{ agentId }` or `{ userId }`).
5. Tables: stories, story_sources, story_tags, story_dates, story_panels, story_links, story_categories, story_entries, breaking_items, cfp_roundup_items, cfp_day_notes, morning_items. Not story_entry_sources or entry_tags (fixed with their entry), not categories.
6. Writer changes only when content changes. A story's last writer moves on any post that answers `updated`; nested rows each record their last changer.
7. Same content from another agent: `unchanged`, stored writer kept; different: 409. Another agent may re-post a story (5c enforces "own items only"; note on NEWS-265).
8. Private read-back: a private story and its entries answer only to the story's creator agent; a Breaking item pointing at a private story answers to that creator or the item's own writer. Others: 404. Unattributed private stories answer to no agent until claimed.
9. Agents: UUID id, unique name (case-insensitive), `--name` addresses. `list` prints id, name, enabled, created. `rotate` prints a new token once; old stops at once. `disable` is final (no enable); `rotate` does not re-enable. Read-backs add `writtenBy` (`{agent}`/`{user}`/null), and `createdBy` on stories (top level only).

## Tasks

1. Schema v5: `agents` table, writer columns and checks (DO-block loop), index on stories(created_by_agent_id); `DASHBOARD_SCHEMA_VERSION` 5; hash in `SCHEMA_HASHES`; schemaV5 test.
2. `writer.ts` (Writer type, params, read helper); `agentStore.ts` (create, list, find by name / hash, disable, set hash, claim unattributed); writer threaded through dashboardStore, storyDetailStore, ingestStore, parse.ts. Tests: test agent helper, all existing call sites pass `TEST_WRITER`, new store tests for writer recording, unchanged-keeps-writer, story last writer, claim.
3. `agentToken.ts`; `openIngest` without INGEST_TOKEN (warning); route auth by agent lookup, `writer` passed to puts, read-back scoped and carrying writtenBy/createdBy. Route tests rewritten on real agent tokens: disabled/unknown/malformed 401, private read-back per agent.
4. `npm run agents` CLI (add/list/disable/rotate, `--claim-unattributed`), with tests; added to the test script.
5. Docs: INGEST.md (setup, auth, re-issue steps, read-back fields, Decided list), DECISIONS (new entry naming what it supersedes), ROADMAP row 5a Done, PRODUCT_SPEC scenarios, WHATS_NEW, `.env.example`, env-example test.
6. Verify: typecheck, server tests on local Postgres, test:kite; one fresh sub-agent review; PR.

## Ledger

- 2026-11-26 09:05 ET: plan written; NEWS-263 In Progress; branch `feat/news-263-agent-tokens` from `7da6e2b`.
- Tasks 1–5 built inline. Server tests 1,307 pass (1 skip: root ignores dir permissions, env-only), typecheck clean, test:kite 160 pass.
- Ruling: store write functions take the writer as the second argument (`fn(pool, writer, input)`) — one mechanical change at every call site — rework only if Phil prefers it inside the input object.
- Ruling: records stay content-only; writers are read separately for the read-back, so fixed-item comparisons ignore the writer — matches answer 7 — none.
- Ruling: read-backs show `writtenBy` / `createdBy` at the top level only; nested rows keep their writer in the database — keeps the read-back small — a later ticket can add nested writers.
- Ruling: the route checks token shape, then the database is configured (503), then the schema, then the agent lookup, then reads the body — the body is never read before auth — none.
- Final review (one fresh sub-agent): 1 Critical (another agent could clear a private story's owner and read it), 1 Important (changing an unclaimed story hit the creator check, 422), 4 Minor (DECISIONS command path, "it wrote" wording, empty INGEST_TOKEN warning, test gaps).
- Phil's answers 2026-11-26 09:30 ET: private story writes are its creator's only (409 "id is taken" for a re-post; 422 missing for entries and Breaking items); changing an unclaimed story is 409 "claim first".
- Ruling: added `agents claim --name` so "claim first" works after a plain `add` — without it, unclaimed rows could never be claimed — small CLI addition.
- All findings fixed with tests. Note: a scripted edit dropped six route tests mid-fix; caught by a per-file test-count check against main and restored.
