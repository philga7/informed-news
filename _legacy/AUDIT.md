# AUDIT.md — Informed News (read-only audit)

**Audit date:** 2026-08-10 (America/New_York) / 2026-08-11 UTC  
**Scope:** Entire repository. No code was fixed or refactored; this file is the only intended deliverable.

---

## Real Status Summary

Docs and phase summaries describe a finished two-tier OSINT platform with multi-source aggregation, AI tone/bias analysis, claims/corroboration, scan workflows, and more. What actually runs today: the **Express backend and Vite frontend start**, the **frontend production build succeeds**, and the **RSS parser can pull live headlines from Citizen Free Press and BBC** (including CFP → original-publisher URL resolution when `scrapeExternalUrl` is enabled). Almost everything else claimed as “working” is **unverified against a live system** because the configured Supabase project hostname does not resolve (`ENOTFOUND`), so the DB is dead for this environment. The configured Ollama Cloud API key returns **401 Unauthorized**, so tone/bias analysis cannot run. There are **no automated unit, integration, or e2e test suites** (`npm test` is missing in root and backend). README claims of RSS/API/email aggregation overstate reality: only **RSS + manual** ingestion are implemented; email is a pending plan; API source type is schema-only; Nitter HTML scraping is **explicitly disabled** in ingest routes. Bias/framing is an **LLM prompt prototype**, not a measured classifier. A genuine end-to-end demo (two live sources → classify → UI with citations) is **blocked** until database and AI credentials work.

---

## Test Results

### Automated suites

| Suite | Command | Result |
|-------|---------|--------|
| Root unit/integration/e2e | `npm test` | **No tests.** `npm error Missing script: "test"` |
| Backend unit/integration/e2e | `cd backend && npm test` | **No tests.** `npm error Missing script: "test"` |
| Test runner deps (vitest/jest/mocha/cypress/`@testing-library`) | repo search excluding `node_modules` | **None found** as project test infrastructure |
| `*.test.*` / `*.spec.*` files | glob | **0 files** |

**Verdict:** No automated test suites exist. Pass/fail/skip counts: **N/A — none exist.**

### Manual / script-only “tests” (not suites)

| Artifact | What it is | Executed? |
|----------|------------|-----------|
| `backend/test-ingestion.sh` | curl smoke script requiring live API + `ORGANIZATION_ID`/`SOURCE_ID` | Partially irrelevant: `/api/ingest/status` returned `degraded` / DB disconnected |
| `docs/TESTING_PLAN_6_OLLAMA.md`, `docs/PHASE_3_TESTING_GUIDE.md`, `supabase/PLAN_1_TESTING_GUIDE.md` | Manual checklists | Not executable suites; not run as automated tests |
| CI workflows (`.github/workflows/*.yml`) | Cron/dispatch jobs calling deployed ingest APIs | Not test suites; schedules commented out on RSS workflow |

### Related quality gates (executed)

| Check | Command | Result |
|-------|---------|--------|
| Frontend build | `npm run build` | **PASS** (Vite built in ~2.4s; chunk-size warning only) |
| Frontend typecheck | `npm run typecheck` | **FAIL** (exit 2) — 10 unused-symbol errors, all under `src/components/Xcom/*` and `xcomProfiles.service.ts` |
| Backend typecheck | `cd backend && npm run typecheck` | **PASS** (exit 0) |
| Backend build | `cd backend && npm run build` | **PASS** (exit 0) |
| ESLint | `npm run lint` | **FAIL** (exit 1) — **637 problems (594 errors, 43 warnings)** |
| Backend lint | `cd backend && npm run lint` | **No lint script** |

### Live runtime probes (executed)

| Probe | Result |
|-------|--------|
| `cd backend && npm run dev` | **Starts.** Logs: Ollama key present (model `gemini-3-flash-preview`); `http://localhost:3001` |
| `npm run client` (Vite) | **Starts.** `http://localhost:5173` → HTTP 200 |
| `GET /health` | `{"status":"ok",...}` |
| `GET /api/ingest/status` | `{"status":"degraded","database":"disconnected","error":"TypeError: fetch failed"}` |
| Supabase REST DNS | **FAIL** — `getaddrinfo ENOTFOUND fwiswypygzosanbgesgb.supabase.co` |
| Ollama Cloud (`ollama` SDK + `https://ollama.com/api/chat`) | **FAIL** — **401 Unauthorized** (key present, rejected) |
| Live RSS: `https://citizenfreepress.com/feed/` | **Works** — RSS 200; parser returned **1162** items |
| CFP + `scrapeExternalUrl: true` | **Works in isolation** — e.g. CFP page → `nytimes.com` / `substack.com` / `popularmechanics.com` |
| Live RSS: BBC | **Works** — **36** items |
| Env files present (values not logged) | Root `.env`: `VITE_*` set; `backend/.env`: `SUPABASE_*`, `OLLAMA_*`, `PORT` set |

