/**
 * Dashboard analytics — the single source of truth for every number and chart
 * shown on a Kinetic dashboard.
 *
 * ⚠ MIRRORED FILE: `web/lib/analytics.js` is a byte-for-byte copy of this
 * module (the Next.js app has its own package root and cannot import across
 * it). Any change here must be applied there too, or the phone and the web
 * dashboard will drift apart again.
 *
 * Week convention: weeks run **Sunday → Saturday**, and a week is identified by
 * the local calendar date of its Sunday ('YYYY-MM-DD').
 *
 * Day convention: sessions are bucketed by their **local** calendar day, not
 * the UTC day of `started_at` — a 23:30 workout belongs to the day you trained,
 * not to tomorrow.
 */

// ─── Shared dashboard windows ─────────────────────────────────────────────────
// Both dashboards render the same spans, so the two never disagree on "recent".
export const CHART_WEEKS   = 12;   // weeks of history in the weekly charts
export const CALENDAR_DAYS = 70;   // days of history in the activity grid
export const SESSION_LIMIT = 100;  // sessions fetched from Supabase
export const RECENT_LIMIT  = 20;   // sessions listed under "Recent sessions"

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

/** "Jun 2" — short label for a day key. */
export const dayLabel = (key) =>
  parseDay(key).toLocaleDateString('en', { month: 'short', day: 'numeric' });

/** A week's label is the date of its Sunday. */
export const weekLabel = dayLabel;

/** "Jun 2 – Jun 8" — the full Sunday→Saturday span. */
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

// ─── Session shaping ──────────────────────────────────────────────────────────

/**
 * Normalise the raw Supabase join into the shape every chart below expects:
 * exercises flattened onto the session and ordered as they were performed.
 */
export const shapeSessions = (rows) =>
  (rows ?? []).map(s => ({
    ...s,
    exercise_count: s.workout_exercises?.length ?? 0,
    exercises: (s.workout_exercises ?? [])
      .slice()
      .sort((a, b) => (a.perf_order ?? 0) - (b.perf_order ?? 0)),
  }));

/** Total kg moved in one session: weight × completed sets × reps. */
export const sessionVolume = (session) =>
  (session.exercises ?? []).reduce((sum, e) => (
    e.exercise_type === 'regular'
      ? sum + (e.weight_kg || 0) * (e.sets_completed || 0) * (e.reps || 0)
      : sum
  ), 0);

export function computeStats(sessions) {
  return {
    count:      sessions.length,
    totalSecs:  sessions.reduce((sum, s) => sum + (s.duration_secs ?? 0), 0),
    activeDays: new Set(sessions.map(s => dayKey(s.started_at))).size,
    totalVolume: sessions.reduce((sum, s) => sum + sessionVolume(s), 0),
  };
}

// ─── Charts ───────────────────────────────────────────────────────────────────

/**
 * Weekly training frequency and total lifted volume over the last `weeks`
 * Sunday→Saturday weeks, plus the list of regular exercises seen in the data.
 * Every series is a `{ key, label, value }[]` with one entry per week.
 */
export function computeCharts(sessions, weeks = 12) {
  const weekKeys = lastWeekKeys(weeks);
  const freq   = Object.fromEntries(weekKeys.map(k => [k, 0]));
  const volume = Object.fromEntries(weekKeys.map(k => [k, 0]));

  sessions.forEach(s => {
    const wk = weekKey(s.started_at);
    if (freq[wk] === undefined) return;
    freq[wk] += 1;
    volume[wk] += sessionVolume(s);
  });

  const names = new Set();
  sessions.forEach(s => (s.exercises ?? []).forEach(e => {
    if (e.exercise_type === 'regular' && e.exercise_name) names.add(e.exercise_name);
  }));

  return {
    freqData:   weekKeys.map(k => ({ key: k, label: weekLabel(k), value: freq[k] })),
    volumeData: weekKeys.map(k => ({ key: k, label: weekLabel(k), value: Math.round(volume[k]) })),
    exerciseNames: [...names].sort(),
  };
}

/** Heaviest weight lifted per day for one exercise, oldest first. */
export function computeProgression(sessions, exerciseName) {
  if (!exerciseName) return [];
  const byDay = {};
  sessions.forEach(s => {
    const day = dayKey(s.started_at);
    (s.exercises ?? []).forEach(e => {
      if (e.exercise_name !== exerciseName || e.exercise_type !== 'regular' || !e.weight_kg) return;
      byDay[day] = Math.max(byDay[day] ?? 0, parseFloat(e.weight_kg));
    });
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ key: day, label: dayLabel(day), value }));
}

