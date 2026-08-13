#!/bin/bash
# Helper script to set up backend/.env from root .env

echo "🔧 Setting up backend/.env file..."

# Read SUPABASE_URL from root .env
SUPABASE_URL=$(grep "^VITE_SUPABASE_URL=" ../.env | cut -d '=' -f 2-)

if [ -z "$SUPABASE_URL" ]; then
  echo "❌ Could not find VITE_SUPABASE_URL in root .env"
  exit 1
fi

echo "✅ Found Supabase URL: ${SUPABASE_URL:0:30}..."

# Update backend/.env
sed -i.bak "s|^SUPABASE_URL=.*|SUPABASE_URL=$SUPABASE_URL|" .env
rm -f .env.bak

echo ""
echo "⚠️  IMPORTANT: You still need to add your SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "To get your service role key:"
echo "1. Go to https://supabase.com/dashboard"
echo "2. Select your project"
echo "3. Go to Settings → API"
echo "4. Copy the 'service_role' key (NOT the 'anon' key)"
echo "5. Edit backend/.env and paste it after SUPABASE_SERVICE_ROLE_KEY="
echo ""
echo "⚠️  WARNING: The service_role key has full database access!"
echo "   Keep it secret and never commit it to version control."
echo ""