**Required to run (from README / ENV docs):**  
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`; optional/required for AI: `OLLAMA_API_KEY`, `OLLAMA_MODEL`. Local files exist, but **Supabase project is unreachable** and **Ollama key is invalid**.

---

## Feature Verification Table

| Feature | Claimed Status | Actual Status | Evidence |
|---------|----------------|---------------|----------|
| Multi-source aggregation (RSS, APIs, email, manual) | README: working capability | **PARTIAL** | RSS + manual code paths exist. `source_type` allows `api`/`email`/`xcom` but **no ApiIngestionService / EmailIngestionService**. Email plan todos are still `pending`. Ingest routes reject non-RSS for `/api/ingest/rss`. |
| Citizen Free Press integration | Implied priority / comments in code & migrations | **PARTIAL** (parser-level CONFIRMED; product wiring UNVERIFIED) | Live feed works; `scrape_external_url` resolves original URLs. **No seeded CFP source** in migrations. End-to-end ingest into DB **blocked** (dead Supabase). |
| RSS feed ingestion | Plan 2 / backend README ✅ | **PARTIAL** | Code + live parse CONFIRMED offline from DB. Persist/dedupe/UI path UNVERIFIED (DB down). |
| API feed processing | backend README Plan 2 ✅ “RSS/API” | **UNVERIFIED / effectively stubbed** | Schema enum includes `api`; no API fetch implementation found. |
| Email ingestion | README lists email as source type | **PARTIAL** (not built) | `.cursor/plans/email_ingestion_system_*.plan.md` — all todos `pending`. |
| Manual input ingestion | Plan 2 | **UNVERIFIED** | `ManualInputService` exists; needs working DB to confirm. |
| Nitter / Twitter scraping ingestion | Code + plans | **PARTIAL / disabled** | `NitterScrapingService` exists (~365 LOC) but ingest throws: scraping **disabled for speed/safety**. |
| X.com profiles/lists UI | Routes under `/developing-news/...` | **PARTIAL** | Embed/timeline UI + services exist; typecheck errors in Xcom components; depends on DB. Not a substitute for RSS aggregation. |
| Bias/framing classifier | README AI tone/sentiment; Plan 6 “complete” | **PARTIAL** | LLM prompt `analyzeTone` returns `overallTone`, `biasSignals`, etc. **No rule-based classifier. No accuracy evals. Live call 401.** Frontend `src/utils/genAI.ts` still throws `"not yet implemented"`. |
| Citations / original-source links | Aggregator scrape feature | **PARTIAL** | With scrape on, `url` becomes publisher URL; CFP URL kept as `original_link` in `raw_metadata`. UI shows `record.url` + `formatSourceNameWithDomain` (“CFP (nytimes.com)”). Depends on source config + successful scrape; fragile HTML link picking. |
| Environmental Scan | README + Phase 8 ✅ Complete | **UNVERIFIED** | Components/routes exist (`/scan`); cannot exercise with dead DB. |
| Watch Items | README + Phase 5 | **UNVERIFIED** | Code present; DB required. |
| Indicators & Warnings | README + Phase 7 | **UNVERIFIED** | Code present; DB required. |
| Topics / question-driven IR | README | **UNVERIFIED** | Large UI (`TopicDetailPage` ~933 LOC); DB required. |
| Claims & corroboration | README + Phase 3 | **UNVERIFIED** | Services/UI exist; DB required. |
| Analyst dashboards (daily/weekly/monthly) | README + Phase 4 | **UNVERIFIED** | Components exist; DB required. |
| Feed hygiene | README + Phase 8 ✅ | **UNVERIFIED** | Backend aggregation queries exist; DB required. |
| Ollama AI analysis (summary/entities/tone) | Plan 6 ✅ Complete | **PARTIAL** | Implementation present (`ollamaService.ts` ~1507 LOC, `analysis.ts` ~2241 LOC). **Runtime: 401 Unauthorized.** |
| QA & audit trails | Plan 9 / README | **UNVERIFIED** | Routes/services exist; DB required. |
| Scheduler / automated ingest | backend README | **PARTIAL** | Code + GH workflow exist; RSS cron **commented out**; needs reachable API + DB. |
| Auth / multi-tenant orgs | README | **UNVERIFIED** | Supabase Auth wiring present; project DNS fails → login/data impossible here. |
| Two-tier intelligence model “complete” | Multiple PHASE_* docs ✅ | **UNVERIFIED** | Substantial UI/API surface compiled into frontend bundle, but not demonstrated live. |

---

## Product Vision Gap Analysis

### 1. Multi-source aggregation

**Vision:** Pull live headlines from multiple real sources, with citizenfreepress.com as a priority breaking-news source.

**Current state:**  
- **RSS path is real** and was exercised live for CFP (`/feed/`, 1162 items) and BBC (36 items).  
- CFP is treated as an **aggregator**: optional cheerio scrape of the first non-CFP `<a href>` to replace the stored URL with the publisher link. That path worked in a one-off `parseRSSFeed` run.  
- CFP is **not** a first-class built-in source (no seed). An operator must create an RSS source pointing at `https://citizenfreepress.com/feed/` and enable `scrape_external_url`.  
- **Email:** planned, not implemented. **API sources:** enum only. **Nitter:** implemented then disabled. **X.com:** mostly embeds/management UI, not the core aggregator pipeline.  
- **Persistence broken here:** Supabase project `fwiswypygzosanbgesgb` does not resolve.

