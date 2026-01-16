---
name: X.com Embedded Timelines Integration
overview: Integrate X.com embedded timeline profiles and lists into Informed News as a new "Developing News" section with organization-scoped management, drag-and-drop reordering, and customizable timeline settings for both profiles and lists.
todos:
  - id: db-schema-profiles
    content: Create database migration for xcom_profiles table with RLS policies
    status: pending
  - id: db-schema-lists
    content: Create database migration for xcom_lists table with RLS policies
    status: pending
  - id: types
    content: Create TypeScript types for X.com profiles, lists, and settings
    status: pending
  - id: backend-routes-profiles
    content: Create backend API routes for profile CRUD and reordering
    status: pending
  - id: backend-routes-lists
    content: Create backend API routes for list CRUD and reordering
    status: pending
  - id: frontend-service-profiles
    content: Create frontend service layer for X.com profiles
    status: pending
  - id: frontend-service-lists
    content: Create frontend service layer for X.com lists
    status: pending
  - id: navigation
    content: Add 'Developing News' navigation item with sub-routes for profiles and lists
    status: pending
  - id: widget-integration
    content: Integrate X.com widget script and create timeline embed components
    status: pending
  - id: profile-management
    content: Create profile management UI (add, edit, delete, reorder)
    status: pending
  - id: list-management
    content: Create list management UI (add, edit, delete, reorder)
    status: pending
  - id: layout-styling
    content: Create responsive layout and apply styling
    status: pending
  - id: validation
    content: Add validation and error handling
    status: pending
  - id: tweet-selection
    content: Implement tweet selection with checkboxes in embedded timelines
    status: pending
  - id: tweet-parsing
    content: Create tweet data parsing utility from DOM
    status: pending
  - id: tweet-topic-workflow
    content: Create modal for tweet selection and Topic creation workflow
    status: pending
  - id: source-record-creation
    content: Implement Source Record creation from tweets using organization X.com source
    status: pending
---

# X.com Embedded Timelines Integration Plan

## Overview

This plan integrates X.com embedded timeline profiles and lists into Informed News as a new "Developing News" top-level navigation section. The feature allows organizations to add, remove, and arrange X.com profiles and lists with customizable timeline settings, displayed using X.com's official embedded timeline widget. Two separate pages are provided: "X.com Profiles" and "X.com Lists", each with full CRUD operations, drag-and-drop reordering, and customizable settings. Additionally, users can select tweets from embedded timelines, parse tweet data from the DOM, create Source Records from selected tweets, and link them to Topics (new or existing) - maintaining consistency with existing architecture by using the organization's X.com source.

## Architecture Decisions

### 1. Navigation Structure

- **Decision**: Add "Developing News" as a top-level navigation item in the sidebar
- **Sub-pages**: Two separate pages accessible at:
  - `/developing-news/xcom-profiles` - X.com Profiles page
  - `/developing-news/xcom-lists` - X.com Lists page
- **Rationale**: User specified this as a "separate layer" from the Dashboard system, warranting its own navigation section. Separate pages allow focused management of profiles vs lists.
- **Group**: Place in 'entry' group (alongside Dashboard) as it's a monitoring/viewing interface

### 2. Data Storage

- **Decision**: Store X.com profiles and lists per-organization (shared by all members)
- **Tables**: 
  - `xcom_profiles` table for profile timelines
  - `xcom_lists` table for list timelines (separate table)
- **Rationale**: User selected per-organization storage and separate tables; aligns with existing organization-scoped data patterns. Separate tables allow different fields (profiles need username, lists need owner_screen_name + slug)
- **Ordering**: Both tables use `display_order` integer field for drag-and-drop reordering

### 3. Timeline Configuration

- **Decision**: Store customizable settings per profile/list (tweet limit, chrome options, dimensions, theme)
- **Rationale**: User requested same customizable settings for both profiles and lists
- **Settings**: Store as JSONB column for flexibility, with TypeScript interface for type safety. Both profiles and lists share the same settings structure.

### 4. X.com Widget Integration

- **Decision**: Use Twitter/X.com's official embedded timeline widget script
- **Implementation**: Include Twitter widget script in HTML head, use anchor-based embed code pattern
- **Script URL**: `https://platform.twitter.com/widgets.js` (still uses twitter.com domain)
- **Class Name**: `twitter-timeline` (class name unchanged despite X rebrand)
- **Profile URL Format**: `https://twitter.com/[username]`
- **List URL Format**: `https://twitter.com/{owner_screen_name}/lists/{slug}`
- **Theme Support**: `data-theme="dark"` attribute for dark mode
- **Rationale**: Official solution, no need for API access or ingestion; profiles and lists remain public X accounts

