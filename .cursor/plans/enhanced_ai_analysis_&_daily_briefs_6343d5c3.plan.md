---
name: Enhanced AI Analysis & Daily Briefs
overview: Comprehensive plan to expand genAI analysis to all media types (articles, videos, podcasts, other) with optimized content storage, enhanced analysis capabilities (key facts, topic summarization, cross-content analysis), and a daily news brief system. Includes content optimization strategies, link extraction, enhanced prompts, and workflow enhancements.
todos: []
---

#Enhanced AI Analysis & Daily News Brief System

## Overview

This plan expands genAI analysis capabilities to support all media types while optimizing content storage and analysis quality. The implementation includes content optimization (link extraction, compression, smart storage), configurable per-source retention policies, enhanced genAI prompts with metadata and link context, transcription for video/audio, new analysis capabilities, and a comprehensive daily brief system.**Key Principles:**

- **Storage Efficiency**: Store only what's needed, optimize based on source value and content length, with configurable retention policies to automatically manage old records
- **Analysis Quality**: Enhanced prompts with metadata, links, and structure for better AI analysis
- **Workflow Integration**: All enhancements integrate seamlessly with existing OSINT workflow
- **Backward Compatibility**: All changes are additive, existing data and workflows continue to work

## Current State

**Existing Analysis Capabilities:**

- ✅ Text summarization (3-5 bullet points)
- ✅ Entity extraction (people, organizations, locations, dates)
- ✅ Tone/sentiment analysis (bias detection, propaganda identification)
- ✅ Content extraction from articles (Readability-based plain text)
- ✅ Timeline analysis for topics
- ⚠️ `key_facts` artifact type defined but not implemented
- ⚠️ Topic-level summarization not implemented
- ⚠️ Cross-content analysis not implemented

**Content Storage:**

- ✅ Plain text (`textContent`) stored in `content` field (TEXT, unlimited length)
- ✅ Metadata in `raw_metadata` JSONB (RSS data, author, thumbnail)
- ❌ Links stripped during text extraction
- ❌ No content optimization strategy
- ❌ No compression for large articles
- ❌ Basic prompts without metadata/links

**Content Types:**

- ✅ Articles/text content (via RSS ingestion + content extraction)
- ❌ Video content (no transcription/analysis)
- ❌ Podcast/audio content (no transcription/analysis)
- ❌ Other media types (no handling)

**Daily Briefs:**

- ❌ Not implemented

---

## Phase 1: Content Optimization & Media Type Detection

**Goal:** Optimize content storage, extract links, detect media types, and enhance content extraction.

### 1.1 Database Schema: Content Optimization & Media Types

**File:** `supabase/migrations/[timestamp]_content_optimization_media_types.sql`

```sql
-- Add media type support
ALTER TABLE source_records 
ADD COLUMN media_type TEXT DEFAULT 'article' 
  CHECK (media_type IN ('article', 'video', 'podcast', 'audio', 'other')),
ADD COLUMN content_type TEXT DEFAULT 'full_text'
  CHECK (content_type IN ('full_text', 'summary', 'structured', 'minimal')),
ADD COLUMN content_compressed BOOLEAN DEFAULT false,
ADD COLUMN content_length INTEGER,
ADD COLUMN storage_optimized_at TIMESTAMPTZ;

-- Indexes for filtering and optimization
CREATE INDEX idx_source_records_media_type ON source_records(media_type);
CREATE INDEX idx_source_records_content_optimization 
  ON source_records(content_type, content_compressed, content_length);

-- Add auto-transcribe to sources (for Phase 7)
ALTER TABLE sources 
ADD COLUMN auto_transcribe BOOLEAN DEFAULT false;

-- Add retention policy configuration to sources (for Phase 7)
ALTER TABLE sources
ADD COLUMN retention_max_items INTEGER, -- Keep N most recent items (null = unlimited)
ADD COLUMN retention_days INTEGER, -- Keep items from last N days (null = unlimited)
ADD COLUMN retention_action TEXT DEFAULT 'archive' -- 'delete' | 'archive'
  CHECK (retention_action IN ('delete', 'archive'));

-- Create archived_source_records table for soft deletion
CREATE TABLE archived_source_records (
  id UUID PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT,
  media_type TEXT,
  content_type TEXT,
  content_compressed BOOLEAN,
  content_length INTEGER,
  published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL,
  language TEXT,
  geographic_indicators JSONB,
  raw_metadata JSONB,
  initial_confidence_flags JSONB,
  scan_status TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archive_reason TEXT -- 'retention_policy' | 'manual' | 'dismissed'
);

CREATE INDEX idx_archived_source_records_source_id ON archived_source_records(source_id);
CREATE INDEX idx_archived_source_records_archived_at ON archived_source_records(archived_at DESC);

-- Function to check if record is protected from retention
CREATE OR REPLACE FUNCTION is_record_protected(record_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_topic_link BOOLEAN;
  has_artifact BOOLEAN;
  has_watch_link BOOLEAN;
  is_not_dismissed BOOLEAN;
BEGIN
  -- Check if linked to any topic
  SELECT EXISTS(
    SELECT 1 FROM topic_source_links WHERE source_record_id = record_id
  ) INTO has_topic_link;
  
  -- Check if has any artifacts
  SELECT EXISTS(
    SELECT 1 FROM analytic_artifacts WHERE source_record_id = record_id
  ) INTO has_artifact;
  
  -- Check if linked to any watch item
  SELECT EXISTS(
    SELECT 1 FROM watch_item_records WHERE source_record_id = record_id
  ) INTO has_watch_link;
  
  -- Check if not dismissed
  SELECT scan_status != 'dismissed' INTO is_not_dismissed
  FROM source_records WHERE id = record_id;
  
  -- Protected if ANY condition is true
  RETURN has_topic_link OR has_artifact OR has_watch_link OR is_not_dismissed;
END;
$$ LANGUAGE plpgsql;

-- Helper function to detect media type from URL
CREATE OR REPLACE FUNCTION detect_media_type_from_url(url TEXT)
RETURNS TEXT AS $$
BEGIN
  IF url ~* 'youtube\.com|youtu\.be|vimeo\.com' THEN
    RETURN 'video';
  ELSIF url ~* 'podcast|spotify\.com.*episode|anchor\.fm' THEN
    RETURN 'podcast';
  ELSIF url ~* '\.mp3|\.wav|\.m4a|soundcloud\.com' THEN
    RETURN 'audio';
  ELSE
    RETURN 'article';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Content Storage Strategy:**

- `content_type`: Determines what level of content is stored
- `full_text`: Complete article text (default, for high-value sources)
- `summary`: Excerpt + first 2000 chars (for low-value sources)
- `structured`: Cleaned HTML with structure (for structure-aware analysis)
- `minimal`: Excerpt only (for social media, low-priority)
- `content_compressed`: Gzip compression flag for content > 50KB
- `content_length`: Original length for optimization decisions
- Links stored in `raw_metadata.links` array: `[{ url, text, context? }]`

### 1.2 Content Extractor Enhancement

**File:** `backend/src/services/ingestion/ContentExtractor.ts`**Enhancements:**

- Extract links from HTML before converting to text
- Store content length and optimization metadata
- Support content type selection based on source configuration

**New Methods:**

```typescript
interface ExtractedContent {
  title: string;
  textContent: string;
  htmlContent: string;
  excerpt: string;
  byline?: string;
  siteName?: string;
  length: number;
  links: Array<{ url: string; text: string; context?: string }>; // NEW
  headings: string[]; // NEW - extracted from HTML
}