/**
 * Body metrics are logged per day, so the dashboard shows the average of every
 * entry that falls inside each Sunday→Saturday week. Weeks with no entry for a
 * field are dropped from that field's series.
 */
export function computeMetricCharts(rows, weeks = 12) {
  const weekKeys = lastWeekKeys(weeks);
  const fields = ['weight_kg', 'waist_cm', 'diet_pct'];
  const sums = {}, counts = {};
  fields.forEach(f => {
    sums[f]   = Object.fromEntries(weekKeys.map(k => [k, 0]));
    counts[f] = Object.fromEntries(weekKeys.map(k => [k, 0]));
  });

  (rows ?? []).forEach(r => {
    const wk = weekKey(parseDay(r.week_date));
    if (counts.weight_kg[wk] === undefined) return;
    fields.forEach(f => {
      if (r[f] != null) { sums[f][wk] += parseFloat(r[f]); counts[f][wk] += 1; }
    });
  });

  const build = f => weekKeys
    .filter(k => counts[f][k] > 0)
    .map(k => ({ key: k, label: weekLabel(k), value: Math.round((sums[f][k] / counts[f][k]) * 10) / 10 }));

  return { weightData: build('weight_kg'), waistData: build('waist_cm'), dietData: build('diet_pct') };
}

// ─── Activity calendar ────────────────────────────────────────────────────────

export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Rows of 7 days for the activity grid. Every row is a full Sunday→Saturday
 * week: the range is padded back to the Sunday on or before `days` ago and
 * forward to the Saturday that closes the current week, so no row is ragged.
 * Days after today are flagged `future` for the caller to dim.
 */
export function buildCalendar(sessions, days = 70) {
  const activeDays = new Set((sessions ?? []).map(s => dayKey(s.started_at)));

  const today = new Date(); today.setHours(12, 0, 0, 0);
  const todayKey = isoDay(today);

  const firstShown = new Date(today); firstShown.setDate(firstShown.getDate() - days + 1);
  const firstDay = weekKey(firstShown);                  // Sunday of the first week
  const lastDay  = shiftDays(weekKey(today), 6);         // Saturday of the current week

  const weeks = [];
  let row = [];
  for (let key = firstDay; ; key = shiftDays(key, 1)) {
    row.push({ key, date: parseDay(key), active: activeDays.has(key), future: key > todayKey });
    if (row.length === 7) { weeks.push(row); row = []; }
    if (key === lastDay) break;
  }
  return weeks;
}

// ─── Exercise detail line ─────────────────────────────────────────────────────

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

// ─── Session-template exercise line ───────────────────────────────────────────

/**
 * One-line summary of an exercise inside a saved *training session template*
 * (the phone's local session shape, camelCased — not a synced `workout_exercises`
 * row, which `exerciseDetail` above handles). Shared by the phone's session
 * editor and the web dashboard's session list so both read a template the same
 * way.
 */
export function templateExerciseLabel(ex) {
  if (ex.type === 'warmup')
    return `🔥 Warmup — ${ex.warmupType} • ${fmtSecs(ex.duration ?? 180)}`;

  if (ex.type === 'intervals') {
    const cardioType = ex.cardioType ?? 'intervals';
    if (cardioType === 'treadmill')
      return `🏃 Treadmill — ${ex.speedKmh ?? 6}km/h • ${ex.inclinePct ?? 0}% incline • ${fmtSecs(ex.lengthSecs ?? 600)}`;
    if (cardioType === 'stairs')
      return `🪜 Stairs — ${ex.speedKmh ?? 6}km/h • ${fmtSecs(ex.lengthSecs ?? 600)}`;
    return `⚡ Intervals — ${ex.reps} reps • ${ex.intervalLength}s run / ${ex.walkDuration ?? 60}s walk`;
  }

  if (ex.type === 'combo') {
    const parts = [...new Set(
      (ex.subExercises ?? [])
        .map(s => (s.bodySection === 'Other' ? (s.customBodySection || 'Other') : s.bodySection))
        .filter(Boolean)
    )].join(' / ');
    return parts ? `🔗 ${parts} — ${ex.sets} sets` : `🔗 Combo — ${ex.sets} sets`;
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