### 5. Tweet Selection & Topic Creation

- **Decision**: Allow users to select tweets from embedded timelines and create Source Records linked to Topics
- **Tweet Selection**: Add checkboxes directly to embedded timeline tweets via DOM manipulation
- **Data Extraction**: Parse tweet data from embedded widget DOM when clicked (text, video links, metadata)
- **Source Record Creation**: Create Source Records from selected tweets using organization's X.com source (create if doesn't exist)
- **Topic Workflow**: Use existing LinkToTopicModal pattern - allow creating new Topic or linking to existing Topic(s)
- **Batch Processing**: Ask user per tweet whether to create separate Source Record or combine with others
- **Rationale**: Enables tweet-to-Topic workflow while maintaining consistency with existing architecture (organization X.com source, existing LinkToTopicModal pattern, Notes functionality for further manipulation)

## Data Model

### New Table: `xcom_profiles`

```sql
CREATE TABLE public.xcom_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  username TEXT NOT NULL, -- X.com username (without @)
  display_name TEXT, -- Optional custom display name
  display_order INTEGER NOT NULL DEFAULT 0, -- For drag-and-drop ordering
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, -- Timeline configuration
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT xcom_profiles_username_length CHECK (char_length(username) > 0),
  CONSTRAINT xcom_profiles_unique_org_username UNIQUE(organization_id, username)
);

CREATE INDEX idx_xcom_profiles_organization_id ON public.xcom_profiles(organization_id);
CREATE INDEX idx_xcom_profiles_display_order ON public.xcom_profiles(organization_id, display_order);
```

### New Table: `xcom_lists`

```sql
CREATE TABLE public.xcom_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_screen_name TEXT NOT NULL, -- List owner's X.com username (without @)
  slug TEXT NOT NULL, -- List slug/identifier
  display_name TEXT, -- Optional custom display name
  display_order INTEGER NOT NULL DEFAULT 0, -- For drag-and-drop ordering
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, -- Timeline configuration (same as profiles)
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT xcom_lists_owner_length CHECK (char_length(owner_screen_name) > 0),
  CONSTRAINT xcom_lists_slug_length CHECK (char_length(slug) > 0),
  CONSTRAINT xcom_lists_unique_org_list UNIQUE(organization_id, owner_screen_name, slug)
);

CREATE INDEX idx_xcom_lists_organization_id ON public.xcom_lists(organization_id);
CREATE INDEX idx_xcom_lists_display_order ON public.xcom_lists(organization_id, display_order);
```

**Settings JSONB Structure (shared by both profiles and lists):**

```typescript
interface XcomTimelineSettings {
  theme?: 'dark' | 'light'; // Timeline theme (default: 'dark' for app)
  tweetLimit?: number; // 1-20, null for unlimited
  width?: number; // pixels, null for auto (180-520px)
  height?: number; // pixels, null for auto
  chrome?: {
    noheader?: boolean;
    nofooter?: boolean;
    noborders?: boolean;
    noscrollbar?: boolean;
    transparent?: boolean;
  };
}
```

**Tweet Data Structure (parsed from DOM):**

```typescript
interface TweetData {
  text: string; // Tweet text content
  authorUsername: string; // @username without @
  tweetUrl: string; // Full tweet URL (https://twitter.com/username/status/123456)
  timestamp?: Date; // Tweet timestamp if available
  videoLinks?: string[]; // Array of video URLs if present
  mediaUrls?: string[]; // Array of image/media URLs if present
  metadata?: Record<string, any>; // Additional tweet metadata
  element?: HTMLElement; // Reference to tweet DOM element
}
```

**Tweet Data Structure (parsed from DOM):**

```typescript
interface TweetData {
  text: string; // Tweet text content
  authorUsername: string; // @username without @
  tweetUrl: string; // Full tweet URL (https://twitter.com/username/status/123456)
  timestamp?: Date; // Tweet timestamp if available
  videoLinks?: string[]; // Array of video URLs if present
  mediaUrls?: string[]; // Array of image/media URLs if present
  metadata?: Record<string, any>; // Additional tweet metadata
  element?: HTMLElement; // Reference to tweet DOM element
}
```

