import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Replace these with your own values from supabase.com → Project Settings → API
const SUPABASE_URL  = 'https://pillifqqefkrudogbhya.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpbGxpZnFxZWZrcnVkb2diaHlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NzM3NDgsImV4cCI6MjEwMDQ0OTc0OH0.u22RdUuB70CRnPT1CQZX3Pid9sezgyPOeSm4hhOFYzQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
