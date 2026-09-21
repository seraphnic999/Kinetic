// GENERATED FILE — do not edit.
//
// Source of truth: shared/analytics.js
// Regenerate:      npm run sync:analytics
//
// Edits here are lost on the next sync, and `npm run check:analytics` fails
// the build if this file and the source have drifted.

/**
 * Kinetic analytics — the single source of truth for every number and chart in
 * the app and on the web dashboard.
 *
 * ⚠ THIS IS THE ORIGINAL. `src/utils/analytics.js` and `web/lib/analytics.js`
 * are generated copies (the Next.js app has its own package root and cannot
 * import across it, and Metro will not follow a symlink out of the project).
 * Edit THIS file, then run `npm run sync:analytics`. `npm run check:analytics`
 * fails if they have drifted, and runs before every export.
 *
 * Week convention: weeks run **Sunday → Saturday**, identified by the local
 * calendar date of their Sunday ('YYYY-MM-DD').
 *
 * Day convention: sessions are bucketed by their **local** calendar day, not
 * the UTC day of `started_at` — a 23:30 workout belongs to the day you trained.
 */

// ─── Shared dashboard windows ─────────────────────────────────────────────────
export const CHART_WEEKS   = 12;   // weeks of history in the weekly charts
export const CALENDAR_DAYS = 70;   // days of history in the activity grid
export const SESSION_LIMIT = 200;  // sessions fetched from Supabase
export const RECENT_LIMIT  = 20;   // sessions listed under "Recent sessions"

/** Above this many reps an e1RM formula stops predicting anything. */
export const E1RM_MAX_REPS = 12;

// ─── Day / week keys ──────────────────────────────────────────────────────────

/** Local calendar date of a Date, as 'YYYY-MM-DD' (never UTC-shifted). */
export const isoDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Parse a 'YYYY-MM-DD' key at local noon — immune to DST and TZ edges. */
export const parseDay = (key) => new Date(`${key}T12:00:00`);

/** Local calendar day of a timestamp (ISO string, ms, or Date). */
export const dayKey = (value) => isoDay(new Date(value));

/** Sunday that starts the week containing `value`, as a day key. */
export const weekKey = (value) => {
  const d = new Date(value);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = Sunday
  return isoDay(d);
};

/** Shift a day key by whole days. */
export const shiftDays = (key, delta) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
};

/** Shift a week key by whole weeks. */
export const shiftWeeks = (key, delta) => shiftDays(key, delta * 7);

/** The `count` most recent week keys, oldest first, ending with this week. */
export const lastWeekKeys = (count = 12) => {
  const current = weekKey(new Date());
  return Array.from({ length: count }, (_, i) => shiftWeeks(current, -(count - 1 - i)));
};

// ─── Formatting ───────────────────────────────────────────────────────────────

export const dayLabel = (key) =>
  parseDay(key).toLocaleDateString('en', { month: 'short', day: 'numeric' });

export const weekLabel = dayLabel;

export const weekRangeLabel = (key) => `${weekLabel(key)} – ${weekLabel(shiftDays(key, 6))}`;

export const fmtDate = (value) =>
  new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' });

