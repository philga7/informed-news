---
name: Email Ingestion System
overview: Add IMAP/POP3 email ingestion capability to enable ingesting intelligence from email sources. Includes encrypted credential storage, email client integration, ingestion service, API routes, scheduler support, and frontend UI.
todos:
  - id: email-schema
    content: Create database migration for email_credentials table with encrypted storage and RLS policies
    status: pending
  - id: email-encryption
    content: Implement encryption utilities for secure credential storage/retrieval using AES-256-GCM
    status: pending
  - id: email-client-abstraction
    content: Create IMAP and POP3 client abstractions with connection handling and email fetching
    status: pending
  - id: email-ingestion-service
    content: Implement EmailIngestionService following IngestionService pattern with email parsing and normalization
    status: pending
    dependencies:
      - email-encryption
      - email-client-abstraction
  - id: email-api-routes
    content: Add API routes for email ingestion (single source, all sources, test connection)
    status: pending
    dependencies:
      - email-ingestion-service
  - id: scheduler-email-support
    content: Update IngestionScheduler to handle email sources alongside RSS sources
    status: pending
    dependencies:
      - email-ingestion-service
  - id: email-types
    content: Add TypeScript types for email credentials, config, and database schema
    status: pending
    dependencies:
      - email-schema
  - id: email-frontend-service
    content: Create frontend service layer for email credential management and connection testing
    status: pending
    dependencies:
      - email-api-routes
  - id: email-source-form
    content: Build EmailSourceForm component for configuring email sources with credentials
    status: pending
    dependencies:
      - email-types
      - email-frontend-service
  - id: sources-page-email-ui
    content: Update SourcesPage to integrate email source creation and display
    status: pending
    dependencies:
      - email-source-form
  - id: email-dependencies
    content: Add email client libraries (imap, node-pop3, mailparser) to backend dependencies
    status: pending
  - id: email-env-config
    content: Document and configure EMAIL_ENCRYPTION_KEY environment variable
    status: pending
  - id: email-threading-enhancement
    content: Future enhancement - Link related emails (email threads) using in_reply_to and references headers
    status: pending
---

# Email Ingestion System Implementation Plan

## Overview

Add IMAP/POP3 email ingestion to enable pulling intelligence from email sources. Supports Hostinger and other standard IMAP/POP3 email servers with encrypted credential storage in the database.

## Architecture

The email ingestion follows the existing ingestion pattern:

- `EmailIngestionService` implements `IngestionService` interface
- Uses `IngestionController` for deduplication and database insertion
- Encrypted credentials stored in separate `email_credentials` table
- Integrates with existing scheduler for periodic email checks
- Supports IMAP (preferred) and POP3 protocols

## Data Flow

```javascript
Email Source → IMAP/POP3 Client → EmailIngestionService → IngestionController → Database
     ↑                                                                             ↓
     └──────────────────── Encrypted Credentials (email_credentials table) ───────┘
```

## Implementation Tasks

### 1. Database Schema

**File**: `supabase/migrations/[timestamp]_email_credentials.sql`

- Create `email_credentials` table for encrypted storage:
                                                                - `id` (UUID, PK)
                                                                - `source_id` (UUID, FK → sources, unique)
                                                                - `encrypted_credentials` (TEXT) - JSON encrypted with application key
                                                                - `protocol` (ENUM: 'imap', 'pop3') - Email protocol
                                                                - `host` (TEXT) - IMAP/POP3 server hostname
                                                                - `port` (INTEGER) - Server port
                                                                - `use_tls` (BOOLEAN) - Use TLS/SSL
                                                                - `username` (TEXT) - Email address (stored in plain text for display)
                                                                - `created_at`, `updated_at` (TIMESTAMPTZ)
- Add RLS policies for organization-scoped access
- Create indexes on `source_id` and organization lookups

**Notes**:

- Credentials encrypted using Node.js `crypto` with AES-256-GCM
- Encryption key stored in environment variable `EMAIL_ENCRYPTION_KEY`
- Encrypted JSON contains: `password`, optionally `oauth_token` for future OAuth support

### 2. Encryption Utilities

**File**: `backend/src/utils/emailEncryption.ts`

- `encryptCredentials(credentials: EmailCredentials): string` - Encrypt credentials for storage
- `decryptCredentials(encrypted: string): EmailCredentials` - Decrypt credentials for use
- Uses AES-256-GCM with initialization vector stored with encrypted data
- Handles missing encryption key gracefully (throws descriptive error)

**Type**: `EmailCredentials` interface:

```typescript
interface EmailCredentials {
  password: string;
  oauthToken?: string; // Future OAuth support
}
```

