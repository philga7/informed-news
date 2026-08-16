# MVP E2E smoke checklist

Verify the greenfield path: **login → fetch → classify → dual citations + framing**.

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

## Checklist

| Step | Action | Pass when |
|------|--------|-----------|
| 1. Login | Enter `MVP_PASSWORD` on the login form | Feed view loads (no 401 loop) |
| 2. Fetch | Click **Refresh CFP** | Status shows fetched count; articles appear with titles |
| 3. Classify | Click **Classify new** | Status shows classified count (needs `OLLAMA_API_KEY`) |
| 4. Dual links | Open an article card | Citation links from the item (CFP + Original when scrape succeeded) |
| 5. Framing | Expand framing on a classified article | Dimension bars/scores and honesty banner visible |

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
- Fetch alone is enough to confirm CFP RSS + publisher scrape and citation URLs.
- Framing scores are AI-assisted analysis, not ground truth (shown in the UI honesty banner).
