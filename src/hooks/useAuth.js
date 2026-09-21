import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { syncSessions, clearSessionCache } from '../utils/storage';
import { clearExerciseHistory } from '../utils/exerciseHistory';

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

/**
 * Sign out of the current account.
 *
 * Flushes anything still pending to Supabase while the access token is valid,
 * then clears the on-device session cache so the next account doesn't inherit
 * it. If revoking the token can't reach the server (no connection, token
 * already expired), falls back to a local-only sign-out — signing out must work
 * offline, same as everything else in the app.
 */
export async function signOut() {
  try { await syncSessions(); } catch { /* best effort */ }
  await clearSessionCache();
  // A cache of the previous account's lifts must not greet the next person
  // with "last time: 120 kg" for a lift they have never done.
  await clearExerciseHistory();
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch {
    await supabase.auth.signOut({ scope: 'local' });
  }
}