/** Duration in seconds → "45m" / "2h 05m". */
export const fmtDur = (secs) => {
  const m = Math.floor((secs ?? 0) / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

/** Duration in seconds → "07:30". */
export const fmtSecs = (secs) => {
  const s = Math.max(0, Math.floor(secs ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Large kg totals → "12.3k" / "1.2M". */
export const fmtVolume = (kg) => {
  if (kg >= 1000000) return `${(kg / 1000000).toFixed(1)}M`;
  if (kg >= 1000)    return `${(kg / 1000).toFixed(1)}k`;
  return String(Math.round(kg));
};

/** Tonnage for a headline tile → "12.4 t" below a tonne, "840 kg" above. */
export const fmtTonnes = (kg) =>
  kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${Math.round(kg)} kg`;

/** Signed percentage → "+12%" / "−8%" / "—". */
export const fmtDelta = (pct) => {
  if (pct == null || !isFinite(pct)) return '—';
  const r = Math.round(pct);
  if (r === 0) return '0%';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}%`;
};

// ─── Estimated one-rep max ────────────────────────────────────────────────────

/**
 * Epley. Returns null above E1RM_MAX_REPS rather than a number that looks like
 * data: past a dozen reps the formula stops predicting anything.
 *
 * This is what replaces "heaviest weight lifted", which ranked 100kg x 1 above
 * 90kg x 10 and so answered "did you do a heavy single" rather than "are you
 * getting stronger".
 */
export const e1rm = (weightKg, reps) => {
  const w = parseFloat(weightKg), r = parseInt(reps, 10);
  if (!(w > 0) || !(r > 0) || r > E1RM_MAX_REPS) return null;
  return Math.round(w * (1 + r / 30) * 10) / 10;
};

// ─── Timeline ─────────────────────────────────────────────────────────────────

/**
 * The richest data in the app, and until now nothing read it.
 *
 * Every session stores a timestamped event list: set starts, set completions
 * with weight/reps/duration, rest periods. Three numbers fall out of it that a
 * gym app cannot otherwise know, because it would have to guess when you were
 * actually working.
 *
 *   workSecs  time under load — the sum of completed set durations
 *   restSecs  rest actually taken, not rest configured
 *   density   workSecs / session duration
 *
 * Sessions recorded before set timing existed have no `durationSecs` on their
 * set_done events; those return nulls rather than a confident zero.
 */
export function deriveTimeline(timeline, totalDurationSecs) {
  const events = Array.isArray(timeline) ? timeline : [];
  if (!events.length) return { workSecs: null, restSecs: null, density: null, restCut: null };

  let workSecs = 0, timedSets = 0;
  let restSecs = 0, restStart = null, restPeriods = 0, restCut = 0;

  for (const e of events) {
    switch (e?.action) {
      case 'set_done':
        if (typeof e.durationSecs === 'number') { workSecs += e.durationSecs; timedSets += 1; }
        break;
      case 'rest_start':
        restStart = e.t;
        break;
      case 'rest_end':
        if (restStart != null && typeof e.t === 'number') {
          restSecs += Math.max(0, e.t - restStart);
          restPeriods += 1;
          if (e.interrupted) restCut += 1;
        }
        restStart = null;
        break;
      default:
        break;
    }
  }

  const total = totalDurationSecs ?? 0;
  return {
    workSecs: timedSets ? workSecs : null,
    restSecs: restPeriods ? restSecs : null,
    density:  timedSets && total > 0 ? workSecs / total : null,
    /** Share of rest periods cut short — a real training variable, thrown away until now. */
    restCut:  restPeriods ? restCut / restPeriods : null,
  };
}

// ─── Session shaping ──────────────────────────────────────────────────────────

/** True for a combo aggregate row — its children carry the real numbers. */
const isComboParent = (e) => e.exercise_type === 'combo';

/** True for rows that contribute weight x reps tonnage. */
const isLifting = (e) => e.exercise_type === 'regular';

/**
 * Normalise the raw Supabase join into the shape every chart expects.
 *
 * `exercises` is what you display: top-level rows in performed order, combo
 * children folded under their parent rather than listed beside it.
 * `liftingRows` is what you count: every regular row INCLUDING combo children,
 * which is the whole point of the parent_id migration.
 */
export const shapeSessions = (rows) =>
  (rows ?? []).map(s => {
    const all = (s.workout_exercises ?? []).slice()
      .sort((a, b) => (a.perf_order ?? 0) - (b.perf_order ?? 0));
    const children = all.filter(e => e.parent_id);
    const top = all.filter(e => !e.parent_id);
    const byParent = new Map();
    for (const c of children) {
      if (!byParent.has(c.parent_id)) byParent.set(c.parent_id, []);
      byParent.get(c.parent_id).push(c);
    }
    return {
      ...s,
      exercise_count: top.length,
      exercises: top.map(e => ({ ...e, children: byParent.get(e.id) ?? [] })),
      liftingRows: all.filter(isLifting),
    };
  });

/** Total kg moved: weight x completed sets x reps, over every lifting row. */
export const sessionVolume = (session) =>
  (session.liftingRows ?? (session.exercises ?? []).filter(isLifting))
    .reduce((sum, e) => sum + (e.weight_kg || 0) * (e.sets_completed || 0) * (e.reps || 0), 0);

/** Completed sets and reps across every lifting row. */
export const sessionSets = (session) =>
  (session.liftingRows ?? []).reduce(
    (a, e) => ({
      sets: a.sets + (e.sets_completed || 0),
      reps: a.reps + (e.sets_completed || 0) * (e.reps || 0),
    }),
    { sets: 0, reps: 0 },
  );

/**
 * Cardio time and distance. Both derivable from columns that already existed
 * and were aggregated nowhere: distance is speed x time.
 */
export const sessionCardio = (session) => {
  let secs = 0, km = 0;
  for (const e of session.exercises ?? []) {
    if (e.exercise_type !== 'intervals') continue;
    const d = e.duration_secs || 0;
    secs += d;
    if (e.speed_kmh) km += (parseFloat(e.speed_kmh) * d) / 3600;
  }
  return { cardioSecs: secs, cardioKm: Math.round(km * 10) / 10 };
};

/** Volume per body section, for the split chart. */
export const sessionSectionVolume = (session) => {
  const out = {};
  for (const e of session.liftingRows ?? []) {
    const k = e.body_section || 'Other';
    out[k] = (out[k] ?? 0) + (e.weight_kg || 0) * (e.sets_completed || 0) * (e.reps || 0);
  }
  return out;
};

/** The best set of each exercise in a session, by e1RM. */
export const sessionBestSets = (session) => {
  const best = new Map();
  for (const e of session.liftingRows ?? []) {
    const est = e1rm(e.weight_kg, e.reps);
    if (est == null) continue;
    const prev = best.get(e.exercise_name);
    if (!prev || est > prev.e1rm) {
      best.set(e.exercise_name, {
        exercise: e.exercise_name,
        bodySection: e.body_section ?? null,
        weightKg: parseFloat(e.weight_kg),
        reps: e.reps,
        e1rm: est,
      });
    }
  }
  return [...best.values()];
};

/**
 * Everything derived about one session, computed once and reused by every
 * chart. This is the layer that did not exist: each screen recomputed its own
 * subset, and none of them counted combos.
 */
export function deriveSession(session) {
  const { cardioSecs, cardioKm } = sessionCardio(session);
  const { sets, reps } = sessionSets(session);
  return {
    id: session.id,
    name: session.name,
    startedAt: session.started_at,
    dayKey: dayKey(session.started_at),
    weekKey: weekKey(session.started_at),
    durationSecs: session.duration_secs ?? 0,
    ...deriveTimeline(session.timeline, session.duration_secs),
    volumeKg: sessionVolume(session),
    setCount: sets,
    repCount: reps,
    cardioSecs,
    cardioKm,
    sectionVolume: sessionSectionVolume(session),
    bestSets: sessionBestSets(session),
    exerciseCount: session.exercise_count ?? 0,
  };
}

export const deriveAll = (sessions) => (sessions ?? []).map(deriveSession);

/**
 * A just-finished local session -> the shape `deriveSession` consumes.
 *
 * The summary screen runs the instant training ends — before the Supabase
 * round trip has necessarily landed, and at all if the phone is offline in a
 * basement gym. So it cannot read its own numbers back from the server.
 *
 * Mapping the local summary onto the shared shape means the tonnage and the
 * time-under-load it prints are computed by the SAME code that computes the
 * dashboard's. The alternative — a second arithmetic implementation on the
 * summary screen — is exactly how the old build ended up quoting two different
 * volumes for one session.
 *
 * The row mapping mirrors utils/syncWorkout.js deliberately: if these two ever
 * disagree, the summary and the history of the same session disagree.
 */
export function sessionFromSummary(summary) {
  if (!summary) return null;
  const rows = [];

  (summary.exercises ?? []).forEach((ex, idx) => {
    const order = ex.performanceOrder ?? idx;
    const base = {
      id: ex.id, parent_id: null,
      exercise_type: ex.type, exercise_name: ex.name,
      body_section: ex.bodySection ?? null,
      status: ex.status, perf_order: order,
    };

    if (ex.type === 'regular') {
      rows.push({ ...base,
        weight_kg: ex.weight ?? null, reps: ex.reps ?? null,
        sets_planned: ex.plannedSets ?? null, sets_completed: ex.completedSets ?? null });
      return;
    }

    if (ex.type === 'combo') {
      rows.push({ ...base,
        sets_planned: ex.plannedSets ?? null, sets_completed: ex.completedSets ?? null });
      // Children are real lifting rows, which is what makes a combo count
      // toward tonnage at all — see the parent_id migration in §5.2.
      (ex.subExercises ?? []).forEach((sub, i) => rows.push({
        id: `${ex.id}:${i}`, parent_id: ex.id,
        exercise_type: 'regular', exercise_name: sub.name,
        body_section: sub.bodySection ?? null, status: ex.status,
        weight_kg: sub.weight ?? null, reps: sub.reps ?? null,
        sets_planned: ex.plannedSets ?? null, sets_completed: ex.completedSets ?? null,
        perf_order: order * 100 + i + 1,
      }));
      return;
    }

    if (ex.type === 'warmup') {
      rows.push({ ...base, duration_secs: ex.plannedDurationSecs ?? null });
      return;
    }

    if (ex.type === 'intervals') {
      const cardioType = ex.cardioType ?? 'intervals';
      rows.push(cardioType === 'intervals'
        ? { ...base, cardio_type: cardioType,
            intervals_planned: ex.plannedReps ?? null,
            intervals_done: ex.completedReps ?? null,
            interval_len_secs: ex.intervalLengthSecs ?? null }
        : { ...base, cardio_type: cardioType,
            duration_secs: ex.completedDurationSecs ?? ex.plannedDurationSecs ?? null,
            speed_kmh: ex.speedKmh ?? null,
            incline_pct: cardioType === 'treadmill' ? (ex.inclinePct ?? null) : null });
    }
  });

  return shapeSessions([{
    id:            summary.sessionId ?? 'local',
    name:          summary.sessionName ?? 'Session',
    started_at:    summary.startTime ?? new Date().toISOString(),
    duration_secs: summary.totalDurationSecs ?? 0,
    timeline:      summary.timeline ?? [],
    workout_exercises: rows,
  }])[0];
}

/**
 * Personal records set by `session`, judged against everything before it.
 *
 * A PR is a higher estimated 1RM for a named exercise than that exercise has
 * ever reached. e1RM rather than raw weight, so 100 kg x 5 correctly beats
 * 105 kg x 1 — the alternative rewards dropping reps, which is not progress.
 *
 * `history` is every OTHER derived session; the caller filters this one out by
 * id so a session cannot set a record against itself.
 */
export function computeSessionPRs(session, history) {
  const best = new Map();
  for (const h of history ?? []) {
    for (const b of h.bestSets ?? []) {
      if (b.e1rm == null) continue;
      const prev = best.get(b.exercise);
      if (!prev || b.e1rm > prev.e1rm) best.set(b.exercise, { e1rm: b.e1rm, dayKey: h.dayKey });
    }
  }

  const prs = [];
  for (const b of session?.bestSets ?? []) {
    if (b.e1rm == null) continue;
    const prev = best.get(b.exercise);
    if (!prev) {
      // First time on record counts, but it is labelled differently: there is
      // no "+2.5 since" to quote when there is nothing to compare against.
      prs.push({ ...b, gain: null, sinceDay: null, first: true });
    } else if (b.e1rm > prev.e1rm) {
      prs.push({ ...b, gain: Math.round((b.e1rm - prev.e1rm) * 10) / 10,
                 sinceDay: prev.dayKey, first: false });
    }
  }
  return prs.sort((a, b) => (b.gain ?? Infinity) - (a.gain ?? Infinity));
}


// ─── Headline tiles ───────────────────────────────────────────────────────────

const sumBy = (rows, f) => rows.reduce((a, r) => a + (f(r) || 0), 0);

/** Sessions falling inside [from, to) day keys. */
const inRange = (derived, from, to) => derived.filter(d => d.dayKey >= from && d.dayKey < to);

/** Percentage change, null when the baseline is zero (no honest percentage). */
const pctChange = (now, before) =>
  before > 0 ? ((now - before) / before) * 100 : null;

/**
 * The four headline numbers, each with a window and a comparison.
 *
 * What these replace: sessions / total time / active days / kg lifted, all
 * cumulative over the last N sessions, all monotonically increasing. A number
 * that can only go up is not information.
 */
export function computeHeadline(derived) {
  const thisWeek = weekKey(new Date());
  const lastWeek = shiftWeeks(thisWeek, -1);
  const weekEnd  = shiftDays(thisWeek, 7);

  const cur  = inRange(derived, thisWeek, weekEnd);
  const prev = inRange(derived, lastWeek, thisWeek);

  const volNow = sumBy(cur, d => d.volumeKg);
  const volPrev = sumBy(prev, d => d.volumeKg);

  const workNow  = sumBy(cur.filter(d => d.workSecs != null), d => d.workSecs);
  const totalNow = sumBy(cur.filter(d => d.workSecs != null), d => d.durationSecs);

  return {
    sessions:      { value: cur.length, delta: cur.length - prev.length, window: 'this week' },
    volumeKg:      { value: volNow, deltaPct: pctChange(volNow, volPrev), window: 'this week' },
    underLoad:     { workSecs: workNow || null, totalSecs: totalNow || null,
                     density: totalNow > 0 ? workNow / totalNow : null },
    streak:        computeStreak(derived),
  };
}

/**
 * Consecutive weeks with at least one session, and the best such run.
 *
 * Weeks, not days, deliberately: a daily streak punishes rest days, which is
 * exactly backwards for lifting, and is the most common way a fitness app makes
 * you feel bad for training correctly.
 */
export function computeStreak(derived) {
  const weeks = new Set(derived.map(d => d.weekKey));
  if (!weeks.size) return { current: 0, best: 0 };

  // Current run ends this week, or last week if this one has not started yet.
  const thisWeek = weekKey(new Date());
  let cursor = weeks.has(thisWeek) ? thisWeek : shiftWeeks(thisWeek, -1);
  let current = 0;
  while (weeks.has(cursor)) { current += 1; cursor = shiftWeeks(cursor, -1); }

  const sorted = [...weeks].sort();
  let best = 0, run = 0, prev = null;
  for (const w of sorted) {
    run = (prev && shiftWeeks(prev, 1) === w) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best: Math.max(best, current) };
}

// ─── Charts ───────────────────────────────────────────────────────────────────

/** Weekly frequency and tonnage, plus a rolling average over the tonnage. */
export function computeCharts(derived, weeks = CHART_WEEKS) {
  const keys = lastWeekKeys(weeks);
  const freq = Object.fromEntries(keys.map(k => [k, 0]));
  const vol  = Object.fromEntries(keys.map(k => [k, 0]));

  for (const d of derived) {
    if (freq[d.weekKey] === undefined) continue;
    freq[d.weekKey] += 1;
    vol[d.weekKey] += d.volumeKg;
  }

  const volumeData = keys.map(k => ({ key: k, label: weekLabel(k), value: Math.round(vol[k]) }));

  // Weekly tonnage is noisy; the 4-week average is the signal.
  const rolling = volumeData.map((_, i) => {
    const slice = volumeData.slice(Math.max(0, i - 3), i + 1);
    return {
      key: volumeData[i].key,
      label: volumeData[i].label,
      value: Math.round(slice.reduce((a, d) => a + d.value, 0) / slice.length),
    };
  });

  const names = new Set();
  for (const d of derived) for (const b of d.bestSets) names.add(b.exercise);

  return {
    freqData: keys.map(k => ({ key: k, label: weekLabel(k), value: freq[k] })),
    volumeData,
    volumeAvgData: rolling,
    exerciseNames: [...names].sort(),
  };
}

/** e1RM per day for one exercise, with the raw best set alongside. */
export function computeProgression(derived, exerciseName) {
  if (!exerciseName) return [];
  const byDay = new Map();
  for (const d of derived) {
    for (const b of d.bestSets) {
      if (b.exercise !== exerciseName) continue;
      const prev = byDay.get(d.dayKey);
      if (!prev || b.e1rm > prev.value) {
        byDay.set(d.dayKey, {
          key: d.dayKey, label: dayLabel(d.dayKey),
          value: b.e1rm, raw: b.weightKg, reps: b.reps,
        });
      }
    }
  }
  return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Personal records: the first time each exercise reached its current best
 * e1RM, newest first, with the previous best for context.
 */
export function computeRecords(derived, limit = 5) {
  const ordered = [...derived].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const best = new Map();   // exercise -> { e1rm, dayKey }
  const records = [];

  for (const d of ordered) {
    for (const b of d.bestSets) {
      const prev = best.get(b.exercise);
      if (!prev || b.e1rm > prev.e1rm) {
        if (prev) {
          records.push({
            exercise: b.exercise, bodySection: b.bodySection,
            e1rm: b.e1rm, weightKg: b.weightKg, reps: b.reps,
            dayKey: d.dayKey, gain: Math.round((b.e1rm - prev.e1rm) * 10) / 10,
            sinceDayKey: prev.dayKey,
          });
        } else {
          records.push({
            exercise: b.exercise, bodySection: b.bodySection,
            e1rm: b.e1rm, weightKg: b.weightKg, reps: b.reps,
            dayKey: d.dayKey, gain: null, sinceDayKey: null,
          });
        }
        best.set(b.exercise, { e1rm: b.e1rm, dayKey: d.dayKey });
      }
    }
  }
  return records.reverse().slice(0, limit);
}

/** Volume share per body section over the last `days`, largest first. */
export function computeBodySplit(derived, days = 28) {
  const from = shiftDays(isoDay(new Date()), -days + 1);
  const totals = {};
  for (const d of derived) {
    if (d.dayKey < from) continue;
    for (const [k, v] of Object.entries(d.sectionVolume)) totals[k] = (totals[k] ?? 0) + v;
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  return Object.entries(totals)
    .map(([section, volumeKg]) => ({
      section, volumeKg,
      pct: sum > 0 ? Math.round((volumeKg / sum) * 100) : 0,
    }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

/** Lifting time versus cardio time over the last `days`. */
export function computeLiftVsCardio(derived, days = 28) {
  const from = shiftDays(isoDay(new Date()), -days + 1);
  const rows = derived.filter(d => d.dayKey >= from);
  const cardio = sumBy(rows, d => d.cardioSecs);
  const lift = Math.max(0, sumBy(rows, d => d.durationSecs) - cardio);
  const total = lift + cardio;
  return {
    liftSecs: lift, cardioSecs: cardio,
    cardioKm: Math.round(sumBy(rows, d => d.cardioKm) * 10) / 10,
    liftPct: total > 0 ? Math.round((lift / total) * 100) : 0,
  };
}

/** Sessions grouped into Sunday→Saturday weeks, newest first, with totals. */
export function groupByWeek(derived) {
  const groups = new Map();
  for (const d of [...derived].sort((a, b) => b.dayKey.localeCompare(a.dayKey))) {
    if (!groups.has(d.weekKey)) groups.set(d.weekKey, []);
    groups.get(d.weekKey).push(d);
  }
  return [...groups.entries()].map(([key, sessions]) => ({
    key,
    label: weekRangeLabel(key),
    sessions,
    volumeKg: sumBy(sessions, s => s.volumeKg),
    count: sessions.length,
  }));
}

/** Everything the Exercise Detail screen shows about one exercise. */
export function computeExerciseDetail(derived, exerciseName) {
  const history = [];
  let bestSet = null;

  for (const d of [...derived].sort((a, b) => b.dayKey.localeCompare(a.dayKey))) {
    const rows = (d.bestSets ?? []).filter(b => b.exercise === exerciseName);
    if (!rows.length) continue;
    const top = rows.reduce((a, b) => (b.e1rm > a.e1rm ? b : a));
    history.push({ dayKey: d.dayKey, label: dayLabel(d.dayKey), ...top });
    if (!bestSet || top.e1rm > bestSet.e1rm) bestSet = { ...top, dayKey: d.dayKey };
  }

  const from30 = shiftDays(isoDay(new Date()), -29);
  const volume30 = derived
    .filter(d => d.dayKey >= from30)
    .reduce((sum, d) => sum + (d.sectionVolume ? 0 : 0) + 0, 0);

  const progression = computeProgression(derived, exerciseName);
  const first = progression[0]?.value ?? null;
  const last = progression[progression.length - 1]?.value ?? null;

  return {
    exercise: exerciseName,
    bestSet,
    last: history[0] ?? null,
    sessions: history.length,
    progression,
    e1rmNow: last,
    e1rmGain: first != null && last != null ? Math.round((last - first) * 10) / 10 : null,
    history,
    volume30,
  };
}

// ─── Body metrics ─────────────────────────────────────────────────────────────

/**
 * Body metrics are logged per day; the dashboard averages every entry inside
 * each Sunday→Saturday week. Weeks with no entry for a field are dropped.
 */
export function computeMetricCharts(rows, weeks = CHART_WEEKS) {
  const keys = lastWeekKeys(weeks);
  const fields = ['weight_kg', 'waist_cm', 'diet_pct'];
  const sums = {}, counts = {};
  for (const f of fields) {
    sums[f]   = Object.fromEntries(keys.map(k => [k, 0]));
    counts[f] = Object.fromEntries(keys.map(k => [k, 0]));
  }

  for (const r of rows ?? []) {
    const wk = weekKey(parseDay(r.week_date));
    if (counts.weight_kg[wk] === undefined) continue;
    for (const f of fields) {
      if (r[f] != null) { sums[f][wk] += parseFloat(r[f]); counts[f][wk] += 1; }
    }
  }

  const build = f => keys.filter(k => counts[f][k] > 0)
    .map(k => ({ key: k, label: weekLabel(k), value: Math.round((sums[f][k] / counts[f][k]) * 10) / 10 }));

  return { weightData: build('weight_kg'), waistData: build('waist_cm'), dietData: build('diet_pct') };
}

/**
 * The compact body strip on the Stats tab: latest value plus the change over
 * `days`, so the dashboard states one window instead of quietly using a
 * different one from the Body tab.
 */
export function computeBodyStrip(rows, days = 30) {
  const sorted = [...(rows ?? [])].sort((a, b) => a.week_date.localeCompare(b.week_date));
  const from = shiftDays(isoDay(new Date()), -days + 1);

  const field = (f, decimals = 1) => {
    const withValue = sorted.filter(r => r[f] != null);
    if (!withValue.length) return null;
    const latest = withValue[withValue.length - 1];
    const baseline = withValue.find(r => r.week_date >= from) ?? withValue[0];
    const round = v => Math.round(parseFloat(v) * 10 ** decimals) / 10 ** decimals;
    const delta = round(latest[f] - baseline[f]);
    return {
      value: round(latest[f]),
      date: latest.week_date,
      delta: baseline === latest ? null : delta,
      days,
    };
  };

  // Diet is an adherence percentage, so a 7-day average says more than the
  // last value — one bad day should not read as a trend.
  const recentDiet = sorted.filter(r => r.diet_pct != null && r.week_date >= shiftDays(isoDay(new Date()), -6));
  const dietAvg = recentDiet.length
    ? Math.round(recentDiet.reduce((a, r) => a + r.diet_pct, 0) / recentDiet.length)
    : null;

  return {
    weight: field('weight_kg'),
    waist: field('waist_cm'),
    diet: dietAvg == null ? null : { value: dietAvg, days: 7 },
  };
}

// ─── Activity calendar ────────────────────────────────────────────────────────

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Rows of 7 days for the activity grid. Every row is a full Sunday→Saturday
 * week. Days carry their volume so the grid can encode intensity rather than
 * mere presence.
 */
export function buildCalendar(derived, days = CALENDAR_DAYS) {
  const byDay = new Map();
  for (const d of derived ?? []) {
    byDay.set(d.dayKey, (byDay.get(d.dayKey) ?? 0) + d.volumeKg);
  }
  const volumes = [...byDay.values()].filter(v => v > 0).sort((a, b) => a - b);
  const p = q => volumes.length ? volumes[Math.floor((volumes.length - 1) * q)] : 0;
  const t1 = p(0.33), t2 = p(0.66);

  const today = new Date(); today.setHours(12, 0, 0, 0);
  const todayKey = isoDay(today);
  const firstShown = new Date(today); firstShown.setDate(firstShown.getDate() - days + 1);
  const firstDay = weekKey(firstShown);
  const lastDay = shiftDays(weekKey(today), 6);

  const weeks = [];
  let row = [];
  for (let key = firstDay; ; key = shiftDays(key, 1)) {
    const vol = byDay.get(key) ?? 0;
    row.push({
      key, date: parseDay(key), active: vol > 0, volumeKg: vol,
      // 0 = none, 1..3 = light/medium/heavy for that person's own history
      level: vol === 0 ? 0 : vol <= t1 ? 1 : vol <= t2 ? 2 : 3,
      future: key > todayKey,
    });
    if (row.length === 7) { weeks.push(row); row = []; }
    if (key === lastDay) break;
  }
  return weeks;
}

// ─── Exercise detail lines ────────────────────────────────────────────────────

/** One-line summary of a stored exercise row, shared by both session lists. */
export function exerciseDetail(e) {
  if (e.exercise_type === 'regular' && e.weight_kg != null)
    return `${e.weight_kg}kg × ${e.sets_completed ?? e.sets_planned ?? '?'}×${e.reps ?? '?'}`;
  if (e.exercise_type === 'warmup' && e.duration_secs)
    return fmtSecs(e.duration_secs);
  if (e.exercise_type === 'intervals') {
    const cardioType = e.cardio_type ?? 'intervals';
    if (cardioType === 'treadmill')
      return `${e.speed_kmh ?? '?'}km/h · ${e.incline_pct ?? 0}% · ${fmtSecs(e.duration_secs ?? 0)}`;
    if (cardioType === 'stairs')
      return `${e.speed_kmh ?? '?'}km/h · ${fmtSecs(e.duration_secs ?? 0)}`;
    return `${e.intervals_done ?? '?'}/${e.intervals_planned ?? '?'} reps`;
  }
  if (e.exercise_type === 'combo' && e.sets_completed != null)
    return `${e.sets_completed}/${e.sets_planned ?? '?'} sets`;
  return '';
}

/**
 * One-line summary of an exercise inside a saved *training session template*
 * (the phone's local shape, camelCased — not a synced `workout_exercises` row,
 * which `exerciseDetail` above handles).
 */
export function templateExerciseLabel(ex) {
  if (ex.type === 'warmup')
    return `Warmup — ${ex.warmupType} • ${fmtSecs(ex.duration ?? 180)}`;

  if (ex.type === 'intervals') {
    const cardioType = ex.cardioType ?? 'intervals';
    if (cardioType === 'treadmill')
      return `Treadmill — ${ex.speedKmh ?? 6}km/h • ${ex.inclinePct ?? 0}% incline • ${fmtSecs(ex.lengthSecs ?? 600)}`;
    if (cardioType === 'stairs')
      return `Stairs — ${ex.speedKmh ?? 6}km/h • ${fmtSecs(ex.lengthSecs ?? 600)}`;
    return `Intervals — ${ex.reps} reps • ${ex.intervalLength}s run / ${ex.walkDuration ?? 60}s walk`;
  }

  if (ex.type === 'combo') {
    const parts = [...new Set(
      (ex.subExercises ?? [])
        .map(s => (s.bodySection === 'Other' ? (s.customBodySection || 'Other') : s.bodySection))
        .filter(Boolean),
    )].join(' / ');
    return parts ? `${parts} — ${ex.sets} sets` : `Combo — ${ex.sets} sets`;
  }

  const section = ex.bodySection === 'Other'
    ? (ex.customBodySection || 'Other')
    : (ex.bodySection || '');
  const name = (ex.name === 'Other' || ex.bodySection === 'Other')
    ? (ex.customName || 'Unnamed')
    : (ex.name || 'Unnamed');
  const details = `${ex.weight}kg • ${ex.sets}×${ex.reps}`;
  return section ? `${section} — ${name} — ${details}` : `${name} — ${details}`;
}

// ─── Legacy names ─────────────────────────────────────────────────────────────
// The old dashboards called these; kept so nothing breaks mid-migration.

/** @deprecated use computeHeadline */
export function computeStats(sessions) {
  const derived = deriveAll(sessions);
  return {
    count: derived.length,
    totalSecs: sumBy(derived, d => d.durationSecs),
    activeDays: new Set(derived.map(d => d.dayKey)).size,
    totalVolume: sumBy(derived, d => d.volumeKg),
  };
}
