# Claims desk — discernment checklist

> **Parked (Epic L, NEWS-91).** The claims desk (Radar claim inbox, Needs review, Mark reviewed, Accept, Track, Brief claims lead) is off the default product path. Server APIs and stored claims remain; extraction runs only when called manually.

Operator and agent design conscience for Epic **J** ([NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)), kept as the binding discernment standard if the desk is ever revived. The default product is now the topic-driven Brief ([BRIEF.md](BRIEF.md)) with no review step. Secular product language only — **not** UI labels, schema enums, or theological branding.

Inspired by Wesleyan Quadrilateral discernment (primary text / tradition / reason / experience) as a **four-lens weigh-in**, not a truth engine.

## Four lenses (every claim)

| Lens | Ask | Desk meaning |
|------|-----|----------------|
| **Primary text** | What do elevated primary sources say? | Official releases, filings, first-party records — *prima* among witnesses, not infallible |
| **Durable method** | How has this *kind* of claim been handled before? | Institutional practice, serious-desk norms — not “what cable always says” |
| **Reason** | Does coherence and calibrated judgment hold? | TypeSafe atomic questions + confidence; status derived in **code** — not vibe or prose. Module: `mvp/server/src/services/typesafeClaimQuestions.ts` (NEWS-71) |
| **Experience** | What do sensors / field / first-person add? | Real but fallible; must be disciplined by the other three |

## Rules of thumb

The desk ran from Epic **J** until Epic **L** parked it ([NEWS-91](https://informedcrew.atlassian.net/browse/NEWS-91)). Items marked *(was)* describe the retired UI; the server behaviour behind them still exists.

- Software **assembles witnesses**; humans **Accept / review** (`needs_review` when confidence is low). `POST /api/claims/extract` ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)) enqueues low-confidence claims to `claim-review-queue.json`. *(was)* The claim inbox lived on `/radar` ([NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74)); `/radar` now redirects to `/topics`. Extract skips articles matching shared mute rules and spends batch `limit` on primary-tier sources first ([NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79)).
- **Needs review exit ([NEWS-78](https://informedcrew.atlassian.net/browse/NEWS-78)):** *(was)* **Mark reviewed** / **Mark all reviewed** dequeued `claim-review-queue.json` only (no hard-delete of claims, evidence, or enrichments), and **Accept** auto-dequeued. The endpoints (`POST /api/claims/review/dismiss`, `…/dismiss-all`) remain, with no UI. Re-entry is allowed if a later extract enqueues again; **Mute** is the permanent ignore path. Extract mute gating shipped in [NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79); low-value gating is not implemented.
- **Accept / Track** ([NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75)): *(was)* Accept marked operator interest (membership on `claimId`); Track watched for new evidence / stance changes. Accept default-tracked; Unaccept did not auto-untrack. **Accept ≠ truth** — it was desk workflow, not a verdict. The Brief once led with accepted claims + linked headlines ([NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)); that lead is gone. The `claim-membership.json` and `tracked-claims.json` stores and their `/api/claims/*` routes remain.
- **Mute is shared** with the topic Brief: one `mute-rules.json` + `/api/brief/mutes` CRUD; `claimMatchesMute` hides matching claims from claim feeds. No per-claimId mute list in v1.
- Echoing ten outlets is **not** durable method and **not** reason — cluster size ≠ confidence.
- No single lens gets a truth seal. Any claim surface speaks **status + evidence** (`reported`, `supported_by_primary`, `contested`, `insufficient_evidence`) — never Verified badges or claim verdicts.
- Ollama may propose candidates ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)) and write **claim verbiage only** (`short_summary`, `talking_points` via `POST /api/claims/enrich` — accepted claims; [NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)). Verbiage is AI-assisted copy marked “not ground truth”; it never overwrites code-derived `Claim.status` or evidence scores.
- **Source tier ([NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)):** curated feeds, persisted articles, and evidence links carry `sourceTier` (`primary` \| `sensor`) stamped at ingest/extract — primaries are preferred evidence witnesses; sensors are proposal fuel. Triage still uses the tier to prefer a primary source as a duplicate group's representative.

## Running claims manually

Claims extraction is **not** part of refresh (the timer, startup catch-up, Refresh button, and `POST /api/fetch` never call it). With a session cookie (see [MVP_API_COMPAT.md](MVP_API_COMPAT.md#demo-always) for `curl` login on the API port `:3001`), run it by hand:

- `POST /api/claims/extract` — body `{ limit?, force?, articleIds? }`. Ollama proposes candidates and TypeSafe judges them; claim status is derived in code. Without `articleIds` it skips topic-search rows; pass `articleIds` to extract from specific articles.
- `POST /api/claims/enrich` — optional body `{ claimIds?, force? }`. Writes Ollama verbiage for **accepted** claims to `claim-enrichments.json`.

Results are stored under `mvp/data/` (`claims.json`, `evidence-links.json`, and the other claim stores), but **no default UI shows them**: Kite has no Radar page and no Brief claims lead, and it no longer proxies the claims routes. Read them back from the API (`GET /api/claims/radar`). The TypeSafe / Ollama split above is still binding: TypeSafe is judgment-of-record, Ollama proposes candidates and writes verbiage only.

## Related

- Plan: [`.cursor/plans/claims_evidence_spine_8f4cde15.plan.md`](../.cursor/plans/claims_evidence_spine_8f4cde15.plan.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Topic Brief and the parked story / claims desks: [OWNED_BRIEF.md](OWNED_BRIEF.md)
