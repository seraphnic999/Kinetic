/**
 * Sends a finished session to Supabase — durably, and in one transaction.
 *
 * Two things were wrong with the previous version, and they compounded:
 *
 *   1. It was called fire-and-forget and every failure path was
 *      `console.warn(); return;`, with the summary never written anywhere
 *      local. A session finished without signal was simply gone.
 *   2. It wrote in three round trips with no transaction — session, then
 *      exercises, then combo children. A failure between the first and second
 *      left a session row with NO exercises, which reads as a session that
 *      moved nothing and quietly drags volume and density down. Worse than
 *      losing it outright, because it is invisible.
 *
 * Now: the payload goes into a durable outbox first (`syncQueue.js`), and the
 * send is a single `kinetic.log_workout` RPC that writes all three tables in
 * one transaction and is idempotent on `client_id` — so a response lost after
 * a successful insert retries into a no-op rather than a duplicate.
 *
 * The row mapping below is unchanged, deliberately. It is mirrored by
 * `sessionFromSummary` in shared/analytics.js so the Summary screen and the
 * stored history of the same session cannot disagree; change a column here and
 * change it there.
 */
import { supabase } from '../config/supabase';
import {
  clientIdFor, enqueue, remove, markAttempt, pending, pendingCount, MAX_ATTEMPTS,
} from './syncQueue';

/** Map a local summary onto the RPC's payload shape. Pure — no I/O. */
export function buildPayload(summary, clientId) {
  const startedAt = summary.startTime instanceof Date
    ? summary.startTime.toISOString()
    : new Date(summary.startTime).toISOString();

  const exercises = (summary.exercises ?? []).map((ex, idx) => {
    const base = {
      exercise_type: ex.type,
      exercise_name: ex.name,
      body_section:  ex.bodySection ?? null,
      status:        ex.status,
      perf_order:    ex.performanceOrder ?? idx,
    };

    if (ex.type === 'regular') return {
      ...base,
      // How to read weight_kg. Without this a pair of 25s is stored as 25 and
      // counts as half of what was moved — see LOAD_TYPES in shared/analytics.
      load_type:      ex.loadType ?? null,
      bar_kg:         ex.loadType === 'barbell' ? (ex.barKg ?? 20) : null,
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
        cardio_type:       cardioType,
        intervals_planned: ex.plannedReps ?? null,
        intervals_done:    ex.completedReps ?? null,
        interval_len_secs: ex.intervalLengthSecs ?? null,
      };
    }

    // combo — the aggregate row. Its sub-exercises go in `children`.
    return {
      ...base,
      sets_planned:   ex.plannedSets ?? null,
      sets_completed: ex.completedSets ?? null,
    };
  });

  // Each sub-exercise is written as an ordinary 'regular' row pointing at its
  // parent. That is the whole trick: volume, progression, records and the body
  // split pick them up with no special-casing, because to every query they ARE
  // regular rows. The parent stays to say "this was one combo of N sets".
  //
  // The parent is referenced by its perf_order rather than an id, because the
  // id does not exist until the RPC runs.
  const children = [];
  (summary.exercises ?? []).forEach((ex, idx) => {
    if (ex.type !== 'combo') return;
    const parentOrder = ex.performanceOrder ?? idx;
    (ex.subExercises ?? []).forEach((sub, subIdx) => {
      if (!sub?.name) return;
      children.push({
        parent_perf_order: parentOrder,
        exercise_name:  sub.name,
        body_section:   sub.bodySection ?? null,
        status:         ex.status,
        // Children share the parent's slot, offset so their own order is
        // stable without colliding with the next top-level exercise.
        perf_order:     parentOrder * 100 + subIdx + 1,
        load_type:      sub.loadType ?? null,
        bar_kg:         sub.loadType === 'barbell' ? (sub.barKg ?? 20) : null,
        weight_kg:      sub.weight ?? null,
        // Sets are inherited: you cannot do four sets of a combo and three of
        // the exercise inside it.
        sets_planned:   ex.plannedSets ?? null,
        sets_completed: ex.completedSets ?? null,
        reps:           sub.reps ?? null,
      });
    });
  });

  return {
    client_id: clientId,
    session: {
      name:            summary.sessionName || 'Session',
      started_at:      startedAt,
      duration_secs:   summary.totalDurationSecs ?? 0,
      rest_timer_secs: summary.restTimerSecs ?? null,
      timeline:        summary.timeline ?? null,
    },
    exercises,
    children,
  };
}

/** One attempt. Resolves `{ ok, id }` or `{ ok:false, error, retryable }`. */
async function send(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  // Not signed in is RETRYABLE: the session stays queued and goes up when the
  // account comes back. Dropping it here is exactly the old bug.
  if (!session) return { ok: false, error: 'not signed in', retryable: true };

  const { data, error } = await supabase.rpc('log_workout', { p: payload });
  if (error) {
    // 22023 is the RPC's own "malformed payload", which retrying never fixes.
    const permanent = error.code === '22023';
    return { ok: false, error: error.message ?? String(error), retryable: !permanent };
  }
  return { ok: true, id: data };
}

let draining = false;

/**
 * Try everything in the outbox, oldest first.
 *
 * Guarded against overlap because launch and foreground can both fire it, and
 * two drains would double-send — harmless thanks to `client_id`, but wasteful
 * and confusing in the logs.
 */
export async function drainSyncQueue() {
  if (draining) return { sent: 0, left: await pendingCount() };
  draining = true;
  let sent = 0;
  try {
    for (const entry of await pending()) {
      if (entry.attempts >= MAX_ATTEMPTS) continue;

      let res;
      try {
        res = await send(entry.payload);
      } catch (e) {
        res = { ok: false, error: e?.message ?? String(e), retryable: true };
      }

      if (res.ok) {
        await remove(entry.clientId);
        sent += 1;
        continue;
      }

      await markAttempt(entry.clientId, res.error);
      if (!res.retryable) {
        console.warn('[syncWorkout] permanent failure, kept for inspection:', res.error);
        continue;
      }
      // A retryable failure now is a retryable failure for the rest of the
      // queue too — almost always no network or no session. Stop rather than
      // burn an attempt on every entry.
      break;
    }
  } finally {
    draining = false;
  }

  const left = await pendingCount();
  if (sent) console.log(`[syncWorkout] ✓ ${sent} session(s) synced, ${left} waiting`);
  return { sent, left };
}

/**
 * Queue a finished session and try to send it immediately.
 *
 * Persisting comes first and is awaited, so "saved" is never claimed for
 * something that is not.
 */
export async function syncWorkout(summary) {
  const startedMs = summary?.startTime instanceof Date
    ? summary.startTime.getTime()
    : new Date(summary?.startTime ?? Date.now()).getTime();

  const clientId = clientIdFor(startedMs);
  const entry = await enqueue(clientId, buildPayload(summary, clientId));
  if (!entry) {
    console.warn('[syncWorkout] could not persist session to the outbox');
    return { queued: false, sent: 0, left: await pendingCount() };
  }

  const { sent, left } = await drainSyncQueue();
  return { queued: true, sent, left };
}

export { pendingCount } from './syncQueue';
