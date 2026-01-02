# Plan 9: Audit Trails, Workflow, and Quality Assurance

This plan implements comprehensive audit logging, analyst workflow indicators, QA completeness checks, and source value tracking to meet intelligence tradecraft standards.

## Architecture Overview

```mermaid
flowchart TB
    subgraph ui [Frontend UI]
        HistoryTab[History Tab Component]
        QAChecklist[QA Checklist Widget]
        SourceRating[Source Value Rating]
        WorkflowBadges[Workflow Status Badges]
    end
    
    subgraph backend [Backend API]
        AuditService[Audit Service]
        AuditRoutes[/api/audit-logs]
        QARoutes[/api/qa]
    end
    
    subgraph database [Supabase]
        AuditLogTable[audit_logs table]
        TopicsTable[osint_topics + status]
        LinksTable[topic_source_links + review_status]
        SourcesTable[sources + value_rating]
    end
    
    HistoryTab --> AuditRoutes
    QAChecklist --> QARoutes
    AuditService --> AuditLogTable
    AuditRoutes --> AuditLogTable
    QARoutes --> TopicsTable
    QARoutes --> LinksTable
</flowchart>
```

---

## Phase 1: Database Schema

### Migration: `20250103000001_audit_logs.sql`

Create `audit_logs` table:

- `id` (UUID, PK)
- `user_id` (UUID, nullable, references profiles)
- `action` (VARCHAR - 'topic_created', 'topic_updated', 'link_added', 'link_removed', 'link_updated', 'artifact_created', 'artifact_reviewed', etc.)
- `entity_type` (VARCHAR - 'topic', 'source_record', 'link', 'artifact', 'source')
- `entity_id` (UUID)
- `before_state` (JSONB, nullable)
- `after_state` (JSONB, nullable)
- `metadata` (JSONB - notes, reason, etc.)
- `timestamp` (TIMESTAMPTZ)

Indexes: `(entity_type, entity_id)`, `timestamp DESC`, `user_id`

### Migration: `20250103000002_workflow_fields.sql`

Add workflow fields:

- `osint_topics.status` (ENUM: 'active', 'monitoring', 'archived') - default 'active'
- `topic_source_links.review_status` (ENUM: 'pending', 'reviewed', 'disputed') - default 'pending'
- `sources.value_rating` (INTEGER 1-5, nullable) - analyst usefulness rating

---

## Phase 2: Backend Audit Service

### New File: [`backend/src/services/auditService.ts`](backend/src/services/auditService.ts)

Create centralized audit logging service:

```javascript
function logAction(params: {
  action: AuditAction,
  entityType: EntityType,
  entityId: string,
  userId?: string,
  beforeState?: object,
  afterState?: object,
  metadata?: object
}): Promise<void>
```



### Integrate Audit Logging into Existing Routes

Hook audit calls into [`backend/src/routes/topics.ts`](backend/src/routes/topics.ts):

- POST `/api/topics` - log 'topic_created'
- PATCH `/api/topics/:id` - log 'topic_updated' with before/after
- DELETE `/api/topics/:id` - log 'topic_deleted'
- POST `/api/topics/:id/links` - log 'link_added'
- PATCH `/api/topics/:topicId/links/:linkId` - log 'link_updated' (includes confidence changes)
- DELETE `/api/topics/:topicId/links/:linkId` - log 'link_removed'

Hook into [`backend/src/routes/analysis.ts`](backend/src/routes/analysis.ts):

- POST analysis endpoints - log 'artifact_created'
- PATCH `/api/analysis/artifacts/:id` - log 'artifact_reviewed' when reviewed=true

---

## Phase 3: Audit Log API Endpoints

### New File: [`backend/src/routes/auditLogs.ts`](backend/src/routes/auditLogs.ts)

| Endpoint | Purpose ||----------|---------|| `GET /api/audit-logs` | Query logs with filters (entity_type, entity_id, action, date range, limit, offset) || `GET /api/topics/:id/history` | Convenience wrapper for topic audit trail || `GET /api/source-records/:id/history` | Convenience wrapper for source record audit trail |Register in [`backend/src/server.ts`](backend/src/server.ts).---

## Phase 4: QA Completeness Endpoint

### New File: [`backend/src/routes/qa.ts`](backend/src/routes/qa.ts)

