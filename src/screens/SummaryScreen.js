/**
 * Summary — what the session was worth, in the order you care about it.
 *
 * §7.3. The old screen opened with duration, a completed-count and a start
 * time: three facts you already knew, because you had just lived through them.
 * What it never told you was how much you actually moved, and whether anything
 * you did was a personal best — both computable from data the app already had,
 * and neither of them shown anywhere.
 *
 * So: three numbers, then the gold PR callouts, then the detail. PRs are
 * computed here and nowhere else pays for it.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput,
  ScrollView, StatusBar, useWindowDimensions, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  Colors, Typography, Spacing, Radius, IconSize, Touch, Elevation, onAccent, SCRIM,
} from '../theme';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/States';
import { formatTime } from '../utils/time';
import { EXERCISE_TYPES, CARDIO_TYPES } from '../data/exercises';
import { generateTrainingCsv } from '../utils/generateCsv';
import { upsertSession, generateId } from '../utils/storage';
import { supabase } from '../config/supabase';
import { lbLabel } from '../utils/units';
import {
  sessionFromSummary, deriveSession, deriveAll, shapeSessions,
  computeSessionPRs, fmtTonnes, fmtDur, dayLabel, SESSION_LIMIT,
} from '../utils/analytics';

const STATUS_ICON = {
  complete: { name: 'statusComplete', color: Colors.gold },
  partial:  { name: 'statusPartial',  color: Colors.warn },
  pending:  { name: 'statusPending',  color: Colors.textMuted },
  skipped:  { name: 'statusSkipped',  color: Colors.textMuted },
};

// ─── Detail row ───────────────────────────────────────────────────────────────
function ExerciseRow({ ex, index }) {
  const icon = STATUS_ICON[ex.status] ?? STATUS_ICON.skipped;
  return (
    <View style={r.card}>
      <View style={r.head}>
        <Text style={r.order}>{index + 1}</Text>
        <Icon name={icon.name} size={IconSize.meta} color={icon.color} />
        <Text style={r.name} numberOfLines={1}>{ex.name}</Text>
      </View>

      {ex.type === EXERCISE_TYPES.REGULAR && (
        <View style={r.pills}>
          <Pill label="Sets"   value={`${ex.completedSets}/${ex.plannedSets}`} />
          <Pill label="Weight" value={`${ex.weight} kg`} shadow={ex.weight} />
          <Pill label="Reps"   value={String(ex.reps)} />
        </View>
      )}

      {ex.type === EXERCISE_TYPES.COMBO && (
        <>
          <View style={r.pills}>
            <Pill label="Rounds" value={`${ex.completedSets}/${ex.plannedSets}`} />
          </View>
          {ex.subExercises?.map((sub, i) => (
            <View key={i} style={r.subRow}>
              <Text style={r.subName} numberOfLines={1}>{sub.name}</Text>
              <Text style={r.subStats}>{sub.weight} kg × {sub.reps}</Text>
            </View>
          ))}
        </>
      )}

      {ex.type === EXERCISE_TYPES.WARMUP && (
        <View style={r.pills}>
          <Pill label="Type"     value={ex.warmupType} />
          <Pill label="Duration" value={formatTime(ex.plannedDurationSecs ?? 0)} />
        </View>
      )}

      {ex.type === EXERCISE_TYPES.INTERVALS
        && (ex.cardioType ?? CARDIO_TYPES.INTERVALS) === CARDIO_TYPES.INTERVALS && (
        <View style={r.pills}>
          <Pill label="Reps"     value={`${ex.completedReps}/${ex.plannedReps}`} />
          <Pill label="Interval" value={`${ex.intervalLengthSecs}s`} />
        </View>
      )}

      {ex.type === EXERCISE_TYPES.INTERVALS && ex.cardioType === CARDIO_TYPES.TREADMILL && (
        <View style={r.pills}>
          <Pill label="Duration" value={formatTime(ex.completedDurationSecs ?? ex.plannedDurationSecs ?? 0)} />
          <Pill label="Speed"    value={`${ex.speedKmh} km/h`} />
          <Pill label="Incline"  value={`${ex.inclinePct ?? 0}%`} />
        </View>
      )}

      {ex.type === EXERCISE_TYPES.INTERVALS && ex.cardioType === CARDIO_TYPES.STAIRS && (
        <View style={r.pills}>
          <Pill label="Duration" value={formatTime(ex.completedDurationSecs ?? ex.plannedDurationSecs ?? 0)} />
          <Pill label="Speed"    value={`${ex.speedKmh} km/h`} />
        </View>
      )}
    </View>
  );
}

function Pill({ label, value, shadow }) {
  return (
    <View style={r.pill}>
      <Text style={r.pillLabel}>{label}</Text>
      <Text style={r.pillValue}>{value}</Text>
      {/* A per-exercise weight is exactly the figure §3.5 wants a pound
          reading beside — you might run this session on a foreign rack. */}
      {shadow > 0 ? <Text style={r.pillShadow}>{lbLabel(shadow)}</Text> : null}
    </View>
  );
}