// Extract links from HTML
async extractLinks(html: string, baseUrl: string): Promise<Link[]>

// Extract with optimization options
async extractWithOptimization(
  url: string, 
  options: { 
    contentType?: 'full_text' | 'summary' | 'structured' | 'minimal',
    maxLength?: number 
  }
): Promise<ExtractedContent>
```

**Link Extraction Logic:**

- Parse HTML with jsdom
- Extract all `<a>` tags with `href`, link text, and surrounding context (50 chars before/after)
- Resolve relative URLs to absolute
- Filter out navigation, footer, and ad links
- Store in `raw_metadata.links` array

### 1.3 Content Optimizer Service

**File:** `backend/src/services/ingestion/ContentOptimizer.ts` (New)**Purpose:** Determine optimal content storage strategy based on source value and content length.

```typescript
interface ContentOptimizationStrategy {
  contentType: 'full_text' | 'summary' | 'structured' | 'minimal';
  shouldCompress: boolean;
  maxLength?: number;
}

class ContentOptimizer {
  // Determine storage strategy based on source value and content length
  determineStrategy(
    sourceValue: number | null, // 1-5 rating
    contentLength: number,
    isLinkedToTopic: boolean
  ): ContentOptimizationStrategy

  // Optimize content based on strategy
  optimizeContent(
    extracted: ExtractedContent,
    strategy: ContentOptimizationStrategy
  ): string

  // Compress content if needed
  compressContent(content: string): { compressed: Buffer, originalLength: number }

  // Decompress content for analysis
  decompressContent(compressed: Buffer): string
}
```

**Optimization Rules:**

- **High-value sources** (value rating ≥ 4): Always store `full_text`
- **Low-value sources** (value rating ≤ 2): Store `summary` or `minimal`
- **Content length**:
- < 10KB: Store full text
- 10-50KB: Store full text, consider compression
- > 50KB: Store first 20KB + summary + links, compress
- > 100KB: Store excerpt + first 10KB + full link list, compress
- **Linked to topics**: Always keep full content
- **Dismissed records**: Can archive/compress after 30 days

### 1.4 Media Type Detection

**File:** `backend/src/services/ingestion/MediaTypeDetector.ts` (New)

```typescript
type MediaType = 'article' | 'video' | 'podcast' | 'audio' | 'other';

