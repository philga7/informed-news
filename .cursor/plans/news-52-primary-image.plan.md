# NEWS-52 — Map scraped images into primary_image

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (this session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When publisher scrape finds an image URL (og/twitter), persist it on the article and map it to owned-brief `primary_image` (and article `image`) so Kite’s Primary image section can render; hide cleanly when absent.

**Architecture:** Extend `publisherBodyScrape` to extract image meta alongside title/body → store on `Article` → `kiteBriefAdapter` picks a cluster primary image. Soft-slip OK for live scrape coverage; fixture guarantees demo/e2e without depending on flaky og tags.

**Tech Stack:** cheerio scrape (`mvp/server`), flat JSON articles store, Kite Brief dig UI (already gates `primaryImage` on `primary_image` / `articles[].image`).

**Spec / ticket:** [NEWS-52](https://informedcrew.atlassian.net/browse/NEWS-52) (Epic H / NEWS-48). Soft-slip OK if live coverage weak — do not block Epic H Done on flaky images; document if needed.

## Global Constraints

- Prefer Informed News glue (`mvp/server` + thin adapter); do not rewrite Kite StoryImage upstream.
- Soft-slip: live og coverage may be sparse; empty-store **fixture must include** a sample image so Brief demo/e2e work.
- No image CDN; no secondary collage / hero redesign.
- No broken UI when image missing (omit fields; section stays hidden).
- If surfacing caption/credit: brief attribution/license honesty in OWNED_BRIEF (credit is publisher/domain attribution, not a rights grant).
- Out of scope: NEWS-53, CDN, collage.

---

### Task 1: Extract + persist image URL from publisher scrape

**Files:**
- Modify: `mvp/server/src/types/article.ts`
- Modify: `mvp/server/src/store/migrateArticle.ts`
- Modify: `mvp/server/src/services/publisherBodyScrape.ts`
- Modify: `mvp/server/src/services/publisherBodyScrape.test.ts`
- Modify: `mvp/server/src/services/cfpFetch.ts` (wire new fields onto Article)
- Modify: `mvp/server/src/store/mergeArticleOnUpsert.ts` (preserve image fields appropriately on upsert)
- Check/update: xcancel path (leave `imageUrl: null` — tweets rarely have og scrape)
- Modify: any Article factory helpers / fixtures that must satisfy the type

- [ ] **Step 1: Article fields**

Add to `Article`:

```typescript
/** Absolute image URL from publisher og/twitter meta when scraped; null if none. */
imageUrl: string | null;
/** Optional caption from og:image:alt / twitter:image:alt when present. */
imageCaption: string | null;
/** Optional credit string (e.g. site name); not a license grant. */
imageCredit: string | null;
```

Migrate in `migrateArticle`: missing → `null`.

- [ ] **Step 2: Extract from HTML**

In `publisherBodyScrape.ts`, extend `PublisherBodyResult` with the three image fields.

Extract order for URL:
1. `meta[property="og:image"]` content
2. else `meta[name="twitter:image"]` / `twitter:image:src`
3. Resolve relative URLs against the page URL when available; for pure HTML extract helper, accept optional `baseUrl` param or resolve only absolute http(s) URLs (drop relative without base).

Caption: `og:image:alt` or `twitter:image:alt` if present.
Credit: hostname of publisher URL / page when image found (simple); else null.

Image extraction must work even when bodyStatus is unavailable/blocked if meta tags exist (optional but preferred: still return image fields on non-ok body).

- [ ] **Step 3: Wire fetch**

`cfpFetch` copies `imageUrl` / `imageCaption` / `imageCredit` from scrape result onto new articles.
`mergeArticleOnUpsert`: when incoming has non-null `imageUrl`, prefer it; when refetch clears body, follow existing framing-clear patterns but do not invent images — preserve existing image if incoming is null and content unchanged (mirror how other scraped fields behave; document choice in report).

- [ ] **Step 4: Tests**

`publisherBodyScrape.test.ts`: HTML with og:image → URL extracted; without → nulls; twitter fallback; relative URL dropped or resolved when base provided.

- [ ] **Step 5: Commit**

```bash
cd mvp/server && npm test && npm run typecheck
git commit -m "$(cat <<'EOF'
feat(news-52): scrape and store publisher og image URLs

EOF
)"
```

---

### Task 2: Adapter mapping, fixture image, OWNED_BRIEF

**Files:**
- Modify: `mvp/server/src/services/kiteBriefAdapter.ts`
- Modify: `mvp/server/src/services/kiteBriefAdapter.test.ts`
- Modify: `docs/OWNED_BRIEF.md`
- Optional soft-slip note in OWNED_BRIEF if live coverage caveated

- [ ] **Step 1: Extend KiteBrief types**

On `KiteBriefStory` add optional:

```typescript
primary_image?: { url: string; caption: string; credit?: string; link?: string };
```

On `KiteBriefArticle` add optional `image?: string`.

- [ ] **Step 2: Map in `articlesToKiteStories`**

For each cluster member with `imageUrl`, set `articles[].image = imageUrl`.
Pick `primary_image` from the first member (newest-first order already used) that has `imageUrl`:
- `url` = imageUrl
- `caption` = imageCaption?.trim() || publisherTitle || title || ''
- `credit` = imageCredit || publisherDomain || undefined
- `link` = publisherUrl || canonicalUrl

Omit `primary_image` when no member has an image (do not emit empty object).

- [ ] **Step 3: Fixture**

Empty-store fixture: set `imageUrl` on the primary fixture article to a stable public placeholder HTTPS image (e.g. `https://picsum.photos/seed/owned-brief-fixture/800/450` or a known example.com-style URL that won’t break layout — prefer a real https URL that e2e can assert is present in JSON; broken load in UI is OK if section still shows). Distinctive caption including `Owned brief fixture image`.

- [ ] **Step 4: Tests + docs**

Unit tests: with imageUrl → primary_image + article.image; without → omitted.
OWNED_BRIEF: document image mapping; note credit/caption are attribution hints not a license; note soft-slip — live stories may lack images until scrape finds og tags.

- [ ] **Step 5: Commit**

```bash
cd mvp/server && npm test && npm run typecheck
git commit -m "$(cat <<'EOF'
feat(news-52): map article images into owned brief primary_image

EOF
)"
```

---

### Task 3: E2E smoke for primary_image

**Files:**
- Modify: `e2e/kite-smoke.spec.ts`
- Optional: `mvp/SMOKE.md` one-liner if scrape/images mentioned

- [ ] **Step 1: API assert**

In owned-brief smoke: when any story has `primary_image?.url` or article `image`, assert at least one; if none, `test.skip` with reason (live store without scrape images). Fixture path (empty articles.json) must pass.

- [ ] **Step 2: Expand optional**

If easy: expand story and assert Primary image / img related UI — do not flake on external image CDN failures; asserting API payload is sufficient if UI assert is brittle.

- [ ] **Step 3: Commit**

```bash
npm run test:kite
# Prefer npm run test:e2e:kite with empty articles.json
git commit -m "$(cat <<'EOF'
test(news-52): e2e smoke for owned brief primary_image

EOF
)"
```

---

## Demo checklist (human)

1. Empty store → expand fixture → Primary image section visible (or payload has primary_image).
2. Live: fetch CFP item with og:image → article.imageUrl set → brief shows image; items without og hide section.