## Implementation Phases

### Phase 1: Database Schema & Types

**Goal**: Create database tables and TypeScript types

**Tasks**:

1. Create migration file: `supabase/migrations/[timestamp]_xcom_profiles.sql`

   - Create `xcom_profiles` table with all columns
   - Add indexes for performance
   - Add RLS policies (organization-scoped access)
   - Add updated_at trigger

2. Create migration file: `supabase/migrations/[timestamp]_xcom_lists.sql`

   - Create `xcom_lists` table with all columns
   - Add indexes for performance
   - Add RLS policies (organization-scoped access)
   - Add updated_at trigger

3. Update `src/types/database.ts` with new table definitions for both tables
4. Create `src/types/xcom.ts` with domain types:

   - `XcomProfile` interface
   - `XcomProfileInsert` interface
   - `XcomProfileUpdate` interface
   - `XcomList` interface
   - `XcomListInsert` interface
   - `XcomListUpdate` interface
   - `XcomTimelineSettings` interface (shared by both)

5. Add types to `src/types/index.ts` exports

**Deliverables**:

- Both database tables created with proper constraints
- TypeScript types defined for profiles and lists
- RLS policies enforced

### Phase 2: Service Layer

**Goal**: Create backend API routes and frontend services

**Tasks**:

1. Create backend route: `backend/src/routes/xcomProfiles.ts`

   - `GET /api/xcom-profiles` - Get all profiles for organization (ordered)
   - `POST /api/xcom-profiles` - Create new profile
   - `PATCH /api/xcom-profiles/:id` - Update profile (including settings)
   - `PATCH /api/xcom-profiles/reorder` - Batch update display_order
   - `DELETE /api/xcom-profiles/:id` - Delete profile

2. Create backend route: `backend/src/routes/xcomLists.ts`

   - `GET /api/xcom-lists` - Get all lists for organization (ordered)
   - `POST /api/xcom-lists` - Create new list
   - `PATCH /api/xcom-lists/:id` - Update list (including settings)
   - `PATCH /api/xcom-lists/reorder` - Batch update display_order
   - `DELETE /api/xcom-lists/:id` - Delete list

3. Create frontend service: `src/services/xcomProfiles.service.ts`

   - Follow existing service patterns (watchItems, indicators)
   - Organization-scoped queries
   - Transform database types to domain types
   - Handle date conversions

4. Create frontend service: `src/services/xcomLists.service.ts`

   - Follow same patterns as profiles service
   - Organization-scoped queries
   - Transform database types to domain types
   - Handle date conversions

5. Register both routes in `backend/src/server.ts`
6. Export both services from `src/services/index.ts`

**Deliverables**:

- Backend API endpoints functional for both profiles and lists
- Frontend service layers complete
- Organization scoping enforced

### Phase 3: Navigation Structure

**Goal**: Add "Developing News" to navigation and routing with sub-pages

**Tasks**:

1. Update `src/components/Layout/Sidebar.tsx`:

   - Add "Developing News" nav item with appropriate icon (Sparkles or TrendingUp)
   - Add to 'entry' group
   - Set path to `/developing-news/xcom-profiles` (default sub-route)
   - Consider adding submenu or tabs for switching between profiles and lists

2. Update `src/App.tsx`:

   - Add route: `/developing-news/xcom-profiles` → `XcomProfilesPage` component
   - Add route: `/developing-news/xcom-lists` → `XcomListsPage` component
   - Consider nested routes structure for future expansion

3. Add icon import (check available icons, or use Sparkles/TrendingUp from lucide-react)

**Deliverables**:

- Navigation item added
- Routing configured for both pages
- Navigation active state working

### Phase 4: X.com Widget Integration

**Goal**: Integrate X.com's embedded timeline widget script for both profiles and lists

**Tasks**:

1. Add Twitter widget script to `index.html`:
   ```html
   <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
   ```

2. Create component: `src/components/Xcom/XcomProfileTimelineEmbed.tsx`

   - Accepts `XcomProfile` as prop
   - Generates anchor element with class `twitter-timeline` and required attributes
   - Profile URL format: `https://twitter.com/[username]`
   - Applies `data-theme="dark"` (or light) based on settings
   - Applies data attributes for tweet limit, width, height, chrome options
   - Handles script loading and widget initialization
   - Uses useEffect to ensure script loads and triggers widget rendering