class MediaTypeDetector {
  detectFromUrl(url: string): MediaType
  detectFromMetadata(metadata: Record<string, any>): MediaType
  extractMediaMetadata(url: string, mediaType: MediaType): Promise<MediaMetadata>
}
```

**Detection Logic:**

- URL pattern matching (YouTube, Vimeo, podcast platforms)
- RSS feed metadata analysis
- File extension detection
- Platform-specific metadata extraction

### 1.5 Update Ingestion Services

**Files:**

- `backend/src/services/ingestion/RssIngestionService.ts`
- `backend/src/services/ingestion/ManualInputService.ts`

**Changes:**

- Detect media type during ingestion
- Extract links during content extraction
- Apply content optimization strategy
- Store `media_type`, `content_type`, `content_length`, and links
- Store compressed content if strategy requires it

**Updated Flow:**

```javascript
1. Fetch RSS/manual content
2. Detect media type
3. Extract content with Readability
4. Extract links from HTML
5. Determine optimization strategy (based on source value)
6. Optimize content (truncate, compress if needed)
7. Store: content, media_type, content_type, content_length, links in raw_metadata
```



### 1.6 Frontend Types Update

**Files:**

- `src/types/osint.ts` - Add `mediaType`, `contentType`, `contentLength` to `SourceRecord`
- `src/types/database.ts` - Update database types
- `src/types/ingestion.ts` - Add `MediaType`, `MediaMetadata`, `Link` types

---

## Phase 2: Video/Audio Transcription with Workflow Integration

**Goal:** Enable transcription for video/audio content with full workflow integration.

### 2.1 Transcription Service

**File:** `backend/src/services/transcription/TranscriptionService.ts`

```typescript
interface TranscriptionService {
  isAvailable(): boolean;
  transcribe(url: string, mediaType: MediaType): Promise<TranscriptResult>;
}

interface TranscriptResult {
  text: string;
  language: string;
  segments?: Array<{ start: number; end: number; text: string }>;
  confidence?: number;
}
```

**File:** `backend/src/services/transcription/YouTubeTranscriptionService.ts`

- Use `ai-youtube-transcript` npm package (no API key required)
- Extract video ID from YouTube URL
- Fetch captions/subtitles (prefer manual over auto-generated)
- Handle multiple languages
- Store transcript in `content` field (same as article text)
- Apply same content optimization as articles

**Package:** `npm install ai-youtube-transcript`

### 2.2 Transcription Routes

**File:** `backend/src/routes/transcription.ts`

- `POST /api/transcription/transcribe/:sourceRecordId` - Trigger transcription
- `GET /api/transcription/:sourceRecordId` - Get transcript if available
- `GET /api/transcription/status/:sourceRecordId` - Check transcription status

### 2.3 Content Extraction Integration

**File:** `backend/src/services/ingestion/ContentExtractor.ts`

- Add `extractVideoContent(url: string): Promise<string | null>` - Use YouTube transcription
- Add `extractAudioContent(url: string): Promise<string | null>` - Placeholder for future
- Apply content optimization to transcripts (same rules as articles)

### 2.4 Frontend: Transcription UI

**Files:**

- `src/services/transcription.service.ts` - Frontend service
- `src/components/SourceRecords/TranscriptionButton.tsx` - Transcription button with loading states
- Update `src/components/SourceRecords/SourceRecordDetail.tsx` - Show transcript and status

### 2.5 Workflow Integration: Transcription Status Indicators

**Files:**

- `src/components/Scan/ScanRecordCard.tsx` - Add transcription status badge
- "📝 Transcribed" if video/audio has content
- "🎥 Needs Transcription" if video/audio lacks content
- Click badge to navigate to detail page
- `src/components/SourceRecords/SourceRecordCard.tsx` - Add status indicator
- `backend/src/routes/sourceRecords.ts` - Add `has_transcript` computed field to scan query

**Workflow Benefit:** Analysts can quickly identify which videos/audio need transcription in scan view.---

## Phase 3: Enhanced Analysis with Content Preparation

**Goal:** Implement key facts extraction, topic summarization, and enhanced prompts with content preparation.

### 3.1 Content Preparation Service

**File:** `backend/src/services/analysis/ContentPreparer.ts` (New)**Purpose:** Prepare content for genAI analysis with metadata, links, and structure.

```typescript
interface PreparedContent {
  text: string; // Main content (decompressed if needed)
  metadata: {
    author?: string;
    siteName?: string;
    publishedAt?: Date;
    excerpt?: string;
    url: string;
  };
  links: Array<{
    url: string;
    text: string;
    context?: string;
  }>;
  structure?: {
    headings: string[]; // H1-H6 headings
    wordCount: number;
  };
}

class ContentPreparer {
  async prepareForAnalysis(record: SourceRecord): Promise<PreparedContent>
  // Decompress content if needed
  // Extract links from raw_metadata
  // Extract structure from htmlContent if stored
  // Combine metadata from record and raw_metadata
}
```



### 3.2 Enhanced genAI Prompts

**File:** `backend/src/services/ollamaService.ts`**Update all analysis methods** to use `PreparedContent` and enhanced prompts:

```typescript
function buildAnalysisPrompt(
  content: PreparedContent,
  analysisType: 'summary' | 'entities' | 'tone' | 'key_facts',
  sourceMetadata?: { name: string; reliabilityRating: string }
): string {
  return `
You are analyzing a web page/article for intelligence purposes.

SOURCE CONTEXT:
- Site: ${content.metadata.siteName || 'Unknown'}
- Author: ${content.metadata.author || 'Unknown'}
- Published: ${content.metadata.publishedAt?.toISOString() || 'Unknown'}
- Original URL: ${content.metadata.url}
- Word Count: ${content.structure?.wordCount || 'Unknown'}
${sourceMetadata ? `- Source: ${sourceMetadata.name} (${sourceMetadata.reliabilityRating} reliability)` : ''}

CONTENT:
${content.text}

${content.links.length > 0 ? `
RELATED LINKS FOUND IN CONTENT:
${content.links.map(link => 
  `- "${link.text}" → ${link.url}${link.context ? ` (context: ${link.context})` : ''}`
).join('\n')}

Note: These links may provide additional context. Consider whether they support or contradict the main content.
` : ''}

${content.structure?.headings.length > 0 ? `
DOCUMENT STRUCTURE:
${content.structure.headings.join(' → ')}
` : ''}

ANALYSIS TASK: ${getTaskDescription(analysisType)}

INSTRUCTIONS:
- Base analysis only on provided content
- Links are provided for reference (do not fetch them)
- Be explicit about uncertainty
- Distinguish facts stated vs. your inferences
- If content references external sources via links, note this

${getOutputFormat(analysisType)}
`;
}
```



### 3.3 Key Facts Extraction

**File:** `backend/src/services/ollamaService.ts`

```typescript
async extractKeyFacts(content: PreparedContent): Promise<KeyFactsResponse> {
  const prompt = buildAnalysisPrompt(content, 'key_facts');
  // Enhanced prompt includes links and metadata
  // Returns structured facts with confidence scores
}