### 3. Email Ingestion Service

**File**: `backend/src/services/ingestion/EmailIngestionService.ts`

- Implements `IngestionService` interface
- Constructor takes: `sourceId`, `organizationId`
- `fetchAndNormalize()` method:
                                                                - Retrieves encrypted credentials from database
                                                                - Decrypts credentials
                                                                - Connects to IMAP/POP3 server
                                                                - Fetches unread emails since last check (tracked in source metadata)
                                                                - Parses email content using detailed parsing strategy (see below)
                                                                - Converts to `SourceRecordDTO[]` format
                                                                - Marks emails as read/processed (IMAP) or deletes (POP3)
- Error handling for connection failures, authentication errors

**Dependencies**:

- Install `imap` package for IMAP support
- Install `pop3` or `node-pop3` for POP3 support
- Install `mailparser` for email parsing

#### 3.1 Email Parsing Strategy

**Email → SourceRecordDTO Mapping:**| Email Field | SourceRecordDTO Field | Processing Notes ||------------|----------------------|------------------|| `Subject` | `title` | Use email subject as title, fallback to "(No Subject)" if empty || `Body (HTML/Text)` | `content` | Prefer HTML body, fallback to plain text, extract plain text from HTML for storage || `Date` | `published_at` | Use email received date (Date header) || `From` | `raw_metadata.email_from` | Sender name and email address `{ name: string, address: string }` || `Message-ID` | `raw_metadata.message_id` | Unique email identifier || `Message-ID` | `url` | Use `mailto:` link with message-id for deduplication reference || `To/CC/BCC` | `raw_metadata.email_to`, etc. | Recipient information (arrays) || `In-Reply-To` | `raw_metadata.in_reply_to` | Threading information || `References` | `raw_metadata.references` | Email thread references (array) || `Attachments` | `raw_metadata.attachments[]` | Metadata for each attachment |**Content Extraction Details:**

1. **Body Processing:**

                                                                                                - Multipart emails: Prefer HTML part if present, otherwise use plain text part
                                                                                                - HTML emails: Extract text content (strip HTML tags, preserve structure)
                                                                                                - Plain text: Use as-is
                                                                                                - MIME decoding: Handle quoted-printable and base64 encodings
                                                                                                - Links: Extract URLs from body for future analysis

2. **Rich Metadata Storage:**
   ```typescript
      raw_metadata: {
        email_from: { name: string, address: string },
        email_to: string[],
        email_cc?: string[],
        email_bcc?: string[],
        message_id: string,
        in_reply_to?: string,  // Threading information
        references?: string[],  // Email thread references
        attachments: [{
          filename: string,
          content_type: string,
          size: number,
          content_id?: string,  // For inline images
          extracted_text?: string  // If attachment is text-based (PDF, Word, TXT)
        }],
        email_headers: Record<string, string>,  // All headers for reference
        is_html: boolean,
        original_html?: string  // Store original HTML if needed for analysis
      }
   ```

3. **Attachments Handling:**

                                                                                                - Extract metadata: filename, MIME type, size
                                                                                                - Text attachments: Extract text from PDF, Word, plain text files (using mailparser)
                                                                                                - Images: Store metadata only (filename, type, size, content-id for inline images)
                                                                                                - Other files: Store metadata only
                                                                                                - Size limit: Skip very large attachments (>10MB) to avoid storage issues
                                                                                                - Attach extracted text to email body if relevant for searchability

4. **Language and Geographic Detection:**

                                                                                                - Follows same pattern as RSS ingestion
                                                                                                - Language: Detect from email body content (basic heuristic, can be enhanced)
                                                                                                - Geographic indicators: Extract location mentions from subject + body content

5. **Deduplication:**

                                                                                                - Content hash: `SHA-256(subject + content + published_at)` (same as RSS)
                                                                                                - Message-ID: Used as additional check (stored in raw_metadata)
                                                                                                - Prevents duplicate ingestion of same email across multiple runs

6. **Example Parse:**
   ```javascript
      Input Email:
            - From: John Doe <john@example.com>
            - To: phil@informedcrew.com
            - Subject: Intelligence Report: Market Analysis
            - Date: 2024-01-15 10:30:00
            - Message-ID: <abc123@example.com>
            - [HTML Body with formatting]
            - Attachments: report.pdf (250KB)
      
      Parsed SourceRecordDTO:
      {
        source_id: "source-uuid",
        title: "Intelligence Report: Market Analysis",
        url: "mailto:john@example.com?message-id=abc123@example.com",
        content: "Extracted text content from HTML body...",
        published_at: new Date("2024-01-15T10:30:00Z"),
        language: "en",
        geographic_indicators: ["United States"],  // If mentioned
        media_type: "article",
        content_type: "full_text",
        content_length: 1234,
        raw_metadata: {
          email_from: { name: "John Doe", address: "john@example.com" },
          email_to: ["phil@informedcrew.com"],
          message_id: "abc123@example.com",
          attachments: [{
            filename: "report.pdf",
            content_type: "application/pdf",
            size: 250000,
            extracted_text: "PDF text content if extracted..."
          }],
          is_html: true
        }
      }
   ```


