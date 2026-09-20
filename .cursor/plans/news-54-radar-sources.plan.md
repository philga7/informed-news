# NEWS-54 — Lock CFP + curated RSS radar sources

**Ticket:** [NEWS-54](https://informedcrew.atlassian.net/browse/NEWS-54)  
**Branch:** `feat/news-54-radar-sources`  
**Spec authority:** NEWS-54 description + [docs/RADAR_SOURCES.md](../../docs/RADAR_SOURCES.md)

## Goal

Commit the locked curated RSS starter set as in-repo config with a typed loader for NEWS-55 ingest. No fetch/ingest wiring, no admin CRUD, no Brief membership changes.

## Global Constraints

- Product path: `mvp/server` (+ docs). Do not touch `_legacy/` or `apps/kite` unless docs only.
- Do **not** implement RSS ingest (NEWS-55), Radar UI, Accept, or [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67) admin CRUD.
- CFP stays on existing `CFP_FEED_URL` — **do not** duplicate CFP as a curated row.
- Empty/missing curated file → loader returns `[]` (CFP-only still works).
- Never commit secrets, `mvp/.env`, or runtime `mvp/data/articles.json` / `meta.json`.
- Follow existing MVP TypeScript + `node:test` patterns.
- Fox feed URL must have **no** URL fragment; Newsmax must be Newsfront section feed.

## Locked source ids / URLs (verbatim)

Use exactly these `id` values and `feedUrl`s (from `docs/RADAR_SOURCES.md`):

**Georgia (`region`: `"georgia"`):**

| id | name | domain | feedUrl |
|----|------|--------|---------|
| georgia-recorder | Georgia Recorder | georgiarecorder.com | https://georgiarecorder.com/feed/localFeed/ |
| capitol-beat | Capitol Beat | capitol-beat.org | https://capitol-beat.org/feed/ |
| 11alive-local | 11Alive local | 11alive.com | https://www.11alive.com/feeds/syndication/rss/news/local |

**National / other (`region`: `"national"` or omit — prefer `"national"` for non-Georgia):**

| id | name | domain | feedUrl |
|----|------|--------|---------|
| newsnation | NewsNation | newsnationnow.com | https://www.newsnationnow.com/feed/ |
| scotusblog | SCOTUSblog | scotusblog.com | https://www.scotusblog.com/feed/ |
| times-of-israel | Times of Israel | timesofisrael.com | https://www.timesofisrael.com/feed/ |
| al-monitor | Al-Monitor | al-monitor.com | https://www.al-monitor.com/rss |
| goldseek | GoldSeek | goldseek.com | https://goldseek.com/rss.xml |
| macrumors | MacRumors | macrumors.com | https://feeds.macrumors.com/MacRumors-All |
| fox-latest | Fox News latest | foxnews.com | https://moxie.foxnews.com/google-publisher/latest.xml |
| abc-topstories | ABC top stories | abcnews.com | https://abcnews.com/abcnews/topstories |
| cbs-main | CBS main | cbsnews.com | https://www.cbsnews.com/latest/rss/main |
| nbc-news | NBC News | nbcnews.com | https://feeds.nbcnews.com/nbcnews/public/news |
| newsmax-newsfront | Newsmax Newsfront | newsmax.com | https://www.newsmax.com/rss/Newsfront/16 |

All rows: `"enabled": true`.

## Config path (ruling)

Committed defaults live at:

`mvp/server/config/radar-sources.json`

(Not under gitignored `mvp/data/`.) Loader resolves relative to the server package / `import.meta.url` (same spirit as other path joins from server root).

Shape:

```json
{
  "sources": [
    {
      "id": "georgia-recorder",
      "name": "Georgia Recorder",
      "domain": "georgiarecorder.com",
      "feedUrl": "https://georgiarecorder.com/feed/localFeed/",
      "region": "georgia",
      "enabled": true
    }
  ]
}
```

---

## Task 1: Curated JSON + types + loader + tests

**Files:**

- Create `mvp/server/config/radar-sources.json` — all 14 sources above.
- Create `mvp/server/src/types/radarSource.ts` — `RadarSource` type (`id`, `name`, `domain`, `feedUrl`, optional `region`, optional `enabled` defaulting true when absent).
- Create `mvp/server/src/services/loadRadarSources.ts` — read/parse JSON; return enabled sources only; missing/invalid/empty → `[]` (do not throw for missing file).
- Create `mvp/server/src/services/loadRadarSources.test.ts` — assert 14 enabled sources from real config path; assert ids match locked list; assert fox URL has no `#`; assert missing path returns `[]`.
- Update `mvp/server/package.json` `test` script to include `src/services/loadRadarSources.test.ts`.

**Tests:** `node:test` via existing server test script.

**Commit:** focused message on locking radar source config + loader.

---

## Task 2: Docs + env pointer

**Files:**

- Update `docs/RADAR_SOURCES.md` — replace “path TBD” with `mvp/server/config/radar-sources.json` and note the loader module.
- Update `mvp/.env.example` — short comment that curated radar RSS is in `mvp/server/config/radar-sources.json` (CFP still `CFP_FEED_URL`).

**Commit:** docs/env pointer for NEWS-54.

---

## Out of scope

- Wiring into `fetchAllSources` / ingest (NEWS-55)
- Admin CRUD (NEWS-67)
- Kite UI
