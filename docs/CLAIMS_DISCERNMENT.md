# Claims desk — discernment checklist

Operator and agent design conscience for Epic **J** ([NEWS-69](https://informedcrew.atlassian.net/browse/NEWS-69)). Secular product language only — **not** UI labels, schema enums, or theological branding.

Inspired by Wesleyan Quadrilateral discernment (primary text / tradition / reason / experience) as a **four-lens weigh-in**, not a truth engine.

## Four lenses (every claim)

| Lens | Ask | Desk meaning |
|------|-----|----------------|
| **Primary text** | What do elevated primary sources say? | Official releases, filings, first-party records — *prima* among witnesses, not infallible |
| **Durable method** | How has this *kind* of claim been handled before? | Institutional practice, serious-desk norms — not “what cable always says” |
| **Reason** | Does coherence and calibrated judgment hold? | TypeSafe atomic questions + confidence; status derived in **code** — not vibe or prose. Module: `mvp/server/src/services/typesafeClaimQuestions.ts` (NEWS-71) |
| **Experience** | What do sensors / field / first-person add? | Real but fallible; must be disciplined by the other three |

## Rules of thumb

- Software **assembles witnesses**; humans **Accept / review** (`needs_review` when confidence is low). `POST /api/claims/extract` ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)) enqueues low-confidence claims to `claim-review-queue.json`; the claim inbox is live on `/radar` ([NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74)).
- **Needs review exit ([NEWS-78](https://informedcrew.atlassian.net/browse/NEWS-78)):** Operators can leave the queue without accepting — **Mark reviewed** / **Mark all reviewed** on `/radar` dequeue `claim-review-queue.json` only (no hard-delete of claims, evidence, or enrichments). **Accept** also auto-dequeues. Re-entry is allowed if a later extract enqueues again; **Mute** is the permanent ignore path. Bulk clear respects the same mute filter as the visible Needs review list — hidden muted rows stay queued until unmuted or individually cleared. Extract spend gating for muted/low-value articles is [NEWS-79](https://informedcrew.atlassian.net/browse/NEWS-79) (follow-up, out of scope here).
- **Accept / Track on `/radar`** ([NEWS-75](https://informedcrew.atlassian.net/browse/NEWS-75)): Accept marks operator interest (membership on `claimId`); Track watches for new evidence / stance changes. Accept default-tracks; Unaccept does not auto-untrack. **Accept ≠ truth** — it is desk workflow, not a verdict. Brief `/` leads with accepted claims + linked headlines ([NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)); Unaccept on Brief, Accept on Radar.
- **Mute is shared** with the story desk: one `mute-rules.json` + `/api/brief/mutes` CRUD; `claimMatchesMute` hides matching claims from the claim inbox. No per-claimId mute list in v1.
- Echoing ten outlets is **not** durable method and **not** reason — cluster size ≠ confidence.
- No single lens gets a truth seal. UI speaks **status + evidence** (`reported`, `supported_by_primary`, `contested`, `insufficient_evidence`) — never Verified badges or claim verdicts.
- Ollama may propose candidates ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)) and write **Brief claim verbiage only** (`short_summary`, `talking_points` via `POST /api/claims/enrich` — accepted claims; [NEWS-76](https://informedcrew.atlassian.net/browse/NEWS-76)). Verbiage is AI-assisted copy marked “not ground truth”; it never overwrites code-derived `Claim.status` or evidence scores.
- **Source tier ([NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)):** Radar feeds, persisted articles, and evidence links carry `sourceTier` (`primary` \| `sensor`) stamped at ingest/extract — primaries are preferred evidence witnesses; sensors are proposal fuel.

## Related

- Plan: [`.cursor/plans/claims_evidence_spine_8f4cde15.plan.md`](../.cursor/plans/claims_evidence_spine_8f4cde15.plan.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Story desk (still live): [OWNED_BRIEF.md](OWNED_BRIEF.md)
