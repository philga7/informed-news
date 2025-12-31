import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-load Supabase client to allow dotenv to load first
let _supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (_supabaseAdmin) return _supabaseAdmin;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables. Check backend/.env file.');
  }

  // Create Supabase client for backend (uses SERVICE_ROLE key, bypasses RLS)
  _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  
  return _supabaseAdmin;
}

// Export lazy-loaded client
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseAdmin() as any)[prop];
  },
});

// Helper function to test backend connection
export async function testConnection(): Promise<{
  success: boolean;
  message: string;
  details?: {
    url: string;
    tablesExist: boolean;
    tableCount?: number;
    tables?: string[];
  };
}> {
  try {
    // Test connection by attempting to query a table
    // If tables don't exist, we'll get a specific error
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('count')
      .limit(1);
    
    if (error) {
      // Check if error is because table doesn't exist
      if (error.message.includes('relation') || 
          error.message.includes('does not exist') ||
          error.message.includes('schema cache') ||
          error.message.includes('Could not find') ||
          error.code === 'PGRST204' ||
          error.code === '42P01') {
        return {
          success: true,
          message: 'Backend connection successful! Tables not yet created. Run migrations in Supabase Dashboard.',
          details: {
            url: process.env.SUPABASE_URL || '',
            tablesExist: false,
            tableCount: 0,
          },
        };
      }
      
      return {
        success: false,
        message: `Connection error: ${error.message}`,
      };
    }
    
    // Table exists, now count all our tables using raw SQL query
    try {
      const { data: tablesData, error: tablesError } = await getSupabaseAdmin()
        .rpc('exec_sql', {
          query: `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
          `
        });
      
      // If RPC doesn't exist, try direct query with admin client
      // Use a simpler approach - just check our known tables
      const ourTables = [
        'profiles',
        'news_sources', 
        'news_articles',
        'feed_collections',
        'feed_source_configs',
        'topics',
        'topic_articles',
        'ignored_topics',
        'ignored_topic_articles'
      ];
      
      let existingTables: string[] = [];
      
      // Check each table individually
      for (const tableName of ourTables) {
        const { error: checkError } = await getSupabaseAdmin()
          .from(tableName)
          .select('count')
          .limit(0);
        
        if (!checkError) {
          existingTables.push(tableName);
        }
      }
      
      return {
        success: true,
        message: `Backend connection successful! Database schema deployed with ${existingTables.length} tables.`,
        details: {
          url: process.env.SUPABASE_URL || '',
          tablesExist: true,
          tableCount: existingTables.length,
          tables: existingTables,
        },
      };
    } catch (countError) {
      // Fallback if counting fails - at least we know profiles exists
      return {
        success: true,
        message: 'Backend connection successful! Database tables exist.',
        details: {
          url: process.env.SUPABASE_URL || '',
          tablesExist: true,
          tableCount: 1,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Helper to get all profiles (admin operation)
export async function getAllProfiles() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .limit(100);
  
  if (error) throw error;
  return data;
}

// Helper to get user by ID (admin operation)
export async function getUserById(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
}