**Distance from vision:** Medium for RSS+CFP mechanics; **large** for “multi-source product” because non-RSS channels are missing/stubbed and the live DB is dead.

### 2. Bias / framing classification

**Vision:** Surface bias/framing in reporting (citizen-journalist / OSINT use case).

**Current state:**  
- Only meaningful approach: **LLM-based tone analysis** via Ollama Cloud (`analyzeTone`), producing coarse labels (`neutral` / `opinion` / `propaganda` / `factual` / `sensational`) plus free-text `biasSignals`.  
- Confidence is model self-report multiplied by a crude source-reliability weight — **not calibrated accuracy**.  
- **No labeled dataset, no eval harness, no rule-based framing detector, no per-outlet bias model.**  
- Cannot measure reliability today: API **401**.  
- Orphaned frontend stub `genAI.ts` still says AI enhancement is unimplemented.

**Distance from vision:** **Large.** Prototype prompt exists; no trustworthy classifier product.

### 3. Citations

**Vision:** Preserve and surface original-source links per headline/story.

**Current state:**  
- Non-aggregator RSS: item `link` stored as `source_records.url` and linked in UI (`target="_blank"`).  
- Aggregator mode: scraped publisher URL becomes primary `url`; CFP page URL retained as `raw_metadata.rss_item.original_link` (not a first-class column). UI labels like `Citizen Free Press (reuters.com)` when scrape flag is on.  
- Risk: scrape picks **first external `<a>`**, which can be wrong (nav, ads, share widgets). Cloudflare sits in front of CFP.  
- Full article body extraction is **disabled during ingestion** (feed snippet only); richer citation context depends on later enrichment.

**Distance from vision:** **Small–medium** for “show a clickable URL”; medium for “always the correct original citation with aggregator provenance clearly dual-linked in UI.”

---

## Blockers to MVP

Goal: one real demo — pull headlines from ≥2 live sources (including CFP if wired), run existing bias/framing logic, display results with visible source citations, **no mocked steps**.

1. **Restore a reachable Supabase project and update env** — Current `SUPABASE_URL` host `ENOTFOUND`. Without DB: no sources, records, auth, or UI data. **Effort: M** (ops/config; possibly L if schema must be re-applied from `supabase/migrations/`).

2. **Fix or replace Ollama Cloud credentials / model access** — Key present but **401**. Tone/bias step cannot run. Confirm billing/model (`gemini-3-flash-preview` vs docs’ `gpt-oss:120b`). **Effort: S–M**.

3. **Create at least two enabled RSS sources in DB** — e.g. CFP (`https://citizenfreepress.com/feed/`, `scrape_external_url=true`) + BBC (or similar). Not seeded today. **Effort: S**.

4. **Run real ingest end-to-end and confirm records in UI** — `POST /api/ingest/rss` (or `/rss/all`) → Source Records / Scan pages showing titles + outbound links. Verify scrape quality on a sample of CFP items. **Effort: S–M**.

