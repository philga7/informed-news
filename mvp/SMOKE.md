# MVP E2E smoke checklist

Verify the greenfield path: **login → Refresh → classify → dual citations + framing** (CFP always; xcancel when configured).

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
| 3. Classify | Click **Classify new** | Status shows classified count (needs `OLLAMA_API_KEY`) |
| 4. Dual links | Open an article card | Citations: **CFP** \| **Original** when scrape succeeded |
| 5. Framing | Expand framing on a classified article | Dimension bars/scores and honesty banner visible |
| 6. Re-fetch | Click **Refresh** again | Unchanged items keep framing; new items stay unclassified |

## Checklist (optional xcancel)

Configure 1–2 handles, then repeat Refresh + Classify:

```bash
# In mvp/.env (example — no secrets):
XCANCEL_PROFILES=sentdefender
# Or copy mvp/data/x-profiles.example.json → mvp/data/x-profiles.json
```

| Step | Action | Pass when |
|------|--------|-----------|
| 7. Refresh with handles | Click **Refresh** | X items appear with `@handle` chip; citations **xcancel** \| **X** |
| 8. Classify X items | Click **Classify new** | Unclassified xcancel items get framing like CFP |
| 9. Honest failure | If xcancel blocks (Cloudflare / RSS whitelist) | Feed still shows CFP; `meta.lastError` / store note is set — not silent success |

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

## Notes

- Classification requires a working Ollama Cloud API key (`OLLAMA_API_KEY` in `mvp/.env`).
- Fetch alone confirms CFP RSS + publisher scrape. With handles set, the same `POST /api/fetch` also runs xcancel (RSS-first, HTML fallback).
- A second fetch does not wipe classification when title, snippet, and canonical URL are unchanged. Changed title/snippet **clears** classification so **Classify new** can run again.
- Framing scores are AI-assisted analysis, not ground truth (shown in the UI honesty banner).
- `mvp/.env.example` documents `XCANCEL_PROFILES`, `XCANCEL_PER_PROFILE_LIMIT`, and `XCANCEL_FETCH_DELAY_MS` with no secrets.
