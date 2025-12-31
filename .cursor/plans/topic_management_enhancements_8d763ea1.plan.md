---
name: Topic Management Enhancements
overview: Enhance topic management with deduplication, actions (checkmark/delete/star), History page, ignored topics modal, and archival status tracking
todos:
  - id: update-types
    content: "Update types/index.ts: Add TopicStatus type, extend Topic interface with status/relevance/expiry fields, add IgnoredTopic interface"
    status: completed
  - id: update-reducer
    content: "Update appReducer.ts: Add ARCHIVE_TOPIC, DELETE_TOPIC_WITH_ARTICLES, ADD_IGNORED_TOPIC, REMOVE_IGNORED_TOPIC, RESTORE_IGNORED_TOPIC actions and handlers. Update AppState to include ignoredTopics"
    status: completed
    dependencies:
      - update-types
  - id: keyword-deduplication
    content: "Update topicExtractor.ts: Implement cross-topic keyword deduplication to prevent keywords appearing on multiple cards. Mark generateTopicName() for future genAI enhancement"
    status: completed
    dependencies:
      - update-types
  - id: dashboard-actions
    content: "Update DashboardPage.tsx: Add Checkmark and Trashcan icons with handlers. Implement handleArchiveTopic (archive + mark articles read) and handleDeleteTopic (delete + store in ignored)"
    status: completed
    dependencies:
      - update-reducer
  - id: dashboard-filtering
    content: "Update DashboardPage.tsx: Filter out archived/ignored topics, implement max topic limit (top 50 by recency), update filteredTopics useMemo"
    status: completed
    dependencies:
      - update-reducer
  - id: ignored-modal
    content: "Create IgnoredTopicsModal.tsx: Display ignored topics list, restore and permanently delete actions, similar UI pattern to SourcesModal"
    status: completed
    dependencies:
      - update-reducer
  - id: history-page
    content: "Create HistoryPage.tsx: Display starred/followed topics, unstar action (sets followed=false and archives), placeholder for future connection features"
    status: completed
    dependencies:
      - update-reducer
  - id: routing-updates
    content: "Update App.tsx: Add /history route. Update Header.tsx: Add History navigation link"
    status: completed
    dependencies:
      - history-page
---

# Topic Management Enhancements

Implement comprehensive topic management features including keyword deduplication, card actions, History page, ignored topics repository, and archival status tracking.

## Key Requirements

1. **Keyword Deduplication**: Prevent keywords from appearing on multiple topic cards
2. **Card Actions**: Add checkmark (archive + mark articles read) and trashcan (delete) icons to topic cards
3. **Topic Archival**: Add status, relevance score, and expiry date to archived topics
4. **Ignored Topics Repository**: Store deleted topics for potential reintroduction via modal
5. **History Page**: Track starred/followed topics for future connection analysis
6. **Dashboard Filtering**: Filter archived/ignored topics and implement max topic limit

## Implementation Details

### 1. Type System Updates

**File: `src/types/index.ts`**Add new types and extend Topic interface:

- `TopicStatus`: `'active' | 'archived' | 'ignored'`
- Extend `Topic` with:
- `status: TopicStatus` (default: 'active')
- `potentialRelevanceScore?: number`
- `expiryDate?: Date`
- `archivedAt?: Date`
- Add `IgnoredTopic` interface (captures topic data when deleted)
- Add `HistoryTopic` interface (for starred topics with additional metadata)
- Add to `AppState`:
- `ignoredTopics: IgnoredTopic[]`
- `historyTopics: HistoryTopic[]` (or track via topics with status/followed flag)

### 2. Topic Extractor Updates

**File: `src/utils/topicExtractor.ts`**

- **Keyword Deduplication**: Implement cross-topic keyword deduplication algorithm:
- Track keywords already assigned to topics
- When generating keywords for a new topic, exclude keywords already used
- Prioritize keywords that haven't been used yet
- **Title Generation**: Add comment/flag marking `generateTopicName()` for future genAI enhancement

### 3. Reducer Actions

