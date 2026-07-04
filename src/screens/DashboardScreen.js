import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { supabase } from '../config/supabase';
import { formatTime } from '../utils/time';

// ─── Date / format helpers ────────────────────────────────────────────────────
const fmtDate  = iso => new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const fmtDur   = s => { const m = Math.floor(s/60); return m<60?`${m}m`:`${Math.floor(m/60)}h ${m%60}m`; };
const isoWeek  = d => {          // ISO week key YYYY-Www
  const date = new Date(d);
  date.setHours(12,0,0,0);
  date.setDate(date.getDate() + 4 - (date.getDay()||7));
  const y = date.getFullYear();
  const w = Math.ceil((((date - new Date(y,0,1))/86400000)+1)/7);
  return `${y}-W${String(w).padStart(2,'0')}`;
};
const weekLabel = isoW => {      // "Jun 2" label for a week key
  const [y,w] = isoW.split('-W').map(Number);
  const jan4 = new Date(y,0,4);
  const d = new Date(jan4.getTime() + (w-1)*7*86400000 - (jan4.getDay()||7)*86400000 + 86400000);
  return d.toLocaleDateString('en',{month:'short',day:'numeric'});
};
const last12Weeks = () => {
  const weeks = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i*7);
    weeks.push(isoWeek(d));
  }
  return weeks;
};