interface KeyFactsResponse {
  facts: Array<{
    fact: string;
    confidence: number;
    category?: 'event' | 'quote' | 'statistic' | 'claim';
    supportingLinks?: string[]; // URLs from content.links that support this fact
  }>;
}
```

**File:** `backend/src/routes/analysis.ts`

- Add route: `POST /api/analysis/source-records/:id/key-facts`
- Use `ContentPreparer` to prepare content
- Store as `analytic_artifacts` with type `'key_facts'`

**File:** `src/services/analysis.service.ts`

- Add method: `extractKeyFacts(sourceRecordId: string)`

### 3.4 Topic-Level Summarization

**File:** `backend/src/services/ollamaService.ts`

```typescript
async summarizeTopic(
  records: PreparedContent[],
  topicContext: { name: string; description?: string; decisionQuestion?: string }
): Promise<TopicSummaryResponse> {
  // Enhanced prompt includes all records with their metadata and links
  // Synthesizes across multiple sources
  // Identifies conflicting perspectives
}

interface TopicSummaryResponse {
  executiveSummary: string;
  keyDevelopments: string[];
  conflictingPerspectives?: string[];
  timelineHighlights?: string[];
  recommendedNextSteps?: string[];
  crossSourceLinks?: Array<{ // Links mentioned across multiple sources
    url: string;
    mentionedIn: string[]; // Source record titles
  }>;
}
```

**File:** `backend/src/routes/analysis.ts`

- Add route: `POST /api/analysis/topics/:id/summarize`
- Fetch all linked source records
- Prepare content for each using `ContentPreparer`
- Call `ollamaService.summarizeTopic()` with prepared content array
- Store as `analytic_artifacts` with `topic_id` (not `source_record_id`)

**File:** `src/services/analysis.service.ts`

- Add method: `generateTopicSummary(topicId: string)`

### 3.5 Update Existing Analysis Routes

**File:** `backend/src/routes/analysis.ts`**Update existing routes** (`summarize`, `entities`, `tone`) to:

- Use `ContentPreparer` instead of raw text
- Use enhanced prompts with metadata and links
- Maintain backward compatibility (graceful fallback if preparation fails)

### 3.6 Frontend: Enhanced Analysis UI

**Files:**

- Update `src/components/SourceRecords/SourceRecordDetail.tsx` - Add "Extract Key Facts" button
- Update `src/components/Topics/TopicDetailPage.tsx` - Add "Generate Topic Summary" button
- Update `src/components/SourceRecords/ArtifactCard.tsx` - Display key_facts artifacts with links
- Create `src/components/Topics/TopicSummaryCard.tsx` - Display topic-level summaries

---

## Phase 4: Cross-Content Analysis

**Goal:** Compare and analyze content across different media types on the same topic.

### 4.1 Cross-Media Comparison Service

**File:** `backend/src/services/ollamaService.ts`

```typescript
async compareMediaTypes(
  records: Array<{ 
    mediaType: MediaType; 
    content: PreparedContent; 
    sourceName: string 
  }>
): Promise<MediaComparisonResponse> {
  // Enhanced prompt analyzes differences across media types
  // Includes links from all sources
  // Identifies unique coverage and perspective differences
}

