---
name: Manual Article Input with Markdown
overview: Add a modal component to the Source Records page that allows analysts to manually input articles with Markdown editing. The content is converted to plain text for storage (matching how other sources store content), and all metadata fields are editable with auto-detection for geographic indicators and media type.
todos:
  - id: add-markdown-library
    content: Add marked library to package.json for Markdown to plain text conversion
    status: pending
  - id: create-manual-input-modal
    content: Create ManualArticleInputModal component with Markdown editor and all metadata fields
    status: pending
    dependencies:
      - add-markdown-library
  - id: add-geo-detection
    content: Implement geographic indicator auto-detection in modal component
    status: pending
    dependencies:
      - create-manual-input-modal
  - id: add-media-type-detection
    content: Implement media type auto-detection from URL in modal component
    status: pending
    dependencies:
      - create-manual-input-modal
  - id: add-markdown-conversion
    content: Implement Markdown to plain text conversion function
    status: pending
    dependencies:
      - add-markdown-library
      - create-manual-input-modal
  - id: add-service-method
    content: Add createManual() method to sourceRecords.service.ts to call backend API
    status: pending
  - id: integrate-modal
    content: Add Manual Article button and integrate modal into SourceRecordsPage
    status: pending
    dependencies:
      - create-manual-input-modal
      - add-service-method
  - id: add-form-validation
    content: Implement form validation for required fields and URL/date format validation
    status: pending
    dependencies:
      - create-manual-input-modal
---

# Manual Article Input with Markdown Editor

## Overview

Add a modal component accessible from the Source Records page that enables analysts to manually input articles with Markdown editing. Content is converted to plain text for storage (matching existing source record storage format), and all metadata fields are editable with placeholders. Geographic indicators are auto-detected from content, and media type is auto-detected from URL.

## Current State

- ✅ Backend API endpoint exists: `POST /api/ingest/manual` in [`backend/src/routes/ingest.ts`](backend/src/routes/ingest.ts)
- ✅ `ManualInputService` handles source creation/selection and content optimization
- ✅ Content is stored as plain text in `content` field
- ❌ No frontend UI for manual input
- ❌ No Markdown support

## Implementation

### 1. Add Markdown to Plain Text Conversion Library

**File:** `package.json`Add dependency for converting Markdown to plain text:

- `marked` - Markdown parser (can extract plain text)
- Or `remark` + `remark-plain-text` - Modern alternative

**Decision:** Use `marked` for simplicity and compatibility.

### 2. Create Manual Article Input Modal Component

**File:** `src/components/SourceRecords/ManualArticleInputModal.tsx` (New)**Features:**

- Markdown editor (textarea with preview or simple textarea)
- All metadata fields with placeholders:
- **Title** (required, text input)
- **Content** (required, Markdown textarea with character count)
- **URL** (optional, text input with validation)
- **Source Name** (optional, text input - defaults to "Manual Input" if empty)
- **Published Date** (optional, date picker - defaults to today)
- **Language** (optional, text input - placeholder: "e.g., en, es, fr")
- **Geographic Indicators** (optional, text input - auto-detected from content, comma-separated)
- **Media Type** (auto-detected from URL, display-only or manual override)
- Auto-detection:
- **Geographic Indicators**: Extract from content using existing logic from `ManualInputService.extractGeographicIndicators()`
- **Media Type**: Detect from URL using `MediaTypeDetector.detectFromUrl()` pattern
- Form validation
- Loading states
- Error handling
- Success callback (refresh source records list)

**Component Structure:**

```typescript
interface ManualArticleInputModalProps {
  organizationId: string;
  onClose: () => void;
  onSuccess: () => void; // Callback after successful submission
}

export function ManualArticleInputModal({
  organizationId,
  onClose,
  onSuccess,
}: ManualArticleInputModalProps) {
  // Form state
  // Markdown to plain text conversion
  // Auto-detection logic
  // Submit handler
}
```

**Markdown Conversion:**

- Use `marked` to parse Markdown
- Extract plain text from parsed tokens
- Store plain text in `content` field (matching existing storage format)

### 3. Add Manual Input Service Method

**File:** `src/services/sourceRecords.service.ts`Add method to call existing backend API:

```typescript
async createManual(
  organizationId: string,
  data: {
    title: string;
    content: string; // Plain text (converted from Markdown)
    url?: string;
    sourceName?: string;
    language?: string;
    publishedAt?: string; // ISO date string
  }
): Promise<{ success: boolean; record?: SourceRecord }> {
  // Call POST /api/ingest/manual
  // Convert dates, handle errors
}
```



### 4. Integrate Modal into Source Records Page

**File:** `src/components/SourceRecords/SourceRecordsPage.tsx`**Changes:**

- Add "Add Manual Article" button in header (next to Filters/Refresh buttons)
- Import and render `ManualArticleInputModal`
- Manage modal open/close state
- Refresh records list after successful submission

**Button Placement:**

