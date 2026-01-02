# AI Agent Guidelines for Informed News

## Project Overview

Informed News is an OSINT (Open Source Intelligence) platform that enables analysts to:
- Aggregate intelligence from multiple sources (RSS feeds, APIs, email, manual input)
- Organize information into topic-centric intelligence streams
- Link source records to topics with confidence ratings and relevance scores
- Generate AI-powered analytic artifacts (summaries, entity extraction, sentiment analysis, timelines)
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
│   ├── Topics/         # OSINT topic management components
│   ├── SourceRecords/  # Source record display & management
│   ├── Sources/        # OSINT source management
│   ├── Layout/         # Layout components (Header, etc.)
│   └── UI/             # Reusable UI components
├── services/           # Data service layer (Supabase operations)
│   ├── auth.service.ts
│   ├── osintTopics.service.ts
│   ├── osintSources.service.ts
│   ├── sourceRecords.service.ts
│   ├── analysis.service.ts
│   ├── auditLog.service.ts
│   └── qa.service.ts
├── context/            # React Context (minimal state)
│   ├── AppContext.tsx  # Auth & UI state management
│   └── appReducer.ts   # Reducer for auth/UI actions only
├── hooks/              # Custom React hooks
│   └── useAuth.ts      # Supabase authentication hook
├── types/              # TypeScript type definitions
│   ├── index.ts        # Core application types
│   ├── osint.ts        # OSINT domain types (Topics, Records, Links, Artifacts)
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
│   │   ├── ingest.ts
│   │   ├── analysis.ts
│   │   ├── qa.ts
│   │   ├── auditLogs.ts
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
   - Status: active, monitoring, or archived
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
import { osintTopicsService } from '../services';
import type { OsintTopic } from '../types/osint';

export function TopicsPage() {
  const { state } = useApp();
  const { user } = useAuth();
  const [topics, setTopics] = useState<OsintTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const organizationId = 'your-org-id'; // Get from org context or props

  useEffect(() => {
    loadTopics();
  }, [organizationId]);

  const loadTopics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedTopics = await osintTopicsService.getAll(organizationId);
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
