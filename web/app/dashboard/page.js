'use client';
export const dynamic = 'force-dynamic';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import {
  fmtDate, fmtDur, fmtSecs, fmtVolume, fmtTonnes, fmtDelta, isoDay, deriveAll,
  shapeSessions, computeHeadline, computeCharts, computeProgression, computeMetricCharts,
  buildCalendar, exerciseDetail, templateExerciseLabel, WEEKDAY_LABELS,
  CALENDAR_DAYS, CHART_WEEKS, SESSION_LIMIT, RECENT_LIMIT,
} from '../../lib/analytics';

// ─── Palette — the exact values from the mobile app's src/theme.js ───────────
const C = {
  ember:   '#FF6B2B',   // LIVE
  ice:     '#4FC3F7',   // WAITING
  gold:    '#FFC93C',   // BANKED
  warn:    '#FFA726',
  danger:  '#FF5252',
  surface: '#17171A',
  raised:  '#202024',
  line:    '#34343C',   // NOT equal to raised — that was the old bug
  ink:     '#F2F2F4',
  muted:   '#9A9AA4',
  faint:   '#63636D',
};

// ─── Chart card — the web twin of the mobile ChartCard ───────────────────────
function ChartCard({ title, subtitle, children, empty }) {
  return (
    <div className="bg-surface border border-line rounded-lg p-5">
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="label text-faint flex-1">{title}</h3>
        {subtitle && <span className="text-xs text-faint">{subtitle}</span>}
      </div>
      {empty
        ? <p className="text-sm text-faint text-center py-8">No data yet</p>
        : children}
    </div>
  );
}

