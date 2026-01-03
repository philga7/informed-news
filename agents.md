# AI Agent Guidelines for Informed News

## Project Overview

Informed News is an OSINT (Open Source Intelligence) platform that enables analysts to:
- **Two-Tier Intelligence Model**: Separate situational awareness (Tier 1: Watch Items, Indicators, Scan) from deep analysis (Tier 2: Topics)
- Aggregate intelligence from multiple sources (RSS feeds, APIs, email, manual input)
- **Environmental Scan**: Rapid triage workflow with keyboard shortcuts and session tracking
- **Watch Items**: Lightweight monitoring entities that can escalate to full topics
- **Indicators & Warnings**: Predefined triggers that automatically create topics when conditions are met
- Organize information into topic-centric intelligence streams with question-driven requirements
- **Claims & Corroboration**: Track factual claims across sources with corroboration matrix visualization
- Link source records to topics with confidence ratings and relevance scores
- Generate AI-powered analytic artifacts (summaries, entity extraction, sentiment analysis, timelines)
- **Analyst Dashboards**: Structured daily (15 min), weekly, and monthly review workflows
- **Feed Hygiene**: Track source effectiveness and identify stale feeds
- Manage multi-tenant organizations with role-based access
- Maintain QA workflows with review status tracking
- Track audit trails for all intelligence operations
- Analyze topic correlations and coordination patterns
- Perform temporal analysis with narrative evolution tracking

## Architecture

### Core Technologies
- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Routing**: React Router v7
- **State Management**: React Context API with useReducer (minimal state for auth & UI)
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Supabase Auth
- **Backend API**: Express.js server for ingestion, analysis, and scheduling
- **AI Analysis**: Ollama integration for content analysis
- **Storage**: PostgreSQL database (all data persisted server-side)

### Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│  Components → Services → Supabase Client → PostgreSQL       │
│                  ↓                                          │
│              Backend API → External Sources                 │
│                  ↓                                          │
│              Ollama AI Service → Analysis                   │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure
```
src/
├── components/          # React components organized by feature
│   ├── Auth/           # Authentication components (Supabase)
│   ├── Dashboard/      # Analyst workflow dashboards (Daily/Weekly/Monthly)
│   │   ├── AnalystDashboard.tsx
│   │   ├── DailyReview.tsx
│   │   ├── WeeklyReview.tsx
│   │   └── MonthlyAudit.tsx
│   ├── Indicators/     # Indicators & Warnings (Tier 1)
│   │   ├── IndicatorsPage.tsx
│   │   ├── IndicatorCard.tsx
│   │   ├── IndicatorForm.tsx
│   │   ├── IndicatorCheckModal.tsx
│   │   └── TriggeredIndicatorsBanner.tsx
│   ├── Scan/           # Environmental Scan workflow (Tier 1)
│   │   ├── ScanPage.tsx
│   │   ├── ScanItem.tsx
│   │   ├── ScanSidebar.tsx
│   │   ├── QuickActionsPanel.tsx
│   │   ├── QuickLinkToTopicModal.tsx
│   │   ├── CreateWatchItemModal.tsx
│   │   └── KeyboardShortcutsModal.tsx
│   ├── WatchList/      # Watch Items (Tier 1)
│   │   ├── WatchListPage.tsx
│   │   ├── WatchItemCard.tsx
│   │   ├── WatchItemForm.tsx
│   │   └── EscalateToTopicModal.tsx
│   ├── Profile/        # User & organization management
│   ├── Topics/         # OSINT topic management (Tier 2)
│   │   ├── ClaimsAnalysis.tsx
│   │   ├── CollectionPlanCard.tsx
│   │   ├── CorroborationMatrix.tsx
│   │   ├── ResolutionModal.tsx
│   │   ├── TopicDetailPage.tsx
│   │   ├── TopicsPage.tsx
│   │   └── ...
│   ├── SourceRecords/  # Source record display & management
│   ├── Sources/        # OSINT source management
│   ├── Layout/         # Layout components (Header, Sidebar)
│   └── UI/             # Reusable UI components
├── services/           # Data service layer (Supabase operations)
│   ├── auth.service.ts
│   ├── claims.service.ts
│   ├── indicators.service.ts
│   ├── organization.service.ts
│   ├── osintTopics.service.ts
│   ├── osintSources.service.ts
│   ├── scan.service.ts
│   ├── scanSessions.service.ts
│   ├── sourceRecords.service.ts
│   ├── watchItems.service.ts
│   ├── analysis.service.ts
│   ├── auditLog.service.ts
│   └── qa.service.ts
├── context/            # React Context (minimal state)
│   ├── AppContext.tsx          # Auth & UI state management
│   ├── OrganizationContext.tsx # Organization state & switching
│   └── appReducer.ts           # Reducer for auth/UI actions only
├── hooks/              # Custom React hooks
│   └── useAuth.ts      # Supabase authentication hook
├── types/              # TypeScript type definitions
│   ├── index.ts        # Core application types
│   ├── osint.ts        # OSINT domain types (Topics, Records, Links, Artifacts, Watch Items, Indicators)
│   └── database.ts     # Supabase database schema types
└── utils/              # Utility functions
    ├── supabase.ts     # Supabase client configuration
    └── apiClient.ts    # Backend API client utilities

backend/
├── src/
│   ├── routes/         # Express API route handlers
│   │   ├── sources.ts
│   │   ├── topics.ts
│   │   ├── sourceRecords.ts
│   │   ├── watchItems.ts
│   │   ├── indicators.ts
│   │   ├── claims.ts
│   │   ├── scanSessions.ts
│   │   ├── ingest.ts
│   │   ├── analysis.ts
│   │   ├── qa.ts
│   │   ├── auditLogs.ts
│   │   ├── organizations.ts
│   │   └── scheduler.ts
│   ├── services/       # Backend business logic
│   │   ├── feedFetcher.ts
│   │   ├── ollamaService.ts
│   │   ├── scheduler.ts
│   │   ├── auditService.ts
│   │   └── ingestion/  # Ingestion pipeline services
│   ├── types/          # Backend type definitions
│   └── server.ts       # Express server entry point

supabase/
└── migrations/         # Database schema migrations
    ├── initial_schema.sql
    ├── osint_*.sql
    ├── question_driven_topics.sql
    ├── expand_topic_status.sql
    ├── claims_corroboration.sql
    ├── watch_items.sql
    ├── scan_view.sql
    ├── indicators.sql
    ├── scan_sessions.sql
    └── workflow_fields.sql
```

## OSINT Domain Concepts

### Core Entities

1. **Organizations**: Multi-tenant workspaces for team collaboration
   - Each organization has members with roles (owner, admin, analyst, member)
   - All data is scoped by organization

2. **Sources**: Intelligence sources (RSS, API, email, manual)
   - Have reliability ratings (HIGH, MEDIUM, LOW, UNKNOWN)
   - Can be rated by analysts for usefulness (value rating 1-5)
   - Support notes and metadata

3. **Source Records**: Individual pieces of content from sources
   - Title, URL, content, published date
   - Geographic indicators, language, raw metadata
   - Initial confidence flags

4. **Topics**: Intelligence topics being tracked
   - Have names, descriptions, keywords
   - Status: active, monitoring, suspended, resolved, or archived
   - Intelligence requirement fields: decision_question, decision_context, key_indicators, resolution_criteria
   - Resolution metadata: summary, confidence (HIGH/MEDIUM/LOW), lessons learned
   - Can be related to other topics

5. **Topic-Source Links**: Relationships between topics and source records
   - Relevance score (0.000 to 1.000)
   - Confidence level (HIGH, MEDIUM, LOW)
   - Analyst notes and assumptions
   - Review status (pending, reviewed, disputed)

6. **Analytic Artifacts**: AI-generated analysis products
   - Types: summary, entity_extraction, tone_analysis, sentiment, key_facts, timeline, network_graph
   - Associated with topics or source records
   - Can be reviewed by analysts
   - Track model name and creator

