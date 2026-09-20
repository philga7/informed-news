# Radar sources (Developing desk)

Locked starter set for [NEWS-54](https://informedcrew.atlassian.net/browse/NEWS-54) / epic [NEWS-57](https://informedcrew.atlassian.net/browse/NEWS-57). These feeds are **radar triage fuel** — they do not put stories on Brief by themselves (that requires Accept / manual seed).

Until [NEWS-67](https://informedcrew.atlassian.net/browse/NEWS-67) (Later), change sources by editing in-repo config + restart. No admin CRUD in v1 Done-demo.

## CFP (existing path)

| Name | Domain | Feed URL |
|------|--------|----------|
| Citizen Free Press | citizenfreepress.com | `CFP_FEED_URL` or `https://citizenfreepress.com/feed/` |

## Curated RSS (starter set)

### Georgia

| id | Name | Domain | Feed URL |
|----|------|--------|----------|
| georgia-recorder | Georgia Recorder | georgiarecorder.com | https://georgiarecorder.com/feed/localFeed/ |
| capitol-beat | Capitol Beat | capitol-beat.org | https://capitol-beat.org/feed/ |
| 11alive-local | 11Alive local | 11alive.com | https://www.11alive.com/feeds/syndication/rss/news/local |

### National / other

| id | Name | Domain | Feed URL |
|----|------|--------|----------|
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

Notes:

- Fox: store without URL fragments (`#_intcmp=…` is not part of the feed).
- Newsmax: use the Newsfront section feed, not `https://www.newsmax.com/rss.xml` (HTML index).

## Config shape (NEWS-54)

Committed JSON at `mvp/server/config/radar-sources.json`. Loaded by `mvp/server/src/services/loadRadarSources.ts` (empty/missing file → no curated sources). Example entry:

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

Empty/missing curated file → CFP-only (and optional xcancel if configured) still works.