// ─── Weekly bar chart — peak week solid, the rest dimmed (as on mobile) ──────
function WeeklyBars({ data, color, unit = '' }) {
  const max = Math.max(...data.map(d => d.value), 0);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} width={30}
          allowDecimals={false} tickFormatter={v => (v > 999 ? `${(v / 1000).toFixed(0)}k` : v)} />
        <Tooltip content={<ChartTooltip unit={unit} color={color} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value === max && d.value > 0 ? color : `${color}55`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Trend line — used for progression and every body metric ────────────────
function TrendLine({ data, color, unit, domain = ['auto', 'auto'] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
        <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: C.faint, fontSize: 10 }} axisLine={false} tickLine={false} width={44}
          tickFormatter={v => `${v}${unit}`} domain={domain} />
        <Tooltip content={<ChartTooltip unit={unit} color={color} />} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2}
          dot={{ fill: color, r: 4, strokeWidth: 2, stroke: '#0D0D0D' }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartTooltip({ active, payload, label, unit = '', color }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  return (
    <div className="bg-raised border border-line rounded-lg px-3 py-2 text-sm">
      <p className="text-muted mb-1">{label}</p>
      <p className="font-bold" style={{ color }}>
        {v > 999 ? `${(v / 1000).toFixed(1)}k${unit}` : `${v}${unit}`}
      </p>
    </div>
  );
}

// ─── Headline tile ───────────────────────────────────────────────────────────
// The §5.5 shape: a value, what it is, and what it is compared to. The old
// cards showed all-time totals — "312 sessions" is a fact about the past that
// never changes and tells you nothing about this week.
function Tile({ label, value, unit, sub, tone }) {
  return (
    <div className="bg-surface border border-line rounded-lg p-5 flex flex-col gap-1">
      <span className="label text-faint">{label}</span>
      <span className="font-display text-4xl leading-none tabular text-ink">
        {value}
        {unit ? <span className="text-lg text-muted font-sans ml-1">{unit}</span> : null}
      </span>
      {sub ? (
        <span className="text-xs tabular"
              style={{ color: tone === 'up' ? C.gold : tone === 'down' ? C.warn : C.faint }}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

// ─── Activity calendar ───────────────────────────────────────────────────────
// Same grid as the phone: one row per Sunday → Saturday week, labelled with the
// week's Sunday, days after today dimmed.
//
// Day cells are a fixed size, never `flex-1`: stretched across this page's
// content column a square cell is ~145px, which made ten weeks of history taller
// than the viewport. The grid is left-aligned at its natural width instead.
function ActivityCalendar({ sessions }) {
  const weeks = buildCalendar(sessions, CALENDAR_DAYS);
  const cell = 'w-6 h-6 sm:w-7 sm:h-7 shrink-0';
  return (
    <div className="bg-surface border border-line rounded-lg p-5">
      <h3 className="label text-faint mb-4">Activity — last 10 weeks</h3>
      <div className="overflow-x-auto">
        <div className="inline-block">
          <div className="flex gap-1 mb-1.5 text-[10px] text-faint">
            <span className="w-14 shrink-0" />
            {WEEKDAY_LABELS.map((l, i) => (
              <span key={i} className={`${cell} text-center`}>{l}</span>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex items-center gap-1">
                <span className="w-14 shrink-0 text-[10px] text-faint">
                  {week[0].date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
                {week.map(day => (
                  <div key={day.key} title={`${day.key}${day.active ? ' — workout' : ''}`}
                    className={`${cell} rounded-sm ${day.active ? 'bg-ember' : 'bg-raised'} ${day.future ? 'opacity-20' : ''}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 text-xs text-faint items-center">
        <div className="w-3 h-3 rounded-sm bg-raised" /> No workout
        <div className="w-3 h-3 rounded-sm bg-ember ml-2" /> Workout
      </div>
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────
const ACTION_LABEL = {
  session_start:      'Session started',
  warmup_start:       'Warmup started',
  warmup_end:         'Warmup complete',
  rest_start:         'Rest started',
  rest_end:           'Rest over',
  set_start:          'Set started',
  set_done:           'Set done',
  interval_phase:     'Phase change',
  intervals_done:     'Intervals complete',
  cardio_length_start:'Cardio started',
  cardio_length_end:  'Cardio complete',
  session_end:        'Session ended',
};

/** Which channel an event belongs to, so the timeline reads without icons. */
const ACTION_TONE = {
  set_done:      C.ember,
  set_start:     C.ember,
  rest_start:    C.ice,
  rest_end:      C.ice,
  session_end:   C.gold,
  warmup_end:    C.gold,
  intervals_done:C.gold,
  cardio_length_end: C.gold,
};

function SessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab]   = useState('exercises');
  const statusColor = { complete: C.gold, partial: C.warn, pending: C.faint };
  const timeline = session.timeline ?? [];

  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-raised transition text-left">
        <div>
          <p className="font-display font-semibold text-lg">{session.name}</p>
          <p className="text-muted text-sm mt-0.5">
            {fmtDate(session.started_at)} · {fmtDur(session.duration_secs)}
            {session.exercise_count > 0 && ` · ${session.exercise_count} exercise${session.exercise_count > 1 ? 's' : ''}`}
          </p>
        </div>
        <svg className={`w-5 h-5 text-faint transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-line">
          <div className="flex gap-2 mt-3 mb-4">
            <button onClick={() => setTab('exercises')}
              className={`px-3 py-1 rounded-full text-sm transition ${tab === 'exercises' ? 'bg-ember text-bg font-semibold' : 'bg-raised text-muted'}`}>
              Exercises
            </button>
            {timeline.length > 0 && (
              <button onClick={() => setTab('timeline')}
                className={`px-3 py-1 rounded-full text-sm transition ${tab === 'timeline' ? 'bg-ember text-bg font-semibold' : 'bg-raised text-muted'}`}>
                Timeline ({timeline.length})
              </button>
            )}
          </div>

          {tab === 'exercises' && (
            <div className="space-y-2">
              {(session.exercises ?? []).map((e, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: statusColor[e.status] ?? C.faint }} />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{e.exercise_name}</span>
                    {e.body_section && <span className="ml-2 text-xs" style={{ color: C.warn }}>{e.body_section}</span>}
                  </div>
                  <span className="text-muted text-sm">{exerciseDetail(e)}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'timeline' && (
            <div className="space-y-1">
              {timeline.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5 border-b border-line last:border-0">
                  <span className="text-xs font-mono text-faint w-12 flex-shrink-0 mt-0.5">{fmtSecs(ev.t ?? 0)}</span>
                  <div className="flex-1">
                    <span className="text-sm"
                          style={{ color: ACTION_TONE[ev.action] ?? C.muted }}>
                      {ACTION_LABEL[ev.action] ?? ev.action}
                    </span>
                    {ev.action === 'set_done' && (
                      <span className="ml-2 text-sm font-medium text-ink">
                        {ev.exerciseName}
                        {ev.bodySection ? ` (${ev.bodySection})` : ''}
                        {ev.weight ? ` — ${ev.weight}kg × ${ev.reps} reps` : ''}
                        {` · set #${ev.setNumber}, ${ev.setsLeft} left`}
                        {ev.durationSecs != null ? ` · ${fmtSecs(ev.durationSecs)}` : ''}
                      </span>
                    )}
                    {ev.action === 'interval_phase' && (
                      <span className="ml-2 text-sm" style={{ color: C.warn }}>
                        → {ev.phase} (rep {ev.repsDone}/{(ev.repsDone ?? 0) + (ev.repsLeft ?? 0)})
                      </span>
                    )}
                    {ev.action === 'warmup_start' && ev.exerciseName && (
                      <span className="ml-2 text-sm text-ink">{ev.exerciseName} · {fmtSecs(ev.durationSecs ?? 0)}</span>
                    )}
                    {ev.action === 'rest_start' && ev.durationSecs && (
                      <span className="ml-2 text-sm text-muted">{fmtSecs(ev.durationSecs)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Training session (template) row ─────────────────────────────────────────
// A saved session the phone can run, not a workout that happened. Read-only
// here — sessions are created and edited in the app.
function TrainingSessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const exercises = session.exercises ?? [];

  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-raised transition text-left">
        <div>
          <p className="font-display font-semibold text-lg">{session.name}</p>
          <p className="text-muted text-sm mt-0.5">
            {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
            {' · '}{fmtSecs(session.rest_timer_secs ?? 60)} rest
            {session.created_at && ` · added ${fmtDate(session.created_at)}`}
          </p>
        </div>
        <svg className={`w-5 h-5 text-faint transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-3 border-t border-line space-y-2">
          {exercises.length === 0
            ? <p className="text-sm text-faint">No exercises in this session yet.</p>
            : exercises.map((ex, i) => (
                <div key={ex.id ?? i} className="flex items-start gap-3">
                  <span className="text-xs text-faint w-5 shrink-0 mt-0.5">{i + 1}.</span>
                  <span className="text-sm flex-1">{templateExerciseLabel(ex)}</span>
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

// ─── Body metrics log form ───────────────────────────────────────────────────
// Entries are per-day (matching the phone's Body Metrics screen); the charts
// above average them into Sunday → Saturday weeks.
function MetricsForm({ metrics, onSaved }) {
  const [day,     setDay]     = useState(() => isoDay(new Date()));
  const [weight,  setWeight]  = useState('');
  const [waist,   setWaist]   = useState('');
  const [diet,    setDiet]    = useState('');
  const [saving,  setSaving]  = useState(false);

  // Pre-fill from whatever is already logged for the chosen day
  useEffect(() => {
    const cur = metrics.find(m => m.week_date === day);
    setWeight(cur?.weight_kg != null ? String(cur.weight_kg) : '');
    setWaist( cur?.waist_cm  != null ? String(cur.waist_cm)  : '');
    setDiet(  cur?.diet_pct  != null ? String(cur.diet_pct)  : '');
  }, [metrics, day]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth) { setSaving(false); return; }
    const w = parseFloat(weight), c = parseFloat(waist), d = parseInt(diet, 10);
    await supabase.from('body_metrics').upsert({
      user_id: auth.user.id,
      week_date: day,
      ...(!isNaN(w) && { weight_kg: Math.round(w * 10) / 10 }),
      ...(!isNaN(c) && { waist_cm:  Math.round(c * 10) / 10 }),
      ...(!isNaN(d) && d >= 0 && d <= 100 && { diet_pct: d }),
    }, { onConflict: 'user_id,week_date' });
    await onSaved();
    setSaving(false);
  };

  const field = (label, value, setValue, unit, props) => (
    <div>
      <label className="block text-xs text-muted mb-1 uppercase tracking-wider">{label}</label>
      <div className="flex items-center bg-raised rounded-lg px-3 h-11">
        <input type="number" value={value} onChange={e => setValue(e.target.value)} {...props}
          className="flex-1 bg-transparent text-ink outline-none text-sm w-full" />
        <span className="text-faint text-sm ml-2">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-surface border border-line rounded-lg p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xs uppercase tracking-wider text-muted">Log body metrics</h3>
        <input type="date" value={day} max={isoDay(new Date())} onChange={e => e.target.value && setDay(e.target.value)}
          className="bg-raised rounded-lg px-3 h-9 text-sm text-ink outline-none" />
      </div>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {field('Weight', weight, setWeight, 'kg', { step: '0.1', placeholder: '82.5' })}
          {field('Waist',  waist,  setWaist,  'cm', { step: '0.5', placeholder: '91' })}
          {field('Diet adherence', diet, setDiet, '%', { min: '0', max: '100', step: '5', placeholder: '80' })}
        </div>
        <button type="submit" disabled={saving}
          className="px-6 h-10 bg-ember text-bg font-semibold rounded-full hover:opacity-90 transition disabled:opacity-50 text-sm">
          {saving ? 'Saving…' : 'Save entry'}
        </button>
      </form>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [headline, setHeadline] = useState(null);
  const [charts, setCharts]     = useState(null);
  const [metrics, setMetrics]   = useState([]);
  const [metricCharts, setMetricCharts] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [selectedExercise, setSelectedExercise] = useState(null);

  const load = useCallback(async () => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth) { router.replace('/login'); return; }
    setUserEmail(auth.user.email ?? '');

    const [{ data: raw }, { data: metricRows }, { data: templateRows }] = await Promise.all([
      supabase
        .from('workout_sessions')
        // id and parent_id are load-bearing: without them shapeSessions cannot
        // fold a combo's children under their parent, and they render as
        // separate top-level exercises — which is what this page did until now.
        .select(`id, name, started_at, duration_secs, timeline,
          workout_exercises(id,parent_id,exercise_type,exercise_name,body_section,status,
            weight_kg,sets_planned,sets_completed,reps,
            duration_secs,intervals_planned,intervals_done,perf_order,
            cardio_type,speed_kmh,incline_pct,load_type,bar_kg)`)
        .order('started_at', { ascending: false })
        .limit(SESSION_LIMIT),
      supabase
        .from('body_metrics')
        .select('week_date, weight_kg, waist_cm, diet_pct')
        .eq('user_id', auth.user.id)
        .order('week_date', { ascending: true })
        .limit(400),
      // Session templates, synced from the phone. Deletes are tombstones, so
      // filter them out rather than expecting the rows to be gone.
      supabase
        .from('training_sessions')
        .select('id, name, exercises, rest_timer_secs, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ]);

    if (raw) {
      const shaped = shapeSessions(raw);
      setSessions(shaped);
      setHeadline(computeHeadline(deriveAll(shaped)));
      const c = computeCharts(shaped, CHART_WEEKS);
      setCharts(c);
      setSelectedExercise(prev => prev ?? c.exerciseNames[0] ?? null);
    }
    if (metricRows) {
      setMetrics(metricRows);
      setMetricCharts(computeMetricCharts(metricRows, CHART_WEEKS));
    }
    setTemplates(templateRows ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace('/login'); };

  const progressionData = computeProgression(sessions, selectedExercise);
  const hasVolume = charts?.volumeData?.some(d => d.value > 0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-ember border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <nav className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-line px-6 py-3 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-display font-bold text-2xl tracking-wide text-ember">Kinetic</span>
          <span className="label text-faint hidden sm:block">Training, measured</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted text-sm hidden sm:block">{userEmail}</span>
          <button onClick={signOut} className="text-muted hover:text-ink text-sm transition">Sign out</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Stats ── */}
        {headline && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile
              label="This week"
              value={headline.sessions.value}
              unit={headline.sessions.value === 1 ? 'session' : 'sessions'}
              sub={headline.sessions.delta === 0 ? 'same as last week'
                : `${headline.sessions.delta > 0 ? '+' : '−'}${Math.abs(headline.sessions.delta)} vs last week`}
              tone={headline.sessions.delta > 0 ? 'up' : headline.sessions.delta < 0 ? 'down' : null}
            />
            <Tile
              label="Volume"
              value={fmtTonnes(headline.volumeKg.value).split(' ')[0]}
              unit={fmtTonnes(headline.volumeKg.value).split(' ')[1]}
              sub={headline.volumeKg.deltaPct == null ? 'first week'
                : `${fmtDelta(headline.volumeKg.deltaPct)} vs last week`}
              tone={headline.volumeKg.deltaPct > 0 ? 'up' : headline.volumeKg.deltaPct < 0 ? 'down' : null}
            />
            <Tile
              label="Under load"
              value={headline.underLoad.workSecs != null ? fmtDur(headline.underLoad.workSecs) : '—'}
              sub={headline.underLoad.density != null
                ? `of ${fmtDur(headline.underLoad.totalSecs)} · ${Math.round(headline.underLoad.density * 100)}%`
                : headline.sessions.value === 0 ? 'no sessions this week' : 'no timed sets'}
            />
            <Tile
              label="Streak"
              value={headline.streak.current}
              unit={headline.streak.current === 1 ? 'week' : 'weeks'}
              sub={`best ${headline.streak.best}`}
              tone={headline.streak.current > 0 ? 'up' : null}
            />
          </div>
        )}

        {sessions.length === 0 && (
          <div className="text-center py-20">
            <p className="font-display text-2xl text-ink">Nothing to measure yet</p>
            <p className="text-sm text-muted mt-2">
              Finish a session in the app and your numbers appear here.
            </p>
          </div>
        )}

        {sessions.length > 0 && (
          <>
            {/* ── Activity ── */}
            <ActivityCalendar sessions={sessions} />

            {/* ── Charts ── */}
            <div className="grid gap-6 md:grid-cols-2">
              <ChartCard title="Training frequency" subtitle="workouts per week"
                empty={charts?.freqData?.every(d => d.value === 0)}>
                <WeeklyBars data={charts?.freqData ?? []} color={C.ice} />
              </ChartCard>

              {hasVolume && (
                <ChartCard title="Total volume" subtitle="kg lifted per week">
                  <WeeklyBars data={charts.volumeData} color={C.ember} unit="kg" />
                </ChartCard>
              )}

              {/* ── Exercise progression ── */}
              <ChartCard title="Exercise progression" subtitle="max weight per session"
                empty={!charts?.exerciseNames?.length}>
                <div className="flex flex-wrap gap-2 mb-5">
                  {(charts?.exerciseNames ?? []).map(name => (
                    <button key={name} onClick={() => setSelectedExercise(name)}
                      className={`px-3 py-1 rounded-full text-sm transition ${
                        selectedExercise === name
                          ? 'bg-ember text-bg font-semibold'
                          : 'bg-raised text-muted hover:text-ink'}`}>
                      {name}
                    </button>
                  ))}
                </div>
                {progressionData.length >= 2 ? (
                  <TrendLine data={progressionData} color={C.ember} unit="kg" />
                ) : (
                  <p className="text-muted text-sm text-center py-8">
                    Need at least 2 sessions with {selectedExercise} to show progression.
                  </p>
                )}
              </ChartCard>

              {/* ── Body metrics — weekly averages, exactly as on the phone ── */}
              {metricCharts?.weightData?.length >= 2 && (
                <ChartCard title="Weight" subtitle="weekly avg · kg">
                  <TrendLine data={metricCharts.weightData} color={C.ice} unit="kg" />
                </ChartCard>
              )}
              {metricCharts?.waistData?.length >= 2 && (
                <ChartCard title="Waist" subtitle="weekly avg · cm">
                  <TrendLine data={metricCharts.waistData} color={C.warn} unit="cm" />
                </ChartCard>
              )}
              {metricCharts?.dietData?.length >= 2 && (
                <ChartCard title="Diet adherence" subtitle="weekly avg · %">
                  <TrendLine data={metricCharts.dietData} color={C.gold} unit="%" domain={[0, 100]} />
                </ChartCard>
              )}
            </div>

            {/* ── Recent sessions ── */}
            <div className="space-y-2">
              <h3 className="label text-faint mb-3">Recent sessions</h3>
              {sessions.slice(0, RECENT_LIMIT).map(s => <SessionRow key={s.id} session={s} />)}
            </div>
          </>
        )}

        {/* ── Training sessions ── */}
        {/* Templates synced from the phone. Outside the history check on
            purpose: a brand-new account has sessions to run before it has any
            workouts to show. */}
        <div className="space-y-2">
          <h3 className="label text-faint mb-3">Training sessions</h3>
          {templates.length === 0
            ? <p className="text-sm text-faint">
                No training sessions yet — create one in the Kinetic app and it shows up here.
              </p>
            : templates.map(t => <TrainingSessionRow key={t.id} session={t} />)}
        </div>

        {/* ── Log body metrics (web-only entry point; the phone has its own screen) ── */}
        <MetricsForm metrics={metrics} onSaved={load} />
      </main>
    </div>
  );
}