interface MediaComparisonResponse {
  coverageAnalysis: {
    uniqueToArticles: string[];
    uniqueToVideos: string[];
    uniqueToPodcasts: string[];
    commonThemes: string[];
  };
  perspectiveDifferences: Array<{
    topic: string;
    articlePerspective: string;
    videoPerspective: string;
    podcastPerspective?: string;
  }>;
  emphasisAnalysis: {
    articleEmphasis: string[];
    videoEmphasis: string[];
    podcastEmphasis?: string[];
  };
  linkAnalysis: {
    sharedLinks: string[]; // Links mentioned across multiple media types
    mediaSpecificLinks: {
      articles: string[];
      videos: string[];
      podcasts: string[];
    };
  };
}
```

**File:** `backend/src/routes/analysis.ts`

- Add route: `POST /api/analysis/topics/:id/compare-media`
- Fetch all linked source records, grouped by `media_type`
- Requires at least 2 different media types
- Prepare content for each record
- Store as `analytic_artifacts` with type `'media_comparison'`

### 4.2 Frontend: Cross-Media Comparison UI

**Files:**

- Create `src/components/Topics/MediaComparisonCard.tsx` - Visualize cross-media analysis
- Update `src/components/Topics/TopicDetailPage.tsx` - Add "Compare Media Types" button (only shown if multiple media types linked)
- Create visual comparison charts showing differences in coverage/perspective

---

## Phase 5: Daily Brief Foundation

**Goal:** Build data aggregation infrastructure for daily briefs.

### 5.1 Daily Brief Data Service

**File:** `backend/src/services/dailyBriefService.ts`

```typescript
interface OrganizationOverview {
  dateRange: { start: Date; end: Date };
  stats: {
    newRecords: number;
    activeTopics: number;
    newClaims: number;
    newEvidence: number;
    newArtifacts: number; // AI analysis artifacts created
  };
  recentActivity: Array<{ 
    type: string; 
    description: string; 
    timestamp: Date;
    link?: string; // Link to relevant record/topic
  }>;
}

interface TopicHighlight {
  topicId: string;
  topicName: string;
  status: TopicStatus;
  activityCount: number;
  newEvidenceCount: number;
  summary?: string; // From topic summary artifact
  keyDevelopments?: string[];
  mediaTypes: MediaType[]; // Types of content linked
}

interface TopStory {
  sourceRecordId: string;
  title: string;
  sourceName: string;
  sourceReliability: ReliabilityRating;
  publishedAt: Date;
  mediaType: MediaType;
  summary?: string; // From summary artifact
  linkedTopics: Array<{ id: string; name: string }>;
  relevanceScore?: number;
  keyFacts?: string[]; // From key_facts artifact
}
```

**Methods:**

- `getOrganizationOverview(organizationId, date)` - Aggregate stats and activity
- `getTopicHighlights(organizationId, date, limit)` - Active topics with summaries
- `getTopStories(organizationId, date, limit)` - Most relevant records with artifacts

### 5.2 Daily Brief Routes

**File:** `backend/src/routes/dailyBrief.ts`

- `GET /api/daily-brief/:organizationId` - Get aggregated data
- Query params: `date` (optional, defaults to today)
- Returns: `{ overview, highlights, topStories }`

### 5.3 Frontend: Daily Brief Service

**File:** `src/services/dailyBrief.service.ts`

- `getDailyBriefData(organizationId, date?)` - Fetch aggregated data

---

## Phase 6: Daily Brief Generation

**Goal:** Generate AI-powered daily briefs in structured and narrative formats.

### 6.1 Brief Generation Service

**File:** `backend/src/services/dailyBriefService.ts`

```typescript
async generateBrief(
  organizationId: string, 
  date: Date, 
  format: 'structured' | 'narrative'
): Promise<DailyBrief> {
  // Fetch aggregated data (from Phase 5)
  // For structured: Organize into sections
  // For narrative: Use Ollama to generate flowing summary
  // Store in database
}

interface DailyBrief {
  id: string;
  organizationId: string;
  briefDate: Date;
  format: 'structured' | 'narrative';
  content: DailyBriefContent;
  generatedAt: Date;
  generatedBy: string;
  reviewed: boolean;
}

interface StructuredBriefContent {
  executiveSummary: string;
  topicHighlights: TopicHighlight[];
  topStories: TopStory[];
  claimsUpdates: Array<{
    claimId: string;
    claimText: string;
    status: CorroborationStatus;
    newEvidence: number;
  }>;
  recommendedActions: string[];
}

interface NarrativeBriefContent {
  narrative: string; // Flowing text summary
  sections: string[]; // Section headers for navigation
}
```



### 6.2 Ollama Integration for Narrative Briefs

**File:** `backend/src/services/ollamaService.ts`

```typescript
async generateNarrativeBrief(
  overview: OrganizationOverview,
  highlights: TopicHighlight[],
  stories: TopStory[]
): Promise<string> {
  // Enhanced prompt includes all brief data
  // Generates human-readable narrative
  // Sections: Overview, Key Developments, Topic Updates, Important Stories, Analysis Insights
  // References links and cross-media analysis when available
}
```



### 6.3 Database: Brief Storage

**File:** `supabase/migrations/[timestamp]_daily_briefs.sql`

```sql
CREATE TABLE daily_briefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brief_date DATE NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('structured', 'narrative')),
  content JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT NOT NULL,
  reviewed BOOLEAN DEFAULT false,
  UNIQUE(organization_id, brief_date, format)
);

