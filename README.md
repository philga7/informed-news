# Informed News - OSINT Intelligence Platform

**Copyright © 2025 Sandiebeach LLC. All Rights Reserved.**  
**Proprietary Software - See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md)**

An open-source intelligence (OSINT) platform for aggregating, analyzing, and organizing intelligence from multiple sources. Organize information into topic-centric intelligence streams with AI-powered analysis, QA workflows, and comprehensive audit trails.

## Overview

Informed News enables analysts to collect intelligence from diverse sources (RSS feeds, APIs, email, manual input), organize it around topics, and analyze it using AI-powered tools. The platform provides a structured approach to OSINT with confidence ratings, relevance scoring, temporal analysis, and multi-tenant organization support.

## Key Features

### Two-Tier Intelligence Model
- **Tier 1: Situational Awareness** - Rapid triage with Watch Items, Indicators, and Environmental Scan
- **Tier 2: Deep Analysis** - Comprehensive intelligence topics with question-driven requirements
- **Escalation Workflow** - Structured path from monitoring to deep analysis

### Core Intelligence Capabilities
- **Environmental Scan** - Rapid triage workflow with keyboard shortcuts and session tracking
- **Watch Items** - Lightweight monitoring entities for potential topics with escalation triggers
- **Indicators & Warnings** - Predefined escalation triggers with check frequencies (daily/weekly/monthly)
- **Topic-Centric Organization** - Organize intelligence around topics with keywords, descriptions, and related topic associations
- **Question-Driven Intelligence** - Define decision questions, key indicators, and resolution criteria for focused analysis
- **Collection Planning** - Track required source types, claims to verify, and coverage gaps per topic
- **Topic Lifecycle Management** - Enhanced status workflow (active, monitoring, suspended, resolved, archived)
- **Claims & Corroboration** - Track factual claims across sources with corroboration matrix visualization
- **Multi-Source Aggregation** - Collect data from RSS feeds, APIs, email, and manual input sources
- **AI-Powered Analysis** - Generate summaries, extract entities, analyze sentiment and tone using Ollama integration

### Workflow & Analytics
- **Analyst Dashboards** - Structured daily (~15 min triage), weekly (quality review), and monthly (strategic audit) workflows
- **Scan Sessions** - Productivity tracking with metrics (items reviewed, linked, dismissed)
- **Feed Hygiene Tracking** - Monitor source effectiveness and identify stale feeds
- **QA Workflows** - Track review status, completeness checks, and ensure data quality with structured review processes
- **Audit Trails** - Complete audit logging for all operations with before/after state tracking
- **Temporal Analysis** - Visualize intelligence timelines, narrative evolution, and detect coordination patterns

