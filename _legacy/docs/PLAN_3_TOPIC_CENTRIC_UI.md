# Plan 3: Topic-Centric UI Foundation

## Overview

Plan 3 implements a complete topic-centric user interface that replaces the previous feed-centric approach. Users now navigate by **Topics** as the primary entry point, with **Source Records** as supporting intelligence data.

This plan builds directly on:
- **Plan 1**: OSINT database schema (organizations, sources, source_records, osint_topics, topic_source_links)
- **Plan 2**: Ingestion layer (RSS ingestion, manual input, content deduplication)

## Architecture

```
Frontend (React/TypeScript)
├── /topics                    → Browse and manage OSINT topics
├── /topics/:id                → Topic detail with linked source records
├── /source-records            → Browse all ingested intelligence
├── /source-records/:id        → Source record detail with content
└── /sources                   → Manage RSS feeds and data sources

Backend API (Express)
├── /api/topics                → Topic CRUD + link/unlink operations
├── /api/source-records        → Source record queries with filters
├── /api/ingest/*              → Ingestion endpoints (from Plan 2)
└── /api/scheduler/*           → Scheduler endpoints (from Plan 2)

Database (Supabase/PostgreSQL)
├── osint_topics               → Intelligence topics
├── source_records             → Ingested data (from Plan 2)
├── topic_source_links         → Links between topics and records
└── sources                    → RSS/API/manual sources (from Plan 1)
```

## Key Features

### Topics-First Navigation
- Topics are now the default landing page (`/topics`)
- Create, edit, and delete topics
- Search topics by name, description, or keywords
- View topic metadata (linked records count, last updated)

### Topic-Record Linking
- Link source records to topics from either direction:
  - From topic detail page: "Link Source Record" button
  - From source record detail page: "Link to Topic" button
- Track link metadata:
  - Confidence level (HIGH/MEDIUM/LOW)
  - Relevance score (0-100%)
  - Analyst notes
  - Linked timestamp and user

### Source Record Management
- Browse all ingested source records
- Full-text search on title and content
- Filter by:
  - Source
  - Linked/unlinked status
  - Date range
- Pagination for large datasets
- View full record content with metadata

### Organization-Based Multi-Tenancy
- All data scoped by organization_id
- Multiple users can collaborate within an organization
- Topics and links are shared within the organization

---

## Testing Plan 3

### Prerequisites

Ensure Plans 1 and 2 are complete:

1. **Plan 1 Complete** ✅
   - OSINT migrations applied (organizations, sources, osint_topics, etc.)
   - Organizations created with members
   - Row-level security policies in place

2. **Plan 2 Complete** ✅
   - Ingestion layer implemented
   - RSS sources configured
   - Source records ingested from feeds
   - Content deduplication working

3. **Services Running**
   - Backend: `cd backend && npm run dev` (port 3001)
   - Frontend: `npm run dev` (port 5173)

### Step 1: Verify Existing Test Data

Run this query in Supabase SQL Editor to check your test data:

```sql
-- Verify your test organizations and data
SELECT 
  o.id as org_id,
  o.name as org_name,
  o.slug,
  COUNT(DISTINCT s.id) as sources_count,
  COUNT(DISTINCT sr.id) as records_count,
  COUNT(DISTINCT ot.id) as topics_count,
  COUNT(DISTINCT tsl.id) as links_count
FROM organizations o
LEFT JOIN sources s ON s.organization_id = o.id
LEFT JOIN source_records sr ON sr.source_id = s.id
LEFT JOIN osint_topics ot ON ot.organization_id = o.id
LEFT JOIN topic_source_links tsl ON tsl.topic_id = ot.id
GROUP BY o.id, o.name, o.slug
ORDER BY records_count DESC;
```

