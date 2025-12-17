# Architecture Decision: Backend Proxy + localStorage

## Decision

Use a backend Express service for feed fetching only, while maintaining localStorage for all data storage.

## Rationale

### Why Backend for Fetching?

1. **CORS Limitations**: Browser `fetch()` fails on many RSS feeds due to CORS restrictions
2. **Reliability**: Server-side fetching is more reliable and can handle complex scenarios
3. **Caching**: Backend can cache feed responses, reducing redundant requests
4. **Future AI**: Backend enables AI features (summarization, categorization) that require server-side processing

### Why Keep localStorage?

1. **Simplicity**: No database setup or management required
2. **Performance**: Local data access is instant
3. **Offline Support**: App works with cached data when offline
4. **Cost**: No database hosting costs
5. **Privacy**: User data stays on their device
6. **No Migration**: Existing users don't need data migration

## Architecture Diagram

```
┌─────────────────┐
│   React App     │
│  (Frontend)     │
│                 │
│  localStorage   │◄─── All data stored here
│  - Articles     │
│  - Sources      │
│  - Collections  │
│  - Preferences  │
└────────┬────────┘
         │
         │ HTTP API calls
         │ (feed fetching only)
         ▼
┌─────────────────┐
│  Express API    │
│  (Backend)      │
│                 │
│  - Feed Fetch   │───► External RSS/APIs
│  - RSS Parser   │
│  - Web Scraper  │
│  - Cache        │
│  - Scheduler    │
└─────────────────┘
```

## Data Flow

### Fetching Feeds

1. User clicks "Refresh" button
2. Frontend calls `POST /api/feeds/fetch` with sources
3. Backend fetches RSS feeds (no CORS issues)
4. Backend parses and returns articles
5. Frontend stores articles in localStorage
6. Frontend updates UI from localStorage

### Other Operations

- **Mark as read/unread**: Updates localStorage directly
- **Favorite/unfavorite**: Updates localStorage directly
- **Filter/search**: Reads from localStorage
- **Add/remove sources**: Updates localStorage directly

## Benefits

✅ **Solves CORS issues** without database complexity  
✅ **Simple architecture** - stateless backend  
✅ **Fast local access** - no network calls for UI operations  
✅ **Works offline** - cached data available  
✅ **Low cost** - no database hosting  
✅ **Privacy** - data stays on user's device  
✅ **Easy deployment** - backend is just a proxy service  

## Trade-offs

⚠️ **No multi-device sync** - data is device-specific  
⚠️ **Storage limits** - localStorage has ~5-10MB limit  
⚠️ **No shared data** - each user fetches independently  

## Future Considerations

If you need these features later, you can migrate to a database:
- Multi-device sync
- Shared article cache across users
- Larger storage capacity
- User collaboration features

For now, localStorage is sufficient for single-user scenarios.

