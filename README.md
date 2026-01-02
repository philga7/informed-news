# Informed News - OSINT Intelligence Platform

**Copyright © 2025 Sandiebeach LLC. All Rights Reserved.**  
**Proprietary Software - See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md)**

An open-source intelligence (OSINT) platform for aggregating, analyzing, and organizing intelligence from multiple sources. Organize information into topic-centric intelligence streams with AI-powered analysis, QA workflows, and comprehensive audit trails.

## Overview

Informed News enables analysts to collect intelligence from diverse sources (RSS feeds, APIs, email, manual input), organize it around topics, and analyze it using AI-powered tools. The platform provides a structured approach to OSINT with confidence ratings, relevance scoring, temporal analysis, and multi-tenant organization support.

## Key Features

- **Topic-Centric Organization** - Organize intelligence around topics with keywords, descriptions, and related topic associations
- **Multi-Source Aggregation** - Collect data from RSS feeds, APIs, email, and manual input sources
- **AI-Powered Analysis** - Generate summaries, extract entities, analyze sentiment and tone using Ollama integration
- **Topic-Record Linking** - Link source records to topics with relevance scores, confidence levels, and analyst notes
- **Temporal Analysis** - Visualize intelligence timelines, narrative evolution, and detect coordination patterns
- **QA Workflows** - Track review status, completeness checks, and ensure data quality with structured review processes
- **Audit Trails** - Complete audit logging for all operations with before/after state tracking
- **Multi-Tenant Support** - Organization-based workspaces with role-based access control (owner, admin, analyst, member)
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
│   ├── components/         # React components (Topics, Sources, Records, etc.)
│   ├── services/           # Data service layer (Supabase operations)
│   ├── context/            # React Context (auth & UI state)
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utilities (Supabase client, API client)
├── backend/                # Express.js backend API
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic (ingestion, analysis, etc.)
│   │   └── server.ts       # Express server entry point
├── supabase/               # Database schema
│   └── migrations/         # SQL migration files
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

The application follows a service layer pattern:

- **Frontend Components** → **Service Layer** → **Supabase/Database**
- **Components** → **Service Layer** → **Backend API** → **External Services/Ollama**

All data operations go through the service layer, keeping components focused on UI logic. Authentication is handled by Supabase Auth with automatic session management.

## Features in Detail

### Intelligence Topics

Create and manage topics to organize intelligence around specific subjects. Topics can have:
- Descriptions and keywords for discovery
- Related topic associations
- Status tracking (active, monitoring, archived)
- Timeline visualization and narrative evolution

### Source Records

Ingested content from all sources stored as source records with:
- Full content extraction and metadata
- Geographic indicators and language detection
- Confidence flags and initial analysis
- Link relationships to topics

### Analytic Artifacts

AI-generated analysis products including:
- Summaries (3-5 bullet points with overview)
- Entity extraction (people, organizations, locations, dates)
- Sentiment and tone analysis
- Timelines and network graphs

### QA & Audit

- Review status tracking for links and artifacts
- Completeness scoring and checklists
- Full audit trail of all operations
- Before/after state tracking for changes

## Contributing

Contributions are welcome! Please read the development guidelines in `agents.md` before submitting pull requests.

## License

This software is proprietary and confidential. All rights reserved by Sandiebeach LLC.

See [LICENSE](LICENSE) for full license terms and [COPYRIGHT.md](COPYRIGHT.md) for copyright information.