// ─── Compute chart data from sessions ────────────────────────────────────────
function computeCharts(sessions) {
  const weekKeys  = last12Weeks();
  const freqMap   = Object.fromEntries(weekKeys.map(k => [k, 0]));
  const volumeMap = Object.fromEntries(weekKeys.map(k => [k, 0]));

  sessions.forEach(s => {
    const wk = isoWeek(s.started_at);
    if (freqMap[wk] !== undefined) freqMap[wk]++;
    (s.exercises ?? []).forEach(e => {
      if (e.exercise_type !== 'regular') return;
      const vol = (e.weight_kg || 0) * (e.sets_completed || 0) * (e.reps || 0);
      if (volumeMap[wk] !== undefined) volumeMap[wk] += vol;
    });
  });

  const freqData   = weekKeys.map(k => ({ label: weekLabel(k), value: freqMap[k] }));
  const volumeData = weekKeys.map(k => ({ label: weekLabel(k), value: Math.round(volumeMap[k]) }));

  // Unique regular exercise names
  const nameSet = new Set();
  sessions.forEach(s => (s.exercises ?? []).forEach(e => {
    if (e.exercise_type === 'regular' && e.exercise_name) nameSet.add(e.exercise_name);
  }));

  return { freqData, volumeData, exerciseNames: [...nameSet].sort() };
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ data, height = 110, color = Colors.primary, valueFormatter }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const fmt = valueFormatter ?? (v => v > 999 ? `${(v/1000).toFixed(1)}k` : String(v));
  // Only show labels for every Nth bar to avoid crowding
  const every = data.length > 8 ? Math.ceil(data.length / 6) : 1;

  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {data.map((d, i) => {
          const barH = Math.max(d.value > 0 ? 4 : 0, (d.value / max) * (height - 16));
          const isPeak = d.value === max && max > 0;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
              {d.value > 0 && (
                <Text style={{ fontSize: 8, color: isPeak ? color : Colors.textMuted, marginBottom: 2 }}>
                  {fmt(d.value)}
                </Text>
              )}
              <View style={{
                width: '70%', height: barH,
                backgroundColor: isPeak ? color : color + '55',
                borderRadius: 3,
                minHeight: d.value > 0 ? 4 : 0,
              }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {i % every === 0 && (
              <Text style={{ fontSize: 8, color: Colors.textMuted }}>{d.label}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Line Chart (pure View geometry) ─────────────────────────────────────────
function LineChart({ data, color = Colors.primary }) {
  const [w, setW] = useState(0);
  if (!data?.length) return null;

  const HEIGHT = 110;
  const DOT = 7;
  const PAD = DOT / 2 + 2;
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value));
  const range = max - min || 1;
  const every = data.length > 8 ? Math.ceil(data.length / 6) : 1;

  const pts = w > 0 ? data.map((d, i) => ({
    x: PAD + (i / Math.max(data.length - 1, 1)) * (w - 2 * PAD),
    y: PAD + ((max - d.value) / range) * (HEIGHT - 2 * PAD),
    ...d,
  })) : [];

  return (
    <View>
      <View
        style={{ height: HEIGHT }}
        onLayout={e => setW(e.nativeEvent.layout.width)}
      >
        {w > 0 && pts.slice(0, -1).map((p, i) => {
          const n  = pts[i + 1];
          const dx = n.x - p.x, dy = n.y - p.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ang = Math.atan2(dy, dx) * 180 / Math.PI;
          return (
            <View key={`l${i}`} style={{
              position: 'absolute',
              left: (p.x + n.x) / 2 - len / 2,
              top:  (p.y + n.y) / 2 - 1.5,
              width: len, height: 3,
              backgroundColor: color + '70',
              transform: [{ rotate: `${ang}deg` }],
            }} />
          );
        })}
        {w > 0 && pts.map((p, i) => (
          <View key={`d${i}`} style={{
            position: 'absolute',
            left: p.x - DOT / 2, top: p.y - DOT / 2,
            width: DOT, height: DOT, borderRadius: DOT / 2,
            backgroundColor: color,
            borderWidth: 2, borderColor: Colors.background,
          }} />
        ))}
        {/* Y-axis labels at max and min */}
        {w > 0 && (
          <>
            <Text style={{ position: 'absolute', right: 0, top: PAD - 8, fontSize: 8, color: Colors.textMuted }}>
              {max}kg
            </Text>
            <Text style={{ position: 'absolute', right: 0, bottom: 4, fontSize: 8, color: Colors.textMuted }}>
              {min}kg
            </Text>
          </>
        )}
      </View>
      {/* X labels */}
      {w > 0 && (
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          {data.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              {i % every === 0 && (
                <Text style={{ fontSize: 8, color: Colors.textMuted }}>{d.label}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color = Colors.primary }) {
  return (
    <View style={st.card}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[st.value, { color }]}>{value}</Text>
      <Text style={st.label}>{label}</Text>
    </View>
  );
}
const st = StyleSheet.create({
  card:  { flex:1, backgroundColor:Colors.surface, borderRadius:Radius.lg, padding:Spacing.md, alignItems:'center', gap:4, ...Shadows.card },
  value: { ...Typography.h2, fontWeight:'700' },
  label: { ...Typography.bodySmall, color:Colors.textSecondary, textAlign:'center' },
});

// ─── Activity calendar ────────────────────────────────────────────────────────
function ActivityCalendar({ sessions }) {
  const today = new Date(); today.setHours(23,59,59,999);
  const activeDays = new Set(sessions.map(s => s.started_at.slice(0,10)));
  const CELL = 10;
  const totalDays = 70;
  const start = new Date(today); start.setDate(start.getDate() - totalDays + 1); start.setHours(0,0,0,0);
  const dayList = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i); dayList.push(d);
  }
  const pad = (dayList[0].getDay() === 0) ? 6 : dayList[0].getDay() - 1;
  for (let i = 0; i < pad; i++) { const d = new Date(start); d.setDate(d.getDate()-(pad-i)); dayList.unshift(d); }
  const weeks = [];
  for (let w = 0; w < Math.ceil(dayList.length/7); w++) weeks.push(dayList.slice(w*7,(w+1)*7));

  return (
    <View>
      <View style={{ flexDirection:'row', marginBottom:3, paddingLeft:2 }}>
        {['M','T','W','T','F','S','S'].map((l,i) => (
          <Text key={i} style={{ width:CELL+3, fontSize:9, color:Colors.textMuted, textAlign:'center' }}>{l}</Text>
        ))}
      </View>
      <View style={{ flexDirection:'column' }}>
        {weeks.map((week,wi) => (
          <View key={wi} style={{ flexDirection:'row', marginBottom:3 }}>
            {week.map((day,di) => {
              const key = day.toISOString().slice(0,10);
              return (
                <View key={di} style={{
                  width:CELL, height:CELL, borderRadius:2, marginRight:3,
                  backgroundColor: activeDays.has(key) ? Colors.primary : Colors.surfaceRaised,
                  opacity: day > today ? 0.2 : 1,
                }} />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────
function SessionRow({ session, expanded, onPress }) {
  const statusColor = { complete:Colors.gold, partial:Colors.amber, pending:Colors.textMuted };
  return (
    <TouchableOpacity style={sr.card} onPress={onPress} activeOpacity={0.8}>
      <View style={sr.header}>
        <View style={{ flex:1 }}>
          <Text style={sr.name} numberOfLines={1}>{session.name}</Text>
          <Text style={sr.meta}>
            {fmtDate(session.started_at)} · {fmtDur(session.duration_secs)}
            {session.exercise_count > 0 ? ` · ${session.exercise_count} exercise${session.exercise_count>1?'s':''}` : ''}
          </Text>
        </View>
        <Ionicons name={expanded?'chevron-up':'chevron-down'} size={18} color={Colors.textMuted} />
      </View>
      {expanded && (session.exercises ?? []).length > 0 && (
        <View style={sr.exercises}>
          {session.exercises.map((e,i) => (
            <View key={i} style={sr.exRow}>
              <View style={[sr.dot, { backgroundColor: statusColor[e.status] ?? Colors.textMuted }]} />
              <View style={{ flex:1 }}>
                <Text style={sr.exName}>{e.exercise_name}</Text>
                {e.body_section ? <Text style={sr.exSub}>{e.body_section}</Text> : null}
              </View>
              <Text style={sr.exDetail}>{exDetail(e)}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}
function exDetail(e) {
  if (e.exercise_type==='regular' && e.weight_kg!=null)
    return `${e.weight_kg}kg × ${e.sets_completed??e.sets_planned??'?'}×${e.reps??'?'}`;
  if (e.exercise_type==='warmup' && e.duration_secs) return formatTime(e.duration_secs);
  if (e.exercise_type==='intervals') return `${e.intervals_done??'?'}/${e.intervals_planned??'?'} reps`;
  return '';
}
const sr = StyleSheet.create({
  card:      { backgroundColor:Colors.surface, borderRadius:Radius.lg, padding:Spacing.md, marginBottom:Spacing.sm, ...Shadows.card },
  header:    { flexDirection:'row', alignItems:'center', gap:Spacing.sm },
  name:      { ...Typography.h3, color:Colors.textPrimary },
  meta:      { ...Typography.bodySmall, color:Colors.textSecondary, marginTop:2 },
  exercises: { marginTop:Spacing.md, gap:Spacing.sm, borderTopWidth:1, borderTopColor:Colors.border, paddingTop:Spacing.md },
  exRow:     { flexDirection:'row', alignItems:'flex-start', gap:Spacing.sm },
  dot:       { width:8, height:8, borderRadius:4, marginTop:4 },
  exName:    { ...Typography.body, color:Colors.textPrimary },
  exSub:     { ...Typography.bodySmall, color:Colors.amber },
  exDetail:  { ...Typography.bodySmall, color:Colors.textSecondary, alignSelf:'center' },
});

// ─── Chart card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, icon, subtitle, children, empty }) {
  return (
    <View style={cc.card}>
      <View style={cc.header}>
        <Ionicons name={icon} size={16} color={Colors.textSecondary} />
        <Text style={cc.title}>{title}</Text>
        {subtitle ? <Text style={cc.subtitle}>{subtitle}</Text> : null}
      </View>
      {empty ? (
        <Text style={cc.empty}>No data yet</Text>
      ) : children}
    </View>
  );
}
const cc = StyleSheet.create({
  card:     { backgroundColor:Colors.surface, borderRadius:Radius.lg, padding:Spacing.md, ...Shadows.card },
  header:   { flexDirection:'row', alignItems:'center', gap:Spacing.xs, marginBottom:Spacing.md },
  title:    { ...Typography.label, color:Colors.textSecondary, flex:1 },
  subtitle: { ...Typography.bodySmall, color:Colors.textMuted },
  empty:    { ...Typography.bodySmall, color:Colors.textMuted, textAlign:'center', paddingVertical:Spacing.lg },
});

// ─── Exercise progression: pill selector + line chart ────────────────────────
function ExerciseProgression({ sessions }) {
  const [selected, setSelected] = useState(null);
  const { exerciseNames } = computeCharts(sessions); // just for names

  // Build progression data from sessions for the selected exercise
  const progressData = (() => {
    if (!selected) return [];
    const byDate = {};
    sessions.forEach(s => {
      const date = s.started_at.slice(0, 10);
      (s.exercises ?? []).forEach(e => {
        if (e.exercise_name !== selected || e.exercise_type !== 'regular' || !e.weight_kg) return;
        byDate[date] = Math.max(byDate[date] ?? 0, e.weight_kg);
      });
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ label: fmtDate(date), value }));
  })();

  if (!exerciseNames.length) {
    return (
      <ChartCard title="EXERCISE PROGRESSION" icon="trending-up-outline" empty />
    );
  }

  return (
    <ChartCard
      title="EXERCISE PROGRESSION"
      icon="trending-up-outline"
      subtitle={selected ? `${progressData.length} sessions` : ''}
    >
      {/* Pill selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
        <View style={{ flexDirection:'row', gap:Spacing.xs }}>
          {exerciseNames.map(name => (
            <TouchableOpacity
              key={name}
              style={[pill.base, selected === name && pill.active]}
              onPress={() => setSelected(n => n === name ? null : name)}
              activeOpacity={0.8}
            >
              <Text style={[pill.txt, selected === name && pill.activeTxt]} numberOfLines={1}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {selected && progressData.length >= 2 && (
        <LineChart data={progressData} color={Colors.primary} />
      )}
      {selected && progressData.length === 1 && (
        <Text style={{ ...Typography.bodySmall, color:Colors.textMuted, textAlign:'center', paddingVertical:Spacing.lg }}>
          Need at least 2 sessions with {selected} to show progression.
        </Text>
      )}
      {!selected && (
        <Text style={{ ...Typography.bodySmall, color:Colors.textMuted, textAlign:'center', paddingVertical:Spacing.md }}>
          Select an exercise above
        </Text>
      )}
    </ChartCard>
  );
}
const pill = StyleSheet.create({
  base:      { paddingHorizontal:Spacing.md, paddingVertical:Spacing.xs+2, borderRadius:Radius.full, backgroundColor:Colors.surfaceRaised },
  active:    { backgroundColor:Colors.primary },
  txt:       { ...Typography.bodySmall, color:Colors.textSecondary },
  activeTxt: { color:Colors.background, fontWeight:'700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [charts, setCharts]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]     = useState(null);
  const [userEmail, setUserEmail]   = useState('');

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;
      setUserEmail(auth.user.email ?? '');

      const { data: raw } = await supabase
        .from('workout_sessions')
        .select(`
          id, name, started_at, duration_secs,
          workout_exercises (
            exercise_type, exercise_name, body_section, status,
            weight_kg, sets_planned, sets_completed, reps,
            duration_secs, intervals_planned, intervals_done, perf_order
          )
        `)
        .order('started_at', { ascending: false })
        .limit(60);   // 60 sessions covers plenty of history for charts

      if (raw) {
        const shaped = raw.map(s => ({
          ...s,
          exercise_count: s.workout_exercises?.length ?? 0,
          exercises: (s.workout_exercises ?? [])
            .sort((a, b) => (a.perf_order ?? 0) - (b.perf_order ?? 0)),
        }));
        setSessions(shaped);

        const totalSecs = shaped.reduce((sum, s) => sum + (s.duration_secs ?? 0), 0);
        const activeDays = new Set(shaped.map(s => s.started_at.slice(0, 10))).size;
        setStats({ count: shaped.length, totalSecs, activeDays });
        setCharts(computeCharts(shaped));
      }
    } catch (e) {
      console.warn('[Dashboard] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };
  const signOut   = () => supabase.auth.signOut();

  if (loading) return (
    <View style={{ flex:1, backgroundColor:Colors.background, alignItems:'center', justifyContent:'center' }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );

  const hasData = sessions.length > 0;
  const hasVolume = charts?.volumeData?.some(d => d.value > 0);

  return (
    <View style={{ flex:1, backgroundColor:Colors.background }}>
      {/* Header */}
      <View style={[ds.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={ds.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={ds.title}>Dashboard</Text>
        <TouchableOpacity onPress={signOut} style={ds.signOutBtn}>
          <Ionicons name="log-out-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex:1 }}
        contentContainerStyle={[ds.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <Text style={ds.userEmail}>{userEmail}</Text>

        {/* ── Stats ── */}
        {stats && (
          <View style={ds.statsRow}>
            <StatCard icon="barbell-outline" value={stats.count}             label="Sessions"    color={Colors.primary} />
            <StatCard icon="time-outline"     value={fmtDur(stats.totalSecs)} label="Total time"  color={Colors.blue} />
            <StatCard icon="calendar-outline" value={stats.activeDays}        label="Active days" color={Colors.gold} />
          </View>
        )}

        {!hasData && (
          <View style={ds.empty}>
            <Ionicons name="barbell-outline" size={44} color={Colors.textMuted} />
            <Text style={ds.emptyTxt}>No synced sessions yet.{'\n'}Complete a workout to see your dashboard.</Text>
          </View>
        )}

        {hasData && (
          <>
            {/* ── Activity calendar ── */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Activity</Text>
              <View style={cc.card}>
                <ActivityCalendar sessions={sessions} />
              </View>
            </View>

            {/* ── Training frequency ── */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Charts</Text>
              <ChartCard
                title="TRAINING FREQUENCY"
                icon="pulse-outline"
                subtitle="Workouts per week"
                empty={charts?.freqData?.every(d => d.value === 0)}
              >
                {charts?.freqData && (
                  <BarChart
                    data={charts.freqData}
                    color={Colors.blue}
                    valueFormatter={v => v === 0 ? '' : String(v)}
                  />
                )}
              </ChartCard>

              {/* ── Volume trend ── */}
              {hasVolume && (
                <ChartCard
                  title="TOTAL VOLUME"
                  icon="barbell-outline"
                  subtitle="kg lifted per week"
                >
                  <BarChart
                    data={charts.volumeData}
                    color={Colors.primary}
                    valueFormatter={v => v === 0 ? '' : (v > 999 ? `${(v/1000).toFixed(1)}k` : String(v))}
                  />
                </ChartCard>
              )}

              {/* ── Exercise progression ── */}
              <ExerciseProgression sessions={sessions} />
            </View>

            {/* ── Recent sessions ── */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Recent sessions</Text>
              {sessions.slice(0, 20).map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  expanded={expanded === s.id}
                  onPress={() => setExpanded(ex => ex === s.id ? null : s.id)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const ds = StyleSheet.create({
  header:       { flexDirection:'row', alignItems:'center', paddingHorizontal:Spacing.md, paddingBottom:Spacing.sm, borderBottomWidth:1, borderBottomColor:Colors.border },
  backBtn:      { width:40 },
  title:        { ...Typography.h2, color:Colors.textPrimary, flex:1, textAlign:'center' },
  signOutBtn:   { width:40, alignItems:'flex-end' },
  content:      { padding:Spacing.md, gap:Spacing.md },
  userEmail:    { ...Typography.bodySmall, color:Colors.textMuted, textAlign:'center' },
  statsRow:     { flexDirection:'row', gap:Spacing.sm },
  section:      { gap:Spacing.sm },
  sectionTitle: { ...Typography.label, color:Colors.textSecondary, textTransform:'uppercase', letterSpacing:1, fontSize:11 },
  empty:        { alignItems:'center', paddingVertical:Spacing.xxl, gap:Spacing.md },
  emptyTxt:     { ...Typography.body, color:Colors.textMuted, textAlign:'center', lineHeight:22 },
});