CREATE INDEX idx_daily_briefs_org_date ON daily_briefs(organization_id, brief_date DESC);
CREATE INDEX idx_daily_briefs_reviewed ON daily_briefs(organization_id, reviewed, brief_date DESC);
```

**Alternative:** Store in `analytic_artifacts` with type `'daily_brief'` (reuses existing infrastructure).

### 6.4 Brief Routes

**File:** `backend/src/routes/dailyBrief.ts`

- `POST /api/daily-brief/:organizationId/generate` - Generate brief
- Body: `{ date?: string, format: 'structured' | 'narrative' }`
- `GET /api/daily-brief/:organizationId` - Get existing brief
- Query params: `date`, `format`
- Returns brief if exists, or generates if `generate=true`
- `GET /api/daily-brief/:organizationId/history` - List past briefs
- `PATCH /api/daily-brief/:organizationId/:briefId/review` - Mark as reviewed

### 6.5 Frontend: Daily Brief UI

**Files:**

- `src/components/DailyBrief/DailyBriefPage.tsx` - Main brief view
- `src/components/DailyBrief/BriefHeader.tsx` - Date selector, format toggle
- `src/components/DailyBrief/StructuredBriefView.tsx` - Structured format display
- `src/components/DailyBrief/NarrativeBriefView.tsx` - Narrative format display
- `src/components/DailyBrief/BriefSection.tsx` - Reusable section component
- Update `src/components/Layout/Sidebar.tsx` - Add "Daily Brief" navigation
- Update `src/App.tsx` - Add route `/daily-brief`

**File:** `src/services/dailyBrief.service.ts`

- `generateBrief(organizationId, date, format)`
- `getBrief(organizationId, date, format)`
- `getBriefHistory(organizationId, limit?)`
- `markBriefReviewed(briefId)`

---

## Phase 7: Workflow Enhancements

**Goal:** Enhance OSINT workflow with filtering, auto-transcription, and brief integration.

### 7.1 Scan View Media Type Filtering

**Files:**

- `src/components/Scan/ScanPage.tsx` - Add media type filter dropdown
- Options: "All" | "Articles" | "Videos" | "Podcasts" | "Audio" | "Other"
- Persist in URL query params
- `backend/src/routes/sourceRecords.ts` - Add `media_type` filter to scan endpoint
- Query param: `media_type` (optional, can be array)
- Works with existing filters (scan_status, domain, date)

**Benefit:** Analysts can focus on specific media types during triage.

### 7.2 Auto-Transcription Configuration

**Files:**

- `supabase/migrations/[timestamp]_auto_transcribe_config.sql` - Already added in Phase 1
- `backend/src/services/ingestion/IngestionController.ts` - Auto-transcription logic
- After inserting video/audio record, check `sources.auto_transcribe`
- If enabled, trigger transcription automatically
- Store transcript with content optimization applied
- `src/components/Sources/EditSourceModal.tsx` - Add auto-transcribe toggle
- Checkbox: "Auto-transcribe videos/audio from this source"
- Help text explaining impact

**Note:** For high-volume transcription, consider using GitHub Actions workflow to process transcription queue, or implement async processing with webhook callbacks.**Benefit:** High-value video sources can have transcripts available immediately.

### 7.3 Daily Brief Integration

**Files:**

- `src/components/Dashboard/DashboardPage.tsx` - Add brief preview widget
- Show today's brief summary
- "Generate Brief" button if not created
- `src/components/Scan/ScanPage.tsx` - Add brief link in header
- "View Today's Brief" button
- `src/components/Layout/Header.tsx` - Optional brief indicator badge

**Benefit:** Briefs accessible from key workflow points.

### 7.4 Content Retention & Archival Management

**Goal:** Implement configurable per-source retention policies to manage storage by automatically archiving or deleting old records that aren't actively used.

#### 7.4.1 Retention Policy Service

**File:** `backend/src/services/retention/RetentionPolicyService.ts` (New)

```typescript
interface RetentionPolicy {
  maxItems?: number; // Keep N most recent items
  retentionDays?: number; // Keep items from last N days
  action: 'delete' | 'archive'; // What to do with items outside window
}

interface RetentionResult {
  processed: number;
  archived: number;
  deleted: number;
  protected: number; // Items protected from retention
  errors: string[];
}

class RetentionPolicyService {
  // Apply retention policy for a source
  async applyRetentionPolicy(
    sourceId: string,
    policy: RetentionPolicy
  ): Promise<RetentionResult>

  // Check if record is protected (all protection criteria)
  async isRecordProtected(recordId: string): Promise<boolean> {
    // Protected if ANY of:
    // - Linked to any topic
    // - Has any artifacts
    // - Linked to any watch item
    // - Not dismissed (scan_status != 'dismissed')
  }

  // Get records eligible for retention (outside window, not protected)
  async getEligibleRecords(
    sourceId: string,
    policy: RetentionPolicy
  ): Promise<SourceRecord[]>

  // Archive record (move to archived_source_records)
  async archiveRecord(recordId: string, reason: string): Promise<void>

  // Delete record permanently
  async deleteRecord(recordId: string): Promise<void>
}
```

**Protection Logic:**A record is **protected** from retention if **ANY** of these conditions are true:

- Linked to any topic (`topic_source_links` table)
- Has any AI analysis artifacts (`analytic_artifacts` table)
- Linked to any watch item (`watch_item_records` table)
- Not dismissed (`scan_status != 'dismissed'`)

**Retention Logic:**

1. For each source with retention policy configured:

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Fetch all records for source, ordered by `published_at DESC` (or `ingested_at DESC`)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Apply `maxItems` limit: Keep only N most recent
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Apply `retentionDays` limit: Keep only items from last N days
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - For each record outside the window:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Check if protected (using `is_record_protected()` function)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - If protected: Skip
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - If not protected: Apply action (archive or delete)

#### 7.4.2 Retention Job Service

**File:** `backend/src/services/retention/RetentionJob.ts` (New)

```typescript
class RetentionJob {
  // Run retention for all sources with policies configured in an organization
  async runRetentionForOrganization(organizationId: string): Promise<RetentionResult>

