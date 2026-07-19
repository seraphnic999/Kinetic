/**
 * Syncs a completed workout session to Supabase.
 * Called silently after session end — errors are logged, never thrown.
 * Skips gracefully if user is not logged in.
 */
import { supabase } from '../config/supabase';

export async function syncWorkout(summary) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // not logged in, skip silently

    const userId = session.user.id;
    const startedAt = summary.startTime instanceof Date
      ? summary.startTime.toISOString()
      : new Date(summary.startTime).toISOString();

    // ── Insert session row ────────────────────────────────────────────────
    const { data: sessionRow, error: sessionErr } = await supabase
      .from('workout_sessions')
      .insert({
        user_id:         userId,
        name:            summary.sessionName || 'Session',
        started_at:      startedAt,
        duration_secs:   summary.totalDurationSecs ?? 0,
        rest_timer_secs: summary.restTimerSecs ?? null,
        timeline:        summary.timeline ?? null,
      })
      .select('id')
      .single();

    if (sessionErr) { console.warn('[syncWorkout] session insert failed:', sessionErr.message); return; }

    // ── Insert exercise rows ──────────────────────────────────────────────
    const exercises = (summary.exercises ?? []).map((ex, idx) => {
      const base = {
        session_id:    sessionRow.id,
        user_id:       userId,
        exercise_type: ex.type,
        exercise_name: ex.name,
        body_section:  ex.bodySection ?? null,
        status:        ex.status,
        perf_order:    ex.performanceOrder ?? idx,
      };

      if (ex.type === 'regular') return {
        ...base,
        weight_kg:      ex.weight ?? null,
        sets_planned:   ex.plannedSets ?? null,
        sets_completed: ex.completedSets ?? null,
        reps:           ex.reps ?? null,
      };

      if (ex.type === 'warmup') return {
        ...base,
        duration_secs: ex.plannedDurationSecs ?? null,
      };

      if (ex.type === 'intervals') return {
        ...base,
        intervals_planned:  ex.plannedReps ?? null,
        intervals_done:     ex.completedReps ?? null,
        interval_len_secs:  ex.intervalLengthSecs ?? null,
      };

      // combo — store aggregate (individual sub-ex data lives in the session summary)
      return {
        ...base,
        sets_planned:   ex.plannedSets ?? null,
        sets_completed: ex.completedSets ?? null,
      };
    });

    if (exercises.length > 0) {
      const { error: exErr } = await supabase.from('workout_exercises').insert(exercises);
      if (exErr) console.warn('[syncWorkout] exercises insert failed:', exErr.message);
    }

    console.log('[syncWorkout] ✓ session synced:', sessionRow.id);
  } catch (e) {
    console.warn('[syncWorkout] unexpected error:', e?.message ?? e);
  }
}
