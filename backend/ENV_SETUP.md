# Backend Environment Setup

## Current Status

✅ `dotenv` package installed  
✅ `dotenv/config` loaded in `server.ts`  
✅ `backend/.env` file created  
✅ `SUPABASE_URL` populated from root `.env`  
⚠️  **`SUPABASE_SERVICE_ROLE_KEY` needs to be added manually**

## Quick Setup

### Step 1: Get Your Service Role Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **API**
4. Find the **service_role** key section
5. Click to reveal and copy the key

### Step 2: Add to Backend .env

Edit `backend/.env` and add your service role key:

```bash
# In backend/.env
SUPABASE_URL=https://fwiswypygzosanbgesgb.supabase.co  # ✅ Already set
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...your-key-here      # ⚠️ Add this
```

### Step 3: Start the Server

```bash
cd backend
npm run dev
```

## Important Security Notes

⚠️ **The `service_role` key has FULL database access** - it bypasses Row Level Security (RLS)!

- **DO NOT** commit this key to version control
- **DO NOT** expose it in frontend code
- **DO NOT** share it publicly
- **ONLY** use it in backend/server-side code

The `service_role` key is different from the `anon` key:
- `anon` key: Safe for frontend, respects RLS
- `service_role` key: Backend only, bypasses RLS

## Troubleshooting

### Error: "Missing SUPABASE_URL environment variable"

**Cause:** The `.env` file is not being loaded or doesn't exist.

**Solution:**
```bash
cd backend
./setup-env.sh
# Then add your SUPABASE_SERVICE_ROLE_KEY manually
```

### Error: "Missing SUPABASE_SERVICE_ROLE_KEY"

This is a warning, not an error. The backend will fall back to using the `VITE_SUPABASE_ANON_KEY` from the root `.env`, but **this won't work** for the ingestion layer since it needs to bypass RLS.

**Solution:** Add your service role key to `backend/.env`

### Where to Find Keys

All keys are in your Supabase project dashboard:
- URL: `https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api`
- Look for the "Project API keys" section

## Environment Variables

### Current Variables

| Variable | Required | Source | Purpose |
|----------|----------|--------|---------|
| `SUPABASE_URL` | ✅ Yes | Supabase Dashboard | Your project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Supabase Dashboard | Server-side database access |
| `PORT` | ❌ No | Manual | Backend server port (default: 3001) |

### Future Variables (Phase 2+)

The following environment variables will be needed for Phase 2 of the Overture Maps integration:

| Variable | Required | Source | Purpose |
|----------|----------|--------|---------|
| `OVERTURE_MAPS_API_KEY` | ⏳ Phase 2 | [Overture Maps API](https://www.overturemapsapi.com/docs/intro) | API key for Overture Maps API (ThatAPICompany service) |

**Note:** Nominatim (OpenStreetMap geocoding) does not require an API key but has strict rate limits (1 request/second). See [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) for requirements.

## Files

- `backend/.env` - Your actual environment variables (gitignored)
- `backend/.env.example` - Template for other developers
- `backend/setup-env.sh` - Helper script to copy URL from root .env