  // Run retention for single source
  async runRetentionForSource(sourceId: string): Promise<RetentionResult>

  // Process sources in batches to avoid long-running transactions
  async processBatch(sources: Source[], batchSize: number): Promise<RetentionResult>
}
```

**Note:** This service provides execution logic only. Scheduling is handled by GitHub Actions (see 7.4.6).**Execution Details:**

- Process sources in batches to avoid long-running transactions
- Log retention actions for audit trail
- Return detailed results for monitoring

#### 7.4.3 Retention Routes

**File:** `backend/src/routes/retention.ts` (New)

- `GET /api/retention/sources/:sourceId/policy` - Get retention policy for source
- `PUT /api/retention/sources/:sourceId/policy` - Update retention policy
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Body: `{ maxItems?: number, retentionDays?: number, action: 'delete' | 'archive' }`
- `POST /api/retention/sources/:sourceId/apply` - Manually trigger retention for source
- `POST /api/retention/organizations/:organizationId/apply` - Run retention for all sources in organization (called by GitHub Actions)
- `GET /api/retention/sources/:sourceId/preview` - Preview what would be archived/deleted
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Returns: `{ eligible: number, protected: number, sample: SourceRecord[] }`
- `GET /api/retention/archived` - List archived records (with filters)
- `POST /api/retention/archived/:id/restore` - Restore archived record

#### 7.4.4 Frontend: Retention Configuration UI

**Files:**

- `src/components/Sources/EditSourceModal.tsx` - Add retention policy section
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "Retention Policy" section with:
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "Max Items" input (optional, number)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "Retention Days" input (optional, number)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "Action" dropdown: "Archive" | "Delete"
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Help text: "Items outside the retention window will be archived/deleted unless they are linked to topics, have artifacts, linked to watch items, or are not dismissed."
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "Preview Impact" button - shows how many items would be affected
- `src/components/Sources/SourcesPage.tsx` - Show retention policy status
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Display retention policy for each source
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Show count of archived items
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "View Archived" link
- `src/components/Sources/ArchivedRecordsPage.tsx` (New) - View archived records
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - List archived records with filters
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - "Restore" button for each record
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Show archive reason and date

#### 7.4.5 Content Optimization Job Service

**File:** `backend/src/services/ingestion/ContentOptimizationJob.ts` (New)

```typescript
class ContentOptimizationJob {
  // Optimize content for an organization
  async optimizeOrganizationContent(organizationId: string): Promise<OptimizationResult>

  // Optimize content for a single source
  async optimizeSourceContent(sourceId: string): Promise<OptimizationResult>

  // Compress content > 50KB
  async compressLargeContent(recordId: string): Promise<void>

  // Update content_type based on source value changes
  async updateContentTypesForSource(sourceId: string): Promise<void>
}
```

**Note:** This service provides execution logic only. Scheduling is handled by GitHub Actions (see 7.4.6).**Optimization Tasks:**

- Compress content > 50KB
- Update `content_type` based on source value changes
- Works in conjunction with retention policy

**File:** `backend/src/routes/optimization.ts` (New)

- `POST /api/optimization/organizations/:organizationId/apply` - Run optimization for all sources in organization (called by GitHub Actions)
- `POST /api/optimization/sources/:sourceId/apply` - Manually trigger optimization for source
- `GET /api/optimization/sources/:sourceId/status` - Get optimization status and stats

#### 7.4.6 GitHub Actions Workflows

**Files:** `.github/workflows/` (New)**Scheduled Jobs via GitHub Actions:**

1. **Retention Job** (`.github/workflows/retention-job.yml`)

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Schedule: Daily at 2 AM UTC (configurable)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Triggers: `POST /api/retention/organizations/:organizationId/apply`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Processes all organizations with retention policies
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Logs results to GitHub Actions logs

2. **Content Optimization Job** (`.github/workflows/content-optimization.yml`)

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Schedule: Weekly on Sundays at 3 AM UTC (configurable)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Triggers: `POST /api/optimization/organizations/:organizationId/apply`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Compresses large content, updates content types
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Logs results to GitHub Actions logs

3. **Daily Brief Generation** (`.github/workflows/daily-brief.yml`) - Optional

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Schedule: Daily at 6 AM UTC (configurable)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Triggers: `POST /api/daily-brief/:organizationId/generate`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Generates daily briefs for all organizations
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Can be disabled per organization

**Workflow Structure:**

```yaml
name: Retention Job
on:
  schedule:
        - cron: '0 2 * * *' # Daily at 2 AM UTC
  workflow_dispatch: # Allow manual trigger

jobs:
  retention:
    runs-on: ubuntu-latest
    steps:
            - name: Run Retention
        run: |
          curl -X POST "${{ secrets.API_URL }}/api/retention/organizations/$ORG_ID/apply" \
            -H "Authorization: Bearer ${{ secrets.API_KEY }}"
