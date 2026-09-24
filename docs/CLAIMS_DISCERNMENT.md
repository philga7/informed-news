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

- Software **assembles witnesses**; humans **Accept / review** (`needs_review` when confidence is low). `POST /api/claims/extract` ([NEWS-72](https://informedcrew.atlassian.net/browse/NEWS-72)) enqueues low-confidence claims to `claim-review-queue.json`; Radar inbox UI is [NEWS-74](https://informedcrew.atlassian.net/browse/NEWS-74).
- Echoing ten outlets is **not** durable method and **not** reason — cluster size ≠ confidence.
- No single lens gets a truth seal. UI speaks **status + evidence** (`reported`, `supported_by_primary`, `contested`, `insufficient_evidence`) — never Verified badges or claim verdicts.
- Ollama may propose candidates and write Brief verbiage; it is **not** judgment-of-record.
- **Source tier ([NEWS-73](https://informedcrew.atlassian.net/browse/NEWS-73)):** Radar feeds, persisted articles, and evidence links carry `sourceTier` (`primary` \| `sensor`) stamped at ingest/extract — primaries are preferred evidence witnesses; sensors are proposal fuel.

## Related

- Plan: [`.cursor/plans/claims_evidence_spine_8f4cde15.plan.md`](../.cursor/plans/claims_evidence_spine_8f4cde15.plan.md)
- Roadmap: [ROADMAP.md](ROADMAP.md)
- Story desk (still live): [OWNED_BRIEF.md](OWNED_BRIEF.md)