`GET /api/qa/topics/:id/completeness` returns:

```json
{
  "topic_id": "...",
  "checks": {
    "has_description": true,
    "has_keywords": true,
    "all_links_have_confidence": false,
    "all_artifacts_reviewed": false
  },
  "missing_confidence_links": ["link-id-1", "link-id-2"],
  "unreviewed_artifacts": ["artifact-id-1"],
  "completeness_score": 0.75
}
```

---

## Phase 5: Frontend Services

### New File: [`src/services/auditLog.service.ts`](src/services/auditLog.service.ts)

API client for fetching audit history with pagination.

### Update: [`src/services/osintTopics.service.ts`](src/services/osintTopics.service.ts)

Add methods:

- `getHistory(topicId)` - fetch audit trail
- `getQACompleteness(topicId)` - fetch QA status
- `updateStatus(topicId, status)` - update topic workflow status

### Update: [`src/services/osintSources.service.ts`](src/services/osintSources.service.ts)

Add method: `rateSource(sourceId, valueRating)` - set 1-5 usefulness rating---

## Phase 6: Frontend UI Components

### New Component: [`src/components/Topics/AuditHistoryTab.tsx`](src/components/Topics/AuditHistoryTab.tsx)

Display audit log entries for a topic:

- Chronological list with timestamp, user (or 'system'), action description
- Expandable rows showing before/after state diff
- Example: "2025-12-20 - analyst@example.com linked SourceRecord #123 (confidence: HIGH)"

### New Component: [`src/components/Topics/QAChecklist.tsx`](src/components/Topics/QAChecklist.tsx)

QA dashboard widget:

- Green checkmark: Description present
- Green checkmark: Keywords defined
- Yellow warning: X links missing confidence
- Yellow warning: X artifacts unreviewed
- Overall completeness percentage

### New Component: [`src/components/Topics/TopicStatusBadge.tsx`](src/components/Topics/TopicStatusBadge.tsx)

Workflow status dropdown (active/monitoring/archived) with color coding.

### New Component: [`src/components/Topics/LinkReviewStatus.tsx`](src/components/Topics/LinkReviewStatus.tsx)

Review status indicator (pending/reviewed/disputed) in linked records table.

### New Component: [`src/components/Sources/SourceValueRating.tsx`](src/components/Sources/SourceValueRating.tsx)

Star rating (1-5) component for source usefulness.---

## Phase 7: Integration

### Update: [`src/components/Topics/TopicDetailPage.tsx`](src/components/Topics/TopicDetailPage.tsx)

- Add tabbed interface: Overview | History | QA
- Add TopicStatusBadge to header
- Add QAChecklist widget
- Integrate AuditHistoryTab

### Update: [`src/components/SourceRecords/SourceRecordDetailPage.tsx`](src/components/SourceRecords/SourceRecordDetailPage.tsx)

- Add History section with AuditHistoryTab (scoped to this record)

### Update: [`src/components/Topics/LinkedRecordsTable.tsx`](src/components/Topics/LinkedRecordsTable.tsx)

- Add review_status column with LinkReviewStatus component

### Update: [`src/components/Sources/OsintSourcesTable.tsx`](src/components/Sources/OsintSourcesTable.tsx)

- Add value_rating column with SourceValueRating component

---

## Type Definitions

### Update: [`src/types/osint.ts`](src/types/osint.ts)

```typescript
export type TopicStatus = 'active' | 'monitoring' | 'archived';
export type LinkReviewStatus = 'pending' | 'reviewed' | 'disputed';

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  timestamp: Date;
}

export interface QACompleteness {
  topicId: string;
  checks: {
    hasDescription: boolean;
    hasKeywords: boolean;
    allLinksHaveConfidence: boolean;
    allArtifactsReviewed: boolean;
  };
  missingConfidenceLinks: string[];
  unreviewedArtifacts: string[];
  completenessScore: number;
}
```

---

## Files Changed Summary

| Category | Files ||----------|-------|| **Migrations** | 2 new SQL files || **Backend Routes** | 2 new, 3 modified || **Backend Services** | 1 new (auditService.ts) || **Frontend Services** | 1 new, 2 modified || **Frontend Components** | 5 new, 4 modified || **Types** | 1 modified |---