```

**Benefits of GitHub Actions:**

- No need for internal scheduler infrastructure
- Works well with Vercel (avoids long-running process limitations)
- Centralized logging and monitoring
- Easy to adjust schedules per organization
- Can trigger manually via `workflow_dispatch`
- Free for public repos, generous limits for private repos

**Alternative Consideration:**

- Vercel Cron Jobs (if available on your plan) could be used instead
- However, GitHub Actions provides better visibility and control
- Recommended: Use GitHub Actions for all scheduled jobs

#### 7.4.7 Content Optimization Management UI

**Files:**

- `src/components/Sources/SourcesPage.tsx` - Show content optimization status
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Display storage stats per source
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Show compression status
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Show retention policy status
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                - Show last optimization run time

**Benefit:** Automatic storage management through retention policies and content optimization, triggered by GitHub Actions.---

## Implementation Strategy

### Phased Rollout

1. **Phase 1** (Foundation): Content optimization + media types
2. **Phase 2** (Transcription): Video/audio support with workflow integration
3. **Phase 3** (Enhanced Analysis): Key facts + topic summarization with enhanced prompts
4. **Phase 4** (Cross-Media): Comparison analysis (depends on Phase 3)
5. **Phase 5-6** (Briefs): Data aggregation + generation (can be done together)
6. **Phase 7** (Enhancements): Workflow improvements + retention management (incremental, independent)

### Key Design Decisions

1. **Content Storage:**

- Store optimized content based on source value and length
- Extract and store links separately (not lost in text conversion)
- Compress large content, decompress on-demand
- Track content type and length for optimization decisions

2. **Analysis Quality:**

- Enhanced prompts with metadata, links, and structure
- Content preparation service standardizes input
- Links included for context (not fetched, just referenced)
- Better analysis through richer context

3. **Storage Efficiency:**

- Target: 40-60% storage reduction
- Average content size: < 20KB per record
- Compression for articles > 50KB
- Optimization based on source value and usage
- **Retention Policies**: Configurable per-source limits (max items or days)
- **Automatic Cleanup**: Archive or delete old records outside retention window
- **Protection**: Records linked to topics, with artifacts, linked to watch items, or not dismissed are protected

4. **Workflow Integration:**

- All enhancements are additive
- Transcription status visible in scan view
- Media type filtering for focused triage
- Briefs accessible from key workflow points

### Dependencies

- **Phase 2:** `ai-youtube-transcript` npm package
- **Phase 3:** Requires `ContentPreparer` (part of Phase 3)
- **Phase 4:** Requires Phase 3 (topic summarization)
- **Phase 6:** Requires Phases 3-5

### Testing Considerations

- Content extraction with various article lengths
- Link extraction accuracy
- Compression/decompression performance
- Enhanced prompts produce better analysis
- Storage savings from optimization
- Transcription with different video types
- Daily brief generation with various data volumes
- Both brief formats (structured vs narrative)

### Performance Considerations

- Content compression: Decompress on-demand, cache in memory
- Transcription: Synchronous for YouTube (1-5 seconds per video)
- Topic summarization: Chunk large topics if > 20 records
- Daily brief generation: Cache briefs, optimize queries
- Content preparation: Cache prepared content for active analysis

### Storage Efficiency Metrics

**Target Metrics:**

- Average content size: < 20KB per record (currently ~50KB+)
- Storage reduction: 40-60% for optimized content
- Link coverage: 90%+ of articles with links have them extracted
- Analysis quality: Maintained or improved with enhanced prompts

---

## Workflow Compatibility

### Current OSINT Workflow

1. **Ingestion** → Source records created (RSS/API/manual)
2. **Environmental Scan** → Rapid triage (dismiss, link, watch, indicator)
3. **Watch Items** → Lightweight monitoring
4. **Topics** → Deep analysis with claims/corroboration
5. **Analysis** → On-demand AI analysis (summarize, entities, tone)

### Compatibility Assessment

**All Phases: ✅ FULLY COMPATIBLE**

- **Additive**: New features don't replace existing functionality
- **Backward Compatible**: Existing data and workflows continue to work
- **Optional**: Enhanced features can be used when needed
- **Non-Breaking**: No schema changes that break existing queries
- **Gradual**: Can be implemented in phases without disruption

**Workflow Integration:**

- Phase 1: Media type metadata (no workflow change)
- Phase 2: Transcription status indicators in scan view (adds visibility)
- Phase 3: New analysis buttons (adds capabilities)
- Phase 4: New topic analysis option (adds capabilities)
- Phase 5-6: New navigation item (standalone feature)
- Phase 7: Filtering and integration (enhances existing workflows)

### Migration Strategy

**Database Migrations:**

1. Phase 1: Add `media_type`, `content_type`, `content_compressed`, `content_length` columns
2. Phase 1: Add `auto_transcribe` to `sources` table
3. Phase 1: Add retention policy columns to `sources` table (`retention_max_items`, `retention_days`, `retention_action`)
4. Phase 1: Create `archived_source_records` table for soft deletion
5. Phase 1: Create `is_record_protected()` function
6. Phase 6: Create `daily_briefs` table

**Backward Compatibility:**

- Existing records: Default to `media_type = 'article'`, `content_type = 'full_text'`
- Existing analysis: Works unchanged (content field structure unchanged)
- Existing workflows: No breaking changes

**Testing Checklist:**

- [ ] Existing source records display correctly (default values)
- [ ] Content optimization doesn't break existing analysis
- [ ] Link extraction works for various HTML structures
- [ ] Compression/decompression maintains content integrity
- [ ] Enhanced prompts produce better analysis