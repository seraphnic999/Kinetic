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
  fmtDate, fmtDur, fmtSecs, fmtVolume, isoDay,
  shapeSessions, computeStats, computeCharts, computeProgression, computeMetricCharts,
  buildCalendar, exerciseDetail, WEEKDAY_LABELS,
  CALENDAR_DAYS, CHART_WEEKS, SESSION_LIMIT, RECENT_LIMIT,
} from '../../lib/analytics';

// ─── Palette — the exact values from the mobile app's src/theme.js ───────────
const C = {
  primary:   '#FF6B2B',
  amber:     '#FF9A3C',
  gold:      '#FFD23F',
  blue:      '#4FC3F7',
  danger:    '#FF3B30',
  surface:   '#1C1C1E',
  raised:    '#2C2C2E',
  border:    '#2C2C2E',
  secondary: '#A0A0A0',
  muted:     '#505050',
};

// ─── Chart card — the web twin of the mobile ChartCard ───────────────────────
function ChartCard({ title, subtitle, children, empty }) {
  return (
    <div className="bg-surface rounded-xl p-5">
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="text-xs uppercase tracking-wider text-secondary flex-1">{title}</h3>
        {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
      </div>
      {empty
        ? <p className="text-sm text-muted text-center py-8">No data yet</p>
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
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={30}
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
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
        <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={44}
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
    <div className="bg-raised border border-border rounded-lg px-3 py-2 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      <p className="font-bold" style={{ color }}>
        {v > 999 ? `${(v / 1000).toFixed(1)}k${unit}` : `${v}${unit}`}
      </p>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className="bg-surface rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-secondary">{label}</span>
      <span className="text-3xl font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Activity calendar ───────────────────────────────────────────────────────
// Same grid as the phone: one row per Sunday → Saturday week, labelled with the
// week's Sunday, days after today dimmed.
function ActivityCalendar({ sessions }) {
  const weeks = buildCalendar(sessions, CALENDAR_DAYS);
  return (
    <div className="bg-surface rounded-xl p-5">
      <h3 className="text-xs uppercase tracking-wider text-secondary mb-4">Activity — last 10 weeks</h3>
      <div className="flex gap-1 mb-1.5 pl-14 text-[10px] text-muted">
        {WEEKDAY_LABELS.map((l, i) => (
          <span key={i} className="flex-1 text-center">{l}</span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex items-center gap-1">
            <span className="w-14 shrink-0 text-[10px] text-muted">
              {week[0].date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
            {week.map(day => (
              <div key={day.key} title={`${day.key}${day.active ? ' — workout' : ''}`}
                className={`flex-1 aspect-square rounded-sm ${day.active ? 'bg-primary' : 'bg-raised'} ${day.future ? 'opacity-20' : ''}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3 text-xs text-muted items-center">
        <div className="w-3 h-3 rounded-sm bg-raised" /> No workout
        <div className="w-3 h-3 rounded-sm bg-primary ml-2" /> Workout
      </div>
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────
const ACTION_LABEL = {
  session_start:      '🏁 Session started',
  warmup_start:       '🔥 Warmup started',
  warmup_end:         '✅ Warmup complete',
  rest_start:         '⏸ Rest started',
  rest_end:           '▶️ Rest over',
  set_start:          '▶️ Set started',
  set_done:           '✓ Set done',
  interval_phase:     '⚡ Phase change',
  intervals_done:     '✅ Intervals complete',
  cardio_length_start:'🏃 Cardio started',
  cardio_length_end:  '🏁 Cardio complete',
  session_end:        '🏆 Session ended',
};

function SessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab]   = useState('exercises');
  const statusColor = { complete: C.gold, partial: C.amber, pending: C.muted };
  const timeline = session.timeline ?? [];

  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-raised transition text-left">
        <div>
          <p className="font-semibold">{session.name}</p>
          <p className="text-secondary text-sm mt-0.5">
            {fmtDate(session.started_at)} · {fmtDur(session.duration_secs)}
            {session.exercise_count > 0 && ` · ${session.exercise_count} exercise${session.exercise_count > 1 ? 's' : ''}`}
          </p>
        </div>
        <svg className={`w-5 h-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-border">
          <div className="flex gap-2 mt-3 mb-4">
            <button onClick={() => setTab('exercises')}
              className={`px-3 py-1 rounded-full text-sm transition ${tab === 'exercises' ? 'bg-primary text-bg font-semibold' : 'bg-raised text-secondary'}`}>
              Exercises
            </button>
            {timeline.length > 0 && (
              <button onClick={() => setTab('timeline')}
                className={`px-3 py-1 rounded-full text-sm transition ${tab === 'timeline' ? 'bg-primary text-bg font-semibold' : 'bg-raised text-secondary'}`}>
                Timeline ({timeline.length})
              </button>
            )}
          </div>

          {tab === 'exercises' && (
            <div className="space-y-2">
              {(session.exercises ?? []).map((e, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: statusColor[e.status] ?? C.muted }} />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{e.exercise_name}</span>
                    {e.body_section && <span className="ml-2 text-xs" style={{ color: C.amber }}>{e.body_section}</span>}
                  </div>
                  <span className="text-secondary text-sm">{exerciseDetail(e)}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'timeline' && (
            <div className="space-y-1">
              {timeline.map((ev, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border last:border-0">
                  <span className="text-xs font-mono text-muted w-12 flex-shrink-0 mt-0.5">{fmtSecs(ev.t ?? 0)}</span>
                  <div className="flex-1">
                    <span className="text-sm text-secondary">{ACTION_LABEL[ev.action] ?? ev.action}</span>
                    {ev.action === 'set_done' && (
                      <span className="ml-2 text-sm font-medium text-white">
                        {ev.exerciseName}
                        {ev.bodySection ? ` (${ev.bodySection})` : ''}
                        {ev.weight ? ` — ${ev.weight}kg × ${ev.reps} reps` : ''}
                        {` · set #${ev.setNumber}, ${ev.setsLeft} left`}
                        {ev.durationSecs != null ? ` · ${fmtSecs(ev.durationSecs)}` : ''}
                      </span>
                    )}
                    {ev.action === 'interval_phase' && (
                      <span className="ml-2 text-sm" style={{ color: C.amber }}>
                        → {ev.phase} (rep {ev.repsDone}/{(ev.repsDone ?? 0) + (ev.repsLeft ?? 0)})
                      </span>
                    )}
                    {ev.action === 'warmup_start' && ev.exerciseName && (
                      <span className="ml-2 text-sm text-white">{ev.exerciseName} · {fmtSecs(ev.durationSecs ?? 0)}</span>
                    )}
                    {ev.action === 'rest_start' && ev.durationSecs && (
                      <span className="ml-2 text-sm text-secondary">{fmtSecs(ev.durationSecs)}</span>
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
      <label className="block text-xs text-secondary mb-1 uppercase tracking-wider">{label}</label>
      <div className="flex items-center bg-raised rounded-lg px-3 h-11">
        <input type="number" value={value} onChange={e => setValue(e.target.value)} {...props}
          className="flex-1 bg-transparent text-white outline-none text-sm w-full" />
        <span className="text-muted text-sm ml-2">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-surface rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-xs uppercase tracking-wider text-secondary">Log body metrics</h3>
        <input type="date" value={day} max={isoDay(new Date())} onChange={e => e.target.value && setDay(e.target.value)}
          className="bg-raised rounded-lg px-3 h-9 text-sm text-white outline-none" />
      </div>
      <form onSubmit={save}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {field('Weight', weight, setWeight, 'kg', { step: '0.1', placeholder: '82.5' })}
          {field('Waist',  waist,  setWaist,  'cm', { step: '0.5', placeholder: '91' })}
          {field('Diet adherence', diet, setDiet, '%', { min: '0', max: '100', step: '5', placeholder: '80' })}
        </div>
        <button type="submit" disabled={saving}
          className="px-6 h-10 bg-primary text-bg font-semibold rounded-full hover:opacity-90 transition disabled:opacity-50 text-sm">
          {saving ? 'Saving…' : '✓ Save entry'}
        </button>
      </form>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [stats, setStats]       = useState(null);
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

    const [{ data: raw }, { data: metricRows }] = await Promise.all([
      supabase
        .from('workout_sessions')
        .select(`id, name, started_at, duration_secs, timeline,
          workout_exercises(exercise_type,exercise_name,body_section,status,
            weight_kg,sets_planned,sets_completed,reps,
            duration_secs,intervals_planned,intervals_done,perf_order,
            cardio_type,speed_kmh,incline_pct)`)
        .order('started_at', { ascending: false })
        .limit(SESSION_LIMIT),
      supabase
        .from('body_metrics')
        .select('week_date, weight_kg, waist_cm, diet_pct')
        .eq('user_id', auth.user.id)
        .order('week_date', { ascending: true })
        .limit(400),
    ]);

    if (raw) {
      const shaped = shapeSessions(raw);
      setSessions(shaped);
      setStats(computeStats(shaped));
      const c = computeCharts(shaped, CHART_WEEKS);
      setCharts(c);
      setSelectedExercise(prev => prev ?? c.exerciseNames[0] ?? null);
    }
    if (metricRows) {
      setMetrics(metricRows);
      setMetricCharts(computeMetricCharts(metricRows, CHART_WEEKS));
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const signOut = async () => { await supabase.auth.signOut(); router.replace('/login'); };

  const progressionData = computeProgression(sessions, selectedExercise);
  const hasVolume = charts?.volumeData?.some(d => d.value > 0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <nav className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-primary text-xl">⚡</span>
          <span className="font-bold tracking-widest text-primary text-lg">KINETIC</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-secondary text-sm hidden sm:block">{userEmail}</span>
          <button onClick={signOut} className="text-secondary hover:text-white text-sm transition">Sign out</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Sessions"    value={stats.count}                   color={C.primary} />
            <StatCard label="Total time"  value={fmtDur(stats.totalSecs)}       color={C.blue} />
            <StatCard label="Active days" value={stats.activeDays}              color={C.gold} />
            <StatCard label="kg lifted"   value={fmtVolume(stats.totalVolume)}  color={C.amber} />
          </div>
        )}

        {sessions.length === 0 && (
          <div className="text-center py-20 text-secondary">
            <p className="text-5xl mb-4">🏋️</p>
            <p className="text-lg">No synced sessions yet.</p>
            <p className="text-sm text-muted mt-1">Complete a workout in the Kinetic app to see your data here.</p>
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
                <WeeklyBars data={charts?.freqData ?? []} color={C.blue} />
              </ChartCard>

              {hasVolume && (
                <ChartCard title="Total volume" subtitle="kg lifted per week">
                  <WeeklyBars data={charts.volumeData} color={C.primary} unit="kg" />
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
                          ? 'bg-primary text-bg font-semibold'
                          : 'bg-raised text-secondary hover:text-white'}`}>
                      {name}
                    </button>
                  ))}
                </div>
                {progressionData.length >= 2 ? (
                  <TrendLine data={progressionData} color={C.primary} unit="kg" />
                ) : (
                  <p className="text-secondary text-sm text-center py-8">
                    Need at least 2 sessions with {selectedExercise} to show progression.
                  </p>
                )}
              </ChartCard>

              {/* ── Body metrics — weekly averages, exactly as on the phone ── */}
              {metricCharts?.weightData?.length >= 2 && (
                <ChartCard title="Weight" subtitle="weekly avg · kg">
                  <TrendLine data={metricCharts.weightData} color={C.blue} unit="kg" />
                </ChartCard>
              )}
              {metricCharts?.waistData?.length >= 2 && (
                <ChartCard title="Waist" subtitle="weekly avg · cm">
                  <TrendLine data={metricCharts.waistData} color={C.amber} unit="cm" />
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
              <h3 className="text-xs uppercase tracking-wider text-secondary mb-3">Recent sessions</h3>
              {sessions.slice(0, RECENT_LIMIT).map(s => <SessionRow key={s.id} session={s} />)}
            </div>

            {/* ── Log body metrics (web-only entry point; the phone has its own screen) ── */}
            <MetricsForm metrics={metrics} onSaved={load} />
          </>
        )}
      </main>
    </div>
  );
}
