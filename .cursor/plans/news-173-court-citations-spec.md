# NEWS-173 spec — court-record checks

Binding spec for the plan `.cursor/plans/news-173-court-citations.plan.md`. Grill answers below were **Recommended, adopted (Phil can override in review)**. Phil is not live in this run. Informed-brain MCP is **skipped, not approved**.

Ticket: [NEWS-173](https://informedcrew.atlassian.net/browse/NEWS-173). Parent work: NEWS-172 (Done, PR #210). Approach: SDD. The controller plans and reviews only and writes no task code.

## Acceptance

- Reporter citations in the NEWS-172 display scope are resolved through CourtListener citation lookup. Unresolved ones are marked **Unverified**.
- A CourtListener or RECAP docket URL keeps the original link and gains the CourtListener record beside it.
- A dismissal on procedure (standing, timing, jurisdiction) is flagged and never treated as refuting a claim. The claim stays **Unconfirmed**.
- `COURTLISTENER_API_TOKEN` lives in server env only, never in the repo, logs, errors, or payloads. Documented rate limits are respected with one backoff. No token → skip the network and mark **Unverified**.
- Tests use recorded fixtures. No live CourtListener call in tests or CI.
- NEWS-172 review gaps G1–G4 in the plan are fixed in this same change, failing-test first.

## Grill (binding)

1. **Hook:** extend the NEWS-172 contract. Add court fields on `CitationCheckItem`. Replace `courtResolver.ts` through the existing registry. `court` was reserved for this (DECISIONS 2026-10-27 item 9).
2. **What counts:** reporter cites and CourtListener/RECAP docket, recap, and opinion URLs only. Bare case names are not citations.
3. **Where from:** the same display scope NEWS-172 already checks (pull quote, perspectives, talking points, timeline, card summaries, living-update notes). Not source bodies.
4. **Unresolved:** `missing-source` → display **unverified**. One reader-facing rule with links and quotes.
5. **Procedural:** advisory `procedural: true` on the log entry. No new terminal status. Reader copy: “Dismissed on procedure, not on the merits”. Never a refuting source.
6. **Fetched source:** a resolved opinion or docket is registered into the per-run source store under its CourtListener URL so existing URL and claim checks see it. A procedural source still does not satisfy a claim.
7. **Docket links:** keep the original link. Add the CourtListener record beside it. Do not rewrite the publisher’s href.
8. **Token:** `COURTLISTENER_API_TOKEN` in `mvp/.env` (example only in `mvp/.env.example`). Without it, skip and mark Unverified. One citation-lookup POST per article for reporter cites. Respect the documented limits (60 valid citations/minute, 250 citations/request, 64,000 characters, HTTP 429 with `wait_until` or the documented typo `wait_util`).
9. **Cache:** gitignored `mvp/data/citation-court-cache.json`, keyed by normalized cite or docket URL, 7-day retention, same JSON write helper as the other citation stores.
10. **Network failure:** mark **Unverified**, `console.warn`, never block a refresh, never return an empty list that leaves items unmarked.
11. **Fold in:** NEWS-172 follow-ups T1, T3, T5, T6, T7 (plan Task 1). T2 mark-detail expander ships in Task 5. T4 wider Google News hosts is **not** this PR. T8: delete the `curl | bash` bun fallback and fail with a clear “install bun 1.4.3” message.

## Not this PR

NEWS-168, NEWS-169, NEWS-179, NEWS-176, NEWS-177, NEWS-178, NEWS-180, NEWS-175, T4 (Google News hosts), informed-brain MCP.