function Tile({ value, label, sub, tone, icon }) {
  return (
    <View style={s.tile}>
      {icon ? <Icon name={icon} size={IconSize.meta} color={tone} /> : null}
      <Text style={[s.tileValue, { color: tone }]} numberOfLines={1}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
      {sub ? <Text style={s.tileSub} numberOfLines={2}>{sub}</Text> : null}
    </View>
  );
}

export default function SummaryScreen({ navigation, route }) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { summary, reusableSession } = route.params ?? {};

  const [downloading, setDownloading]           = useState(false);
  const [showSaveModal, setShowSaveModal]       = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState(reusableSession?.suggestedName ?? '');
  const [savingSession, setSavingSession]       = useState(false);
  const [sessionSaved, setSessionSaved]         = useState(false);
  const [prs, setPrs] = useState(null);   // null = still looking · [] = none

  // This session's own numbers, from the shared engine rather than a second
  // arithmetic implementation living on this screen. The old build had two,
  // which is how it managed to quote two different volumes for one session.
  const derived   = summary ? deriveSession(sessionFromSummary(summary)) : null;
  const derivedId = derived?.id;
  const derivedAt = derived?.startedAt;

  // PRs need history, and history needs the network. Best effort: a session
  // that cannot reach Supabase still shows its volume and time under load, and
  // simply says nothing about records rather than claiming there were none.
  const loadPRs = useCallback(async () => {
    if (!derivedId) return;
    try {
      const { data } = await supabase.from('workout_sessions').select(`
          id, name, started_at, duration_secs, timeline,
          workout_exercises (
            id, parent_id, exercise_type, exercise_name, body_section, status,
            weight_kg, sets_planned, sets_completed, reps, duration_secs,
            perf_order, cardio_type, speed_kmh, incline_pct
          )
        `).order('started_at', { ascending: false }).limit(SESSION_LIMIT);
      if (!data) { setPrs([]); return; }
      // Exclude this session however it got there — once the sync lands it is
      // in the history too, and it must not set a record against itself.
      const history = deriveAll(shapeSessions(data))
        .filter(d => d.id !== derivedId && d.startedAt !== derivedAt);
      setPrs(computeSessionPRs(derived, history));
    } catch (e) {
      console.warn('[Summary] PR lookup failed:', e?.message ?? e);
      setPrs([]);
    }
  }, [derivedId, derivedAt]);

  useEffect(() => { loadPRs(); }, [loadPRs]);

  if (!summary) {
    return (
      <View style={[s.container, { height: windowHeight, justifyContent: 'center' }]}>
        <EmptyState
          icon="emptyHistory"
          title="Nothing to summarise"
          message="This screen opens at the end of a session."
          actionLabel="Back to training"
          onAction={() => navigation.popToTop()}
        />
      </View>
    );
  }

  const saveAsSession = async () => {
    const name = sessionNameInput.trim();
    if (!name) return;
    setSavingSession(true);
    try {
      await upsertSession({
        id: generateId(),
        name,
        exercises: reusableSession.exercises,
        restTimerSecs: reusableSession.restTimerSecs ?? 60,
        createdAt: Date.now(),
      });
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
      const safeName = (summary.sessionName ?? 'training').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const dateStr  = new Date(summary.startTime ?? Date.now()).toISOString().slice(0, 10);
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

  const discarded = summary.saved === false;
  const prCount   = prs?.length ?? 0;

  return (
    <View style={[s.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />

      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Banked ─────────────────────────────────────────────────── */}
        <View style={s.hero}>
          <Icon name={discarded ? 'eyeOff' : 'statusComplete'} size={IconSize.empty}
                color={discarded ? Colors.textMuted : Colors.gold} />
          <Text style={[s.heroTitle, discarded && { color: Colors.textMuted }]}>
            {discarded ? 'SESSION DISCARDED' : 'SESSION BANKED'}
          </Text>
          <Text style={s.heroSub}>
            {summary.sessionName} · {fmtDur(summary.totalDurationSecs)}
          </Text>
          {discarded ? <Text style={s.heroNote}>Not saved to your stats.</Text> : null}
        </View>

        {/* ── The three numbers that matter ──────────────────────────── */}
        <View style={s.tiles}>
          <Tile value={fmtTonnes(derived.volumeKg)} label="VOLUME" tone={Colors.text} />
          <Tile
            value={derived.workSecs != null ? fmtDur(derived.workSecs) : '—'}
            label="UNDER LOAD"
            sub={derived.density != null
              ? `${Math.round(derived.density * 100)}% of session`
              : 'no timed sets'}
            tone={Colors.text}
          />
          <Tile
            value={prs == null ? '·' : String(prCount)}
            label={prCount === 1 ? 'PR' : 'PRS'}
            icon={prCount > 0 ? 'trophy' : null}
            tone={prCount > 0 ? Colors.gold : Colors.textMuted}
          />
        </View>

        {/* ── PR callouts ────────────────────────────────────────────── */}
        {prCount > 0 && (
          <>
            <Text style={s.section}>Personal records</Text>
            {prs.map((p, i) => (
              <View key={`${p.exercise}-${i}`} style={s.prRow}>
                <Icon name="trophy" size={IconSize.row} color={Colors.gold} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.prName} numberOfLines={1}>{p.exercise}</Text>
                  <Text style={s.prSet}>{p.weightKg} kg × {p.reps}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.prE1rm}>{p.e1rm} kg</Text>
                  <Text style={s.prShadow}>{lbLabel(p.e1rm)}</Text>
                  <Text style={s.prGain}>+{p.gain} since {dayLabel(p.sinceDay)}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Detail ─────────────────────────────────────────────────── */}
        <Text style={s.section}>Exercises</Text>
        {summary.exercises.map((ex, idx) => (
          <ExerciseRow key={ex.id} ex={ex} index={idx} />
        ))}
      </ScrollView>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <View style={[s.footerWrap, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
        <View style={s.footerRow}>
          {reusableSession && (
            <TouchableOpacity
              style={[s.ghostBtn, sessionSaved && { borderColor: Colors.gold }]}
              onPress={() => setShowSaveModal(true)}
              activeOpacity={0.8}
              disabled={sessionSaved}
              accessibilityRole="button"
            >
              <Icon name={sessionSaved ? 'statusComplete' : 'save'} size={IconSize.meta}
                    color={sessionSaved ? Colors.gold : Colors.ice} />
              <Text style={[s.ghostTxt, { color: sessionSaved ? Colors.gold : Colors.ice }]}>
                {sessionSaved ? 'Saved' : 'Save as template'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.ghostBtn} onPress={downloadCsv}
                            activeOpacity={0.8} disabled={downloading}
                            accessibilityRole="button">
            {downloading
              ? <ActivityIndicator size="small" color={Colors.ember} />
              : <Icon name="export" size={IconSize.meta} color={Colors.ember} />}
            <Text style={[s.ghostTxt, { color: Colors.ember }]}>Export CSV</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.doneBtn} onPress={() => navigation.popToTop()}
                          activeOpacity={0.85} accessibilityRole="button">
          <Text style={s.doneTxt}>DONE</Text>
        </TouchableOpacity>
      </View>

      {/* ── Save-as-template prompt ──────────────────────────────────── */}
      {showSaveModal && (
        <KeyboardAvoidingView style={s.modalScrim}
                              behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Save as template</Text>
            <Text style={s.modalMsg}>Name it and it joins your session list, ready to run again.</Text>
            <TextInput
              style={s.modalInput}
              value={sessionNameInput}
              onChangeText={setSessionNameInput}
              placeholder="Session name"
              placeholderTextColor={Colors.textFaint}
              autoFocus
              selectTextOnFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowSaveModal(false)}
                                activeOpacity={0.8}>
                <Text style={s.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSave, (!sessionNameInput.trim() || savingSession) && { opacity: 0.5 }]}
                onPress={saveAsSession}
                activeOpacity={0.8}
                disabled={!sessionNameInput.trim() || savingSession}
              >
                {savingSession
                  ? <ActivityIndicator size="small" color={onAccent} />
                  : <Text style={s.modalSaveTxt}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: Colors.base },
  scroll:    { padding: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.sm },

  hero:      { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.lg },
  heroTitle: { ...Typography.h1, color: Colors.gold, letterSpacing: 1 },
  heroSub:   { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  heroNote:  { ...Typography.caption, color: Colors.textFaint, marginTop: Spacing.xs },

  tiles: { flexDirection: 'row', gap: Spacing.sm },
  tile: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    alignItems: 'center', gap: 2, ...Elevation.card,
  },
  tileValue: { ...Typography.statHuge, fontSize: 30, lineHeight: 34 },
  tileLabel: { ...Typography.label, color: Colors.textFaint },
  tileSub:   { ...Typography.caption, color: Colors.textFaint, textAlign: 'center' },

  section: { ...Typography.label, color: Colors.textFaint, marginTop: Spacing.lg },

  prRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.goldDim,
    padding: Spacing.md,
  },
  prName:   { ...Typography.h3, color: Colors.text },
  prSet:    { ...Typography.bodySmall, color: Colors.textMuted },
  prE1rm:   { ...Typography.metric, color: Colors.gold },
  prShadow: { ...Typography.caption, color: Colors.textFaint },
  prGain:   { ...Typography.caption, color: Colors.gold },

  footerWrap: {
    borderTopWidth: 1, borderTopColor: Colors.line,
    backgroundColor: Colors.base,
    padding: Spacing.md, gap: Spacing.sm,
  },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },
  ghostBtn: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: Touch.min,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line,
  },
  ghostTxt: { ...Typography.bodyMedium },
  doneBtn: {
    height: Touch.gym, borderRadius: Radius.md, backgroundColor: Colors.ember,
    alignItems: 'center', justifyContent: 'center',
  },
  doneTxt: { ...Typography.h2, color: onAccent, letterSpacing: 1 },

  modalScrim: {
    ...StyleSheet.absoluteFillObject, backgroundColor: SCRIM,
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  modalBox: {
    width: '100%', maxWidth: 420,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.line,
    padding: Spacing.xl, gap: Spacing.md, ...Elevation.floating,
  },
  modalTitle: { ...Typography.h2, color: Colors.text },
  modalMsg:   { ...Typography.bodySmall, color: Colors.textMuted },
  modalInput: {
    height: Touch.gym, borderRadius: Radius.md, backgroundColor: Colors.raised,
    borderWidth: 1, borderColor: Colors.line,
    paddingHorizontal: Spacing.md, ...Typography.body, color: Colors.text,
  },
  modalBtns: { flexDirection: 'row', gap: Spacing.sm },
  modalCancel: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0, height: Touch.min,
    borderRadius: Radius.md, backgroundColor: Colors.raised,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelTxt: { ...Typography.h3, color: Colors.text },
  modalSave: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0, height: Touch.min,
    borderRadius: Radius.md, backgroundColor: Colors.ember,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveTxt: { ...Typography.h3, color: onAccent },
});

const r = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.line,
    padding: Spacing.md, gap: Spacing.sm,
  },
  head:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  order: { ...Typography.caption, color: Colors.textFaint, width: 16,
           fontVariant: ['tabular-nums'] },
  name:  { ...Typography.h3, color: Colors.text, flex: 1, minWidth: 0 },

  pills: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  pill: {
    backgroundColor: Colors.raised, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    alignItems: 'center', minWidth: 68,
  },
  pillLabel:  { ...Typography.caption, color: Colors.textFaint },
  pillValue:  { ...Typography.metric, color: Colors.text },
  pillShadow: { ...Typography.caption, color: Colors.textFaint },

  subRow:   { flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', gap: Spacing.sm, paddingVertical: 2 },
  subName:  { ...Typography.bodySmall, color: Colors.textMuted, flex: 1, minWidth: 0 },
  subStats: { ...Typography.bodySmall, color: Colors.text, fontVariant: ['tabular-nums'] },
});
