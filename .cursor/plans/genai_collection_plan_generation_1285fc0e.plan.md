---
name: GenAI Collection Plan Generation
overview: Implement GenAI-powered Collection Plan generation with on-demand suggestions, smart prompting, and workflow integration. Includes backend API routes, Ollama service methods, frontend UI updates, audit logging, and integration with Watch Item escalation and Indicator triggers.
todos:
  - id: backend-ollama-method
    content: Add generateCollectionPlanSuggestions() method to OllamaService with prompt building and JSON parsing
    status: pending
  - id: backend-analysis-route
    content: Create POST /api/analysis/topics/:id/collection-plan-suggestions route with data fetching, Ollama call, and audit logging
    status: pending
  - id: backend-audit-service
    content: Add collection_plan_suggestions_generated action type to auditService
    status: pending
  - id: frontend-service-layer
    content: Add generateCollectionPlanSuggestions() method to analysis.service.ts
    status: pending
  - id: frontend-collection-plan-card
    content: Add 'Generate Suggestions' button, loading states, and merge/replace/add dialog to CollectionPlanCard
    status: pending
  - id: frontend-smart-prompting
    content: Add smart prompt banner logic to TopicDetailPage (show after 2+ records, dismissible)
    status: pending
  - id: workflow-watch-item
    content: Add optional Collection Plan suggestion generation after Watch Item escalation
    status: pending
  - id: workflow-indicator
    content: Add async Collection Plan suggestion generation after Indicator trigger creates topic
    status: pending
  - id: type-definitions
    content: Add CollectionPlanSuggestions interface to frontend and backend type files
    status: pending
  - id: error-handling
    content: Implement comprehensive error handling, validation, and graceful degradation
    status: pending
---

# GenAI Collection Plan Generation Implementation Plan

## Overview

Add GenAI-powered Collection Plan generation that analyzes topic metadata and linked source records to suggest:

- Source types needed
- Claims to verify
- Coverage gaps
- Sources to avoid

Implementation includes on-demand generation, smart prompting, workflow integration, and comprehensive audit logging.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend: CollectionPlanCard                                │
│  - "Generate Suggestions" button                            │
│  - Smart prompt banner (after 2-3 records)                   │
│  - Merge/Replace/Add options                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Service Layer: analysis.service.ts                          │
│  - generateCollectionPlanSuggestions(topicId)               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend API: /api/analysis/topics/:id/collection-plan       │
│  - Fetches topic + linked records                            │
│  - Calls Ollama service                                     │
│  - Returns structured suggestions                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Ollama Service: ollamaService.ts                            │
│  - generateCollectionPlanSuggestions()                      │
│  - Builds prompt from topic + records                       │
│  - Parses JSON response                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Audit Service: auditService.ts                              │
│  - Logs collection_plan_suggestions_generated               │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### 1. Backend: Ollama Service Method

**File:** `backend/src/services/ollamaService.ts`

Add new method to generate Collection Plan suggestions:

```typescript
async generateCollectionPlanSuggestions(
  records: Array<PreparedContent & { sourceRecordTitle?: string; sourceName?: string }>,
  topicContext: {
    name: string;
    description?: string;
    decisionQuestion?: string;
    keywords?: string[];
  },
  existingPlan?: {
    sourceTypesNeeded: string[];
    claimsToVerify: string[];
    coverageGaps: string[];
    sourcesToAvoid: string[];
  }
): Promise<CollectionPlanSuggestionsResponse>
```

**Key Requirements:**

