# MVP E2E smoke checklist

Verify the greenfield path: **login → Refresh → classify → dual citations + depth honesty + framing** (CFP always; xcancel when configured).

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
   npm run dev
   ```

3. Open the UI at [http://localhost:5174](http://localhost:5174). API health: [http://localhost:3001/health](http://localhost:3001/health).

## Checklist (CFP-only)

Leave `XCANCEL_PROFILES` empty (default). Do not create `mvp/data/x-profiles.json`.

| Step | Action | Pass when |
|------|--------|-----------|
| 1. Login | Enter `MVP_PASSWORD` on the login form | Feed view loads (no 401 loop) |
| 2. Refresh | Click **Refresh** | Status shows fetched count; CFP articles appear with a `CFP` source chip |
| 3. Depth honesty | Scan CFP cards after Refresh | Some show a short **original-text excerpt** (`bodyStatus: ok`); others show **Original text unavailable** or **Original text blocked** — not silent |
| 4. Publisher title | Find a card whose publisher title differs from the CFP headline | Both titles appear (CFP headline + Publisher line) |
| 5. Classify | Click **Classify new** | Status shows classified count (needs `OLLAMA_API_KEY`) |
| 6. Body-backed framing | Expand framing on a **body-ok** classified card | Evidence / summary can reflect article text, not only the RSS blurb |
| 7. Dual links | Open an article card | Citations: **CFP** \| **Original** when scrape succeeded |
| 8. Framing UI | Expand framing on a classified article | Dimension bars/scores and honesty banner visible |
| 9. Re-fetch | Click **Refresh** again | Unchanged items keep framing; items whose body **newly** became ok clear framing so Classify can re-run; other new items stay unclassified |

## Checklist (optional xcancel)

Configure 1–2 handles, then repeat Refresh + Classify:

```bash
# In mvp/.env (example — no secrets):
XCANCEL_PROFILES=sentdefender
# Or copy mvp/data/x-profiles.example.json → mvp/data/x-profiles.json
```

| Step | Action | Pass when |
|------|--------|-----------|
| 10. Refresh with handles | Click **Refresh** | X items appear with `@handle` chip; citations **xcancel** \| **X** |
| 11. Tweet-as-body | Inspect an xcancel card | Tweet excerpt is shown; body stays `not_applicable` (no x.com scrape / no “unavailable”) |
| 12. Classify X items | Click **Classify new** | Unclassified xcancel items get framing like CFP |
| 13. Honest failure | If xcancel blocks (Cloudflare / RSS whitelist) | Feed still shows CFP; `meta.lastError` / store note is set — not silent success |

Empty profile list must not error: CFP-only Refresh stays green.

## Optional API-only checks

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
- `mvp/.env.example` documents `XCANCEL_PROFILES`, `XCANCEL_PER_PROFILE_LIMIT`, and `XCANCEL_FETCH_DELAY_MS` with no secrets.