**Expected Output:**
- At least 1 organization with an `org_id`
- Some `sources_count` (RSS feeds from Plan 2)
- Some `records_count` (ingested articles from Plan 2)
- `topics_count` may be 0 (we'll create them in testing)
- `links_count` may be 0 (we'll create them in testing)

**Copy the `org_id`** from the organization with the most records.

### Step 2: Configure Organization ID

The UI needs to know which organization's data to display. There are two approaches:

#### Option A: Quick Hardcode for Testing (Recommended)

Update these 3 files with your test organization ID:

**1. `src/components/Topics/TopicsPage.tsx`** (line ~23):
```typescript
// Find this line:
const organizationId = (user as any)?.organizationId || 'default-org-id';

// Replace with your actual org ID:
const organizationId = 'YOUR_ACTUAL_ORG_ID_FROM_STEP_1';
```

**2. `src/components/SourceRecords/SourceRecordsPage.tsx`** (line ~28):
```typescript
// Same replacement:
const organizationId = 'YOUR_ACTUAL_ORG_ID_FROM_STEP_1';
```

**3. `src/components/SourceRecords/SourceRecordDetailPage.tsx`** (line ~16):
```typescript
// Same replacement:
const organizationId = 'YOUR_ACTUAL_ORG_ID_FROM_STEP_1';
```

#### Option B: Add to User Profile (Production Approach)

Add organization_id to the profiles table:

```sql
-- Add column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Set your user's organization
UPDATE profiles 
SET organization_id = 'YOUR_ORG_ID'
WHERE id = auth.uid();

-- Verify
SELECT id, email, organization_id FROM profiles WHERE id = auth.uid();
```

Then the UI will automatically read from `user.organizationId`.

### Step 3: Start Services

Open 2 terminals:

**Terminal 1 - Backend:**
```bash
cd /Users/philipclapper/workspace/informed-news/backend
npm run dev
```

**Expected output:**
```
🚀 Backend server running on http://localhost:3001
📡 Health check: http://localhost:3001/health
```

**Terminal 2 - Frontend:**
```bash
cd /Users/philipclapper/workspace/informed-news
npm run dev
```

**Expected output:**
```
VITE v5.x.x ready in xxx ms
➜  Local:   http://localhost:5173/
```

### Step 4: Test Topics Page (`/topics`)

1. **Navigate:** Open http://localhost:5173/ (should redirect to `/topics`)

2. **Should Display:**
   - Page title: "Topics" with target icon
   - Search bar
   - "Create Topic" button (blue accent)
   - "Refresh" button
   - Empty state OR list of existing topics

3. **Test: Create New Topic**
   - Click "Create Topic"
   - Modal should appear with form
   - Fill in:
     - Name: "Cyber Security Threats"
     - Description: "Tracking cyber security incidents and vulnerabilities"
     - Keywords: Add "cybersecurity", "hacking", "vulnerability"
   - Click "Create Topic"
   - Topic should appear at top of list with 0 linked records

4. **Test: Search Topics**
   - Type "cyber" in search bar
   - Should filter to show only matching topics
   - Clear search to show all topics

5. **Test: Topic Card Display**
   - Each topic card should show:
     - Topic name
     - Description (truncated)
     - Keywords (up to 4, with "+X more" if needed)
     - Linked records count
     - Last updated date
     - Delete button (trash icon)

### Step 5: Test Topic Detail Page (`/topics/:id`)

1. **Navigate:** Click on any topic from the list

2. **Should Display:**
   - Back button to topics list
   - Topic name as page title
   - Description
   - Keywords as badges
   - "Edit" button
   - Metadata footer (record count, created/updated dates)
   - "Linked Source Records" section
   - "Link Source Record" button

3. **Test: Edit Topic**
   - Click "Edit" button
   - Modal opens with current data
   - Modify description
   - Add a new keyword
   - Click "Update Topic"
   - Changes should reflect immediately

4. **Test: Link Source Record**
   - Click "Link Source Record"
   - Modal opens with search and record list
   - Should see unlinked source_records from your organization
   - Search for a keyword in the search box
   - Click on a record to select it
   - Set confidence level (HIGH/MEDIUM/LOW)
   - Adjust relevance score slider (0-100%)
   - Add analyst notes (optional): "This record provides background on the threat"
   - Click "Link Record"
   - Record should appear in the "Linked Source Records" table

5. **Test: Linked Records Table**
   - Table should show:
     - Record title (clickable to record detail)
     - Source name and reliability rating
     - Published date
     - Confidence level badge
     - Relevance score percentage
     - Unlink button (trash icon)
   - Click on a record title → should navigate to `/source-records/:id`
   - Click external link icon → opens source URL in new tab

6. **Test: Unlink Record**
   - Click trash icon on a linked record
   - Confirm dialog appears
   - Confirm unlink
   - Record should be removed from table

### Step 6: Test Source Records Page (`/source-records`)

1. **Navigate:** Click "Source Records" in the header

2. **Should Display:**
   - Page title: "Source Records" with file icon
   - Search bar
   - "Filters" button
   - "Refresh" button
   - Table of all source_records from your organization

3. **Test: Table Display**
   - Columns: Title, Source, Published, Linked Topics
   - Each row shows:
     - Record title (line-clamped to 2 lines)
     - Source name and reliability rating
     - Published date
     - Linked topic badges (up to 2, with "+X" for more)
   - Click any row → navigates to record detail

4. **Test: Search**
   - Type keywords in search box (e.g., "security", "update")
   - Press Enter or click "Search"
   - Should see filtered results
   - Clear search to see all records

5. **Test: Filters**
   - Click "Filters" button (should highlight blue when active)
   - Filter panel appears below search
   - **Linked Status:**
     - Select "Linked Only" → shows only records linked to topics
     - Select "Unlinked Only" → shows only records not linked
     - Select "All Records" → shows everything
   - **Date Range:**
     - Set "Date From" → filters records published after date
     - Set "Date To" → filters records published before date
   - Click "Clear Filters" to reset

6. **Test: Pagination**
   - If you have >50 records, pagination controls appear
   - Shows "Showing X to Y of Z records"
   - "Previous" and "Next" buttons
   - Click "Next" → loads next page
   - Click "Previous" → goes back

### Step 7: Test Source Record Detail (`/source-records/:id`)

1. **Navigate:** Click on any source record from the list

2. **Should Display:**
   - Back button to source records list
   - Full article title
   - Metadata bar:
     - Source name with reliability rating badge
     - Published date and time
     - "View Source" link (external link icon)
   - Full article content
   - Metadata section (if available):
     - Language
     - Geographic indicators
   - "Linked Topics" section at bottom
   - "Link to Topic" button

3. **Test: Content Display**
   - Full content should be displayed (not truncated)
   - Proper spacing and readability
   - External link works (opens in new tab)

4. **Test: Link to Topics**
   - Click "Link to Topic" button
   - Modal opens with topic search and selection
   - Search for topics (filters by name, description, keywords)
   - **Can select multiple topics** (checkboxes)
   - Selected topics show blue highlight with link icon
   - Counter shows "X selected"
   - Click "Link to X Topics"
   - Modal closes and linked topics appear in the section

5. **Test: Linked Topics Display**
   - Each linked topic shows:
     - Topic name (clickable to topic detail)
     - Analyst notes (if added during linking)
     - Confidence level and relevance score
   - Click topic name → navigates to `/topics/:id`

### Step 8: Test Sources Page (`/sources`)

1. **Navigate:** Click "Sources" in the header

2. **Should Display:**
   - Page title: "Manage Sources" with database icon
   - "Add New Source" section (from existing SourceManager)
   - "Your Sources" section with list

3. **Test: Existing Functionality**
   - This page uses your existing SourceManager component
   - Should show RSS sources from Plan 2
   - All existing functionality should still work:
     - Add new RSS source
     - Enable/disable sources
     - Delete sources
     - Test source connection

### Step 9: Test Navigation Flow

Verify the complete user journey:

1. **Start at `/topics`** → View available topics
2. **Create a new topic** → "Supply Chain Attacks"
3. **Click the topic** → View empty linked records
4. **Click "Link Source Record"** → Browse source records
5. **Link 3-4 records** → Set confidence and notes
6. **Go to "Source Records"** in header
7. **Filter by "Linked Only"** → See your linked records with topic badges
8. **Click a linked record** → View full content and linked topics
9. **Click a topic badge** → Navigate back to topic detail
10. **Verify all records** are shown in topic's linked records table

### Step 10: Verify Database Changes

After testing, verify data was created correctly:

```sql
-- 1. Check topics you created
SELECT 
  id,
  name,
  description,
  keywords,
  created_at,
  updated_at
FROM osint_topics
WHERE organization_id = 'YOUR_ORG_ID'
ORDER BY created_at DESC;

-- 2. Check topic-record links
SELECT 
  ot.name as topic_name,
  sr.title as record_title,
  tsl.confidence_level,
  tsl.relevance_score,
  tsl.analyst_notes,
  tsl.linked_at
FROM topic_source_links tsl
JOIN osint_topics ot ON ot.id = tsl.topic_id
JOIN source_records sr ON sr.id = tsl.source_record_id
WHERE ot.organization_id = 'YOUR_ORG_ID'
ORDER BY tsl.linked_at DESC;

-- 3. Check records with linked topic counts
SELECT 
  sr.title,
  sr.published_at,
  COUNT(tsl.id) as linked_topics_count
FROM source_records sr
JOIN sources s ON s.id = sr.source_id
LEFT JOIN topic_source_links tsl ON tsl.source_record_id = sr.id
WHERE s.organization_id = 'YOUR_ORG_ID'
GROUP BY sr.id, sr.title, sr.published_at
HAVING COUNT(tsl.id) > 0
ORDER BY linked_topics_count DESC;
```

---

## API Testing (Optional)

Test backend endpoints directly with curl:

### 1. List Topics
```bash
curl "http://localhost:3001/api/topics?organization_id=YOUR_ORG_ID"
```

**Expected:** JSON array of topics with linked_records_count

### 2. Create Topic
```bash
curl -X POST http://localhost:3001/api/topics \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "YOUR_ORG_ID",
    "name": "API Test Topic",
    "description": "Created via API",
    "keywords": ["test", "api"]
  }'
```

**Expected:** 201 status with created topic object

### 3. Get Topic Detail
```bash
curl "http://localhost:3001/api/topics/TOPIC_ID"
```

**Expected:** Topic with nested topic_source_links and source_records

### 4. List Source Records
```bash
curl "http://localhost:3001/api/source-records?organization_id=YOUR_ORG_ID&limit=10"
```

**Expected:** JSON with records array and pagination object

### 5. Search Source Records
```bash
curl "http://localhost:3001/api/source-records?organization_id=YOUR_ORG_ID&search=security"
```

**Expected:** Filtered records matching search term

### 6. Link Record to Topic
```bash
curl -X POST "http://localhost:3001/api/topics/TOPIC_ID/links" \
  -H "Content-Type: application/json" \
  -d '{
    "source_record_id": "RECORD_ID",
    "confidence_level": "HIGH",
    "relevance_score": 0.85,
    "analyst_notes": "API test link"
  }'
```

**Expected:** 201 status with created link object

### 7. Unlink Record from Topic
```bash
curl -X DELETE "http://localhost:3001/api/topics/TOPIC_ID/links/LINK_ID"
```

**Expected:** 200 status with success message

---

## Troubleshooting

### Issue: "No topics found"
**Cause:** Fresh installation, no topics created yet  
**Solution:** Click "Create Topic" to add your first topic

### Issue: "No source records found"
**Cause:** No records ingested from Plan 2, or wrong organization_id  
**Solution:**
1. Verify organization_id matches your test data
2. Check you have source_records: `SELECT COUNT(*) FROM source_records;`
3. If empty, re-run Plan 2 ingestion: `curl -X POST http://localhost:3001/api/ingest/rss ...`

### Issue: "Failed to fetch topics" (API Error)
**Cause:** Backend not running or wrong API URL  
**Solution:**
1. Check backend is running: `curl http://localhost:3001/health`
2. Check frontend API URL: `VITE_API_URL` should be `http://localhost:3001`
3. Check browser console for CORS errors

### Issue: Can't link records to topics
**Cause:** Records might already be linked, or organization mismatch  
**Solution:**
1. Check linked status with filter: "Unlinked Only"
2. Verify organization_id is consistent across all queries
3. Check console for error messages

### Issue: Search returns no results
**Cause:** PostgreSQL full-text search requires exact words  
**Solution:**
1. Try shorter, common words
2. Use partial matches: "secur" instead of "security"
3. Check the `idx_source_records_search` index exists

### Issue: Pagination not working
**Cause:** Less than 50 records in dataset  
**Solution:** Normal behavior - pagination only shows when needed

---

## Integration with Plans 1 & 2

### Data Flow from Plan 2 → Plan 3

```
Plan 2 Ingestion:
POST /api/ingest/rss → Creates source_records
                           ↓
Plan 3 UI:
GET /api/source-records → Displays source_records
                           ↓
User links to topics → Creates topic_source_links
                           ↓
GET /api/topics/:id → Shows linked source_records
```

### Database Tables Usage

| Table | Plan Created | Plan 3 Usage |
|-------|--------------|--------------|
| `organizations` | Plan 1 | Scopes all queries |
| `sources` | Plan 1 | Referenced in source_records |
| `source_records` | Plan 2 | Main intelligence data, displayed in `/source-records` |
| `osint_topics` | Plan 1 | Created/managed in `/topics` |
| `topic_source_links` | Plan 1 | Created when linking topics to records |

### Schema Relationship

```sql
organizations
    ↓ (organization_id)
sources
    ↓ (source_id)
source_records ←──────────┐
    ↑                     │
    │                     │ (many-to-many)
topic_source_links        │
    ↑                     │
    │                     │
osint_topics ─────────────┘
    ↓ (organization_id)
organizations
```

---

## Next Steps After Plan 3

With the topic-centric UI foundation complete, you can now:

1. **Add Advanced Features:**
   - Topic timeline visualization
   - Topic relationships graph
   - Geographic distribution maps
   - Bulk link/unlink operations

2. **Implement AI Analysis:**
   - Auto-suggest relevant records for topics
   - Entity extraction from source_records
   - Sentiment analysis
   - Key facts extraction

3. **Enhance Collaboration:**
   - Multi-user topic assignments
   - Comments on topic-record links
   - Change history tracking
   - Export topics with all linked records

4. **Add Analytics:**
   - Topic coverage metrics
   - Source reliability analysis
   - Trending topics dashboard
   - Alert system for new relevant records

5. **Improve UX:**
   - Drag-and-drop record linking
   - Keyboard shortcuts
   - Saved searches and filters
   - Custom topic views

---

## Summary

Plan 3 successfully transforms the application from a feed-centric RSS reader into a professional OSINT intelligence platform where:

✅ **Topics are the organizing principle** - Not feeds or articles  
✅ **Source records are raw intelligence** - Ingested and deduplicated  
✅ **Links connect topics to evidence** - With confidence scoring and notes  
✅ **Multi-user collaboration** - Organization-based multi-tenancy  
✅ **Scalable architecture** - Pagination, search, and filtering built-in  

The application is now ready for serious intelligence analysis workflows, with all the foundation needed for advanced features like AI-assisted analysis, visualization, and reporting.

