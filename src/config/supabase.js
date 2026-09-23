import { createClient } from '@supabase/supabase-js';
import { config } from './env.js';

// Create a single Supabase client instance
// Using service role key for server-side operations
export const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
