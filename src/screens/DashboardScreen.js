import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, Shadows, IconSize } from '../theme';
import { Icon } from '../components/Icon';
import { supabase } from '../config/supabase';
import { signOut as signOutAccount } from '../hooks/useAuth';
import { PickerModal, PickerField } from '../components/PickerModal';
import {
  fmtDate, fmtDur, fmtVolume,
  shapeSessions, computeStats, computeCharts, computeProgression, computeMetricCharts,
  buildCalendar, exerciseDetail, WEEKDAY_LABELS,
  CALENDAR_DAYS, CHART_WEEKS, SESSION_LIMIT, RECENT_LIMIT,
} from '../utils/analytics';

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
function LineChart({ data, color = Colors.primary, unit = 'kg' }) {
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
              {max}{unit}
            </Text>
            <Text style={{ position: 'absolute', right: 0, bottom: 4, fontSize: 8, color: Colors.textMuted }}>
              {min}{unit}
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
      <Icon name={icon} size={IconSize.row} color={color} />
      <Text style={[st.value, { color }]}>{value}</Text>
      <Text style={st.label}>{label}</Text>
    </View>
  );
}
const st = StyleSheet.create({
  card:  { flexGrow:1, flexBasis:'45%', backgroundColor:Colors.surface, borderRadius:Radius.lg, padding:Spacing.md, alignItems:'center', gap:4, ...Shadows.card },
  value: { ...Typography.h2, fontWeight:'700' },
  label: { ...Typography.bodySmall, color:Colors.textSecondary, textAlign:'center' },
});

// ─── Activity calendar ────────────────────────────────────────────────────────
const CAL_LABEL_COL = 46;
const CAL_GAP = 4;

