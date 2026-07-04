import React, { useState, useEffect, useCallback } from 'react';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = {
  date: (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  weekday: (iso) => new Date(iso).toLocaleDateString('en', { weekday: 'short' }),
  duration: (secs) => {
    const m = Math.floor(secs / 60);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
  },
};

// ─── Activity calendar (last 10 weeks × 7 days) ───────────────────────────────
function ActivityCalendar({ sessions }) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Build a Set of ISO date strings (YYYY-MM-DD) that had a workout
  const activeDays = new Set(
    sessions.map(s => new Date(s.started_at).toISOString().slice(0, 10))
  );

  // Build 10 weeks of day cells (oldest first)
  const weeks = [];
  const totalDays = 70; // 10 weeks
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);
  startDate.setHours(0, 0, 0, 0);

  let dayList = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dayList.push(d);
  }

  // Pad so first cell is a Monday
  const firstDow = dayList[0].getDay(); // 0=Sun
  const padDays = firstDow === 0 ? 6 : firstDow - 1; // shift to Mon-based
  for (let i = 0; i < padDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() - (padDays - i));
    dayList.unshift(d);
  }

  // Chunk into weeks
  for (let w = 0; w < Math.ceil(dayList.length / 7); w++) {
    weeks.push(dayList.slice(w * 7, w * 7 + 7));
  }

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <View style={cal.container}>
      <View style={cal.labelRow}>
        {DAY_LABELS.map((l, i) => (
          <Text key={i} style={cal.dayLabel}>{l}</Text>
        ))}
      </View>
      <View style={cal.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={cal.weekCol}>
            {week.map((day, di) => {
              const key = day.toISOString().slice(0, 10);
              const isFuture = day > today;
              const isActive = activeDays.has(key);
              return (
                <View
                  key={di}
                  style={[
                    cal.cell,
                    isActive && cal.cellActive,
                    isFuture && cal.cellFuture,
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const CELL = 10;
const cal = StyleSheet.create({
  container: { marginTop: Spacing.sm },
  labelRow: { flexDirection: 'row', marginBottom: 4, paddingLeft: 2 },
  dayLabel: { ...Typography.bodySmall, color: Colors.textMuted, width: CELL + 3, fontSize: 9, textAlign: 'center' },
  grid:     { flexDirection: 'column' },
  weekCol:  { flexDirection: 'row', marginBottom: 3 },
  cell:     { width: CELL, height: CELL, borderRadius: 2, backgroundColor: Colors.surfaceRaised, marginRight: 3 },
  cellActive: { backgroundColor: Colors.primary },
  cellFuture: { opacity: 0.2 },
});

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
  card:  { flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', gap: 4, ...Shadows.card },
  value: { ...Typography.h2, fontWeight: '700' },
  label: { ...Typography.bodySmall, color: Colors.textSecondary, textAlign: 'center' },
});

// ─── Session row ──────────────────────────────────────────────────────────────
function SessionRow({ session, onPress, expanded }) {
  const status = { complete: Colors.gold, partial: Colors.amber, pending: Colors.textMuted };
  return (
    <TouchableOpacity style={sr.card} onPress={onPress} activeOpacity={0.8}>
      <View style={sr.header}>
        <View style={{ flex: 1 }}>
          <Text style={sr.name} numberOfLines={1}>{session.name}</Text>
          <Text style={sr.meta}>
            {fmt.date(session.started_at)} · {fmt.duration(session.duration_secs)}
            {session.exercise_count > 0 ? ` · ${session.exercise_count} exercise${session.exercise_count > 1 ? 's' : ''}` : ''}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </View>

      {expanded && session.exercises?.length > 0 && (
        <View style={sr.exercises}>
          {session.exercises.map((ex, i) => (
            <View key={i} style={sr.exRow}>
              <View style={[sr.dot, { backgroundColor: status[ex.status] ?? Colors.textMuted }]} />
              <View style={{ flex: 1 }}>
                <Text style={sr.exName}>{ex.exercise_name}</Text>
                {ex.body_section ? <Text style={sr.exSub}>{ex.body_section}</Text> : null}
              </View>
              <Text style={sr.exDetail}>{exerciseDetail(ex)}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function exerciseDetail(ex) {
  if (ex.exercise_type === 'regular' && ex.weight_kg != null)
    return `${ex.weight_kg}kg × ${ex.sets_completed ?? ex.sets_planned ?? '?'}×${ex.reps ?? '?'}`;
  if (ex.exercise_type === 'warmup' && ex.duration_secs)
    return formatTime(ex.duration_secs);
  if (ex.exercise_type === 'intervals')
    return `${ex.intervals_done ?? '?'}/${ex.intervals_planned ?? '?'} reps`;
  return '';
}

const sr = StyleSheet.create({
  card:     { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadows.card },
  header:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name:     { ...Typography.h3, color: Colors.textPrimary },
  meta:     { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  exercises:{ marginTop: Spacing.md, gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  exRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  dot:      { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  exName:   { ...Typography.body, color: Colors.textPrimary },
  exSub:    { ...Typography.bodySmall, color: Colors.amber },
  exDetail: { ...Typography.bodySmall, color: Colors.textSecondary, alignSelf: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions]   = useState([]);
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded]   = useState(null);
  const [userEmail, setUserEmail] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) return;
      setUserEmail(auth.user.email ?? '');

      // Recent sessions with exercise details
      const { data: sessionsData } = await supabase
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
        .limit(20);

      if (sessionsData) {
        const shaped = sessionsData.map(s => ({
          ...s,
          exercise_count: s.workout_exercises?.length ?? 0,
          exercises: (s.workout_exercises ?? []).sort((a, b) => (a.perf_order ?? 0) - (b.perf_order ?? 0)),
        }));
        setSessions(shaped);

        // Compute stats client-side
        const totalSecs = shaped.reduce((sum, s) => sum + (s.duration_secs ?? 0), 0);
        const activeDays = new Set(shaped.map(s => s.started_at.slice(0, 10))).size;
        const totalExercises = shaped.reduce((sum, s) => sum + s.exercise_count, 0);
        setStats({ count: shaped.length, totalSecs, activeDays, totalExercises });
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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
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
        style={{ flex: 1 }}
        contentContainerStyle={[ds.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* User */}
        <Text style={ds.userEmail}>{userEmail}</Text>

        {/* Stat cards */}
        {stats && (
          <View style={ds.statsRow}>
            <StatCard icon="barbell-outline"    value={stats.count}         label="Sessions"    color={Colors.primary} />
            <StatCard icon="time-outline"        value={fmt.duration(stats.totalSecs)} label="Total time" color={Colors.blue} />
            <StatCard icon="calendar-outline"    value={stats.activeDays}    label="Active days" color={Colors.gold} />
          </View>
        )}

        {/* Activity calendar */}
        {sessions.length > 0 && (
          <View style={ds.section}>
            <Text style={ds.sectionTitle}>Activity</Text>
            <ActivityCalendar sessions={sessions} />
          </View>
        )}

        {/* Recent sessions */}
        <View style={ds.section}>
          <Text style={ds.sectionTitle}>Recent sessions</Text>
          {sessions.length === 0 ? (
            <View style={ds.empty}>
              <Ionicons name="barbell-outline" size={40} color={Colors.textMuted} />
              <Text style={ds.emptyTxt}>No synced sessions yet.{'\n'}Complete a workout to see it here.</Text>
            </View>
          ) : (
            sessions.map(s => (
              <SessionRow
                key={s.id}
                session={s}
                expanded={expanded === s.id}
                onPress={() => setExpanded(ex => ex === s.id ? null : s.id)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const ds = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:   { width: 40 },
  title:     { ...Typography.h2, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  signOutBtn:{ width: 40, alignItems: 'flex-end' },
  content:   { padding: Spacing.md, gap: Spacing.md },
  userEmail: { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center' },
  statsRow:  { flexDirection: 'row', gap: Spacing.sm },
  section:   { gap: Spacing.sm },
  sectionTitle: { ...Typography.h3, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, fontSize: 12 },
  empty:     { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTxt:  { ...Typography.body, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
