---
name: OSINT Intelligence Dashboard Implementation
overview: ""
todos: []
---

# OSINT Intelligence Dashboard Implementation

Transform the app from a feed reader to an OSINT/intelligence-gathering tool with topic extraction, grouping, and visualization capabilities.

## Overview

Add topic extraction and analysis features that identify key topics/phrases from articles, group similar articles together, and provide actionable intelligence with timeline and geo-spatial visualization.

## Key Components

### 1. Routing Setup

- Set up `react-router-dom` (already installed) for navigation
- Add routes for `/`, `/feeds`, `/dashboard`, `/topic/:id`
- Update `App.tsx` to use Router instead of ViewMode state

### 2. Topic Data Model

Add to `src/types/index.ts`:

- `Topic` interface with: id, name, keywords, articleIds, followed, tags, createdAt, updatedAt
- `TopicTag` type for labeling topics
- Add `topics: Topic[]` to `AppState`
- Add topic-related actions: `ADD_TOPIC`, `UPDATE_TOPIC`, `DELETE_TOPIC`, `ADD_ARTICLES_TO_TOPIC`, `FOLLOW_TOPIC`, `TAG_TOPIC`

### 3. Topic Extraction & Grouping Utilities

Create `src/utils/topicExtractor.ts`:

- Keyword extraction: Extract meaningful phrases/keywords from article titles (filter common stop words)
- Similarity scoring: Use text similarity algorithms (e.g., cosine similarity on TF-IDF vectors, or Levenshtein distance for simplicity in MVP)
- Group articles by similarity threshold
- Generate topic names from common keywords

### 4. Intelligence Dashboard Page

Create `src/components/Intelligence/DashboardPage.tsx`:

- Display list of detected topics with:
- Topic name and keyword tags
- Article count per topic
- Follow status indicator
- Tags/labels
- Last activity (most recent article)
- Add filters: followed topics, tagged topics
- "Refresh Topics" button to re-run extraction
- Click topic to navigate to detail page

### 5. Topic Detail Page

Create `src/components/Intelligence/TopicDetailPage.tsx`:

- Display topic information: name, keywords, tags, follow status
- Timeline view: Chronological display of articles mentioning the topic
- Geo-spatial map using Leaflet showing article locations (if extractable from articles)
- Article list filtered to this topic
- Actions: Follow/unfollow, Add/remove tags, View articles

### 6. Leaflet Integration

- Install `leaflet` and `react-leaflet` packages
- Install `@types/leaflet` for TypeScript
- Add Leaflet CSS to `src/index.css`
- Create `src/components/Intelligence/TopicMap.tsx` component
- Extract location data from articles (initially placeholder/empty, structure ready for future location extraction)

### 7. Header Navigation Update

Update `src/components/Layout/Header.tsx`:

- Add "Dashboard" button that navigates to `/dashboard`
- Keep existing navigation for Feeds and Sources

### 8. GenAI Preparation (Structure Only)

Create `src/utils/genAI.ts`:

- Placeholder structure for Ollama API integration
- Add `OLLAMA_API_KEY` config placeholder (from environment or settings)
- Define types for future AI operations (topic enhancement, summarization)
- No implementation yet, just structure

### 9. Topic State Management

Update `src/context/appReducer.ts`:

- Add topic action handlers
- Integrate topic extraction when articles are added (or on-demand via Dashboard)

### 10. Timeline Component

Create `src/components/Intelligence/TopicTimeline.tsx`:

- Display articles in chronological order
- Visual timeline representation (simple vertical timeline)
- Show article title, date, source for each entry

## Technical Decisions

- **Similarity Algorithm**: Start with simple string similarity (Levenshtein/Jaro-Winkler) for MVP, can upgrade to TF-IDF/cosine similarity later
- **Keyword Extraction**: Simple phrase extraction with stop-word filtering (common English words)
- **Location Extraction**: Initially empty/placeholder - structure ready for future metadata extraction or API integration
- **Topic Naming**: Use most common keywords/phrases found in grouped articles
- **Routing**: Use react-router-dom for proper URL-based navigation (better UX than state-based switching)

## Files to Create/Modify

**New Files:**

- `src/components/Intelligence/DashboardPage.tsx`
- `src/components/Intelligence/TopicDetailPage.tsx`
- `src/components/Intelligence/TopicMap.tsx`
- `src/components/Intelligence/TopicTimeline.tsx`
- `src/utils/topicExtractor.ts`
- `src/utils/genAI.ts` (placeholder structure)

**Modified Files:**

- `src/types/index.ts` - Add Topic types and state
- `src/context/appReducer.ts` - Add topic actions
- `src/App.tsx` - Replace ViewMode with Router
- `src/main.tsx` - Wrap with Router
- `src/components/Layout/Header.tsx` - Add Dashboard navigation
- `src/index.css` - Add Leaflet CSS import
- `package.json` - Add leaflet, react-leaflet, @types/leaflet dependencies

## Implementation Notes

- Keep MVP simple: Basic keyword extraction and similarity matching
- Topics are derived from existing articles (no AI initially)