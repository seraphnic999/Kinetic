import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

/**
 * Returns { session, loading }.
 * session is null while unauthenticated, a Supabase Session object when logged in.
 * Automatically reacts to sign-in / sign-out events from any part of the app.
 */
export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Live listener for sign-in / sign-out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    );
    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
