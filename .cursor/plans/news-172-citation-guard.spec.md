# NEWS-172 — Citation guard (short spec)

Clean-room. Inspired by CaseCite (Elastic License 2.0) — do **not** open, copy, port, or paraphrase CaseCite code, tests, or prompts. Build from this spec, the ticket acceptance criteria, and this repo only.

**Ticket:** [NEWS-172](https://informedcrew.atlassian.net/browse/NEWS-172)  
**Approach:** SDD. Controller plans and reviews only; every task is dispatched to an implementer subagent (NEWS-179 lesson).  
**Follow-up (not this PR):** NEWS-173 court checks.

## Goal

Before Brief or story-update content is shown as backed by sources, every outbound link, quoted line, and link-backed claim is checked against sources registered for that run. Unmatched items never appear as fact: they are marked **unverified** (links/quotes) or **unconfirmed** (claims that would have been “debunked” without a refuting source). Checks never block a refresh.

## Binding grill answers (Phil, 2026-10-27)

1. **Fetched that run:** Same-hash stored text counts if this run registers it into the per-run source store. No re-HTTP scrape solely for the guard.
2. **Source definition:** Kept scraped body, duplicate-cluster member bodies, RSS/body text when that is what we have, and saved post text that is article content. An unresolved Google News URL is **not** a source.
3. **Unmatched links and quotes:** One rule — keep and mark **unverified**; never present as fact. Do not silently drop.
4. **Debunked:** No new badge. Without a linked refuting source among fetched sources, show **unconfirmed**. Transparency’s “no verified / false badge” stands.
5. **Scope now:** Pull quote, perspectives, talking points, timeline, card summaries, living-update notes. Not: parked claims-desk UI, Transparency copy, Topics form fields.
6. **Quote normalization:** Whitespace + curly/straight quote marks only. Case-sensitive. Ellipses and `[bracketed]` insertions are not normalized. Match against full stored source text (model 3k window is irrelevant to checks).
7. **Per-run source store:** New gitignored file under `mvp/data/` via the shared JSON write helper. Retention **7 days** (align with Brief full-story / summary cache).
8. **Check log:** Persist under `mvp/data/`, keyed by story/article id; survives restart; old stories without a log still load. Fold match status into Brief / full-story payloads. Brief UI: unverified / unconfirmed marks only. Screen reader: polite advisory (“unverified link”, “unverified quote”, “unconfirmed”).
9. **NEWS-173 hook:** Citation `kind` on each checked item (`url` | `quote` | `claim`, reserve `court`) + resolver registry (kind → check). Source records: `url`, `text`, `fetchedAt`/`runId`, `contentHash`. Shared terminal states: `match` | `mismatch` | `missing-source` (display: unverified / unconfirmed as above).
10. **When:** Both refresh and on-demand generation. Failed checks mark items and continue — never block a refresh.

## Acceptance (from ticket + grill)

- Fetched source text is stored per run; survives restart; pruned on the 7-day schedule; no secrets or raw data in git.
- Every outbound link on a card or full story maps to a source in the store; unmatched → unverified; unresolved GN link → missing-source / unverified.
- Quotes: exact match after whitespace/quote-mark normalize passes; one-word change fails; paraphrase-as-quote fails; no fetched source fails. Never shown as fact.
- Refuted/debunked without linked refuting source among fetched sources → **unconfirmed**. No verified/false/debunked badge.
- Each check writes match / mismatch / missing-source per item; log survives restart; stories without a log still load.
- Unverified mark on the right items, keyboard-reachable, screen reader advisory; e2e covers match, mismatch, missing source, paraphrase-as-quote.
- Recorded fixtures only — no live network in tests or CI.

## Docs / ship extras (same PR)

- Update `docs/BRIEF.md`, `docs/TRIAGE.md`, `docs/DECISIONS.md` (dated grill entry), `docs/ROADMAP.md`, `AGENTS.md` Current next → NEWS-173.
- PRODUCT_SPEC catch-up for NEWS-167 Approved/Filtered/All + NEWS-172 unverified/unconfirmed.
- WHATS_NEW: replace bogus 2026-10-27 “No user-visible change” with toggle entry; add NEWS-172 entry.
- Lean `.cursor/environment.json` if missing (idempotent install skipping when lockfile hash unchanged).
- VISION unchanged unless direction shifts (expected: no change).
