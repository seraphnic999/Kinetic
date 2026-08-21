import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput,
  ScrollView, StatusBar, useWindowDimensions, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { formatTime } from '../utils/time';
import { EXERCISE_TYPES } from '../data/exercises';
import { generateTrainingCsv } from '../utils/generateCsv';
import { loadSessions, saveSessions, generateId } from '../utils/storage';

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
  const insets = useSafeAreaInsets();
  const { summary, reusableSession } = route.params ?? {};

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

  const [downloading, setDownloading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState(reusableSession?.suggestedName ?? '');
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);

  const saveAsSession = async () => {
    const name = sessionNameInput.trim();
    if (!name) return;
    setSavingSession(true);
    try {
      const newSession = {
        id: generateId(),
        name,
        exercises: reusableSession.exercises,
        restTimerSecs: reusableSession.restTimerSecs ?? 60,
        createdAt: Date.now(),
      };
      const sessions = await loadSessions();
      await saveSessions([...sessions, newSession]);
      setSessionSaved(true);
      setShowSaveModal(false);
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? String(e));
    } finally {
      setSavingSession(false);
    }
  };

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      const csv = generateTrainingCsv(summary);
      const safeName = (summary.sessionName ?? 'training')
        .replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const dateStr = new Date(summary.startTime ?? Date.now())
        .toISOString().slice(0, 10);
      const filename = `kinetic_${safeName}_${dateStr}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, filename);
        file.write(csv);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Save training report' });
        } else {
          Alert.alert('Sharing not available', 'Cannot open the share sheet on this device.');
        }
      }
    } catch (e) {
      Alert.alert('Export failed', e?.message ?? String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.title}>Session Complete</Text>
        <Text style={styles.sessionName}>{summary.sessionName}</Text>
        {summary.saved === false && (
          <View style={styles.discardedBadge}>
            <Ionicons name="eye-off-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.discardedBadgeTxt}>Not saved to your stats</Text>
          </View>
        )}
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

      {/* Footer */}
      <View style={[styles.footerWrap, { paddingBottom: Math.max(insets.bottom, Spacing.lg) }]}>
        {reusableSession && (
          <TouchableOpacity
            style={[styles.saveSessionBtn, sessionSaved && styles.saveSessionBtnDone]}
            onPress={() => setShowSaveModal(true)}
            activeOpacity={0.8}
            disabled={sessionSaved}
          >
            <Ionicons
              name={sessionSaved ? 'checkmark-circle' : 'bookmark-outline'}
              size={20}
              color={sessionSaved ? Colors.gold : Colors.blue}
            />
            <Text style={[styles.saveSessionBtnTxt, sessionSaved && { color: Colors.gold }]}>
              {sessionSaved ? 'Saved as Session' : 'Save as Session'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.csvBtn}
            onPress={downloadCsv}
            activeOpacity={0.8}
            disabled={downloading}
          >
            {downloading
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="download-outline" size={20} color={Colors.primary} />
            }
            <Text style={styles.csvBtnTxt}>Download CSV</Text>
          </TouchableOpacity>
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

      {/* Save-as-Session name prompt */}
      {showSaveModal && (
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Save as Session</Text>
            <Text style={styles.modalMsg}>Give this session a name so you can reuse it later.</Text>
            <TextInput
              style={styles.modalInput}
              value={sessionNameInput}
              onChangeText={setSessionNameInput}
              placeholder="Session name"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowSaveModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, (!sessionNameInput.trim() || savingSession) && { opacity: 0.5 }]}
                onPress={saveAsSession}
                activeOpacity={0.8}
                disabled={!sessionNameInput.trim() || savingSession}
              >
                {savingSession
                  ? <ActivityIndicator size="small" color={Colors.background} />
                  : <Text style={styles.modalSaveTxt}>Save</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
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
  discardedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: Spacing.sm, backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
  },
  discardedBadgeTxt: { ...Typography.caption, color: Colors.textMuted },

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

  footerWrap: {
    borderTopWidth: 1, borderTopColor: Colors.border,
    padding: Spacing.md, gap: Spacing.sm,
  },
  footer: {
    flexDirection: 'row', gap: Spacing.sm,
  },
  saveSessionBtn: {
    height: 48, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.blue,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  saveSessionBtnDone: { borderColor: Colors.gold, backgroundColor: `${Colors.gold}18` },
  saveSessionBtnTxt: { ...Typography.h3, color: Colors.blue, fontWeight: '700' },

  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  },
  modalBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.xl, margin: Spacing.xl, gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, alignSelf: 'stretch', ...Shadows.card,
  },
  modalTitle: { ...Typography.h2, color: Colors.textPrimary, textAlign: 'center' },
  modalMsg:   { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  modalInput: {
    height: 48, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: Spacing.md, ...Typography.body, color: Colors.textPrimary,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  modalCancelBtn: {
    flex: 1, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center',
  },
  modalCancelTxt: { ...Typography.h3, color: Colors.textSecondary },
  modalSaveBtn: {
    flex: 1, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  modalSaveTxt: { ...Typography.h3, color: Colors.background, fontWeight: '700' },
  csvBtn: {
    flex: 1, height: 56, borderRadius: Radius.lg,
    borderWidth: 2, borderColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  csvBtnTxt:  { ...Typography.h3, color: Colors.primary, fontWeight: '700' },
  homeBtn: {
    flex: 1, height: 56, borderRadius: Radius.lg, backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    ...Shadows.orange,
  },
  homeBtnTxt: { ...Typography.h3, color: Colors.background, fontWeight: '700' },
});
