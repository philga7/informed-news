# MVP E2E smoke checklist

Verify the greenfield path: **login → Refresh → classify → dual citations + depth honesty + framing + clusters / selection signal** (CFP always; xcancel when configured).

## Prerequisites

1. Copy env and set a local password:

   ```bash
   cp mvp/.env.example mvp/.env
   # Edit mvp/.env — set MVP_PASSWORD, SESSION_SECRET, and OLLAMA_API_KEY
   ```

2. Install and start:

   ```bash
   npm install
   npm run install:all
   npm run server   # or npm run dev (server + Kite)
   ```

3. API health: [http://localhost:3001/health](http://localhost:3001/health). Product UI is Kite on :5173; this checklist is **API-oriented** (the old React feed is archived at `_legacy/mvp-web/`).

## Checklist (CFP-only)

Leave `XCANCEL_PROFILES` empty (default). Do not create `mvp/data/x-profiles.json`.

Use curl + session cookie (see Optional API-only checks below). Interactive React feed steps require optionally running `_legacy/mvp-web` — not the product path.

| Step | Action | Pass when |
|------|--------|-----------|
| 1. Login | `POST /api/login` with `MVP_PASSWORD` | `{"ok":true}` + session cookie |
| 2. Refresh | `POST /api/fetch` | Status shows fetched count; articles include CFP `sourceKind` |
| 3. Depth honesty | Inspect article JSON after fetch | Some `bodyStatus: ok` with `bodyText`; others unavailable/blocked — not silent |
| 4. Publisher title / selection | Find item whose `publisherTitle` differs from CFP `title` | Both present when scrape succeeded; selection signal fields honest (not a truth verdict) |
| 5. Classify | `POST /api/classify` | Classified count increases (needs `OLLAMA_API_KEY`) |
| 6. Enrich | `POST /api/enrich` | Brief clusters include highlights/timeline/Q&A when available |
| 7. Body-backed framing | Inspect a **body-ok** classified article | Evidence / summary can reflect article text |
| 8. Dual links | Inspect `citations` | **CFP** \| **Original** when scrape succeeded |
| 9. Framing | Inspect `classification` | Dimension scores present; treat as AI-assisted |
| 10. Verify this | Inspect classified item | `openQuestions` / selection-risk notes when present |
| 11. Re-fetch | `POST /api/fetch` again | Unchanged items keep framing; newly body-ok items clear framing for re-classify |

## Checklist (optional xcancel)

Configure 1–2 handles, then repeat Refresh + Classify:

```bash
# In mvp/.env (example — no secrets):
XCANCEL_PROFILES=sentdefender
# Or copy mvp/data/x-profiles.example.json → mvp/data/x-profiles.json
```

| Step | Action | Pass when |
|------|--------|-----------|
| 12. Refresh with handles | `POST /api/fetch` | X items appear with xcancel `sourceKind`; citations **xcancel** \| **X** |
| 13. Tweet-as-body | Inspect an xcancel article | Tweet text present; body stays `not_applicable` |
| 14. Classify X items | `POST /api/classify` | Unclassified xcancel items get framing like CFP |
| 15. Cluster group | Find items that share a `clusterId` | Related CFP + tweet share `clusterId` |
| 16. Honest failure | If xcancel blocks (Cloudflare / RSS whitelist) | CFP still succeeds; `meta.lastError` / store note is set — not silent success |

Empty profile list must not error: CFP-only Refresh stays green.

## Optional API-only checks

Frozen compat surface (health + articles/fetch/classify while Kite is the UI): [docs/MVP_API_COMPAT.md](../docs/MVP_API_COMPAT.md).

With a valid session cookie (after browser login), or via curl after `POST /api/login`:

```bash
curl -s http://localhost:3001/health
curl -s -c /tmp/mvp-cookies -X POST http://localhost:3001/api/login \
  -H 'Content-Type: application/json' \
  -d "{\"password\":\"$MVP_PASSWORD\"}"
curl -s -b /tmp/mvp-cookies -X POST http://localhost:3001/api/fetch
curl -s -b /tmp/mvp-cookies -X POST http://localhost:3001/api/classify
curl -s -b /tmp/mvp-cookies http://localhost:3001/api/articles | head
```

Quick body-status spot-check (after fetch):

```bash
curl -s -b /tmp/mvp-cookies http://localhost:3001/api/articles \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const a=JSON.parse(d).articles||JSON.parse(d);const rows=(Array.isArray(a)?a:[]).slice(0,8).map(x=>({sourceKind:x.sourceKind,bodyStatus:x.bodyStatus,hasBody:Boolean(x.bodyText)}));console.log(rows)})'
```

## Notes

- Classification requires a working Ollama Cloud API key (`OLLAMA_API_KEY` in `mvp/.env`).
- Fetch alone confirms CFP RSS + publisher URL scrape + **best-effort body scrape** (no paywall bypass). With handles set, the same `POST /api/fetch` also runs xcancel (RSS-first, HTML fallback).
- A second fetch does not wipe classification when title, snippet, and canonical URL are unchanged **and** body usability did not newly become ok. Changed title/snippet, or body newly becoming usable, **clears** classification so **Classify new** can run again.
- Framing scores are AI-assisted analysis, not ground truth (shown in the UI honesty banner).
- Depth honesty on the card: excerpt when original text is present; honest unavailable/blocked when not.
- Selection signal: differing CFP vs publisher headlines (and missing publisher original) are plain-language cues — not a partisan blindspot score or truth verdict.
- `mvp/.env.example` documents `XCANCEL_PROFILES`, `XCANCEL_PER_PROFILE_LIMIT`, and `XCANCEL_FETCH_DELAY_MS` with no secrets.
