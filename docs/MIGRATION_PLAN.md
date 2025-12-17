# Migration Plan: Backend Feed Fetching with localStorage Storage

## Overview

This document outlines the architecture decision to use the backend service for feed fetching (solving CORS issues) while maintaining localStorage for data storage. This hybrid approach provides the benefits of server-side fetching without the complexity of database migration.

## Current State

### Data Storage
- **Location**: Browser localStorage
- **Size Limit**: 5MB per user (enforced in `storage.ts`)
- **Scope**: User-specific data (articles, sources, collections, preferences)
- **Persistence**: Automatic debounced saves (500ms delay)

### Current Data Structure
```typescript
AppState {
  authentication: { user, isAuthenticated, isDemoMode }
  articles: NewsArticle[]
  sources: NewsSource[]
  collections: FeedCollection[]
  filters: { searchQuery, sourceId, showOnlyFavorites, showOnlyUnread }
  ui: { isFetching, error, lastUpdate }
}
```

## Architecture Decision

### Current Approach: Backend Proxy + localStorage Storage

**Goal**: Use backend for feed fetching only, keep all data in localStorage

**Architecture**:
1. **Backend Service**: Handles feed fetching (RSS parsing, web scraping)
   - Solves CORS issues
   - Provides caching layer
   - Enables scheduled fetching
   - No data persistence (stateless)

2. **Frontend localStorage**: Stores all application data
   - Articles (fetched from backend, stored locally)
   - Sources and collections
   - User preferences and UI state
   - Authentication data

**Benefits**:
- ✅ Solves CORS limitations for feed fetching
- ✅ No database setup required
- ✅ Simple architecture (stateless backend)
- ✅ Fast local data access
- ✅ Works offline (with cached data)
- ✅ No migration needed for existing users
- ✅ Lower hosting costs (no database)

**Data Flow**:
```
User clicks "Refresh" 
  → Frontend calls backend API /api/feeds/fetch
  → Backend fetches RSS feeds (no CORS issues)
  → Backend returns articles
  → Frontend stores articles in localStorage
  → Frontend displays articles
```

**Implementation**:
1. Backend provides feed fetching endpoints only
2. Frontend continues using localStorage for all data
3. Frontend calls backend API when fetching feeds
4. Articles returned from backend are stored in localStorage
5. All other operations (read/unread, favorites, filters) remain client-side

## Future Database Migration (Optional)

If you decide to migrate to a database in the future, here are schema designs:

### Option 1: PostgreSQL (Recommended)

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sources table
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'rss', 'api', 'manual', 'scrape'
  url TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_fetched TIMESTAMP,
  error_message TEXT
);

-- Articles table
CREATE TABLE articles (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  author VARCHAR(255),
  published_at TIMESTAMP NOT NULL,
  content TEXT,
  is_read BOOLEAN DEFAULT false,
  is_favorite BOOLEAN DEFAULT false,
  fetched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, url) -- Prevent duplicates per user
);

-- Collections table
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Collection sources (many-to-many)
CREATE TABLE collection_sources (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  count INTEGER DEFAULT 10,
  sort_by VARCHAR(50) DEFAULT 'date', -- 'date' or 'title'
  ascending BOOLEAN DEFAULT false,
  PRIMARY KEY (collection_id, source_id)
);

-- User preferences
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  filters JSONB DEFAULT '{}',
  ui_settings JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_articles_user_id ON articles(user_id);
CREATE INDEX idx_articles_source_id ON articles(source_id);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_is_read ON articles(user_id, is_read);
CREATE INDEX idx_articles_is_favorite ON articles(user_id, is_favorite);
CREATE INDEX idx_sources_user_id ON sources(user_id);
```

### Option 2: MongoDB (Alternative)

```javascript
// User schema
{
  _id: ObjectId,
  email: String,
  name: String,
  passwordHash: String,
  createdAt: Date,
  updatedAt: Date
}