7. **Audit Logs**: Complete audit trail of all operations
   - Track user actions (create, update, delete)
   - Store before/after state for changes
   - Include metadata and timestamps

8. **Collection Plans**: Intelligence collection planning per topic
   - Source types needed (government, academic, primary, expert analysis)
   - Claims to verify (specific assertions needing corroboration)
   - Coverage gaps (identified gaps in evidence)
   - Sources to avoid (biased or unreliable sources to skip)
   - One-to-one relationship with topics

9. **Claims**: Factual assertions for corroboration tracking
   - Claim text and type (factual, assessment, prediction)
   - Falsifiability flag
   - Associated with topics
   - Tracked for corroboration status

10. **Claim Evidence**: Links between claims and source records
    - References claim and topic_source_link
    - Supports/contradicts indicator (true, false, or null for neutral)
    - Evidence excerpts and analyst notes
    - Corroboration status: corroborated (multiple sources), single-source (one source), contradicted (conflicting sources)

### Two-Tier Intelligence Model

The application implements a two-tier intelligence model separating situational awareness from deep analysis:

#### Tier 1: Situational Awareness

11. **Watch Items**: Lightweight monitoring entities for potential topics
    - Title, category (domain), and notes
    - Indicator triggers defining escalation criteria
    - Status: watching → escalated → archived
    - Signal count (linked source records)
    - Can escalate to full topics (Tier 2)
    - One-to-many relationship with source records via junction table

12. **Indicators**: Predefined escalation triggers for specific conditions
    - Domain categorization (politics, finance, technology, etc.)
    - Check frequency (daily, weekly, monthly)
    - Triggered status with timestamp
    - Action on trigger (what should happen)
    - Can automatically create topics when triggered
    - Links to created topic via triggered_topic_id

13. **Environmental Scan**: Rapid triage workflow for source records
    - Scan status (pending, reviewed, linked, dismissed)
    - Keyboard shortcuts for rapid processing
    - Quick actions: dismiss, link to topic, create watch item
    - Review tracking (reviewed_at, reviewed_by)

14. **Scan Sessions**: Workflow analytics and productivity tracking
    - Session duration tracking
    - Counter metrics: items reviewed, linked, watch items created, dismissed
    - Session notes for context
    - Aggregated statistics for organization performance

#### Tier 2: Deep Analysis

Topics (as described above) represent deep intelligence analysis with:
- Question-driven intelligence requirements
- Claims and corroboration tracking
- Full analytic artifacts (summaries, entity extraction, timelines)
- Resolution workflow with confidence levels

## Application Navigation

The application uses a sidebar-based navigation structure with the following routes:

### Primary Routes
- `/dashboard` - Analyst Dashboard (landing page after authentication)
  - Daily Review (15-minute triage workflow)
  - Weekly Review (quality checks and corroboration)
  - Monthly Audit (strategic reflection and metrics)
- `/scan` - Environmental Scan (Tier 1 rapid triage)
  - Keyboard shortcuts for rapid processing
  - Session tracking with metrics
  - Quick actions: dismiss, link to topic, create watch item
- `/watch-list` - Watch Items (Tier 1 monitoring)
  - Lightweight monitoring entities
  - Review mode for weekly triage
  - Escalation to topics
- `/indicators` - Indicators & Warnings (Tier 1 triggers)
  - Predefined escalation triggers
  - Check workflow and status tracking
  - Automatic topic creation on trigger
- `/topics` - Intelligence Topics (Tier 2 deep analysis)
  - Question-driven requirements
  - Claims and corroboration
  - Resolution workflow
- `/source-records` - Source Records
  - All ingested content
  - Linking to topics and watch items
- `/sources` - OSINT Sources
  - Source management
  - Feed hygiene tracking
  - Domain categorization
- `/profile` - User Profile & Organization Management
  - Organization switching
  - Member management
  - Settings

### Navigation Components
- **Header** - Organization switcher, update news button, triggered indicators banner
- **Sidebar** - Main navigation with icons and labels (collapsible on mobile)
- **TriggeredIndicatorsBanner** - Global alert for triggered indicators (appears below header)

## AI Agent Responsibilities