3. Create component: `src/components/Xcom/XcomListTimelineEmbed.tsx`

   - Accepts `XcomList` as prop
   - Generates anchor element with class `twitter-timeline` and required attributes
   - List URL format: `https://twitter.com/{owner_screen_name}/lists/{slug}`
   - Applies same settings as profile embed (theme, tweet limit, width, height, chrome)
   - Handles script loading and widget initialization
   - Uses useEffect to ensure script loads and triggers widget rendering

4. Create utility: `src/utils/xcomEmbed.ts`

   - Function to generate anchor attributes and data attributes (shared by both)
   - Handles settings transformation (theme, width, height, chrome, tweet limit)
   - Converts chrome options to space-separated string format
   - Validates settings constraints
   - Example profile output:
     ```html
     <a class="twitter-timeline" 
        data-theme="dark"
        data-tweet-limit="5"
        data-width="400"
        href="https://twitter.com/sentdefender">Tweets by sentdefender</a>
     ```

   - Example list output:
     ```html
     <a class="twitter-timeline" 
        data-theme="dark"
        data-tweet-limit="5"
        data-width="400"
        href="https://twitter.com/twitter/lists/official-twitter-accts">Tweets from https://twitter.com/twitter/lists/official-twitter-accts</a>
     ```


**Deliverables**:

- X.com widget script integrated
- Timeline embed components functional for both profiles and lists
- Settings properly applied to embeds

### Phase 5: Profile Management UI

**Goal**: Create UI for adding, editing, and deleting profiles

**Tasks**:

1. Create `src/components/Xcom/XcomProfilesPage.tsx`:

   - Main page component for profiles
   - Grid layout for timeline displays
   - Management panel/sidebar for profile CRUD
   - Link to lists page

2. Create `src/components/Xcom/XcomProfileForm.tsx`:

   - Form for creating/editing profiles
   - Fields: username, display name, settings
   - Settings UI (tweet limit, width/height, chrome options, theme)
   - Validation (username format, numeric constraints)

3. Create `src/components/Xcom/XcomProfileCard.tsx`:

   - Display profile with embed preview
   - Edit/delete buttons
   - Drag handle for reordering

4. Create `src/components/Xcom/XcomProfileSettingsModal.tsx`:

   - Modal for editing profile settings
   - Form controls for all settings options
   - Preview of settings impact

**Deliverables**:

- Profile management UI complete
- Create/edit/delete functionality working
- Settings customization functional

### Phase 6: List Management UI

**Goal**: Create UI for adding, editing, and deleting lists

**Tasks**:

1. Create `src/components/Xcom/XcomListsPage.tsx`:

   - Main page component for lists
   - Grid layout for timeline displays
   - Management panel/sidebar for list CRUD
   - Link to profiles page

2. Create `src/components/Xcom/XcomListForm.tsx`:

   - Form for creating/editing lists
   - Fields: owner_screen_name, slug, display name, settings
   - Settings UI (tweet limit, width/height, chrome options, theme)
   - Validation (username format, slug format, numeric constraints)

3. Create `src/components/Xcom/XcomListCard.tsx`:

   - Display list with embed preview
   - Edit/delete buttons
   - Drag handle for reordering

4. Create `src/components/Xcom/XcomListSettingsModal.tsx`:

   - Modal for editing list settings
   - Form controls for all settings options
   - Preview of settings impact

**Deliverables**:

- List management UI complete
- Create/edit/delete functionality working
- Settings customization functional

### Phase 7: Drag-and-Drop Reordering

**Goal**: Implement drag-and-drop for profile and list ordering

**Tasks**:

1. Install drag-and-drop library (e.g., `@dnd-kit/core`, `@dnd-kit/sortable`)
2. Update `XcomProfilesPage.tsx`:

   - Wrap profile list in drag-and-drop context
   - Add drag handles to profile cards
   - Handle reorder events

3. Update `XcomListsPage.tsx`:

   - Wrap list items in drag-and-drop context
   - Add drag handles to list cards
   - Handle reorder events

4. Update services to support batch reordering:

   - `reorderProfiles(organizationId: string, profileIds: string[])` function
   - `reorderLists(organizationId: string, listIds: string[])` function
   - Updates display_order for all items in batch

5. Implement optimistic updates for smooth UX
6. Handle error states (revert on failure)

**Deliverables**:

- Drag-and-drop reordering working for both profiles and lists
- Order persisted to database
- Smooth UX with optimistic updates

### Phase 8: Layout & Styling

