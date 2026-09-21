/**
 * What you did last time, cached locally so the training screen can read it.
 *
 * `TrainingScreen` makes no network calls at all, on purpose: the app is
 * designed for a gym in a basement, and every screen you use mid-session reads
 * from local state. Showing "last time you did this" therefore cannot be a
 * query — it has to be something already on the device before you walk in.
 *
 * So this keeps a small map, exercise name → the top set of the most recent
 * session that contained it, refreshed whenever the app has connectivity. A
 * stale entry is fine and says so by carrying its date; a missing one just
 * shows nothing. Neither blocks training.
 *
 * Combo sub-exercises fall out for free: they are stored as ordinary regular
 * rows with their own names (the parent_id migration), so they are simply more
 * exercises as far as this is concerned.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { shapeSessions, deriveAll, SESSION_LIMIT } from './analytics';

const KEY = '@kinetic_exercise_history';

/** In-memory mirror so the set sheet never awaits storage mid-session. */
let memo = null;

const EMPTY = { byExercise: {}, refreshedAt: null };

/** Read the cache. Cheap after the first call. */
export async function getExerciseHistory() {
  if (memo) return memo;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    memo = raw ? JSON.parse(raw) : EMPTY;
    if (!memo || typeof memo.byExercise !== 'object') memo = EMPTY;
  } catch (e) {
    console.warn('[exerciseHistory] could not read cache:', e?.message ?? e);
    memo = EMPTY;
  }
  return memo;
}

/** Synchronous read for render paths. Null until `getExerciseHistory` has run. */
export const peekExerciseHistory = () => memo;

/**
 * One entry, or null.
 * `{ weightKg, reps, e1rm, dayKey }` — the top set of the last session that
 * contained this exercise, not the last set. The heaviest is what you are
 * actually deciding against.
 */
export function lastFor(exerciseName) {
  if (!memo || !exerciseName) return null;
  return memo.byExercise[exerciseName] ?? null;
}

/**
 * Rebuild the cache from the server. Safe to call often and safe to fail:
 * on any error the existing cache is left exactly as it was, because a stale
 * answer beats no answer on this particular screen.
 */
export async function refreshExerciseHistory() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, reason: 'not signed in' };

    const { data, error } = await supabase.from('workout_sessions').select(`
        id, name, started_at, duration_secs, timeline,
        workout_exercises (
          id, parent_id, exercise_type, exercise_name, body_section, status,
          weight_kg, sets_planned, sets_completed, reps, duration_secs, perf_order
        )
      `).order('started_at', { ascending: false }).limit(SESSION_LIMIT);

    if (error) return { ok: false, reason: error.message };
    if (!data) return { ok: false, reason: 'no data' };

    // Newest first, so the first sighting of an exercise is its last outing.
    const byExercise = {};
    for (const d of deriveAll(shapeSessions(data))) {
      for (const b of d.bestSets ?? []) {
        if (!b.exercise || byExercise[b.exercise]) continue;
        byExercise[b.exercise] = {
          weightKg: b.weightKg,
          reps:     b.reps,
          e1rm:     b.e1rm,
          dayKey:   d.dayKey,
        };
      }
    }

    const next = { byExercise, refreshedAt: Date.now() };
    memo = next;
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return { ok: true, count: Object.keys(byExercise).length };
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
}

/** Test and sign-out hook — a cache of someone else's lifts would be wrong. */
export async function clearExerciseHistory() {
  memo = EMPTY;
  await AsyncStorage.removeItem(KEY);
}