### Code Generation
- **ALWAYS** use TypeScript with strict type checking
- **ALWAYS** follow the existing component structure and patterns
- **ALWAYS** use functional components with hooks
- **ALWAYS** use the `useApp()` hook for accessing application state (auth & UI only)
- **ALWAYS** use service layer for all data operations (never direct Supabase calls in components)
- **ALWAYS** use Tailwind CSS classes for styling (no inline styles)
- **ALWAYS** use Lucide React icons for UI icons
- **ALWAYS** handle loading and error states appropriately
- **ALWAYS** use React Router for navigation

### State Management
- **ALWAYS** keep context state minimal (auth + UI loading/error states only)
- **ALWAYS** fetch data from Supabase via service layer in components
- **ALWAYS** use local component state (`useState`) for component-specific data
- **ALWAYS** add new UI state properties to `AppState.ui` interface if needed globally
- **ALWAYS** add corresponding action types to `AppAction` union type
- **ALWAYS** implement action handlers in `appReducer.ts`
- **ALWAYS** use the reducer pattern - never mutate state directly
- **NEVER** store application data in context (use Supabase via services)

### Organization Context
- **ALWAYS** use `useOrganization()` hook from `src/context/OrganizationContext.tsx` for organization-scoped queries
- **ALWAYS** use `currentOrganization` to get the active organization
- **NEVER** hardcode organization IDs in components
- Organizations are automatically created for new users (Personal workspace)
- Users can switch between organizations, create new ones, and manage members

```typescript
import { useOrganization } from '../context/OrganizationContext';

const { currentOrganization, organizations, switchOrganization, refreshOrganizations } = useOrganization();
const orgId = currentOrganization?.id;

// Use orgId in service calls
const topics = await osintTopicsService.getAll(orgId);
```

### Component Development
- **ALWAYS** create components in the appropriate feature directory
- **ALWAYS** use TypeScript interfaces for component props
- **ALWAYS** follow the existing naming conventions (PascalCase for components)
- **ALWAYS** use the `useApp()` hook to access auth state only
- **ALWAYS** use service layer functions for all data operations
- **ALWAYS** handle user interactions through service calls
- **ALWAYS** implement proper error boundaries and error handling
- **ALWAYS** manage loading states per-component with `useState`

### Data Management

#### Service Layer Pattern
- **ALWAYS** create service functions in `src/services/` directory
- **ALWAYS** use Supabase client from `src/utils/supabase.ts`
- **ALWAYS** use types from `src/types/database.ts` for type-safe queries
- **ALWAYS** handle errors and return typed results
- **ALWAYS** transform database responses to domain types (convert dates, handle nulls)
- **ALWAYS** expose service functions through `src/services/index.ts`

#### Service Function Pattern
```typescript
import { supabase } from '../utils/supabase';
import type { OsintTopic, OsintTopicInsert } from '../types/osint';
import type { Database } from '../types/database';

export const osintTopicsService = {
  async getAll(organizationId: string): Promise<OsintTopic[]> {
    const { data, error } = await supabase
      .from('osint_topics')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Transform database types to domain types
    return data.map(row => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      keywords: row.keywords as string[],
      relatedTopics: row.related_topics as string[],
      status: row.status as TopicStatus,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  },

  async create(organizationId: string, topic: OsintTopicInsert): Promise<OsintTopic> {
    const { data, error } = await supabase
      .from('osint_topics')
      .insert({
        organization_id: organizationId,
        name: topic.name,
        description: topic.description,
        keywords: topic.keywords || [],
        related_topics: topic.relatedTopics || [],
        status: topic.status || 'active',
      })
      .select()
      .single();

    if (error) throw error;
    
    // Transform to domain type
    return transformTopic(data);
  },
};
```

### Authentication
- **ALWAYS** use `useAuth()` hook from `src/hooks/useAuth.ts` for auth state
- **ALWAYS** use `authService` from `src/services/auth.service.ts` for auth operations
- **ALWAYS** check `state.authentication.isAuthenticated` before rendering protected content
- **ALWAYS** let Supabase manage session persistence (no manual session storage)
- **ALWAYS** handle session restoration through `AppContext` which syncs with Supabase auth state