**Goal**: Create responsive layout for timeline display

**Tasks**:

1. Design grid layout for multiple timelines:

   - Responsive columns (1 on mobile, 2 on tablet, 3+ on desktop)
   - Proper spacing and sizing
   - Timeline height considerations

2. Style profile management panel:

   - Sidebar or collapsible panel
   - Add profile button
   - Profile list with drag handles

3. Apply Tailwind CSS styling:

   - Match existing design system (stone colors, accent)
   - Responsive breakpoints
   - Loading and empty states

**Deliverables**:

- Responsive layout implemented
- Consistent styling with app design
- Good UX for viewing multiple timelines

### Phase 9: Error Handling & Validation

**Goal**: Add robust error handling and validation

**Tasks**:

1. Add profile validation:

   - X.com username format (alphanumeric, underscores, max length)
   - Check for @ prefix (strip if present)
   - Uniqueness validation per organization

2. Add list validation:

   - Owner screen name format (alphanumeric, underscores, max length)
   - Slug format validation
   - Check for @ prefix in owner name (strip if present)
   - Uniqueness validation per organization (owner + slug combination)

3. Add settings validation:

   - Tweet limit: 1-20 range
   - Width: 180-520px range
   - Height: reasonable min/max

4. Error handling:

   - Invalid username/owner/slug errors
   - API errors
   - Widget loading errors

5. Loading states:

   - Profile/list fetching
   - Widget initialization
   - Reordering operations

**Deliverables**:

- Comprehensive validation for both profiles and lists
- User-friendly error messages
- Loading states implemented

### Phase 10: Tweet Selection & Topic Creation

**Goal**: Enable users to select tweets from embedded timelines and create Source Records linked to Topics

**Tasks**:

1. Create utility: `src/utils/xcomTweetParser.ts`

   - Function to parse tweet data from embedded timeline DOM
   - Extract: tweet text, author username, tweet URL, video links, timestamp, metadata
   - Handle tweet element structure from Twitter widget
   - Parse tweet content (text, links, media)
   - Extract video links if present
   - Handle edge cases (deleted tweets, protected accounts, etc.)

2. Create component: `src/components/Xcom/XcomTweetCheckbox.tsx`

   - Component to inject checkboxes into embedded timeline tweets
   - Uses MutationObserver to detect new tweets loaded in timeline
   - Adds checkbox to each tweet element
   - Handles checkbox state management
   - Triggers selection callback when checkbox clicked

3. Create component: `src/components/Xcom/XcomTweetSelectionModal.tsx`

   - Modal to manage selected tweets and create Topics/Source Records
   - Displays selected tweets with preview
   - For each tweet, allows user to choose:
     - Create separate Source Record
     - Combine with other tweets into single Source Record
   - Uses existing `LinkToTopicModal` pattern for Topic creation/linking
   - Shows "Create Topic from Tweets" button when tweets selected

4. Create utility: `src/utils/xcomSourceManager.ts`

   - Function to get or create organization X.com source
   - Checks for existing X.com source for organization
   - Creates if doesn't exist: `{ source_type: 'xcom', name: 'X.com' }`
   - Returns source ID for Source Record creation

5. Create service method: `src/services/xcomProfiles.service.ts` (or new service)

   - `createSourceRecordFromTweet(organizationId: string, tweetData: TweetData, topicIds: string[])`
   - Gets or creates organization X.com source
   - Creates Source Record with:
     - title: Tweet text (truncated if needed) or "Tweet by @username"
     - content: Full tweet text
     - url: Tweet URL
     - publishedAt: Tweet timestamp
     - sourceName: From X.com source
   - Links Source Record to provided Topic IDs
   - Handles batch creation for multiple tweets

6. Update `XcomProfileTimelineEmbed.tsx` and `XcomListTimelineEmbed.tsx`:

   - Add `XcomTweetCheckbox` integration
   - Track selected tweets state
   - Show selection counter/badge when tweets selected
   - Add "Create Topic from Selected Tweets" button
   - Open `XcomTweetSelectionModal` when button clicked

7. Integrate with existing LinkToTopicModal:

   - After Source Records created, show LinkToTopicModal for additional linking
   - Allow user to link to multiple Topics
   - Support creating new Topic inline (existing functionality)

**Deliverables**:

- Tweet selection functionality working via checkboxes
- Tweet data parsing from DOM functional
- Source Record creation from tweets working
- Topic creation/linking workflow integrated
- Organization X.com source auto-created if needed
- User choice per tweet (separate vs combined Source Records)

