import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Replace these with your own values from supabase.com → Project Settings → API
const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
