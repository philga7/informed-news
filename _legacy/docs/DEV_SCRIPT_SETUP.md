# Development Script Setup

## Overview

The project now uses `concurrently` to run both backend and frontend services with a single command, matching the pattern used in `informed-investor`.

## Scripts

### Main Development Command

```bash
npm run dev
```

This runs both services simultaneously:
- **Backend**: Express server on `http://localhost:3001`
- **Frontend**: Vite dev server on `http://localhost:5173`

### Individual Service Commands

```bash
# Backend only
npm run server

# Frontend only
npm run client
```

## Implementation

### Root `package.json`

```json
{
  "scripts": {
    "dev": "concurrently \"npm run server\" \"npm run client\"",
    "server": "cd backend && npm run dev",
    "client": "vite"
  }
}
```

### Dependencies

- `concurrently` - Installed as dev dependency to run multiple commands

## Output

When running `npm run dev`, you'll see color-coded output from both services:

```
[0] > informed-news-backend@1.0.0 dev
[0] > tsx watch src/server.ts
[0] 🚀 Backend server running on http://localhost:3001

[1] > vite
[1] VITE v5.4.8  ready in 143 ms
[1] ➜  Local:   http://localhost:5173/
```

## Benefits

✅ **Single Command**: Start everything with `npm run dev`  
✅ **Color-Coded Output**: Easy to distinguish backend vs frontend logs  
✅ **Consistent Pattern**: Matches `informed-investor` project structure  
✅ **Flexible**: Can still run services individually if needed  

## Usage

1. **Start Development**:
   ```bash
   npm run dev
   ```

2. **Stop Services**: Press `Ctrl+C` to stop both services

3. **Run Individual Services** (if needed):
   ```bash
   npm run server  # Backend only
   npm run client  # Frontend only
   ```

