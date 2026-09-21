# NEWS-58 — Radar UI at `/radar`

**Ticket:** [NEWS-58](https://informedcrew.atlassian.net/browse/NEWS-58)  
**Branch:** `feat/news-58-radar-ui`  
**Spec authority:** NEWS-58 description + [docs/ROUTE_MAP.md](../../docs/ROUTE_MAP.md) + [docs/ROADMAP.md](../../docs/ROADMAP.md) membership (Radar = CFP + curated RSS triage)

## Goal

Session-gated `/radar` in `apps/kite`: dense headline list from the owned article store (CFP + curated RSS only), grouped by existing `clusterId`. Footer link from Brief chrome. Update ROUTE_MAP. No Accept / Track / Mute (NEWS-65/59/60).

## Global Constraints

- Product path: `apps/kite` wrappers + `mvp/server` API glue. Do not rewrite upstream kite Brief cards for Radar.
- Auth: same `mvp_session` / `requireApiSession` as `/api/articles`. Honest empty + 401 → login UI on the page.
- Radar sources: **`cfp` + `rss` only** (exclude `xcancel`). Group by `clusterId` already assigned by `clusterArticles` on fetch — do not re-run clustering in the UI.
- Dense headlines — not full Brief story cards / expanders.
- NEWS-42: **no** Finance / Situation / Listen tabs or header links.
- No Accept control (NEWS-65). No Birdclaw/Telegram.
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/*.json`.
- Prefer existing Tailwind / Lufga / `bg-app-bg` tokens (match Transparency + Brief shell), not a new marketing aesthetic.

## Locked design rulings

| Topic | Ruling | Cost if wrong |
|-------|--------|----------------|
| API | New `GET /api/radar` behind session: filter `cfp`\|`rss`, group by `clusterId` (null → singleton group with synthetic key), sort clusters by newest `publishedAt`/`fetchedAt`, each item headline-only fields (`id`, `title`, `sourceKind`, `publisherDomain`, `publishedAt`, `canonicalUrl`, citation labels). | Extra endpoint vs filtering `/api/articles` client-side — thinner payloads and clear contract. |
| Cookie / ports | Proxy `POST /api/login`, `POST /api/logout`, `GET /api/radar` through Kite (`$lib/server/proxy`) so browser cookies stick to `:5173` and forward to `:3001`. Fix empty `apps/kite/src/routes/api/auth/+server.ts` by replacing with real `login`/`logout` routes (or implement that file). | Cross-origin credential dance if skipped. |
| Chrome link | Footer link next to Transparency (`Footer.svelte`) — not a product-layer tab in Header. | Users may miss it; Accept later can promote. |
| Unauth UX | `/radar` always loads; if API 401, show password form (MVP password) + short copy; on success refetch. | No separate `/login` route required for v1. |
| Empty store | Honest empty state: “No radar items yet — run Refresh / fetch on the API.” | |
| Visual | Dense stacked headlines with small source/domain + kind chip; cluster = one block with multiple lines when `clusterId` shared. No cards-in-cards. | |

### Response shape (verbatim contract)

```ts
type RadarHeadline = {
  id: string;
  title: string;
  sourceKind: 'cfp' | 'rss';
  publisherDomain: string | null;
  publishedAt: string | null;
  canonicalUrl: string;
  citationLabel: string | null; // first citation label if any
};

type RadarCluster = {
  clusterId: string; // existing id or `singleton:<articleId>`
  headlines: RadarHeadline[]; // ≥1, newest first within cluster
  newestAt: string | null;
};

type RadarResponse = {
  ok: true;
  clusters: RadarCluster[];
  meta: { lastFetchAt: string | null; lastError: string | null };
};
```

401: `{ ok: false, error: string }` (existing session middleware style).

---

## Task 1: `GET /api/radar` + unit tests

**Files:**

- Create `mvp/server/src/services/radarFeed.ts` — pure `buildRadarFeed(articles: Article[]): RadarCluster[]` (filter, group, sort).
- Create `mvp/server/src/services/radarFeed.test.ts`.
- Wire `GET /api/radar` in `mvp/server/src/index.ts` (after `requireApiSession`) reading store + meta.
- Export from `services/index.ts`; add test to `mvp/server/package.json` test script.

**Commit:** `feat(server): add session-gated radar feed API`

---

## Task 2: Kite API proxies for login + radar

**Files:**

- `apps/kite/src/routes/api/login/+server.ts` — `POST` proxy to `/login`
- `apps/kite/src/routes/api/logout/+server.ts` — `POST` proxy to `/logout`
- `apps/kite/src/routes/api/radar/+server.ts` — `GET` proxy to `/radar`
- Remove or replace broken `apps/kite/src/routes/api/auth/+server.ts` (empty import) so it does not break builds.

**Commit:** `feat(kite): proxy login and radar API to mvp/server`

---

## Task 3: `/radar` page UI

**Files:**

- `apps/kite/src/routes/radar/+page.svelte` — load clusters via `fetch('/api/radar', { credentials: 'include' })`; login form on 401; dense clustered headline list; empty + error states; link back to Brief `/`.
- Optional tiny helper `apps/kite/src/lib/radar.ts` for copy strings only if it keeps the page thin.

**Commit:** `feat(kite): add session-gated /radar triage UI`

---

## Task 4: Footer + ROUTE_MAP + shell tests

**Files:**

- `apps/kite/src/lib/components/Footer.svelte` — Radar link (`href="/radar"`) beside Transparency.
- `docs/ROUTE_MAP.md` — move `/radar` from Planned to Shipped; note session + CFP/RSS.
- `tests/nav-shell.test.js` — assert `/radar` route file exists, footer has `/radar`, still no finance/situation/listen; update ROUTE_MAP assertions as needed.
- Optional: one Playwright assertion in `e2e/kite-smoke.spec.ts` that `/radar` loads a login or empty/list shell (title contains Radar) — keep light.

**Commit:** `docs: ship /radar in route map and Brief footer`

---

## Out of scope

- Accept / Unaccept (NEWS-65)
- Track / Mute / alert badge (NEWS-59–61)
- Manual seeds (NEWS-66)
- Reworking Brief membership filter
- Finance / Situation / Listen chrome
