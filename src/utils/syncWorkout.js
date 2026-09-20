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

      if (ex.type === 'intervals') {
        const cardioType = ex.cardioType ?? 'intervals';
        if (cardioType !== 'intervals') return {
          ...base,
          cardio_type:   cardioType,
          duration_secs: ex.completedDurationSecs ?? ex.plannedDurationSecs ?? null,
          speed_kmh:     ex.speedKmh ?? null,
          incline_pct:   cardioType === 'treadmill' ? (ex.inclinePct ?? null) : null,
        };
        return {
          ...base,
          cardio_type:        cardioType,
          intervals_planned:  ex.plannedReps ?? null,
          intervals_done:     ex.completedReps ?? null,
          interval_len_secs:  ex.intervalLengthSecs ?? null,
        };
      }

      // combo — the aggregate row. Its sub-exercises are inserted separately
      // below, as real rows pointing back at this one.
      return {
        ...base,
        sets_planned:   ex.plannedSets ?? null,
        sets_completed: ex.completedSets ?? null,
      };
    });

    if (exercises.length === 0) {
      console.log('[syncWorkout] ✓ session synced (no exercises):', sessionRow.id);
      return;
    }

    // `select()` so the combo rows come back with their generated ids, which
    // the children need as a parent.
    const { data: inserted, error: exErr } = await supabase
      .from('workout_exercises')
      .insert(exercises)
      .select('id, perf_order, exercise_type');

    if (exErr) { console.warn('[syncWorkout] exercises insert failed:', exErr.message); return; }

    // ── Combo children ────────────────────────────────────────────────────
    //
    // Each sub-exercise is written as an ordinary 'regular' row with
    // `parent_id` set. That is the whole trick: volume, progression, records
    // and the body split all pick them up with no special-casing, because to
    // every query they ARE regular rows. The parent stays to say "this was one
    // combo of N sets".
    //
    // Sets completed is inherited from the parent: you cannot do four sets of
    // a combo and three sets of the exercise inside it.
    const idByOrder = new Map((inserted ?? []).map(r => [r.perf_order, r.id]));
    const children = [];

    (summary.exercises ?? []).forEach((ex, idx) => {
      if (ex.type !== 'combo') return;
      const parentId = idByOrder.get(ex.performanceOrder ?? idx);
      if (!parentId) return;

      (ex.subExercises ?? []).forEach((sub, subIdx) => {
        if (!sub?.name) return;
        children.push({
          session_id:     sessionRow.id,
          user_id:        userId,
          parent_id:      parentId,
          exercise_type:  'regular',
          exercise_name:  sub.name,
          body_section:   sub.bodySection ?? null,
          status:         ex.status,
          // Children share the parent's slot, offset so their own order is
          // stable without colliding with the next top-level exercise.
          perf_order:     (ex.performanceOrder ?? idx) * 100 + subIdx + 1,
          weight_kg:      sub.weight ?? null,
          sets_planned:   ex.plannedSets ?? null,
          sets_completed: ex.completedSets ?? null,
          reps:           sub.reps ?? null,
        });
      });
    });

    if (children.length > 0) {
      const { error: childErr } = await supabase.from('workout_exercises').insert(children);
      if (childErr) console.warn('[syncWorkout] combo children insert failed:', childErr.message);
    }

    console.log(`[syncWorkout] ✓ session synced: ${sessionRow.id} ` +
                `(${exercises.length} exercises, ${children.length} combo children)`);
  } catch (e) {
    console.warn('[syncWorkout] unexpected error:', e?.message ?? e);
  }
}
