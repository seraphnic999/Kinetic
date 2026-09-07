import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Replace these with your own values from supabase.com → Project Settings → API
const SUPABASE_URL  = 'https://yvqptrjxbptloucyuubm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cXB0cmp4YnB0bG91Y3l1dWJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3OTA1NjUsImV4cCI6MjEwMTM2NjU2NX0.voNVzzy6ZUe8vJ2mPDibYmm4SLfbvUE5g6xdt7Irb58';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  // Tables live in the "kinetic" schema since the Supabase project
  // consolidation -- this project also hosts cellar/mommy/manifest.
  db: { schema: 'kinetic' },
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