### 4. Email Client Abstraction

**File**: `backend/src/services/ingestion/emailClient/ImapClient.ts`**File**: `backend/src/services/ingestion/emailClient/Pop3Client.ts`**File**: `backend/src/services/ingestion/emailClient/index.ts`

- Abstract `EmailClient` interface
- `ImapClient` implementation:
                                                                - Connect with credentials
                                                                - Search for unread emails since date
                                                                - Fetch email bodies
                                                                - Mark as read after processing
                                                                - Close connection properly
- `Pop3Client` implementation:
                                                                - Connect with credentials
                                                                - List and retrieve emails
                                                                - Delete after processing (POP3 behavior)
- Factory function to create appropriate client based on protocol

### 5. API Routes

**File**: `backend/src/routes/ingest.ts`Add new routes:

- `POST /api/ingest/email` - Trigger email ingestion for a single source
                                                                - Body: `{ organization_id, source_id }`
                                                                - Validates source exists and is email type
                                                                - Retrieves credentials, creates `EmailIngestionService`
                                                                - Runs through `IngestionController`
                                                                - Returns ingestion results
- `POST /api/ingest/email/all` - Trigger email ingestion for all email sources in organization
                                                                - Body: `{ organization_id }`
                                                                - Processes all enabled email sources in parallel (max 5 concurrent)
                                                                - Returns aggregated results
- `POST /api/ingest/email/test` - Test email connection (for configuration)
                                                                - Body: `{ organization_id, source_id }` or `{ credentials }` (temporary test)
                                                                - Tests connection without ingesting
                                                                - Returns connection status

### 6. Scheduler Integration

**File**: `backend/src/services/ingestion/IngestionScheduler.ts`

- Update `runIngestionForOrganization()` to process email sources
- Add email source handling alongside RSS sources:
                                                                - Filter sources by `source_type = 'email'`
                                                                - Create `EmailIngestionService` for each
                                                                - Run through `IngestionController`
                                                                - Update source `updated_at` timestamp

**File**: `backend/src/routes/scheduler.ts`

- No changes needed - scheduler already handles all source types generically

### 7. Backend Service Layer

**File**: `backend/src/services/emailCredentials.service.ts` (optional helper)

- `createCredentials(sourceId, credentials, config)` - Create and encrypt credentials
- `getCredentials(sourceId)` - Retrieve and decrypt credentials
- `updateCredentials(sourceId, credentials, config)` - Update encrypted credentials
- `deleteCredentials(sourceId)` - Delete credentials (CASCADE from source deletion)

### 8. TypeScript Types

**File**: `src/types/osint.ts`

- Update `Source` interface - no changes needed (source_type already includes 'email')
- Add `EmailSourceConfig` interface:
```typescript
interface EmailSourceConfig {
  protocol: 'imap' | 'pop3';
  host: string;
  port: number;
  useTls: boolean;
  username: string;
}
```


**File**: `src/types/database.ts`

- Add `email_credentials` table types to `Database` interface
- Add `EmailCredentialsRow`, `EmailCredentialsInsert`, `EmailCredentialsUpdate`

**File**: `backend/src/types/ingestion.ts`

- Add `EmailIngestionConfig` interface:
```typescript
interface EmailIngestionConfig {
  sourceId: string;
  organizationId: string;
}
```


### 9. Frontend Service

**File**: `src/services/emailCredentials.service.ts`

- `createEmailCredentials(sourceId, password, config)` - Create email source with credentials
- `testEmailConnection(credentials, config)` - Test email connection
- `updateEmailCredentials(sourceId, password, config)` - Update credentials
- Uses `apiClient` to call backend routes

### 10. Frontend UI Components

**File**: `src/components/Sources/EmailSourceForm.tsx`

- Form for configuring email sources:
                                                                - Source name
                                                                - Email address (username)
                                                                - Protocol selection (IMAP/POP3)
                                                                - Host (with common presets: Gmail, Outlook, Hostinger)
                                                                - Port (auto-fill based on protocol + TLS)
                                                                - TLS/SSL checkbox
                                                                - Password input (masked)
                                                                - Test connection button
- Validates required fields
- Calls backend to create/update source with credentials
- Handles connection testing feedback

