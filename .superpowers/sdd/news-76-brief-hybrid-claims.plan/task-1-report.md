# Task 1 Report

## Status

DONE

## Scope Delivered

Implemented the Task 1 server-only NEWS-76 slice:

- Added `BriefClaimItem` / `BriefClaimVerbiage` types and a public accepted-claims feed builder in `mvp/server/src/services/briefClaims.ts`
- Added `claim-enrichments.json` persistence via `mvp/server/src/store/claimEnrichmentStore.ts`
- Added claim-focused Ollama verbiage generation in `mvp/server/src/services/ollamaClaimVerbiage.ts`
- Added accepted-only batch enrichment in `mvp/server/src/services/enrichClaims.ts`
- Wired public `GET /api/batches/:batchId/claims` in `mvp/server/src/services/kiteBriefRoutes.ts`
- Wired session `POST /api/claims/enrich` in `mvp/server/src/app.ts`
- Registered and added focused tests for the new store, feed builder, Ollama verbiage, enrichment batch, and route/auth behavior

## Key Behavioral Notes

- Brief claims source is `ClaimMembership.acceptedClaimIds` only
- Muted accepted claims are excluded from the public Brief claims feed without removing membership
- Feed items sort by `createdAt` descending
- Linked headlines reuse the existing evidence-to-article resolution pattern and are capped at 8
- Verbiage is stored separately in `claim-enrichments.json` and never overwrites claim status or evidence-derived fields
- `POST /api/claims/enrich` only enriches accepted claims, skips non-accepted ids, and is idempotent unless `force` is set

## Tests Added / Updated

- `mvp/server/src/store/claimEnrichmentStore.test.ts`
- `mvp/server/src/services/briefClaims.test.ts`
- `mvp/server/src/services/ollamaClaimVerbiage.test.ts`
- `mvp/server/src/services/enrichClaims.test.ts`
- `mvp/server/src/app.test.ts`
- `mvp/server/package.json` test script registration

## Verification

Focused verification:

```sh
node --import tsx --test src/store/claimEnrichmentStore.test.ts src/services/briefClaims.test.ts src/services/ollamaClaimVerbiage.test.ts src/services/enrichClaims.test.ts src/app.test.ts
```

Package verification:

```sh
npm test
npm run typecheck
```

All passed.

## Self Review

- The claims feed, enrichment store, and session enrich route all follow existing `mvp/server` dependency-injection and batch-enrichment patterns
- The public claims route is mounted alongside the existing public brief routes and preserves `owned-latest` / `latest` handling
- Enrichment intentionally keeps muted claims enrichable if they remain accepted, because mute affects Brief visibility rather than membership
- No UI, docs, `_legacy`, Supabase, `mvp/.env`, or `mvp/data/*.json` changes were made

## Concerns

None at implementation time. The only notable behavior choice is that muted accepted claims can still be enriched through the accepted-membership route, which matches the membership-vs-visibility split described in the plan.
