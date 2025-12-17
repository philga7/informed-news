# Setup Guide

## Quick Start

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
VITE_API_URL=http://localhost:3001
```

### 3. Start Both Services

```bash
npm run dev
```

This will start both the backend and frontend services simultaneously:
- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173` (or another port if 5173 is taken)

**Alternative**: Run services separately:
- Backend only: `npm run server`
- Frontend only: `npm run client`

## Verification

### Test Backend Health

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Test Feed Fetching

1. Open the frontend app in your browser
2. Add a news source (e.g., RSS feed)
3. Click "Update News" button
4. Articles should be fetched from the backend and displayed

## Troubleshooting

### Backend won't start

- Check if port 3001 is already in use
- Verify Node.js version (requires Node.js 18+ for native fetch)
- Check backend dependencies: `cd backend && npm install`

### Frontend can't connect to backend

- Verify backend is running: `curl http://localhost:3001/health`
- Check `.env` file has `VITE_API_URL=http://localhost:3001`
- Restart frontend dev server after changing `.env`

### CORS errors

- Backend has CORS enabled by default
- If you see CORS errors, check backend `server.ts` has `app.use(cors())`

### Feed fetching fails

- Check backend console for error messages
- Verify RSS feed URL is accessible
- Test feed URL directly: `curl https://example.com/feed.xml`

## Development Workflow

### Running Both Services

Simply run:
```bash
npm run dev
```

This uses `concurrently` to run both services in a single terminal with color-coded output.

**Run Services Separately:**
- Backend only: `npm run server`
- Frontend only: `npm run client`

## Production Build

### Build Backend

```bash
cd backend
npm run build
npm start
```

### Build Frontend

```bash
npm run build
npm run preview
```

## Environment Variables

### Frontend (.env)
- `VITE_API_URL` - Backend API URL (default: `http://localhost:3001`)

### Backend (backend/.env - optional)
- `PORT` - Server port (default: `3001`)
- `NODE_ENV` - Environment (development/production)

## Next Steps

- See [Implementation Guide](./IMPLEMENTATION_GUIDE.md) for API usage
- See [Architecture Decision](./ARCHITECTURE_DECISION.md) for design rationale
- See [Hosting Evaluation](./HOSTING_EVALUATION.md) for deployment options