5. **Run tone analysis on ingested records and show artifacts in UI** — Source record detail “Analyze Tone” → `ArtifactCard` with bias signals. Accept that this is LLM prototype output, not measured accuracy. **Effort: S** after (2)+(4).

6. **(Optional but demo-hardening) Dual citation in UI** — Surface both aggregator page and publisher URL when both exist (`original_link` today is easy to miss in metadata). **Effort: S**.

Until (1)–(5) succeed on a live stack, any “demo” that looks complete is either stale screenshots or mocked data.

---

## Everything Else (non-blocking)

### Complexity hotspots

| Area | Approx. size | Note |
|------|--------------|------|
| `backend/src/routes/analysis.ts` | ~2241 LOC | God-route for AI features |
| `backend/src/services/ollamaService.ts` | ~1507 LOC | Many analysis modes in one service |
| `src/components/Topics/TopicDetailPage.tsx` | ~933 LOC | Large page component |
| `backend/src/routes/ingest.ts` | ~717 LOC | RSS/manual/Nitter branching |
| `backend/src/services/feedFetcher.ts` | ~406 LOC | RSS + scrape + redirect helpers |
| Frontend ESLint | 594 errors | Indicates accumulated type/`any` debt |

### Dead / orphaned / oversold code

- **`NitterScrapingService`**: implemented but ingest path throws “disabled”.  
- **`src/utils/genAI.ts`**: explicit placeholders throwing “not yet implemented” while backend AI exists separately.  
- **Email / API source types**: accepted in API validation; no ingestion implementations.  
- **Email plan**: fully pending.  
- **Backend README Plan 2 “RSS/API”**: API half is not real.  
- **Phase docs marked ✅ Complete**: code likely landed historically, but **this audit could not confirm runtime** due to dead DB — treat “complete” as **documentation claim**, not verified production health.  
- **X.com components**: typecheck failures (unused vars) — incomplete cleanup.

### Scraping / rate-limit fragility

- **CFP**: Cloudflare; WordPress RSS currently open; HTML scrape of article pages is brittle (first external link heuristic). Large feed (1000+ items) → slow ingest if scrape enabled for every item (observed full scrape parse ~10s+ just for resolution work).  
- **Nitter**: inherently unstable (instances die, bot detection); Playwright plans acknowledge Cloudflare/fingerprint issues; currently disabled anyway.  
- **X.com embeds**: third-party widget/`widgets.js` dependency; scraping plans exist under `.cursor/plans/` with rate-limit designs — not the audited happy path.  
- **RSS format drift**: mitigated somewhat (HTML→feed discovery, ampersand preprocess) but still fragile per-publisher.  
- **Full content extraction**: intentionally off at ingest; AI-on-snippet will be weaker than full-article framing analysis.

### Security / config notes

- **CRITICAL: OpenSSH private key tracked in git** — files `informed_news` and `informed_news.pub` are committed and **not** in `.gitignore`. Treat the private key as **compromised**; rotate/revoke any host access it unlocked; remove from history if this repo is or was shared.  
- **`.env` / `backend/.env`**: gitignored (good). Present locally with real-looking secrets; **do not commit**. No root `.env.example` found (only `backend/ENV_SETUP.md`).  
- **Service role key**: expected in backend env (bypasses RLS). Correct pattern if kept server-side only; lethal if ever shipped to Vite/`VITE_*`.  
- **Ollama key**: present but rejected (401) — rotate when fixing access.  
- **Supabase project**: configured ref does not resolve — either deleted, renamed, or DNS/network issue; confirm whether the project still exists in the Supabase dashboard.  
- Lint/typecheck debt increases chance of unsafe `any` paths in services (many `@typescript-eslint/no-explicit-any` hits).

### Build/dev summary (honest)

| Layer | Starts / builds? | Usable for product demo? |
|-------|------------------|---------------------------|
| Frontend Vite | Yes | Shell only — auth/data need Supabase |
| Frontend `vite build` | Yes | Same |
| Frontend `tsc` | No (Xcom unused symbols) | Build still ships (Vite does not typecheck) |
| Backend | Yes | Health OK; data plane dead |
| AI | Configured in logs | 401 — non-functional |
| Automated tests | None | Cannot regress-protect MVP |

---

*End of audit. Claims of “complete” in docs should be read as historical implementation notes, not as evidence the system works in this environment.*