### Organization & Collaboration
- **Organization Management** - Create, switch, and manage organizations with role-based membership
- **Correlation Detection** - Automatically identify related topics and duplicate records
- **Source Reliability** - Rate sources for reliability and value, track credibility over time

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router
- **Backend**: Express.js, Node.js
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Supabase Auth
- **AI Analysis**: Ollama Cloud API
- **Build Tools**: Vite, TypeScript, ESLint

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account and project

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd informed-news
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd backend && npm install && cd ..
   ```

3. **Configure environment variables**

   Create a `.env` file in the project root:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   
   # Backend API URL
   VITE_API_URL=http://localhost:3001
   
   # Optional: Ollama AI Analysis
   OLLAMA_API_KEY=your-ollama-api-key
   OLLAMA_MODEL=gpt-oss:120b
   ```

   For backend, create `backend/.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   PORT=3001
   ```

   > **Note**: Get your Supabase credentials from your [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API

4. **Run database migrations**

   Apply the database schema from `supabase/migrations/` using your Supabase project's SQL editor or CLI.

5. **Start the development server**
   ```bash
   npm run dev
   ```

   This starts both frontend and backend services:
   - Frontend: `http://localhost:5173`
   - Backend API: `http://localhost:3001`

   **Alternative**: Run services separately:
   ```bash
   npm run server  # Backend only
   npm run client  # Frontend only
   ```

### Verify Installation

1. **Check backend health**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Open the application**
   - Navigate to `http://localhost:5173`
   - Register a new account or sign in
   - Create an organization to get started

## Project Structure

```
informed-news/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   │   ├── Dashboard/      # Analyst workflow dashboards (Daily/Weekly/Monthly)
│   │   ├── Scan/           # Environmental scan workflow (Tier 1)
│   │   ├── WatchList/      # Watch items management (Tier 1)
│   │   ├── Indicators/     # Indicators & warnings (Tier 1)
│   │   ├── Topics/         # Topic management & analysis (Tier 2)
│   │   ├── Sources/        # Source management with feed hygiene
│   │   ├── SourceRecords/  # Source record management
│   │   ├── Profile/        # Organization & user management
│   │   ├── Layout/         # Header, Sidebar navigation
│   │   └── UI/             # Reusable components
│   ├── services/           # Data service layer (Supabase operations)
│   │   ├── watchItems.service.ts
│   │   ├── indicators.service.ts
│   │   ├── claims.service.ts
│   │   ├── scanSessions.service.ts
│   │   ├── scan.service.ts
│   │   └── ...
│   ├── context/            # React Context (auth, organization, UI state)
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utilities (Supabase client, API client)
├── backend/                # Express.js backend API
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   │   ├── watchItems.ts
│   │   │   ├── indicators.ts
│   │   │   ├── claims.ts
│   │   │   ├── scanSessions.ts
│   │   │   └── ...
│   │   ├── services/       # Business logic (ingestion, analysis, etc.)
│   │   └── server.ts       # Express server entry point
├── supabase/               # Database schema
│   └── migrations/         # SQL migration files
│       ├── question_driven_topics.sql
│       ├── expand_topic_status.sql
│       ├── claims_corroboration.sql
│       ├── watch_items.sql
│       ├── scan_view.sql
│       ├── indicators.sql
│       └── scan_sessions.sql
└── docs/                   # Documentation
```

## Documentation

- **[Setup Guide](docs/SETUP_GUIDE.md)** - Detailed setup and configuration instructions
- **[Architecture Guide](agents.md)** - Developer guidelines and architecture patterns
- **[Database Schema](docs/DATABASE_SCHEMA.md)** - Database schema documentation
- **[Backend API](backend/README.md)** - Backend service documentation

## Development

### Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run client` - Start frontend only (Vite dev server)
- `npm run server` - Start backend only (Express server)
- `npm run build` - Build frontend for production
- `npm run lint` - Run ESLint
- `npm run typecheck` - Type-check TypeScript

### Architecture Overview

The application follows a service layer pattern with two-tier intelligence architecture:

**Data Flow:**
- **Frontend Components** → **Service Layer** → **Supabase/Database**
- **Components** → **Service Layer** → **Backend API** → **External Services/Ollama**

**Intelligence Tiers:**
- **Tier 1 (Situational Awareness)**: Watch Items, Indicators, Environmental Scan
  - Lightweight entities for rapid triage and monitoring
  - Minimal cognitive load, maximum throughput
  - Escalation triggers for deep analysis
  
- **Tier 2 (Deep Analysis)**: Intelligence Topics
  - Comprehensive analysis with question-driven requirements
  - Claims tracking and corroboration
  - Resolution workflow with confidence assessments

All data operations go through the service layer, keeping components focused on UI logic. Authentication is handled by Supabase Auth with automatic session management.

**Navigation Structure:**
- Sidebar-based navigation with 7 primary routes
- Dashboard as landing page (daily/weekly/monthly workflows)
- Tier 1 routes: Scan, Watch List, Indicators
- Tier 2 routes: Topics, Source Records, Sources
- Profile for organization management

## Features in Detail

### Two-Tier Intelligence Model

The application implements a structured two-tier approach to intelligence analysis:

#### Tier 1: Situational Awareness

**Environmental Scan** (`/scan`)
- Rapid triage of incoming source records
- Keyboard shortcuts for quick processing (x: dismiss, t: link to topic, w: create watch item)
- Session tracking with productivity metrics
- Quick actions panel for common workflows
- Real-time counter updates

**Watch Items** (`/watch-list`)
- Lightweight monitoring entities for potential topics
- Category-based organization (politics, finance, technology, etc.)
- Signal count tracking (linked source records)
- Escalation triggers (user-defined criteria)
- Review mode for weekly triage
- Bulk archive dormant items
- One-click escalation to topics

**Indicators & Warnings** (`/indicators`)
- Predefined escalation triggers for specific conditions
- Check frequencies: daily, weekly, monthly
- Structured check workflow (not triggered / triggered)
- Automatic topic creation on trigger
- Global banner alerts for triggered indicators
- Reset capability for recurring patterns

#### Tier 2: Deep Analysis

**Intelligence Topics** (`/topics`)

Create and manage topics to organize intelligence around specific subjects. Topics support a question-driven intelligence workflow with:
- Decision questions and context (what question is being answered, why it matters)
- Key indicators and resolution criteria (what evidence would change your mind)
- Collection planning (required source types, claims to verify, coverage gaps)
- Expanded lifecycle status (active, monitoring, suspended, resolved, archived)
- Resolution workflow with confidence levels and lessons learned
- Descriptions, keywords, and related topic associations
- Timeline visualization and narrative evolution
- Claims corroboration matrix across sources

**Claims & Corroboration**
- Track factual claims, assessments, and predictions
- Link evidence from multiple sources
- Corroboration status: no evidence, single-source, corroborated, disputed
- Visual corroboration matrix (claims × sources)
- Evidence excerpts and analyst notes
- Falsifiability tracking (Popper criterion)

### Analyst Dashboards

Structured workflow dashboards aligned with intelligence tradecraft:

**Daily Review** (~15 minutes)
- Today's inbox (unlinked records from last 24 hours)
- Active topics summary with staleness indicators
- Quick-link actions for rapid triage
- Stale topic detection (7+ days without update)

**Weekly Review** (~1 hour)
- Topics needing attention (stale or low QA scores)
- Claims needing corroboration (single-source or unsupported)
- Resolution candidates (topics ready to close)
- Quality assurance checks

**Monthly Audit** (~2 hours)
- Topic lifecycle metrics (status distribution)
- Recently resolved topics review
- Source value report and rankings
- Blind spot analysis prompts
- Strategic reflection

### Scan Sessions & Analytics

Workflow productivity tracking:
- Automatic session creation on scan page load
- Real-time metrics: items reviewed, linked, watch items created, dismissed
- Session duration tracking
- End session with optional notes
- Aggregated statistics for organization performance
- Historical session data

### Feed Hygiene Tracking

Source effectiveness monitoring:
- Signal effectiveness percentage (records linked / total records)
- Stale feed detection (no links in 90+ days)
- Low effectiveness warnings (<5% with 10+ records)
- Domain categorization for organization
- Average effectiveness dashboard
- Source value ratings (1-5 stars)

### Source Records

Ingested content from all sources stored as source records with:
- Full content extraction and metadata
- Geographic indicators and language detection
- Confidence flags and initial analysis
- Link relationships to topics and watch items
- Scan status tracking (pending, reviewed, linked, dismissed)

### Analytic Artifacts

AI-generated analysis products including:
- Summaries (3-5 bullet points with overview)
- Entity extraction (people, organizations, locations, dates)
- Sentiment and tone analysis
- Timelines and network graphs
- Coordination detection across sources

### QA & Audit

- Review status tracking for links and artifacts
- Completeness scoring and checklists
- Full audit trail of all operations
- Before/after state tracking for changes
- Corroboration verification workflows

## Contributing

Contributions are welcome! Please read the development guidelines in `agents.md` before submitting pull requests.

## License

This software is proprietary and confidential. All rights reserved by Sandiebeach LLC.

See [LICENSE](LICENSE) for full license terms and [COPYRIGHT.md](COPYRIGHT.md) for copyright information.
