import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    // Tables live in the "kinetic" schema since the Supabase project
    // consolidation -- this project also hosts cellar/mommy/manifest.
    db: { schema: 'kinetic' },
    auth: { persistSession: true },
  }
);