// Rows are whole Sunday → Saturday weeks, labelled with the week's Sunday.
function ActivityCalendar({ sessions }) {
  const [containerW, setContainerW] = useState(0);
  const weeks = buildCalendar(sessions, CALENDAR_DAYS);

  // Cell spans the remaining width evenly across 7 day columns (+ their gaps),
  // so the grid always fills the card edge-to-edge regardless of screen size.
  const gridW = Math.max(containerW - CAL_LABEL_COL, 0);
  const CELL  = gridW > 0 ? Math.floor((gridW - CAL_GAP * 6) / 7) : 0;

  return (
    <View onLayout={e => setContainerW(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection:'row', marginBottom:6 }}>
        <View style={{ width: CAL_LABEL_COL }} />
        {WEEKDAY_LABELS.map((l,i) => (
          <Text key={i} style={{ width:CELL, marginRight: i<6?CAL_GAP:0, fontSize:10, color:Colors.textMuted, textAlign:'center' }}>{l}</Text>
        ))}
      </View>
      {CELL > 0 && (
        <View style={{ flexDirection:'column' }}>
          {weeks.map((week,wi) => (
            <View key={wi} style={{ flexDirection:'row', alignItems:'center', marginBottom:CAL_GAP }}>
              <Text style={{ width: CAL_LABEL_COL, fontSize:9, color:Colors.textMuted }}>
                {week[0].date.toLocaleDateString('en', { month:'short', day:'numeric' })}
              </Text>
              {week.map((day,di) => (
                <View key={di} style={{
                  width:CELL, height:CELL, borderRadius:4, marginRight: di<6?CAL_GAP:0,
                  backgroundColor: day.active ? Colors.primary : Colors.surfaceRaised,
                  opacity: day.future ? 0.2 : 1,
                }} />
              ))}
            </View>
          ))}
        </View>
      )}
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
        <Icon name={expanded?'chevronUp':'chevronDown'} size={IconSize.meta} color={Colors.textMuted} />
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
              <Text style={sr.exDetail}>{exerciseDetail(e)}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
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
        <Icon name={icon} size={IconSize.meta} color={Colors.textSecondary} />
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
function ExerciseProgression({ sessions, exerciseNames }) {
  const [selected, setSelected] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  // Default to the first exercise, as the web dashboard does, so both open on
  // the same chart instead of one showing an empty prompt.
  useEffect(() => {
    setSelected(prev => prev ?? exerciseNames[0] ?? null);
  }, [exerciseNames]);

  const progressData = computeProgression(sessions, selected);

  if (!exerciseNames.length) {
    return (
      <ChartCard title="Exercise progression" icon="trendUp" empty />
    );
  }

  return (
    <ChartCard
      title="Exercise progression"
      icon="trendUp"
      subtitle="max weight per session"
    >
      <View style={{ marginBottom: Spacing.md }}>
        <PickerField
          label="Exercise"
          value={selected}
          placeholder="Select exercise..."
          onPress={() => setShowPicker(true)}
        />
      </View>
      <PickerModal
        visible={showPicker}
        title="Select Exercise"
        options={exerciseNames}
        selected={selected}
        onSelect={setSelected}
        onClose={() => setShowPicker(false)}
      />

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

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions]     = useState([]);
  const [stats, setStats]           = useState(null);
  const [charts, setCharts]         = useState(null);
  const [metricCharts, setMetricCharts] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]     = useState(null);
  const [userEmail, setUserEmail]   = useState('');

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;
      setUserEmail(auth.user.email ?? '');

      const [{ data: raw }, { data: metricRows }] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select(`
            id, name, started_at, duration_secs,
            workout_exercises (
              exercise_type, exercise_name, body_section, status,
              weight_kg, sets_planned, sets_completed, reps,
              duration_secs, intervals_planned, intervals_done, perf_order,
              cardio_type, speed_kmh, incline_pct
            )
          `)
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
        setCharts(computeCharts(shaped, CHART_WEEKS));
      }
      if (metricRows) setMetricCharts(computeMetricCharts(metricRows, CHART_WEEKS));
    } catch (e) {
      console.warn('[Dashboard] load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };
  const signOut   = () => signOutAccount();

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
          <Icon name="back" size={IconSize.row} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={ds.title}>Dashboard</Text>
        <TouchableOpacity onPress={signOut} style={ds.signOutBtn}>
          <Icon name="signOut" size={IconSize.row} color={Colors.textSecondary} />
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
            <StatCard icon="barbell"  value={stats.count}                  label="Sessions"    color={Colors.primary} />
            <StatCard icon="clock"     value={fmtDur(stats.totalSecs)}      label="Total time"  color={Colors.blue} />
            <StatCard icon="calendar" value={stats.activeDays}             label="Active days" color={Colors.gold} />
            <StatCard icon="trendUp" value={fmtVolume(stats.totalVolume)} label="kg lifted" color={Colors.amber} />
          </View>
        )}

        {!hasData && (
          <View style={ds.empty}>
            <Icon name="barbell" size={IconSize.section} color={Colors.textMuted} />
            <Text style={ds.emptyTxt}>No synced sessions yet.{'\n'}Complete a workout to see your dashboard.</Text>
          </View>
        )}

        {hasData && (
          <>
            {/* ── Activity calendar ── */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Activity — last 10 weeks</Text>
              <View style={cc.card}>
                <ActivityCalendar sessions={sessions} />
              </View>
            </View>

            {/* ── Training frequency ── */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Charts</Text>
              <ChartCard
                title="Training frequency"
                icon="intervals"
                subtitle="workouts per week"
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
                  title="Total volume"
                  icon="barbell"
                  subtitle="kg lifted per week"
                >
                  <BarChart
                    data={charts.volumeData}
                    color={Colors.primary}
                    valueFormatter={v => v === 0 ? '' : fmtVolume(v)}
                  />
                </ChartCard>
              )}

              {/* ── Exercise progression ── */}
              <ExerciseProgression sessions={sessions} exerciseNames={charts?.exerciseNames ?? []} />

              {/* ── Body metrics (weekly averages) ── */}
              {metricCharts?.weightData?.length >= 2 && (
                <ChartCard title="Weight" icon="bodyProfile" subtitle="weekly avg · kg">
                  <LineChart data={metricCharts.weightData} color={Colors.blue} />
                </ChartCard>
              )}
              {metricCharts?.waistData?.length >= 2 && (
                <ChartCard title="Waist" icon="tape" subtitle="weekly avg · cm">
                  <LineChart data={metricCharts.waistData} color={Colors.amber} unit="cm" />
                </ChartCard>
              )}
              {metricCharts?.dietData?.length >= 2 && (
                <ChartCard title="Diet adherence" icon="diet" subtitle="weekly avg · %">
                  <LineChart data={metricCharts.dietData} color={Colors.gold} unit="%" />
                </ChartCard>
              )}
            </View>

            {/* ── Recent sessions ── */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Recent sessions</Text>
              {sessions.slice(0, RECENT_LIMIT).map(s => (
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
  // Four stat cards wrap into a 2×2 grid rather than being squeezed into one
  // row — "12h 05m" needs room to stay on a single line.
  statsRow:     { flexDirection:'row', flexWrap:'wrap', gap:Spacing.sm },
  section:      { gap:Spacing.sm },
  sectionTitle: { ...Typography.label, color:Colors.textSecondary, textTransform:'uppercase', letterSpacing:1, fontSize:11 },
  empty:        { alignItems:'center', paddingVertical:Spacing.xxl, gap:Spacing.md },
  emptyTxt:     { ...Typography.body, color:Colors.textMuted, textAlign:'center', lineHeight:22 },
});