```tsx
<button
  onClick={() => setShowManualInput(true)}
  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-250"
>
  <Plus size={18} />
  <span className="hidden sm:inline">Add Manual Article</span>
</button>
```



### 5. Geographic Indicator Auto-Detection

**File:** `src/components/SourceRecords/ManualArticleInputModal.tsx`Implement client-side geographic indicator extraction (matching backend logic):

```typescript
function extractGeographicIndicators(text: string): string[] {
  const indicators: string[] = [];
  const commonPlaces = [
    'United States', 'USA', 'America', 'UK', 'United Kingdom',
    'China', 'Russia', 'Europe', 'Asia', 'Middle East', 'Africa',
    'Washington', 'New York', 'London', 'Moscow', 'Beijing',
    'California', 'Texas', 'Florida'
  ];

  commonPlaces.forEach(place => {
    if (text.includes(place)) {
      indicators.push(place);
    }
  });

  return [...new Set(indicators)];
}
```

**Trigger:** Auto-detect when content changes (debounced).

### 6. Media Type Auto-Detection

**File:** `src/components/SourceRecords/ManualArticleInputModal.tsx`Implement client-side media type detection (matching backend pattern):

```typescript
function detectMediaTypeFromUrl(url: string): MediaType {
  if (!url) return 'article';
  
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(url)) {
    return 'video';
  }
  if (/podcast|spotify\.com.*episode|anchor\.fm/i.test(url)) {
    return 'podcast';
  }
  if (/\.mp3|\.wav|\.m4a|soundcloud\.com/i.test(url)) {
    return 'audio';
  }
  return 'article';
}
```

**Display:** Show detected media type (read-only or allow manual override).

### 7. Markdown to Plain Text Conversion

**File:** `src/components/SourceRecords/ManualArticleInputModal.tsx`Convert Markdown to plain text before submission:

```typescript
import { marked } from 'marked';

function markdownToPlainText(markdown: string): string {
  // Parse Markdown
  const tokens = marked.lexer(markdown);
  
  // Extract plain text from tokens
  function extractText(tokens: any[]): string {
    return tokens.map(token => {
      if (token.type === 'paragraph' || token.type === 'text') {
        return token.text || '';
      }
      if (token.tokens) {
        return extractText(token.tokens);
      }
      if (token.items) {
        return extractText(token.items);
      }
      return '';
    }).join('\n\n');
  }
  
  return extractText(tokens).trim();
}
```

**Alternative:** Use `marked` with custom renderer that outputs plain text, or use `strip-markdown` library.

### 8. Form Validation

**File:** `src/components/SourceRecords/ManualArticleInputModal.tsx`**Required Fields:**

- Title (non-empty)
- Content (non-empty after Markdown conversion)

**Optional Fields:**

- URL (if provided, validate URL format)
- Published Date (if provided, validate date format)
- Language (if provided, validate format - 2-3 letter code)

**Error Display:**

- Show validation errors inline
- Disable submit button if required fields invalid

### 9. UI/UX Enhancements

**File:** `src/components/SourceRecords/ManualArticleInputModal.tsx`**Features:**

- Character count for content field
- Preview of plain text conversion (optional, collapsible)
- Auto-detection indicators (show when geo indicators/media type detected)
- Loading spinner during submission
- Success message before closing
- Error message display

**Styling:**

- Match existing modal patterns (see `CreateSourceModal.tsx`, `CreateWatchItemModal.tsx`)
- Use Tailwind CSS classes
- Dark theme (stone-950 background)
- Responsive layout

## Data Flow

```javascript
User Input (Markdown)
    ↓
Markdown → Plain Text Conversion
    ↓
Form Validation
    ↓
Auto-detect: Geo Indicators, Media Type
    ↓
API Call: POST /api/ingest/manual
    ↓
ManualInputService (backend)
    ↓
Content Optimization (if needed)
    ↓
Database: source_records table
    ↓
Success → Refresh Source Records List
```



## Integration with Enhanced AI Analysis Plan

**Compatibility:** ✅ Fully compatible

- Content stored as plain text (matches Phase 1 storage format)
- Media type detection aligns with Phase 1 media type support
- Geographic indicators stored in `geographic_indicators` field (existing format)
- Content optimization handled by existing `ManualInputService` (Phase 1)
- No conflicts with Phase 2 enhanced analysis (content preparation works with plain text)

**No changes needed** to the Enhanced AI Analysis plan.

## Testing Considerations

- Markdown conversion accuracy (headers, lists, links, emphasis)
- Geographic indicator detection from various content
- Media type detection from various URL patterns
- Form validation (required fields, URL format, date format)
- Error handling (API errors, network failures)
- Success flow (modal closes, list refreshes)
- Edge cases (empty content, very long content, special characters)

## Files to Create/Modify

**New Files:**

- `src/components/SourceRecords/ManualArticleInputModal.tsx`

**Modified Files:**

- `package.json` - Add `marked` dependency
- `src/components/SourceRecords/SourceRecordsPage.tsx` - Add button and modal integration
- `src/services/sourceRecords.service.ts` - Add `createManual()` method