**File**: `src/components/Sources/SourcesPage.tsx`

- Update to show email sources in list
- Add "Add Email Source" button that opens `EmailSourceForm`
- Show email-specific metadata (username, protocol, host)
- Handle editing email source credentials

### 11. Dependencies

**File**: `backend/package.json`Add dependencies:

- `imap` - IMAP client library
- `node-pop3` or `pop3` - POP3 client library  
- `mailparser` - Email parsing (handles MIME, attachments)
- `@types/imap` - TypeScript types for IMAP

Install command:

```bash
cd backend && npm install imap node-pop3 mailparser && npm install --save-dev @types/imap @types/node-pop3
```

### 12. Environment Variables

**File**: `backend/.env.example`Add:

```env
EMAIL_ENCRYPTION_KEY=your-32-byte-hex-encryption-key-here
```

**Notes**:

- Generate key: `openssl rand -hex 32`
- Store securely in Vercel environment variables
- Required for credential encryption/decryption

### 13. Source Configuration Tracking

**Enhancement**: Track last email check timestamp in source metadata

- Store `last_email_check` in `sources.raw_metadata` JSONB column
- Update after successful ingestion
- Use for incremental email fetching (only fetch emails after last check)
- Defaults to fetching last 7 days on first run

### 14. Email Threading Enhancement (Future)

**Enhancement**: Link related emails using threading headers**Scope**: Link source records that are part of the same email thread using `in_reply_to` and `references` headers stored in `raw_metadata`.**Implementation Notes**:

- Store `in_reply_to` and `references` in `raw_metadata` during ingestion (already included in parsing strategy)
- Future enhancement: Create relationships between source records with same thread identifiers
- Options for linking:
                - Add `thread_id` column to `source_records` table (UUID)
                - Add `source_record_threads` junction table for many-to-many threading relationships
                - Use existing `raw_metadata` JSONB queries to find related emails (simpler, no schema change)
- Thread visualization in frontend:
                - Show email threads as grouped/conversation view in source records list
                - Display thread relationships in topic detail views
                - Link related emails in scan workflow

**Considerations**:

- Threading can span multiple email sources (cross-source threading)
- Message-ID uniqueness across email servers
- Thread depth limits to prevent extremely long chains
- Performance implications of thread queries on large datasets

**Note**: This is a future enhancement - threading metadata is collected during initial implementation, but linking will be implemented in a follow-up phase.

## Security Considerations

1. **Encryption**: All passwords encrypted at rest using AES-256-GCM
2. **RLS Policies**: Email credentials protected by Row Level Security (organization-scoped)
3. **Key Management**: Encryption key stored in environment variables (never in code)
4. **Credential Isolation**: Credentials stored separately from source configuration
5. **Connection Security**: Enforce TLS/SSL for email connections
6. **Password Handling**: Never log passwords, mask in UI, encrypt immediately

## Testing Strategy

1. **Unit Tests**:

                                                                                                - Encryption/decryption utilities
                                                                                                - Email parsing logic
                                                                                                - Client connection handling

2. **Integration Tests**:

                                                                                                - Test email connection with real server (test account)
                                                                                                - Full ingestion flow with test emails
                                                                                                - Credential storage and retrieval

3. **Manual Testing**:

                                                                                                - Configure Hostinger email account
                                                                                                - Test IMAP and POP3 connections
                                                                                                - Verify email ingestion creates source records
                                                                                                - Test scheduler picks up email sources

## Migration Notes

1. Existing email source types in database are already supported (enum includes 'email')
2. No data migration needed - email_credentials table is new
3. Backwards compatible - existing RSS/manual sources unaffected

## Files to Create/Modify

**New Files**:

- `supabase/migrations/[timestamp]_email_credentials.sql`
- `backend/src/utils/emailEncryption.ts`
- `backend/src/services/ingestion/EmailIngestionService.ts`
- `backend/src/services/ingestion/emailClient/ImapClient.ts`
- `backend/src/services/ingestion/emailClient/Pop3Client.ts`
- `backend/src/services/ingestion/emailClient/index.ts`
- `src/services/emailCredentials.service.ts`
- `src/components/Sources/EmailSourceForm.tsx`

**Modified Files**:

- `backend/src/routes/ingest.ts` - Add email ingestion routes
- `backend/src/services/ingestion/IngestionScheduler.ts` - Add email source handling
- `backend/src/services/ingestion/index.ts` - Export EmailIngestionService
- `src/types/database.ts` - Add email_credentials types
- `src/types/osint.ts` - Add EmailSourceConfig interface
- `src/components/Sources/SourcesPage.tsx` - Add email source UI