**File: `src/context/appReducer.ts`**Add new action types and handlers:

- `ARCHIVE_TOPIC`: Set topic status to 'archived', set archivedAt, mark all articles as read
- `DELETE_TOPIC_WITH_ARTICLES`: Delete topic, delete all associated articles, store in ignoredTopics
- `ADD_IGNORED_TOPIC`: Store topic in ignoredTopics
- `REMOVE_IGNORED_TOPIC`: Remove from ignoredTopics (for reintroduction)
- `RESTORE_IGNORED_TOPIC`: Recreate topic from ignored list
- `UPDATE_TOPIC_STATUS`: Update status, relevance score, expiry date
- Modify `FOLLOW_TOPIC`: When following, ensure it's tracked in history; when unfollowing, archive if needed

### 4. Dashboard Page Updates

**File: `src/components/Intelligence/DashboardPage.tsx`**

- Add Checkmark and Trashcan icons to topic cards (similar to `ArticleCard.tsx`)
- Implement `handleArchiveTopic`: Archive topic + mark articles as read
- Implement `handleDeleteTopic`: Delete topic + articles, store in ignored
- Filter topics: Exclude archived/ignored topics from main view
- Implement max topic limit (e.g., top 50 by recency/activity)
- Update topic card UI to show action buttons

### 5. Ignored Topics Modal

**File: `src/components/Intelligence/IgnoredTopicsModal.tsx`** (NEW)Create modal similar to `SourcesModal.tsx`:

- Display list of ignored topics
- Show topic name, keywords, original article count, deleted date
- "Restore" button to reintroduce topic (creates new topic from ignored data)
- "Permanently Delete" option to remove from ignored list

### 6. History Page

**File: `src/components/Intelligence/HistoryPage.tsx`** (NEW)Create new page for starred/followed topics:

- Display topics where `followed: true` OR status is archived after being followed
- Show topic cards with full metadata
- Placeholder for future connection/association features
- "Unstar" action: Sets followed to false and archives topic

**File: `src/App.tsx`**

- Add route: `/history` -> `HistoryPage`

**File: `src/components/Layout/Header.tsx`**

- Add "History" navigation link (similar to Dashboard/Feeds links)

### 7. Topic Status Management

Track topic lifecycle:

- **Active**: Normal topics on Dashboard
- **Archived**: Checkmarked topics (articles marked read, status='archived')
- **Ignored**: Deleted topics stored for potential restoration
- **History**: Starred/followed topics tracked separately

### 8. Data Persistence

All new state (ignoredTopics, topic status fields) must:

- Persist via existing localStorage mechanism in `AppContext`
- Handle migration/backward compatibility in `LOAD_STATE` action
- Ensure proper Date serialization/deserialization

## Files to Create/Modify

**New Files:**

- `src/components/Intelligence/IgnoredTopicsModal.tsx`
- `src/components/Intelligence/HistoryPage.tsx`

**Modified Files:**

- `src/types/index.ts` - Add types and extend Topic interface
- `src/context/appReducer.ts` - Add new actions and handlers
- `src/components/Intelligence/DashboardPage.tsx` - Add actions, filtering, max limit
- `src/utils/topicExtractor.ts` - Keyword deduplication, mark for genAI
- `src/App.tsx` - Add /history route
- `src/components/Layout/Header.tsx` - Add History navigation link

## Technical Notes

- Keyword deduplication: Assign keywords to topics based on relevance, skip if already assigned
- Max topic limit: Apply after filtering archived/ignored, sort by updatedAt descending
- Topic archival: When checkmarked, set status='archived', archivedAt=now, mark all topic articles as isRead=true
- Topic deletion: Remove topic from state, remove all associated articles, store topic snapshot in ignoredTopics
- History tracking: Use followed flag + status to determine history membership
- Future genAI: Mark `generateTopicName()` with TODO comment for AI enhancement

## Implementation Order

1. Update types and interfaces
2. Update reducer with new actions
3. Implement keyword deduplication in topicExtractor
4. Add card actions to DashboardPage