import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { formatTime } from '../utils/time';
import { EXERCISE_TYPES } from '../data/exercises';

const STATUS_ICON = {
  complete: { name: 'checkmark-circle', color: Colors.gold },
  partial:  { name: 'ellipsis-horizontal-circle', color: Colors.amber },
  pending:  { name: 'close-circle-outline', color: Colors.textMuted },
  skipped:  { name: 'remove-circle-outline', color: Colors.textMuted },
};

function ExerciseRow({ ex, index }) {
  const icon = STATUS_ICON[ex.status] ?? STATUS_ICON.skipped;
  return (
    <View style={rowStyles.card}>
      <View style={rowStyles.header}>
        <View style={rowStyles.orderBadge}>
          <Text style={rowStyles.orderNum}>{index + 1}</Text>
        </View>
        <Ionicons name={icon.name} size={20} color={icon.color} />
        <Text style={rowStyles.name} numberOfLines={1}>{ex.name}</Text>
      </View>

      {ex.type === EXERCISE_TYPES.REGULAR && (
        <View style={rowStyles.stats}>
          <StatPill label="Sets" value={`${ex.completedSets}/${ex.plannedSets}`} />
          <StatPill label="Weight" value={`${ex.weight}kg`} />
          <StatPill label="Reps" value={String(ex.reps)} />
        </View>
      )}

      {ex.type === EXERCISE_TYPES.COMBO && (
        <>
          <View style={rowStyles.stats}>
            <StatPill label="Sets" value={`${ex.completedSets}/${ex.plannedSets}`} />
          </View>
          {ex.subExercises?.map((sub, i) => (
            <View key={i} style={rowStyles.subRow}>
              <Text style={rowStyles.subName}>{sub.name}</Text>
              <Text style={rowStyles.subStats}>{sub.weight}kg × {sub.reps} reps</Text>
            </View>
          ))}
        </>
      )}

      {ex.type === EXERCISE_TYPES.WARMUP && (
        <View style={rowStyles.stats}>
          <StatPill label="Type" value={ex.warmupType} />
          <StatPill label="Duration" value={formatTime(ex.plannedDurationSecs ?? 0)} />
        </View>
      )}

      {ex.type === EXERCISE_TYPES.INTERVALS && (
        <View style={rowStyles.stats}>
          <StatPill label="Completed" value={`${ex.completedReps}/${ex.plannedReps} reps`} />
          <StatPill label="Interval" value={`${ex.intervalLengthSecs}s`} />
        </View>
      )}
    </View>
  );
}

function StatPill({ label, value }) {
  return (
    <View style={pillStyles.pill}>
      <Text style={pillStyles.label}>{label}</Text>
      <Text style={pillStyles.value}>{value}</Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  pill: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    alignItems: 'center', minWidth: 64,
  },
  label: { ...Typography.caption, color: Colors.textMuted },
  value: { ...Typography.h3, color: Colors.textPrimary, marginTop: 2 },
});

const rowStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm,
  },
  header:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  orderBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center',
  },
  orderNum: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '700' },
  name:     { ...Typography.h3, color: Colors.textPrimary, flex: 1 },
  stats:    { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  subRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  subName:  { ...Typography.body, color: Colors.textSecondary },
  subStats: { ...Typography.body, color: Colors.textPrimary },
});

export default function SummaryScreen({ navigation, route }) {
  const { height: windowHeight } = useWindowDimensions();
  const { summary } = route.params ?? {};

  if (!summary) {
    return (
      <View style={[styles.container, { height: windowHeight, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: Colors.textSecondary }}>No summary data</Text>
        <TouchableOpacity onPress={() => navigation.popToTop()}>
          <Text style={{ color: Colors.primary, marginTop: Spacing.md }}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const completedCount = summary.exercises.filter(e => e.status === 'complete').length;
  const totalCount     = summary.exercises.length;
  const startDate      = new Date(summary.startTime);

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.title}>Session Complete</Text>
        <Text style={styles.sessionName}>{summary.sessionName}</Text>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatTime(summary.totalDurationSecs)}</Text>
          <Text style={styles.statLabel}>DURATION</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{completedCount}/{totalCount}</Text>
          <Text style={styles.statLabel}>COMPLETED</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statValue}>
            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.statLabel}>STARTED</Text>
        </View>
      </View>

      {/* Exercise list */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>EXERCISES</Text>
        {summary.exercises.map((ex, idx) => (
          <ExerciseRow key={ex.id} ex={ex} index={idx} />
        ))}

        {/* JSON export block (ready for future backend) */}
        <View style={styles.jsonNote}>
          <Ionicons name="cloud-upload-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.jsonNoteText}>Summary ready for sync — backend coming soon</Text>
        </View>
      </ScrollView>

      {/* Home button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.popToTop()}
          activeOpacity={0.8}
        >
          <Ionicons name="home-outline" size={22} color={Colors.background} />
          <Text style={styles.homeBtnTxt}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.background },

  header: {
    alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  trophy:      { fontSize: 48, marginBottom: Spacing.sm },
  title:       { ...Typography.h1, color: Colors.gold },
  sessionName: { ...Typography.body, color: Colors.textSecondary, marginTop: 4 },

  statsBar: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statCell:    { flex: 1, alignItems: 'center', gap: 2 },
  statValue:   { ...Typography.h2, color: Colors.textPrimary },
  statLabel:   { ...Typography.label, color: Colors.textMuted, fontSize: 11 },
  statDivider: { width: 1, backgroundColor: Colors.border },

  listContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  sectionLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.xs },

  jsonNote: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.lg, justifyContent: 'center',
  },
  jsonNoteText: { ...Typography.bodySmall, color: Colors.textMuted },

  footer: {
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  homeBtn: {
    height: 56, borderRadius: Radius.lg, backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    ...Shadows.orange,
  },
  homeBtnTxt: { ...Typography.h3, color: Colors.background, fontWeight: '700' },
});
