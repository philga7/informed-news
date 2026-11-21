# NEWS-254 — Users and read markers (UI build sequence step 3)

Spec: Jira NEWS-254 (scope, acceptance, Phil's answers of 2026-11-20). Background: `docs/DECISIONS.md` 2026-11-16 entries (multi-user accounts; per-user follow/hide and private stories, NEWS-252), data model proposal ticket 3 and "Added Nov 16".

Approach: SDD, inline in a Claude session; one fresh sub-agent reviews the whole branch before the PR opens. Ledger: `.superpowers/sdd/<plan>/progress.md` (git-ignored), per the `subagent-driven-development` skill. Delete this plan on the branch before merge.

## Global constraints

- App code calls the Postgres store; SQL lives only in `mvp/server/src/store/postgres/`.
- Fixed values lowercase, in `vocabulary.ts` and in `CHECK` constraints.
- Times are `timestamptz`, inputs must carry a zone (`asInstant`).
- `schema.sql` stays idempotent and applies over a schema v2 database; the new statements go at the end.
- Test-only env reads stay in `*.test.ts`; every env var a non-test file reads is listed in `mvp/.env.example`.
- New test files are added to the `test` script in `mvp/server/package.json`.
- No `.github/workflows`, no UI screens, no `AGENTS.md`/`CLAUDE.md` edits.
- Without Postgres configured (`POSTGRES_PASSWORD` unset) the server starts and sign-in behaves as today.

## Phil's answers (2026-11-20)

1. Login takes email + password against `users`. A password-only request is checked against `MVP_PASSWORD(_HASH)` and signs in as the account named by `OPERATOR_EMAIL`, until the new sign-in screen ships.
2. Accounts are made with an operator CLI script (add, list, disable, set password).
3. `read_up_to` is a UTC time and only moves forward. Stories key by story id; CFP and Weather are one tracker each per user. `last_opened_at` too.
4. Only hubs may be private for now; a branch under a private hub is refused.

## Tasks

### Task 1 — Schema and version row
- Append to `schema.sql`: `users` (id, email, password_hash, display_name, created_at, disabled_at; unique index on `lower(email)`), `stories.owner_user_id` (FK users, nullable; CHECK branch ⇒ no owner), `read_markers` (user_id, tracker_kind story|cfp|weather, tracker_id FK stories nullable, read_up_to, last_opened_at; CHECK story ⇔ tracker_id; `UNIQUE NULLS NOT DISTINCT (user_id, tracker_kind, tracker_id)`), `user_follows` (user_id, story_id FK nullable, topic_id nullable, state follow|hide, updated_at; exactly one subject; `UNIQUE NULLS NOT DISTINCT (user_id, story_id, topic_id)`), and last `dashboard_schema_version` (single row, `version int`).
- `ensureDashboardSchema`: done when the version row is ≥ `DASHBOARD_SCHEMA_VERSION` (3); otherwise apply `schema.sql` and upsert the row, in one transaction under the advisory lock. Replace `SCHEMA_LAST_TABLE` and its test with a test that the version table is the file's last statement.
- `vocabulary.ts`: tracker kinds, follow states.
- Tests: empty DB, over v2 DB, second apply changes nothing, version row = 3.

### Task 2 — Store functions
- `userStore.ts`: createUser, readUser, findUserByEmail (case-insensitive), listUsers, disableUser, setUserPasswordHash. Email trimmed and lowercased; duplicate → `DashboardStoreError`.
- `readMarkerStore.ts`: markRead (forward-only via GREATEST), markOpened, readMarkers(user). Story kind needs a story id; CFP/Weather refuse one.
- `followStore.ts`: setFollowState, clearFollowState, listFollowStates(user).
- `dashboardStore.ts`: `ownerUserId` on story input/record; createStory refuses an owner on a branch and a branch whose hub has an owner (hub row locked `FOR SHARE`).
- Tests for each against the test database.

### Task 3 — Accounts and sign-in
- `auth/accounts.ts`: an `Accounts` interface (verify email+password with constant-ish timing, resolve operator by email, check a user is active) built on the store and bcrypt; `hashPassword`.
- `auth/routes.ts`: `/login` takes `{email, password}` (accounts on) or `{password}` (MVP fallback; operator user id when `OPERATOR_EMAIL` is set and accounts are on). Same 401 for unknown email and wrong password; 503 for email login when accounts are off. `GET /api/me`. Session stores `userId`.
- `auth/session.ts` / `requireApiSession`: when the session has a user id and accounts are on, an inactive user is signed out (401).
- `createApp` takes `accounts?`; `index.ts` opens the pool and runs `ensureDashboardSchema` when Postgres is configured, else logs that accounts are off.
- `mvp/.env.example`: `OPERATOR_EMAIL`.
- Route tests with a fake `Accounts`, plus one integration test with the real store.

### Task 4 — Operator CLI
- `src/cli/usersCli.ts` (testable: injected pool and output) and `src/cli/users.ts` entry; `npm run users --prefix mvp/server -- <add|list|disable|set-password> …`. A new password is generated and printed once unless `--password-stdin` is given.
- Tests for each command.

### Task 5 — Docs
- `docs/DECISIONS.md` new entry (2026-11-20) for the sign-in cut-over and answers 1–4, naming the part of the 2026-11-16 multi-user entry it supersedes.
- `docs/ROADMAP.md` row 3 → NEWS-254, **Done**.
- `docs/PRODUCT_SPEC.md` Sign in; `docs/WHATS_NEW.md` entry.
- Run `npm run test:kite`.

### Task 6 — Verify and review
- typecheck, `npm test`, `test:kite`, shell unit + check. One fresh sub-agent reviews the whole branch; resolve findings.