### Backend API Integration
- **ALWAYS** use `apiClient` from `src/utils/apiClient.ts` for backend API calls
- **ALWAYS** use service layer to abstract backend API calls from components
- **ALWAYS** handle backend API errors appropriately
- **ALWAYS** use environment variables for API base URL (`VITE_API_URL`)
- **ALWAYS** prefer backend API for complex operations (ingestion, analysis, scheduling)

### Database Operations
- **NEVER** call Supabase directly from components - always use service layer
- **ALWAYS** use Row Level Security (RLS) policies for data access control
- **ALWAYS** use type-safe queries with `database.ts` types
- **ALWAYS** handle organization-scoped queries (filter by `organization_id`)
- **ALWAYS** transform database snake_case to TypeScript camelCase in services

## File Interaction Standards

### When Adding New Features

1. **Types First**: 
   - Add domain types to `src/types/osint.ts`
   - Add database types to `src/types/database.ts` if schema changes
   - Update `src/types/index.ts` for core application types

2. **Database Schema**: 
   - Create migration in `supabase/migrations/`
   - Update `src/types/database.ts` if schema changed

3. **Service Layer**: 
   - Create or update service in `src/services/`
   - Export from `src/services/index.ts`
   - Use Supabase client for queries

4. **Components**: 
   - Create components in appropriate feature directories
   - Use service layer for all data operations
   - Use `useAuth()` for authentication checks
   - Manage loading/error state locally

5. **Backend Routes** (if needed):
   - Create route handler in `backend/src/routes/`
   - Register in `backend/src/server.ts`
   - Create service in `backend/src/services/` if needed

### When Modifying Existing Features

1. **ALWAYS** check existing patterns before making changes
2. **ALWAYS** maintain backward compatibility with existing database schema
3. **ALWAYS** update types if changing data structures
4. **ALWAYS** update services if changing data access patterns
5. **ALWAYS** test data persistence after changes

## Development Patterns

### Component Pattern
```typescript
import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../context/OrganizationContext';
import { osintTopicsService } from '../services';
import type { OsintTopic } from '../types/osint';

export function TopicsPage() {
  const { state } = useApp();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const [topics, setTopics] = useState<OsintTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentOrganization?.id) {
      loadTopics();
    }
  }, [currentOrganization?.id]);

  const loadTopics = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const fetchedTopics = await osintTopicsService.getAll(currentOrganization.id);
      setTopics(fetchedTopics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load topics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="container mx-auto p-4">
      {/* JSX with Tailwind classes */}
    </div>
  );
}
```