- Build prompt analyzing topic context and linked source records
- Extract claims from source record content
- Analyze source diversity (types, reliability, geographic coverage)
- Identify temporal and coverage gaps
- Suggest sources to avoid based on reliability ratings
- Return structured JSON with all four suggestion categories
- Handle existing plan (don't duplicate existing items)

**Response Type:**

```typescript
interface CollectionPlanSuggestionsResponse {
  sourceTypesNeeded: string[];
  claimsToVerify: string[];
  coverageGaps: string[];
  sourcesToAvoid: string[];
  confidence?: {
    sourceTypes: number;
    claims: number;
    gaps: number;
    avoid: number;
  };
}
```

### 2. Backend: Analysis API Route

**File:** `backend/src/routes/analysis.ts`

Add new route: `POST /api/analysis/topics/:id/collection-plan-suggestions`

**Implementation Steps:**

1. Fetch topic with metadata (name, description, decision_question, keywords)
2. Fetch all linked source records with content
3. Prepare content using `contentPreparer.prepareForAnalysis()` for each record
4. Fetch existing collection plan (if any)
5. Call `ollamaService.generateCollectionPlanSuggestions()`
6. Audit log: `collection_plan_suggestions_generated`
7. Return suggestions with metadata

**Error Handling:**

- 404 if topic not found
- 400 if no linked records (minimum 1 required, but suggest 2+)
- 503 if Ollama service unavailable
- 500 for other errors

**Audit Logging:**

```typescript
await auditService.logAction({
  action: 'collection_plan_suggestions_generated',
  entityType: 'topic',
  entityId: topicId,
  userId: req.user?.id,
  metadata: {
    linkedRecordsCount: records.length,
    hasExistingPlan: !!existingPlan,
    suggestionsCount: {
      sourceTypes: suggestions.sourceTypesNeeded.length,
      claims: suggestions.claimsToVerify.length,
      gaps: suggestions.coverageGaps.length,
      avoid: suggestions.sourcesToAvoid.length,
    }
  }
});
```

### 3. Frontend: Service Layer

**File:** `src/services/analysis.service.ts`

Add method:

```typescript
async generateCollectionPlanSuggestions(topicId: string): Promise<CollectionPlanSuggestions>
```

**Type Definition:**

```typescript
export interface CollectionPlanSuggestions {
  sourceTypesNeeded: string[];
  claimsToVerify: string[];
  coverageGaps: string[];
  sourcesToAvoid: string[];
}
```

### 4. Frontend: CollectionPlanCard Updates

**File:** `src/components/Topics/CollectionPlanCard.tsx`

**Additions:**

1. **"Generate Suggestions" Button**

   - Show when editing mode is active
   - Disabled while generating
   - Loading state with spinner
   - Position: Above form fields, below header

2. **Smart Prompt Banner**

   - Show when: no plan exists, 2+ linked records, topic is active/monitoring
   - Non-intrusive banner: "You have X linked records. Generate Collection Plan suggestions?"
   - Dismissible (store dismissal in localStorage per topic)
   - Auto-hide after user generates suggestions

3. **Merge/Replace/Add Dialog**

   - When suggestions received and plan exists, show modal:
     - "Replace existing plan" (overwrite all fields)
     - "Merge suggestions" (add new items, keep existing)
     - "Add to existing" (append all suggestions)
   - Default: "Merge suggestions"
   - Apply button populates form fields based on choice

4. **State Management:**

   - `isGenerating: boolean` - loading state
   - `suggestions: CollectionPlanSuggestions | null` - received suggestions
   - `showMergeDialog: boolean` - show merge/replace dialog
   - `promptDismissed: Set<string>` - dismissed prompts per topic

5. **Form Population Logic:**

   - Replace: Set state arrays to suggestions
   - Merge: Combine arrays, remove duplicates
   - Add: Append all suggestions to existing arrays

### 5. Frontend: Smart Prompting Logic

**File:** `src/components/Topics/TopicDetailPage.tsx`

**Add Smart Prompt Check:**

```typescript
const shouldShowCollectionPlanPrompt = (
  topic: OsintTopic,
  linkedRecords: any[],
  collectionPlan: CollectionPlan | null
): boolean => {
  // Check localStorage for dismissal
  const dismissed = localStorage.getItem(`collection-plan-prompt-dismissed-${topic.id}`);
  if (dismissed) return false;
  
  // Show if:
  // - No collection plan exists
  // - 2+ linked source records
  // - Topic is active or monitoring
  // - Topic has decision question or description (shows it's a real requirement)
  return (
    !collectionPlan &&
    linkedRecords.length >= 2 &&
    ['active', 'monitoring'].includes(topic.status) &&
    (topic.decisionQuestion || topic.description)
  );
};
```

**Render Banner:**

- Show above CollectionPlanCard when conditions met
- Include "Generate Suggestions" button
- Include "Dismiss" button (stores in localStorage)

### 6. Workflow Integration: Watch Item Escalation

**File:** `src/components/WatchList/EscalateToTopicModal.tsx`

**After Topic Creation:**

1. After successful escalation, check if topic has 2+ linked records
2. Show optional prompt: "Generate Collection Plan suggestions for this topic?"
3. If yes, call `analysisService.generateCollectionPlanSuggestions()`
4. Navigate to topic detail page
5. CollectionPlanCard will show suggestions (or merge dialog if plan exists)

**Implementation:**

```typescript
// After topic creation in handleSubmit
if (newTopic && linkedRecords.length >= 2) {
  // Optional: Show confirmation dialog
  const shouldGenerate = await showConfirmDialog(
    'Generate Collection Plan suggestions?'
  );
  
  if (shouldGenerate) {
    try {
      const suggestions = await analysisService.generateCollectionPlanSuggestions(newTopic.id);
      // Suggestions will be available when user views topic
    } catch (err) {
      // Non-blocking error - just log
      console.warn('Failed to generate suggestions:', err);
    }
  }
}
```

### 7. Workflow Integration: Indicator Triggers

**File:** `backend/src/routes/indicators.ts`

**After Topic Creation in trigger_indicator:**

1. After topic is created via `trigger_indicator` function
2. Check if topic has any linked records (from indicator context)
3. If 2+ records, asynchronously generate suggestions (don't block response)
4. Log audit event

**Implementation:**

```typescript
// In POST /:id/trigger route, after topic creation
if (topicId && topic) {
  // Check for linked records (if any were linked during trigger)
  const { data: links } = await supabase
    .from('topic_source_links')
    .select('id')
    .eq('topic_id', topicId);
  
  // Async generation (don't block response)
  if (links && links.length >= 2) {
    generateCollectionPlanSuggestionsAsync(topicId).catch(err => {
      console.warn(`Failed to generate suggestions for topic ${topicId}:`, err);
    });
  }
}
```

**Helper Function:**

```typescript
async function generateCollectionPlanSuggestionsAsync(topicId: string) {
  // Call analysis route internally or directly call Ollama service
  // This runs in background, doesn't block indicator trigger response
}
```

### 8. Audit Service Updates

**File:** `backend/src/services/auditService.ts`

**Add New Action Type:**

```typescript
export type AuditAction =
  | 'collection_plan_suggestions_generated'  // NEW
  | 'collection_plan_updated'  // May already exist
  | // ... existing actions
```

**Add Logging Method (if needed):**

```typescript
async logCollectionPlanSuggestionsGenerated(
  topicId: string,
  userId: string | null,
  metadata: {
    linkedRecordsCount: number;
    hasExistingPlan: boolean;
    suggestionsCount: {
      sourceTypes: number;
      claims: number;
      gaps: number;
      avoid: number;
    };
  }
): Promise<void>
```

### 9. Type Definitions

**File:** `src/types/osint.ts`

**Add Interface:**

```typescript
export interface CollectionPlanSuggestions {
  sourceTypesNeeded: string[];
  claimsToVerify: string[];
  coverageGaps: string[];
  sourcesToAvoid: string[];
}
```

**File:** `backend/src/services/ollamaService.ts`

**Add Response Type:**

```typescript
export interface CollectionPlanSuggestionsResponse {
  sourceTypesNeeded: string[];
  claimsToVerify: string[];
  coverageGaps: string[];
  sourcesToAvoid: string[];
  confidence?: {
    sourceTypes: number;
    claims: number;
    gaps: number;
    avoid: number;
  };
}
```

### 10. Error Handling & Validation

**Minimum Data Requirements:**

- Topic must exist
- At least 1 linked source record (suggest 2+ for better results)
- Topic should have name and (description OR decision_question OR keywords)

**Error Messages:**

- "Topic not found"
- "No linked source records. Link at least 1 record before generating suggestions."
- "Insufficient data. Add a description or decision question to the topic for better suggestions."
- "AI analysis service not available"

**Graceful Degradation:**

- If Ollama unavailable, show friendly error message
- If generation fails, allow retry
- If partial data, still generate what's possible

### 11. Testing Considerations

**Test Cases:**

1. Generate suggestions for topic with 2+ records
2. Generate suggestions for topic with existing plan (merge/replace/add)
3. Generate suggestions with minimal data (1 record, basic topic)
4. Error handling: Ollama unavailable
5. Error handling: No linked records
6. Smart prompt appears/disappears correctly
7. Workflow integration: Watch Item escalation
8. Workflow integration: Indicator trigger
9. Audit logging verification
10. Merge/replace/add logic correctness

## File Changes Summary

### Backend Files

- `backend/src/services/ollamaService.ts` - Add `generateCollectionPlanSuggestions()` method
- `backend/src/routes/analysis.ts` - Add `POST /topics/:id/collection-plan-suggestions` route
- `backend/src/services/auditService.ts` - Add `collection_plan_suggestions_generated` action type
- `backend/src/routes/indicators.ts` - Add async suggestion generation after topic creation

### Frontend Files

- `src/services/analysis.service.ts` - Add `generateCollectionPlanSuggestions()` method
- `src/components/Topics/CollectionPlanCard.tsx` - Add "Generate Suggestions" button, merge dialog, smart prompt
- `src/components/Topics/TopicDetailPage.tsx` - Add smart prompt banner logic
- `src/components/WatchList/EscalateToTopicModal.tsx` - Add optional suggestion generation after escalation
- `src/types/osint.ts` - Add `CollectionPlanSuggestions` interface

## Implementation Order

1. **Phase 1: Core Backend** (Foundation)

   - Ollama service method
   - Analysis API route
   - Audit logging
   - Type definitions

2. **Phase 2: Frontend Core** (Basic Functionality)

   - Service layer method
   - CollectionPlanCard "Generate Suggestions" button
   - Basic form population

3. **Phase 3: UX Enhancements** (Polish)

   - Merge/Replace/Add dialog
   - Smart prompting banner
   - Loading states and error handling

4. **Phase 4: Workflow Integration** (Automation)

   - Watch Item escalation integration
   - Indicator trigger integration

## Notes

- All GenAI suggestions are advisory - analyst maintains full control
- Suggestions are not auto-saved - analyst must review and save manually
- Smart prompts are dismissible per-topic (localStorage)
- Workflow integrations are optional/non-blocking
- Audit logging captures all suggestion generation events
- Minimum 1 record required, but 2+ recommended for quality suggestions