## Key Integration Points

### With Existing Systems

- **Organization Context**: Uses `useOrganization()` hook for organization-scoped queries
- **Service Pattern**: Follows existing service layer patterns (watchItems, indicators)
- **Database**: Uses organization-based RLS policies
- **Navigation**: Extends sidebar navigation structure
- **Styling**: Uses existing Tailwind design system
- **Source Management**: Uses existing X.com source type, auto-creates organization source if needed (following `getOrCreateManualSource()` pattern)
- **Source Record Creation**: Uses existing `sourceRecordsService.createManual()` pattern for creating Source Records
- **Topic Linking**: Uses existing `LinkToTopicModal` component and `osintTopicsService.linkRecord()` for linking Source Records to Topics
- **Notes Functionality**: Leverages existing Source Record notes field for additional tweet data manipulation if needed

### Twitter/X.com Widget Requirements

- **Script Loading**: Twitter widget script (`platform.twitter.com/widgets.js`) must load before embeds render
- **Embed Format**: Uses anchor element with class `twitter-timeline` and data attributes
- **Class Name**: `twitter-timeline` (unchanged despite X rebrand)
- **Profile URL**: `https://twitter.com/[username]` format
- **List URL**: `https://twitter.com/{owner_screen_name}/lists/{slug}` format
- **Theme**: `data-theme` attribute supports "dark" or "light"
- **Constraints**: 
  - Width: 180-520px (auto-adjusted by Twitter)
  - Tweet limit: 1-20 (or unlimited if not specified via `data-tweet-limit`)
  - Chrome options: Space-separated tokens in `data-chrome` attribute (noheader, nofooter, noborders, noscrollbar, transparent)
- **Shared Settings**: Both profiles and lists support the same customization options (theme, tweet limit, dimensions, chrome options)

## File Structure

```
supabase/migrations/
  [timestamp]_xcom_profiles.sql
  [timestamp]_xcom_lists.sql

src/
  components/
    Xcom/
      XcomProfilesPage.tsx       # Profiles main page component
      XcomListsPage.tsx           # Lists main page component
      XcomProfileTimelineEmbed.tsx # Profile timeline embed wrapper
      XcomListTimelineEmbed.tsx   # List timeline embed wrapper
      XcomProfileCard.tsx         # Profile card with embed
      XcomListCard.tsx            # List card with embed
      XcomProfileForm.tsx         # Profile create/edit form
      XcomListForm.tsx            # List create/edit form
      XcomProfileSettingsModal.tsx # Profile settings editor
      XcomListSettingsModal.tsx   # List settings editor
      XcomTweetCheckbox.tsx       # Checkbox injection for tweets
      XcomTweetSelectionModal.tsx # Modal for tweet selection & Topic creation
  services/
    xcomProfiles.service.ts      # Frontend profiles service
    xcomLists.service.ts          # Frontend lists service
  types/
    xcom.ts                      # X.com profile, list, and tweet types
  utils/
    xcomEmbed.ts                 # Shared embed code generation
    xcomTweetParser.ts           # Tweet data parsing from DOM
    xcomSourceManager.ts         # Organization X.com source management

backend/src/routes/
  xcomProfiles.ts                # Backend profiles API routes
  xcomLists.ts                   # Backend lists API routes
```

## Dependencies

- **New Packages**: 
  - `@dnd-kit/core` - Drag-and-drop functionality
  - `@dnd-kit/sortable` - Sortable list utilities
- **X.com Widget**: Official X for Websites script (external, loaded from CDN)

## Testing Considerations

- Test profile CRUD operations
- Test list CRUD operations
- Test drag-and-drop reordering for both profiles and lists
- Test settings customization for both
- Test widget loading and rendering for both profile and list timelines
- Test organization scoping (users only see their org's profiles/lists)
- Test validation (username format, owner/slug format, settings constraints)
- Test responsive layout
- Test error handling
- Test navigation between profiles and lists pages
- Test tweet selection via checkboxes in embedded timelines
- Test tweet data parsing from DOM (text, links, video, metadata)
- Test Source Record creation from tweets
- Test organization X.com source auto-creation
- Test Topic creation/linking workflow from tweets
- Test user choice per tweet (separate vs combined Source Records)
- Test batch processing of multiple selected tweets
- Test integration with existing LinkToTopicModal