### Service Layer Pattern
```typescript
import { supabase } from '../utils/supabase';
import type { OsintTopic, OsintTopicInsert } from '../types/osint';
import type { Database } from '../types/database';

type TopicRow = Database['public']['Tables']['osint_topics']['Row'];

function transformTopic(row: TopicRow): OsintTopic {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    keywords: row.keywords as string[],
    relatedTopics: row.related_topics as string[],
    status: row.status as TopicStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export const osintTopicsService = {
  async getAll(organizationId: string): Promise<OsintTopic[]> {
    const { data, error } = await supabase
      .from('osint_topics')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map(transformTopic);
  },

  async getById(topicId: string): Promise<OsintTopic> {
    const { data, error } = await supabase
      .from('osint_topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (error) throw error;
    return transformTopic(data);
  },

  async create(organizationId: string, topic: OsintTopicInsert): Promise<OsintTopic> {
    const { data, error } = await supabase
      .from('osint_topics')
      .insert({
        organization_id: organizationId,
        name: topic.name,
        description: topic.description,
        keywords: topic.keywords || [],
        related_topics: topic.relatedTopics || [],
        status: topic.status || 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return transformTopic(data);
  },

  async update(topicId: string, updates: Partial<OsintTopicInsert>): Promise<OsintTopic> {
    const { data, error } = await supabase
      .from('osint_topics')
      .update({
        name: updates.name,
        description: updates.description,
        keywords: updates.keywords,
        related_topics: updates.relatedTopics,
        status: updates.status,
      })
      .eq('id', topicId)
      .select()
      .single();

    if (error) throw error;
    return transformTopic(data);
  },

  async delete(topicId: string): Promise<void> {
    const { error } = await supabase
      .from('osint_topics')
      .delete()
      .eq('id', topicId);

    if (error) throw error;
  },
};

// Watch Items Service (Tier 1)
export const watchItemsService = {
  async getAll(organizationId: string, filters?: { category?: string; status?: string }): Promise<WatchItem[]>,
  async getById(watchItemId: string): Promise<WatchItem>,
  async create(watchItem: WatchItemInsert): Promise<WatchItem>,
  async update(watchItemId: string, updates: WatchItemUpdate): Promise<WatchItem>,
  async archive(watchItemId: string): Promise<void>,
  async delete(watchItemId: string): Promise<void>,
  async linkRecord(watchItemId: string, sourceRecordId: string): Promise<void>,
  async unlinkRecord(watchItemId: string, sourceRecordId: string): Promise<void>,
  async getSignalCount(watchItemId: string): Promise<number>,
  async escalateToTopic(watchItemId: string, topicData: OsintTopicInsert): Promise<OsintTopic>,
};

// Indicators Service (Tier 1)
export const indicatorsService = {
  async getAll(organizationId: string, filters?: { domain?: string; isTriggered?: boolean }): Promise<Indicator[]>,
  async getById(indicatorId: string): Promise<Indicator>,
  async create(indicator: IndicatorInsert): Promise<Indicator>,
  async update(indicatorId: string, updates: IndicatorUpdate): Promise<Indicator>,
  async delete(indicatorId: string): Promise<void>,
  async markAsChecked(indicatorId: string): Promise<void>,
  async trigger(indicatorId: string, topicData?: OsintTopicInsert): Promise<Indicator>,
  async reset(indicatorId: string): Promise<Indicator>,
  async getDueForCheck(organizationId: string): Promise<Indicator[]>,
  async getTriggered(organizationId: string): Promise<Indicator[]>,
};

// Claims Service
export const claimsService = {
  async getClaimsByTopic(topicId: string): Promise<ClaimWithEvidence[]>,
  async createClaim(topicId: string, claimText: string, options?: Partial<ClaimInsert>): Promise<Claim>,
  async updateClaim(claimId: string, updates: ClaimUpdate): Promise<Claim>,
  async deleteClaim(claimId: string): Promise<void>,
  async addEvidence(claimId: string, linkId: string, options?: Partial<ClaimEvidenceInsert>): Promise<ClaimEvidence>,
  async updateEvidence(claimId: string, evidenceId: string, updates: ClaimEvidenceUpdate): Promise<ClaimEvidence>,
  async deleteEvidence(claimId: string, evidenceId: string): Promise<void>,
  async getCorroborationMatrix(topicId: string): Promise<CorroborationMatrix>,
};

// Scan Sessions Service
export const scanSessionsService = {
  async create(organizationId: string, userId: string): Promise<ScanSession>,
  async update(sessionId: string, updates: Partial<ScanSession>): Promise<ScanSession>,
  async end(sessionId: string, counters: SessionCounters, notes?: string): Promise<ScanSession>,
  async getById(sessionId: string): Promise<ScanSession>,
  async getRecent(organizationId: string, limit?: number): Promise<ScanSession[]>,
  async getStats(organizationId: string, days?: number): Promise<ScanSessionStats>,
  async delete(sessionId: string): Promise<void>,
};
```

### Authentication Pattern
```typescript
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services';

export function LoginForm() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await authService.signIn({ email, password });
      // Auth state will update automatically via useAuth hook
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (user) return <Navigate to="/topics" />;

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

### Backend API Pattern
```typescript
import { apiClient } from '../utils/apiClient';