// Source schema
{
  _id: ObjectId,
  userId: ObjectId,
  name: String,
  type: String, // 'rss', 'api', 'manual', 'scrape'
  url: String,
  enabled: Boolean,
  createdAt: Date,
  lastFetched: Date,
  errorMessage: String
}

// Article schema
{
  _id: String, // Custom ID from frontend
  userId: ObjectId,
  sourceId: ObjectId,
  title: String,
  description: String,
  url: String,
  imageUrl: String,
  author: String,
  publishedAt: Date,
  content: String,
  isRead: Boolean,
  isFavorite: Boolean,
  fetchedAt: Date,
  createdAt: Date
}

// Collection schema
{
  _id: ObjectId,
  userId: ObjectId,
  name: String,
  description: String,
  sources: [{
    sourceId: ObjectId,
    count: Number,
    sortBy: String,
    ascending: Boolean
  }],
  createdAt: Date,
  updatedAt: Date
}
```

## Migration Script Strategy

### Step 1: Export localStorage Data

```typescript
// Migration utility to export localStorage data
export function exportLocalStorageData(userId: string): AppState | null {
  return loadFromStorage(userId);
}
```

### Step 2: Import to Database

```typescript
// Backend migration endpoint
POST /api/migration/import
Body: { userId, state: AppState }

// Process:
// 1. Validate user exists
// 2. Import sources
// 3. Import articles (deduplicate by URL)
// 4. Import collections
// 5. Import preferences
// 6. Return migration report
```

### Step 3: Verify and Switch

1. User logs in
2. Check if migration needed (localStorage exists, no backend data)
3. Prompt user to migrate
4. Run migration
5. Verify data integrity
6. Switch to backend API

## API Endpoints for Migration

### Articles
- `GET /api/articles` - Get user's articles (with pagination, filters)
- `POST /api/articles` - Create article
- `PATCH /api/articles/:id` - Update article (isRead, isFavorite)
- `DELETE /api/articles/:id` - Delete article
- `POST /api/articles/batch` - Batch operations

### Sources
- `GET /api/sources` - Get user's sources
- `POST /api/sources` - Create source
- `PATCH /api/sources/:id` - Update source
- `DELETE /api/sources/:id` - Delete source

### Collections
- `GET /api/collections` - Get user's collections
- `POST /api/collections` - Create collection
- `PATCH /api/collections/:id` - Update collection
- `DELETE /api/collections/:id` - Delete collection

### Migration
- `POST /api/migration/export` - Export current localStorage data
- `POST /api/migration/import` - Import data to database
- `GET /api/migration/status` - Check migration status

## Data Migration Checklist

- [ ] Create database schema
- [ ] Set up database connection
- [ ] Create migration API endpoints
- [ ] Build export utility for localStorage
- [ ] Build import utility for database
- [ ] Add migration UI in frontend
- [ ] Test migration with sample data
- [ ] Add rollback mechanism
- [ ] Document migration process
- [ ] Create migration guide for users

## Rollback Strategy

1. Keep localStorage data during migration
2. Add feature flag to switch between localStorage and backend
3. Allow users to export data before migration
4. Provide manual rollback option
5. Monitor migration success rate

## Timeline Estimate

- **Phase 1 (Hybrid)**: 2-3 weeks
  - Database setup: 2-3 days
  - API development: 5-7 days
  - Frontend integration: 3-5 days
  - Testing: 2-3 days

- **Phase 2 (Full Migration)**: 2-3 weeks
  - Authentication migration: 3-5 days
  - Preferences migration: 2-3 days
  - Real-time sync: 5-7 days
  - Testing and polish: 3-5 days

## Risk Mitigation

1. **Data Loss**: Always backup before migration
2. **Downtime**: Use feature flags for gradual rollout
3. **Performance**: Implement caching and pagination
4. **User Experience**: Show progress and allow cancellation
5. **Compatibility**: Support both systems during transition

