'use client';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../lib/supabase';

// ─── Colors matching the mobile app ──────────────────────────────────────────
const C = {
  primary:   '#FF6B2B',
  blue:      '#4A9EFF',
  amber:     '#FFA040',
  gold:      '#FFD700',
  success:   '#4CAF50',
  danger:    '#FF4444',
  surface:   '#1C1C1E',
  raised:    '#2C2C2E',
  border:    '#2C2C2E',
  secondary: '#ABABAB',
  muted:     '#6B6B6B',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
const fmtDate = iso => new Date(iso).toLocaleDateString('en', { month:'short', day:'numeric', year:'numeric' });
const fmtDur  = s => { const m = Math.floor(s/60); return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m`; };
const fmtSecs = s => { const m = Math.floor(s/60), sec = s%60; return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };

// Metrics date helpers
function getWeekMonday(date = new Date()) {
  const d = new Date(date); d.setHours(12,0,0,0);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0,10);
}
function shiftWeek(iso, delta) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setDate(d.getDate() + delta * 7);
  return d.toISOString().slice(0,10);
}
function weekLabel(iso) {
  const mon = new Date(iso + 'T12:00:00Z');
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const f = d => d.toLocaleDateString('en', { month:'short', day:'numeric' });
  return `${f(mon)} – ${f(sun)}`;
}
function buildMetricChart(metrics, key, weeks = 16) {
  const map = Object.fromEntries(metrics.map(m => [m.week_date, m]));
  return Array.from({ length: weeks }, (_, i) => {
    const mon = shiftWeek(getWeekMonday(), -(weeks - 1 - i));
    const m   = map[mon];
    const d   = new Date(mon + 'T12:00:00Z');
    return {
      name:  d.toLocaleDateString('en', { month:'short', day:'numeric' }),
      value: m?.[key] ?? null,
    };
  });
}

const isoWeek = d => {
  const date = new Date(d); date.setHours(12,0,0,0);
  date.setDate(date.getDate() + 4 - (date.getDay()||7));
  const y = date.getFullYear();
  const w = Math.ceil((((date - new Date(y,0,1))/86400000)+1)/7);
  return `${y}-W${String(w).padStart(2,'0')}`;
};
const weekLabel = isoW => {
  const [y,w] = isoW.split('-W').map(Number);
  const jan4 = new Date(y,0,4);
  const d = new Date(jan4.getTime() + (w-1)*7*86400000 - (jan4.getDay()||7)*86400000 + 86400000);
  return d.toLocaleDateString('en',{month:'short',day:'numeric'});
};
const last12Weeks = () => {
  const weeks=[]; const now = new Date();
  for(let i=11;i>=0;i--){ const d=new Date(now); d.setDate(d.getDate()-i*7); weeks.push(isoWeek(d)); }
  return weeks;
};

// ─── Compute chart data ───────────────────────────────────────────────────────
function computeCharts(sessions) {
  const weekKeys  = last12Weeks();
  const freqMap   = Object.fromEntries(weekKeys.map(k=>[k,0]));
  const volumeMap = Object.fromEntries(weekKeys.map(k=>[k,0]));
  sessions.forEach(s => {
    const wk = isoWeek(s.started_at);
    if(freqMap[wk]!==undefined) freqMap[wk]++;
    (s.exercises??[]).forEach(e => {
      if(e.exercise_type!=='regular') return;
      const vol = (e.weight_kg||0)*(e.sets_completed||0)*(e.reps||0);
      if(volumeMap[wk]!==undefined) volumeMap[wk]+=vol;
    });
  });
  const freqData   = weekKeys.map(k=>({name:weekLabel(k), value:freqMap[k]}));
  const volumeData = weekKeys.map(k=>({name:weekLabel(k), value:Math.round(volumeMap[k])}));
  const nameSet = new Set();
  sessions.forEach(s=>(s.exercises??[]).forEach(e=>{ if(e.exercise_type==='regular'&&e.exercise_name) nameSet.add(e.exercise_name); }));
  return { freqData, volumeData, exerciseNames:[...nameSet].sort() };
}

function getProgression(sessions, exerciseName) {
  const byDate = {};
  sessions.forEach(s=>{
    const date = s.started_at.slice(0,10);
    (s.exercises??[]).forEach(e=>{
      if(e.exercise_name!==exerciseName||e.exercise_type!=='regular'||!e.weight_kg) return;
      byDate[date] = Math.max(byDate[date]??0, e.weight_kg);
    });
  });
  return Object.entries(byDate)
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([date,value])=>({name:new Date(date).toLocaleDateString('en',{month:'short',day:'numeric'}), value}));
}

// ─── Activity calendar (12 weeks) ────────────────────────────────────────────
function ActivityCalendar({ sessions }) {
  const activeDays = new Set(sessions.map(s=>s.started_at.slice(0,10)));
  const today = new Date(); today.setHours(23,59,59,999);
  const totalDays = 84; // 12 weeks
  const start = new Date(today); start.setDate(start.getDate()-totalDays+1); start.setHours(0,0,0,0);
  const days = [];
  for(let i=0;i<totalDays;i++){ const d=new Date(start); d.setDate(d.getDate()+i); days.push(d); }
  const pad = days[0].getDay()===0 ? 6 : days[0].getDay()-1;
  for(let i=0;i<pad;i++){ const d=new Date(start); d.setDate(d.getDate()-(pad-i)); days.unshift(d); }
  const weeks=[];
  for(let w=0;w<Math.ceil(days.length/7);w++) weeks.push(days.slice(w*7,(w+1)*7));

  return (
    <div className="p-4 bg-surface rounded-xl">
      <h3 className="text-xs uppercase tracking-wider text-secondary mb-3">Activity — Last 12 weeks</h3>
      <div className="flex gap-1">
        {weeks.map((week,wi)=>(
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day,di)=>{
              const key = day.toISOString().slice(0,10);
              const active = activeDays.has(key);
              const future = day > today;
              return (
                <div key={di} title={key}
                  className={`w-3 h-3 rounded-sm ${active?'bg-primary':future?'bg-raised opacity-30':'bg-raised'}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2 text-xs text-muted items-center">
        <div className="w-3 h-3 rounded-sm bg-raised" /> No workout
        <div className="w-3 h-3 rounded-sm bg-primary ml-2" /> Workout
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-surface rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-secondary">{label}</span>
      <span className="text-3xl font-bold" style={{color}}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, unit='' }) {
  if (!active||!payload?.length) return null;
  return (
    <div className="bg-raised border border-border rounded-lg px-3 py-2 text-sm">
      <p className="text-secondary mb-1">{label}</p>
      <p className="font-bold" style={{color:payload[0]?.color}}>
        {payload[0]?.value > 999
          ? `${(payload[0].value/1000).toFixed(1)}k${unit}`
          : `${payload[0]?.value}${unit}`}
      </p>
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────
function SessionRow({ session }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab]   = useState('exercises'); // 'exercises' | 'timeline'
  const statusColor = { complete:C.gold, partial:C.amber, pending:C.muted };

  const exDetail = e => {
    if(e.exercise_type==='regular'&&e.weight_kg!=null)
      return `${e.weight_kg}kg × ${e.sets_completed??e.sets_planned??'?'}×${e.reps??'?'}`;
    if(e.exercise_type==='warmup'&&e.duration_secs) return fmtSecs(e.duration_secs);
    if(e.exercise_type==='intervals') return `${e.intervals_done??'?'}/${e.intervals_planned??'?'} reps`;
    return '';
  };

  const timeline = session.timeline ?? [];

  const actionLabel = {
    session_start:  '🏁 Session started',
    warmup_start:   '🔥 Warmup started',
    warmup_end:     '✅ Warmup complete',
    rest_start:     '⏸ Rest started',
    rest_end:       '▶️ Rest over',
    set_done:       '✓ Set done',
    interval_phase: '⚡ Phase change',
    intervals_done: '✅ Intervals complete',
    session_end:    '🏆 Session ended',
  };

  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <button onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-raised transition text-left"
      >
        <div>
          <p className="font-semibold">{session.name}</p>
          <p className="text-secondary text-sm mt-0.5">
            {fmtDate(session.started_at)} · {fmtDur(session.duration_secs)}
            {session.exercise_count>0 && ` · ${session.exercise_count} exercise${session.exercise_count>1?'s':''}`}
          </p>
        </div>
        <svg className={`w-5 h-5 text-muted transition-transform ${open?'rotate-180':''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-border">
          {/* Tab switcher */}
          <div className="flex gap-2 mt-3 mb-4">
            <button onClick={()=>setTab('exercises')}
              className={`px-3 py-1 rounded-full text-sm transition ${tab==='exercises'?'bg-primary text-bg font-semibold':'bg-raised text-secondary'}`}>
              Exercises
            </button>
            {timeline.length > 0 && (
              <button onClick={()=>setTab('timeline')}
                className={`px-3 py-1 rounded-full text-sm transition ${tab==='timeline'?'bg-primary text-bg font-semibold':'bg-raised text-secondary'}`}>
                Timeline ({timeline.length})
              </button>
            )}
          </div>

          {/* Exercises tab */}
          {tab === 'exercises' && (
            <div className="space-y-2">
              {(session.exercises??[]).map((e,i)=>(
                <div key={i} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{backgroundColor:statusColor[e.status]??C.muted}} />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{e.exercise_name}</span>
                    {e.body_section && <span className="ml-2 text-xs" style={{color:C.amber}}>{e.body_section}</span>}
                  </div>
                  <span className="text-secondary text-sm">{exDetail(e)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Timeline tab */}
          {tab === 'timeline' && timeline.length > 0 && (
            <div className="space-y-1">
              {timeline.map((ev, i) => {
                const isSet = ev.action === 'set_done';
                const isPhase = ev.action === 'interval_phase';
                return (
                  <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border last:border-0">
                    {/* Timestamp */}
                    <span className="text-xs font-mono text-muted w-12 flex-shrink-0 mt-0.5">
                      {fmtSecs(ev.t ?? 0)}
                    </span>
                    {/* Action */}
                    <div className="flex-1">
                      <span className="text-sm text-secondary">
                        {actionLabel[ev.action] ?? ev.action}
                      </span>
                      {isSet && (
                        <span className="ml-2 text-sm font-medium text-white">
                          {ev.exerciseName}
                          {ev.bodySection ? ` (${ev.bodySection})` : ''}
                          {ev.weight ? ` — ${ev.weight}kg × ${ev.reps} reps` : ''}
                          {` · set #${ev.setNumber}, ${ev.setsLeft} left`}
                        </span>
                      )}
                      {isPhase && (
                        <span className="ml-2 text-sm" style={{color:C.amber}}>
                          → {ev.phase} (rep {ev.repsDone}/{(ev.repsDone??0)+(ev.repsLeft??0)})
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
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions]         = useState([]);
  const [stats, setStats]               = useState(null);
  const [charts, setCharts]             = useState(null);
  const [metrics, setMetrics]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [userEmail, setUserEmail]       = useState('');
  const [selectedExercise, setSelectedExercise] = useState(null);

  // Metrics log form
  const [metricWeek, setMetricWeek]     = useState(getWeekMonday());
  const [mWeight, setMWeight]           = useState('');
  const [mWaist,  setMWaist]            = useState('');
  const [mDiet,   setMDiet]             = useState('');
  const [savingMetrics, setSavingMetrics] = useState(false);

  const load = useCallback(async () => {
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth) { router.replace('/login'); return; }
    setUserEmail(auth.user.email ?? '');

    const [{ data: raw }, { data: metricsData }] = await Promise.all([
      supabase
        .from('workout_sessions')
        .select(`id, name, started_at, duration_secs, timeline,
          workout_exercises(exercise_type,exercise_name,body_section,status,
            weight_kg,sets_planned,sets_completed,reps,
            duration_secs,intervals_planned,intervals_done,perf_order)`)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase
        .from('weekly_metrics')
        .select('week_date, weight_kg, waist_cm, diet_pct')
        .order('week_date', { ascending: false })
        .limit(52),
    ]);

    if (metricsData) {
      setMetrics(metricsData);
      // Populate form with current week's values
      const cur = metricsData.find(m => m.week_date === metricWeek);
      setMWeight(cur?.weight_kg != null ? String(cur.weight_kg) : '');
      setMWaist( cur?.waist_cm  != null ? String(cur.waist_cm)  : '');
      setMDiet(  cur?.diet_pct  != null ? String(cur.diet_pct)  : '');
    }

    if (raw) {
      const shaped = raw.map(s=>({
        ...s,
        exercise_count: s.workout_exercises?.length??0,
        exercises: (s.workout_exercises??[]).sort((a,b)=>(a.perf_order??0)-(b.perf_order??0)),
      }));
      setSessions(shaped);
      const totalSecs  = shaped.reduce((s,r)=>s+(r.duration_secs??0),0);
      const activeDays = new Set(shaped.map(s=>s.started_at.slice(0,10))).size;
      const totalVol   = shaped.reduce((sum,s)=>{
        return sum + (s.exercises??[]).reduce((es,e)=>{
          if(e.exercise_type!=='regular') return es;
          return es + (e.weight_kg||0)*(e.sets_completed||0)*(e.reps||0);
        },0);
      },0);
      setStats({ count:shaped.length, totalSecs, activeDays, totalVol });
      const c = computeCharts(shaped);
      setCharts(c);
      if (!selectedExercise && c.exerciseNames.length) setSelectedExercise(c.exerciseNames[0]);
    }
    setLoading(false);
  }, [router, selectedExercise]);

  useEffect(() => { load(); }, []);   // eslint-disable-line

  const signOut = async () => { await supabase.auth.signOut(); router.replace('/login'); };

  const saveMetrics = async (e) => {
    e.preventDefault();
    setSavingMetrics(true);
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth) { setSavingMetrics(false); return; }
    const w = parseFloat(mWeight), c = parseFloat(mWaist), d = parseInt(mDiet, 10);
    const payload = {
      user_id: auth.user.id, week_date: metricWeek,
      ...(!isNaN(w) && { weight_kg: w }),
      ...(!isNaN(c) && { waist_cm: c }),
      ...(!isNaN(d) && d >= 0 && d <= 100 && { diet_pct: d }),
    };
    await supabase.from('weekly_metrics').upsert(payload, { onConflict: 'user_id,week_date' });
    await load();
    setSavingMetrics(false);
  };

  const changeMetricWeek = (delta) => {
    const next = shiftWeek(metricWeek, delta);
    if (delta > 0 && next > getWeekMonday()) return;
    setMetricWeek(next);
    const cur = metrics.find(m => m.week_date === next);
    setMWeight(cur?.weight_kg != null ? String(cur.weight_kg) : '');
    setMWaist( cur?.waist_cm  != null ? String(cur.waist_cm)  : '');
    setMDiet(  cur?.diet_pct  != null ? String(cur.diet_pct)  : '');
  };

  const progressionData = selectedExercise ? getProgression(sessions, selectedExercise) : [];
  const hasVolume = charts?.volumeData?.some(d=>d.value>0);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-primary text-xl">⚡</span>
          <span className="font-bold tracking-widest text-primary text-lg">KINETIC</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-secondary text-sm hidden sm:block">{userEmail}</span>
          <button onClick={signOut}
            className="text-secondary hover:text-white text-sm transition flex items-center gap-1">
            Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Stats ── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Sessions"    value={stats.count}               color={C.primary} />
            <StatCard label="Total time"  value={fmtDur(stats.totalSecs)}   color={C.blue} />
            <StatCard label="Active days" value={stats.activeDays}           color={C.gold} />
            <StatCard label="Total volume"
              value={stats.totalVol > 999999
                ? `${(stats.totalVol/1000000).toFixed(1)}M`
                : stats.totalVol > 999
                ? `${(stats.totalVol/1000).toFixed(1)}k`
                : String(Math.round(stats.totalVol))}
              sub="kg lifted (all time)"
              color={C.amber}
            />
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
            {/* ── Charts row ── */}
            <div className={`grid gap-6 ${hasVolume ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
              {/* Training Frequency */}
              <div className="bg-surface rounded-xl p-5">
                <h3 className="text-xs uppercase tracking-wider text-secondary mb-4">Training Frequency — Workouts/week</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={charts?.freqData} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{fill:'rgba(255,255,255,0.04)'}} />
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {charts?.freqData?.map((d,i)=>(
                        <Cell key={i} fill={d.value===Math.max(...(charts.freqData.map(x=>x.value)))&&d.value>0 ? C.blue : `${C.blue}55`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Volume Trend */}
              {hasVolume && (
                <div className="bg-surface rounded-xl p-5">
                  <h3 className="text-xs uppercase tracking-wider text-secondary mb-4">Total Volume — kg lifted/week</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={charts?.volumeData} barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="name" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} width={36}
                        tickFormatter={v=>v>999?`${(v/1000).toFixed(0)}k`:v} />
                      <Tooltip content={<ChartTooltip unit="kg" />} cursor={{fill:'rgba(255,255,255,0.04)'}} />
                      <Bar dataKey="value" radius={[4,4,0,0]}>
                        {charts?.volumeData?.map((d,i)=>(
                          <Cell key={i} fill={d.value===Math.max(...(charts.volumeData.map(x=>x.value)))&&d.value>0 ? C.primary : `${C.primary}55`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* ── Exercise Progression ── */}
            {charts?.exerciseNames?.length > 0 && (
              <div className="bg-surface rounded-xl p-5">
                <h3 className="text-xs uppercase tracking-wider text-secondary mb-4">Exercise Progression — Max weight per session</h3>
                <div className="flex flex-wrap gap-2 mb-5">
                  {charts.exerciseNames.map(name=>(
                    <button key={name}
                      onClick={()=>setSelectedExercise(name)}
                      className={`px-3 py-1 rounded-full text-sm transition ${
                        selectedExercise===name
                          ? 'bg-primary text-bg font-semibold'
                          : 'bg-raised text-secondary hover:text-white'
                      }`}>
                      {name}
                    </button>
                  ))}
                </div>
                {progressionData.length >= 2 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={progressionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="name" tick={{fill:C.muted,fontSize:11}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fill:C.muted,fontSize:11}} axisLine={false} tickLine={false} width={44}
                        tickFormatter={v=>`${v}kg`} domain={['auto','auto']} />
                      <Tooltip content={<ChartTooltip unit="kg" />} />
                      <Line type="monotone" dataKey="value"
                        stroke={C.primary} strokeWidth={2}
                        dot={{fill:C.primary,strokeWidth:2,stroke:'#0D0D0D',r:5}}
                        activeDot={{r:7,fill:C.primary}} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-secondary text-sm text-center py-8">
                    {progressionData.length === 0
                      ? `No data for ${selectedExercise}`
                      : `Need at least 2 sessions with ${selectedExercise} to show progression`}
                  </p>
                )}
              </div>
            )}

            {/* ── Bottom row: calendar + sessions ── */}
            <div className="grid md:grid-cols-5 gap-6">
              {/* Activity calendar */}
              <div className="md:col-span-2">
                <ActivityCalendar sessions={sessions} />
              </div>

              {/* Recent sessions */}
              <div className="md:col-span-3">
                <div className="space-y-2">
                  <h3 className="text-xs uppercase tracking-wider text-secondary mb-3">Recent sessions</h3>
                  {sessions.slice(0,15).map(s=>(
                    <SessionRow key={s.id} session={s} />
                  ))}
                </div>
              </div>
            </div>

            {/* ── Body Metrics ── */}
            <div>
              <h2 className="text-xs uppercase tracking-wider text-secondary mb-4">Body Metrics</h2>

              {/* Log form */}
              <div className="bg-surface rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold mb-4">Log Week</h3>
                <form onSubmit={saveMetrics}>
                  {/* Week selector */}
                  <div className="flex items-center gap-3 mb-5 bg-raised rounded-lg px-2 py-1">
                    <button type="button" onClick={()=>changeMetricWeek(-1)} className="p-2 text-secondary hover:text-white transition">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                      </svg>
                    </button>
                    <span className="flex-1 text-center text-sm font-medium">{weekLabel(metricWeek)}</span>
                    <button type="button" onClick={()=>changeMetricWeek(1)}
                      disabled={shiftWeek(metricWeek,1) > getWeekMonday()}
                      className="p-2 text-secondary hover:text-white transition disabled:opacity-30">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-xs text-secondary mb-1 uppercase tracking-wider">Avg. Weight</label>
                      <div className="flex items-center bg-raised rounded-lg px-3 h-11">
                        <input type="number" step="0.1" value={mWeight} onChange={e=>setMWeight(e.target.value)}
                          className="flex-1 bg-transparent text-white outline-none text-sm"
                          placeholder="82.5" />
                        <span className="text-muted text-sm">kg</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-secondary mb-1 uppercase tracking-wider">Waist</label>
                      <div className="flex items-center bg-raised rounded-lg px-3 h-11">
                        <input type="number" step="0.5" value={mWaist} onChange={e=>setMWaist(e.target.value)}
                          className="flex-1 bg-transparent text-white outline-none text-sm"
                          placeholder="91" />
                        <span className="text-muted text-sm">cm</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-secondary mb-1 uppercase tracking-wider">Diet Adherence</label>
                      <div className="flex items-center bg-raised rounded-lg px-3 h-11">
                        <input type="number" min="0" max="100" step="5" value={mDiet} onChange={e=>setMDiet(e.target.value)}
                          className="flex-1 bg-transparent text-white outline-none text-sm"
                          placeholder="85" />
                        <span className="text-muted text-sm">%</span>
                      </div>
                    </div>
                  </div>

                  <button type="submit" disabled={savingMetrics}
                    className="w-full sm:w-auto px-6 h-10 bg-primary text-bg font-semibold rounded-full hover:opacity-90 transition disabled:opacity-50 text-sm">
                    {savingMetrics ? 'Saving…' : '✓ Save Week'}
                  </button>
                </form>
              </div>

              {/* Three metric charts */}
              <div className="grid md:grid-cols-3 gap-5">
                {/* Weight */}
                <div className="bg-surface rounded-xl p-5">
                  <h3 className="text-xs uppercase tracking-wider mb-4" style={{color:C.primary}}>⚖ Weight (kg)</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={buildMetricChart(metrics,'weight_kg')}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="name" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} width={36} tickFormatter={v=>`${v}kg`} domain={['auto','auto']}/>
                      <Tooltip formatter={(v)=>[`${v} kg`,'Weight']} contentStyle={{backgroundColor:C.raised,border:'none',borderRadius:8}}/>
                      <Line type="monotone" dataKey="value" stroke={C.primary} strokeWidth={2} dot={{fill:C.primary,r:4,strokeWidth:2,stroke:'#0D0D0D'}} connectNulls={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Waist */}
                <div className="bg-surface rounded-xl p-5">
                  <h3 className="text-xs uppercase tracking-wider mb-4" style={{color:C.blue}}>📏 Waist (cm)</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={buildMetricChart(metrics,'waist_cm')}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="name" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} width={36} tickFormatter={v=>`${v}cm`} domain={['auto','auto']}/>
                      <Tooltip formatter={(v)=>[`${v} cm`,'Waist']} contentStyle={{backgroundColor:C.raised,border:'none',borderRadius:8}}/>
                      <Line type="monotone" dataKey="value" stroke={C.blue} strokeWidth={2} dot={{fill:C.blue,r:4,strokeWidth:2,stroke:'#0D0D0D'}} connectNulls={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Diet */}
                <div className="bg-surface rounded-xl p-5">
                  <h3 className="text-xs uppercase tracking-wider mb-4" style={{color:C.amber}}>🥗 Diet Adherence (%)</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={buildMetricChart(metrics,'diet_pct')} barSize={10}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
                      <XAxis dataKey="name" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} width={28} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                      <Tooltip formatter={(v)=>[v!=null?`${v}%`:'—','Diet']} contentStyle={{backgroundColor:C.raised,border:'none',borderRadius:8}}/>
                      <Bar dataKey="value" radius={[3,3,0,0]}>
                        {buildMetricChart(metrics,'diet_pct').map((d,i)=>(
                          <Cell key={i} fill={d.value==null?C.raised:d.value>=90?C.success:d.value>=70?C.amber:C.danger+'CC'}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    {[[C.success,'≥ 90%'],[C.amber,'70–89%'],[C.danger,'< 70%']].map(([c,l])=>(
                      <div key={l} className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:c}}/>
                        <span className="text-xs text-muted">{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