export const analysisService = {
  async generateSummary(sourceRecordId: string): Promise<AnalyticArtifact> {
    const response = await apiClient.post('/api/analysis/summary', {
      source_record_id: sourceRecordId,
    });
    return response.artifact;
  },

  async generateTimeline(topicId: string): Promise<TopicTimeline> {
    const response = await apiClient.get(`/api/analysis/timeline/${topicId}`);
    return response.timeline;
  },
};
```

### Backend API Routes

The application includes comprehensive backend API routes for all major features:

#### Core OSINT Routes
- `/api/sources` - Source management (RSS, API, email, manual)
- `/api/source-records` - Source record CRUD and ingestion
- `/api/topics` - Topic management and analytics
- `/api/organizations` - Organization management and member roles
- `/api/ingest` - Content ingestion from external sources
- `/api/analysis` - AI-powered analysis (summaries, entities, sentiment)
- `/api/qa` - Quality assurance and completeness checks
- `/api/audit-logs` - Audit trail queries
- `/api/scheduler` - Scheduling for automated tasks

#### Two-Tier Intelligence Model Routes
- `/api/watch-items` - Watch item management (Tier 1)
  - GET, POST, PATCH, DELETE operations
  - Link/unlink source records
  - Escalate to topics
  - Signal count retrieval
- `/api/indicators` - Indicators & warnings (Tier 1)
  - GET, POST, PATCH, DELETE operations
  - Check, trigger, and reset operations
  - Due for check and triggered queries
- `/api/scan-sessions` - Scan workflow analytics
  - Session lifecycle (create, update, end)
  - Recent sessions and aggregated statistics
  - Performance metrics tracking

#### Claims & Corroboration Routes
- `/api/claims` - Claims tracking
  - CRUD operations for claims
  - Evidence management (add, update, delete)
  - Corroboration matrix generation
  - Status calculation (corroborated, single-source, disputed)

## Two-Tier Intelligence Workflow

The application implements a structured workflow separating Tier 1 (Situational Awareness) from Tier 2 (Deep Analysis):

### Tier 1: Situational Awareness

**Purpose**: Rapid triage and monitoring without deep analysis commitment

1. **Environmental Scan** (`/scan`)
   - Review new source records quickly
   - Keyboard shortcuts: `x` (dismiss), `t` (link to topic), `w` (watch), `i` (indicator)
   - Session tracking with productivity metrics
   - No deep analysis required

2. **Watch Items** (`/watch-list`)
   - Create lightweight monitoring entities for potential topics
   - Track signal count (linked records)
   - Define escalation triggers
   - Weekly review mode for triage
   - Escalate to topics when warranted

3. **Indicators** (`/indicators`)
   - Define predefined conditions to monitor
   - Check frequency: daily, weekly, monthly
   - Trigger workflow creates topics automatically
   - Global banner alerts when triggered

### Tier 2: Deep Analysis

**Purpose**: Comprehensive intelligence analysis with question-driven approach

1. **Topics** (`/topics`)
   - Question-driven intelligence requirements
   - Collection planning (source types needed, claims to verify, gaps)
   - Claims and corroboration tracking
   - Topic lifecycle: active → monitoring → suspended → resolved → archived
   - Resolution workflow with confidence levels and lessons learned

2. **Workflow Dashboards** (`/dashboard`)
   - **Daily Review** (~15 min): Triage unlinked records, check stale topics
   - **Weekly Review** (~1 hour): Quality checks, corroboration verification, resolution candidates
   - **Monthly Audit** (~2 hours): Strategic reflection, source effectiveness, lifecycle metrics

### Escalation Paths

1. **Scan → Watch Item**: Spotted pattern, not ready for deep analysis
2. **Watch Item → Topic**: Sufficient signals warrant full investigation
3. **Indicator Triggered → Topic**: Predefined condition met, automatic escalation
4. **Scan → Topic**: Directly link to existing topic (already escalated)

### Feed Hygiene

- **Source Effectiveness**: Track percentage of records linked to topics
- **Stale Feed Detection**: Identify sources with no links in 90+ days
- **Domain Categorization**: Organize sources by domain (politics, finance, tech, etc.)
- **Value Ratings**: Analyst-assigned usefulness ratings (1-5 stars)

## Prohibited Actions

- **NEVER** call Supabase directly from components - always use service layer
- **NEVER** store application data in React Context - use Supabase
- **NEVER** use localStorage for data persistence - use Supabase
- **NEVER** mutate state directly - always use service functions for updates
- **NEVER** bypass the service layer
- **NEVER** use inline styles - always use Tailwind CSS
- **NEVER** access Supabase client directly in components - use services
- **NEVER** skip error handling in async operations
- **NEVER** create components without TypeScript interfaces
- **NEVER** forget organization-scoped queries (always filter by organization_id)

## Decision-Making Guidelines

### Priority Order
1. **Type Safety**: Ensure all code is properly typed with TypeScript
2. **Service Layer**: All data operations must go through service layer
3. **Error Handling**: Handle errors gracefully at component and service level
4. **User Experience**: Handle loading states, errors, and edge cases
5. **Code Reusability**: Extract common patterns into services and utilities
6. **Performance**: Use React hooks (useMemo, useCallback) where appropriate

### When Adding New Features
1. Check if similar functionality exists in services
2. Follow existing patterns and conventions
3. Add types first, then service layer, then components
4. Ensure proper error handling and loading states
5. Test data persistence and organization scoping

### When Fixing Bugs
1. Identify the root cause (service layer, component, or backend)
2. Check service layer logic for the affected operation
3. Verify type definitions match actual usage
4. Ensure error handling is appropriate
5. Test edge cases and error scenarios

## Code Review Checklist

- [ ] All TypeScript types are defined and used correctly
- [ ] All data operations go through service layer (no direct Supabase calls in components)
- [ ] Components use `useAuth()` hook for authentication checks
- [ ] Error handling is implemented in services and components
- [ ] Loading states are handled appropriately
- [ ] Tailwind CSS classes are used (no inline styles)
- [ ] Components are in appropriate feature directories
- [ ] Service functions are exported from `src/services/index.ts`
- [ ] Database queries are organization-scoped where applicable
- [ ] Date transformations are handled (database strings → Date objects)
- [ ] Proper cleanup in useEffect hooks

## Testing Considerations

- Test authentication flow (login, logout, session restore)
- Test service layer functions with various data scenarios
- Test error handling for failed API calls and database operations
- Test organization scoping (users can only access their org's data)
- Test data transformations (snake_case ↔ camelCase, date conversions)
- Test backend API integration
- Test Row Level Security policies

## Performance Guidelines

- Use `useMemo` for expensive computations (like filtering/transforming lists)
- Use `useCallback` for functions passed to child components
- Debounce search input if needed
- Lazy load components if bundle size becomes an issue
- Consider pagination for large data sets
- Use Supabase select filters to limit data fetched from database

## Security Considerations

- **ALWAYS** use Row Level Security (RLS) policies for data access
- **ALWAYS** filter queries by organization_id for multi-tenant security
- **NEVER** trust client-side data - validate on backend
- **ALWAYS** use Supabase Auth for authentication (never manual auth)
- **ALWAYS** use environment variables for sensitive configuration
- **NEVER** expose Supabase service role key in frontend code
- Handle authentication errors gracefully
- Don't expose sensitive data in error messages
- Validate user input before processing

## Data Flow Patterns

### Pattern 1: Component → Service → Supabase → Database
Used for: Reading and writing core OSINT data (topics, records, links, artifacts)

```typescript
// Component
const topics = await osintTopicsService.getAll(organizationId);

// Service
const { data } = await supabase.from('osint_topics').select('*')...

// Database returns data via RLS policies
```

### Pattern 2: Component → Service → Backend API → External Source
Used for: Ingestion, analysis, scheduling operations

```typescript
// Component
const artifact = await analysisService.generateSummary(recordId);

// Service
const response = await apiClient.post('/api/analysis/summary', {...});

// Backend API processes request and stores result in database
```

### Pattern 3: Backend → Ollama → Analysis → Database
Used for: AI-powered content analysis

```typescript
// Backend route receives request
// Backend service calls Ollama API
// Analysis results stored in analytic_artifacts table
// Frontend fetches via service layer
```
