/**
 * Exercise detail — the screen the data always supported and nobody built.
 *
 * Reached by tapping an exercise anywhere: a record on the Stats tab, a row in
 * session history. Everything here comes out of the shared analytics module, so
 * it agrees with the dashboard by construction rather than by coincidence.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius, IconSize, Elevation } from '../theme';
import { Icon } from '../components/Icon';
import { ChartCard, LineChart } from '../components/Chart';
import { supabase } from '../config/supabase';
import { lbLabel } from '../utils/units';
import {
  shapeSessions, deriveAll, computeExerciseDetail, dayLabel, fmtVolume, SESSION_LIMIT,
} from '../utils/analytics';

const SECTION_ICON = {
  Chest: 'bodyChest', Back: 'bodyBack', Shoulders: 'bodyShoulders',
  'Front Arms': 'bodyArmsFront', 'Back Arms': 'bodyArmsBack',
  Legs: 'bodyLegs', Core: 'bodyCore', Other: 'bodyOther',
};

function Stat({ label, value, sub }) {
  return (
    <View style={s.statRow}>
      <Text style={s.statLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.statValue}>{value}</Text>
        {sub ? <Text style={s.statSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function ExerciseDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { exercise } = route.params ?? {};
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.from('workout_sessions').select(`
          id, name, started_at, duration_secs, timeline,
          workout_exercises (
            id, parent_id, exercise_type, exercise_name, body_section, status,
            weight_kg, sets_planned, sets_completed, reps, duration_secs,
            perf_order, cardio_type, speed_kmh, incline_pct
          )
        `).order('started_at', { ascending: false }).limit(SESSION_LIMIT);
      if (data) setDetail(computeExerciseDetail(deriveAll(shapeSessions(data)), exercise));
    } catch (e) {
      console.warn('[ExerciseDetail] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [exercise]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: Colors.base, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.ember} size="large" />
    </View>
  );

  const d = detail;
  const section = d?.bestSet?.bodySection;
  const gainUp = d?.e1rmGain != null && d.e1rmGain > 0;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.base }}>
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}
                          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="back" size={IconSize.row} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{exercise}</Text>
          {section ? <Text style={s.sub}>{section}</Text> : null}
        </View>
        {section ? (
          <Icon name={SECTION_ICON[section] ?? 'bodyOther'} size={IconSize.section} color={Colors.ember} />
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>
        {!d || d.sessions === 0 ? (
          <View style={s.empty}>
            <Icon name="emptyChart" size={IconSize.empty} color={Colors.textFaint} />
            <Text style={s.emptyTxt}>No recorded sets for this exercise yet.</Text>
          </View>
        ) : (
          <>
            <View style={s.hero}>
              <View style={{ flex: 1 }}>
                <Text style={s.heroLabel}>Estimated 1RM</Text>
                <Text style={s.heroValue}>
                  {d.e1rmNow ?? '—'}<Text style={s.heroUnit}> kg</Text>
                </Text>
                {d.e1rmNow != null ? (
                  <Text style={s.heroShadow}>{lbLabel(d.e1rmNow)}</Text>
                ) : null}
              </View>
              {d.e1rmGain != null && d.e1rmGain !== 0 ? (
                <View style={s.gain}>
                  <Icon name={gainUp ? 'trendUp' : 'trendDown'} size={IconSize.meta}
                        color={gainUp ? Colors.gold : Colors.warn} />
                  <Text style={[s.gainTxt, { color: gainUp ? Colors.gold : Colors.warn }]}>
                    {gainUp ? '+' : '−'}{Math.abs(d.e1rmGain)} kg
                  </Text>
                </View>
              ) : null}
            </View>

            {d.progression.length >= 2 && (
              <ChartCard title="Progression" icon="trendUp" subtitle={`${d.sessions} sessions`}>
                <LineChart
                  data={d.progression}
                  secondary={d.progression.map(p => ({ ...p, value: p.raw }))}
                  color={Colors.ember}
                  format={v => String(Math.round(v))}
                />
                <Text style={s.note}>Solid: estimated 1RM. Dashed: the heaviest set it came from.</Text>
              </ChartCard>
            )}

            <View style={s.card}>
              <Stat
                label="Best set"
                value={d.bestSet ? `${d.bestSet.weightKg} kg × ${d.bestSet.reps}` : '—'}
                sub={d.bestSet ? dayLabel(d.bestSet.dayKey) : undefined}
              />
              <Stat
                label="Last"
                value={d.last ? `${d.last.weightKg} kg × ${d.last.reps}` : '—'}
                sub={d.last ? dayLabel(d.last.dayKey) : undefined}
              />
              <Stat label="Sessions" value={String(d.sessions)} />
            </View>

            <Text style={s.section}>History</Text>
            {d.history.map((h, i) => (
              <View key={`${h.dayKey}-${i}`} style={s.histRow}>
                <Text style={s.histDate}>{h.label}</Text>
                <Text style={s.histSet}>{h.weightKg} kg × {h.reps}</Text>
                <Text style={s.histE1rm}>{h.e1rm} e1RM</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  back:  { paddingRight: Spacing.xs },
  title: { ...Typography.h1, color: Colors.text },
  sub:   { ...Typography.bodySmall, color: Colors.textMuted },

  content: { padding: Spacing.md, gap: Spacing.sm },
  section: { ...Typography.label, color: Colors.textFaint, marginTop: Spacing.lg },
  note:    { ...Typography.caption, color: Colors.textFaint, marginTop: Spacing.sm },

  hero: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.md, ...Elevation.card,
  },
  heroLabel:  { ...Typography.label, color: Colors.textFaint },
  heroValue:  { ...Typography.statHuge, color: Colors.text, marginTop: 2 },
  heroUnit:   { ...Typography.h3, color: Colors.textMuted },
  heroShadow: { ...Typography.caption, color: Colors.textFaint },
  gain:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  gainTxt:    { ...Typography.metric },

  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, ...Elevation.card },
  statRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  statLabel: { ...Typography.label, color: Colors.textFaint },
  statValue: { ...Typography.metric, color: Colors.text },
  statSub:   { ...Typography.caption, color: Colors.textFaint },

  histRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    ...Elevation.card,
  },
  histDate:  { ...Typography.caption, color: Colors.textMuted, width: 62 },
  histSet:   { ...Typography.bodySmall, color: Colors.text, flex: 1 },
  histE1rm:  { ...Typography.caption, color: Colors.ember },

  empty:    { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyTxt: { ...Typography.bodySmall, color: Colors.textFaint, textAlign: 'center' },
});
