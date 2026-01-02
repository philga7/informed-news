/**
 * Supabase Client for Vercel Serverless Functions
 * 
 * Provides server-side Supabase client with service role key
 * for API operations and database access.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL) {
  throw new Error('Missing SUPABASE_URL environment variable');
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not set. Using anon key (limited permissions)');
}

/**
 * Serverless Supabase client with service role permissions
 * Use this for server-side operations that bypass RLS
 */
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('organizations').select('id').limit(1);
    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase connection test error:', err);
    return false;
  }
}

