import { createClient } from '@supabase/supabase-js';

// Supabase client configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local file.');
}

// Create Supabase client for frontend (uses ANON key, respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Helper function to test connection
export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  details?: {
    url: string;
    authenticated: boolean;
    userId?: string;
  };
}> {
  try {
    // Test 1: Check if we can connect to Supabase
    const { data: session } = await supabase.auth.getSession();
    
    // Test 2: Try a simple query (this will fail if tables don't exist)
    const { error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      // If tables don't exist yet, that's okay - connection works
      if (error.message.includes('relation') || 
          error.message.includes('does not exist') ||
          error.message.includes('schema cache') ||
          error.message.includes('Could not find') ||
          error.code === 'PGRST204' ||
          error.code === '42P01') {
        return {
          success: true,
          message: 'Database is accessible. Tables/schema not yet created. Ready for migrations.',
          details: {
            url: supabaseUrl,
            authenticated: !!session.session,
            userId: session.session?.user?.id,
          },
        };
      }
      
      return {
        success: false,
        message: `Connection error: ${error.message}`,
      };
    }
    
    return {
      success: true,
      message: 'Database is accessible and tables exist. Schema is ready!',
      details: {
        url: supabaseUrl,
        authenticated: !!session.session,
        userId: session.session?.user?.id,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Helper to check if user is authenticated
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Helper to get user session
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

