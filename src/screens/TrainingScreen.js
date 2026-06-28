import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, StatusBar, FlatList, useWindowDimensions,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows, DIGITAL_FONT } from '../theme';
import { formatTime } from '../utils/time';
import { initAudio, loadSounds, unloadSounds, playRestBeep, playIntervalBeep } from '../utils/sounds';
import { EXERCISE_TYPES } from '../data/exercises';
import { Stepper } from '../components/Stepper';

// ─── Constants ────────────────────────────────────────────────────────────────
const WALK_DURATION   = 60;   // seconds, always
const TRANS_DURATION  = 10;   // seconds, always

const PHASE = {
  WALKING:      'walking',
  TRANS_IN:     'trans_in',   // walking → running
  RUNNING:      'running',
  TRANS_OUT:    'trans_out',  // running → walking
};

const PHASE_LABEL = {
  [PHASE.WALKING]:  'WALKING',
  [PHASE.TRANS_IN]: 'TRANSITION',
  [PHASE.RUNNING]:  'RUNNING',
  [PHASE.TRANS_OUT]:'TRANSITION',
};

const PHASE_COLOR = {
  [PHASE.WALKING]:  Colors.blue,
  [PHASE.TRANS_IN]: Colors.amber,
  [PHASE.RUNNING]:  Colors.primary,
  [PHASE.TRANS_OUT]:Colors.amber,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getExerciseName = (ex) => {
  if (!ex) return '';
  if (ex.type === EXERCISE_TYPES.WARMUP)    return `Warmup — ${ex.warmupType}`;
  if (ex.type === EXERCISE_TYPES.INTERVALS) return 'Intervals';
  if (ex.type === EXERCISE_TYPES.COMBO)     return ex.name || 'Combo';
  return ex.name === 'Other' ? (ex.customName || 'Exercise') : (ex.name || 'Exercise');
};

const initExerciseStates = (exercises) => {
  const s = {};
  exercises.forEach(ex => {
    if (ex.type === EXERCISE_TYPES.REGULAR) {
      s[ex.id] = { setsLeft: ex.sets, setsCompleted: 0, weight: ex.weight, reps: ex.reps, status: 'pending' };
    } else if (ex.type === EXERCISE_TYPES.COMBO) {
      s[ex.id] = {
        setsLeft: ex.sets, setsCompleted: 0, status: 'pending',
        subWeights: ex.subExercises.map(s => s.weight),
        subReps:    ex.subExercises.map(s => s.reps),
      };
    } else if (ex.type === EXERCISE_TYPES.WARMUP) {
      s[ex.id] = { timeLeft: ex.duration * 60, isRunning: false, status: 'pending' };
    } else if (ex.type === EXERCISE_TYPES.INTERVALS) {
      s[ex.id] = {
        repsLeft: ex.reps, reps: ex.reps,
        intervalLength: ex.intervalLength,
        phase: null, timeLeft: 0, isRunning: false, status: 'pending',
      };
    }
  });
  return s;
};

// ─── Sub-component: Status icon ───────────────────────────────────────────────
function StatusDot({ status }) {
  if (status === 'complete') return <Ionicons name="checkmark-circle" size={22} color={Colors.gold} />;
  if (status === 'partial')  return <Ionicons name="ellipsis-horizontal-circle" size={22} color={Colors.amber} />;
  return <View style={dotStyles.empty} />;
}
const dotStyles = StyleSheet.create({
  empty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border },
});

// ─── Sub-component: Regular / Combo detail ────────────────────────────────────
function RegularDetail({ exercise, state, onUpdate, onSetDone, onBack }) {
  const isComplete = state.setsLeft === 0;
  return (
    <View style={detailStyles.container}>
      <Text style={detailStyles.name}>{getExerciseName(exercise)}</Text>
      <Text style={detailStyles.subtitle}>{exercise.bodySection}</Text>

      <View style={detailStyles.stepperRow}>
        <Stepper size="large" label="WEIGHT (kg)"
          value={state.weight} min={0} max={500}
          onChange={v => onUpdate({ weight: v })} />
        <Stepper size="large" label="SETS LEFT"
          value={state.setsLeft} min={0} max={99}
          onChange={v => onUpdate({ setsLeft: v })} />
        <Stepper size="large" label="REPS"
          value={state.reps} min={1} max={999}
          onChange={v => onUpdate({ reps: v })} />
      </View>

      {isComplete ? (
        <View style={detailStyles.completeBadge}>
          <Ionicons name="checkmark-circle" size={28} color={Colors.gold} />
          <Text style={detailStyles.completeText}>Set Complete!</Text>
        </View>
      ) : (
        <TouchableOpacity style={detailStyles.setDoneBtn} onPress={onSetDone} activeOpacity={0.8}>
          <Ionicons name="checkmark" size={26} color={Colors.background} />
          <Text style={detailStyles.setDoneTxt}>SET DONE</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={detailStyles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={detailStyles.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

function ComboDetail({ exercise, state, onUpdate, onSetDone, onBack }) {
  const isComplete = state.setsLeft === 0;
  return (
    <View style={detailStyles.container}>
      <Text style={detailStyles.name}>🔗 {getExerciseName(exercise)}</Text>

      <View style={detailStyles.stepperRow}>
        <Stepper size="large" label="SETS LEFT"
          value={state.setsLeft} min={0} max={99}
          onChange={v => onUpdate({ setsLeft: v })} />
      </View>

      <ScrollView style={detailStyles.comboScroll} showsVerticalScrollIndicator={false}>
        {exercise.subExercises.map((sub, idx) => {
          const subName = sub.name === 'Other' ? (sub.customName || `Exercise ${idx+1}`) : (sub.name || `Exercise ${idx+1}`);
          return (
            <View key={sub.id} style={detailStyles.subCard}>
              <Text style={detailStyles.subName}>{subName}</Text>
              <Text style={detailStyles.subSection}>{sub.bodySection}</Text>
              <View style={detailStyles.stepperRow}>
                <Stepper size="large" label="WEIGHT (kg)"
                  value={state.subWeights[idx]} min={0} max={500}
                  onChange={v => {
                    const sw = [...state.subWeights]; sw[idx] = v;
                    onUpdate({ subWeights: sw });
                  }} />
                <Stepper size="large" label="REPS"
                  value={state.subReps[idx]} min={1} max={999}
                  onChange={v => {
                    const sr = [...state.subReps]; sr[idx] = v;
                    onUpdate({ subReps: sr });
                  }} />
              </View>
            </View>
          );
        })}
      </ScrollView>

      {isComplete ? (
        <View style={detailStyles.completeBadge}>
          <Ionicons name="checkmark-circle" size={28} color={Colors.gold} />
          <Text style={detailStyles.completeText}>Combo Complete!</Text>
        </View>
      ) : (
        <TouchableOpacity style={detailStyles.setDoneBtn} onPress={onSetDone} activeOpacity={0.8}>
          <Ionicons name="git-merge-outline" size={22} color={Colors.background} />
          <Text style={detailStyles.setDoneTxt}>COMBO SET DONE</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={detailStyles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={detailStyles.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Sub-component: Warmup detail ─────────────────────────────────────────────
function WarmupDetail({ exercise, state, onToggle, onBack }) {
  const isRunning = state.isRunning;
  const isComplete = state.status === 'complete';
  return (
    <View style={detailStyles.container}>
      <Text style={detailStyles.name}>🔥 Warmup</Text>
      <Text style={detailStyles.subtitle}>{exercise.warmupType}</Text>

      <View style={warmupStyles.timerBlock}>
        <Text style={warmupStyles.timer}>{formatTime(state.timeLeft)}</Text>
        <Text style={warmupStyles.timerLabel}>
          {isComplete ? 'DONE' : isRunning ? 'RUNNING' : 'PAUSED'}
        </Text>
      </View>

      {!isComplete && (
        <TouchableOpacity
          style={[detailStyles.setDoneBtn, isRunning && { backgroundColor: Colors.amber }]}
          onPress={onToggle}
          activeOpacity={0.8}
        >
          <Ionicons name={isRunning ? 'pause' : 'play'} size={26} color={Colors.background} />
          <Text style={detailStyles.setDoneTxt}>{isRunning ? 'PAUSE' : 'START'}</Text>
        </TouchableOpacity>
      )}

      {isComplete && (
        <View style={detailStyles.completeBadge}>
          <Ionicons name="checkmark-circle" size={28} color={Colors.gold} />
          <Text style={detailStyles.completeText}>Warmup Complete!</Text>
        </View>
      )}

      <TouchableOpacity style={detailStyles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={detailStyles.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

const warmupStyles = StyleSheet.create({
  timerBlock: { alignItems: 'center', marginVertical: Spacing.xl },
  timer: {
    fontFamily: DIGITAL_FONT,
    fontSize: 72, color: Colors.amber,
    letterSpacing: 4,
  },
  timerLabel: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.sm },
});

// ─── Sub-component: Intervals detail ─────────────────────────────────────────
function IntervalsDetail({ exercise, state, onToggle, onUpdateReps, onBack }) {
  const { repsLeft, phase, timeLeft, isRunning, status } = state;
  const isComplete = status === 'complete';
  const notStarted = phase === null;
  const phaseColor = phase ? PHASE_COLOR[phase] : Colors.textMuted;
  const phaseLabel = phase ? PHASE_LABEL[phase] : 'READY';

  return (
    <View style={detailStyles.container}>
      <Text style={detailStyles.name}>⚡ Intervals</Text>

      {/* Reps remaining */}
      <View style={intervalStyles.repsRow}>
        <Text style={intervalStyles.repsLabel}>REPS REMAINING</Text>
        <Stepper size="large" label=""
          value={repsLeft} min={0} max={99}
          onChange={onUpdateReps} />
      </View>

      {/* Phase indicator */}
      <View style={[intervalStyles.phaseBlock, { borderColor: phaseColor }]}>
        <Text style={[intervalStyles.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
        <Text style={[intervalStyles.timer, { color: phaseColor }]}>
          {notStarted ? formatTime(WALK_DURATION) : formatTime(timeLeft)}
        </Text>
      </View>

      {!isComplete && (
        <TouchableOpacity
          style={[detailStyles.setDoneBtn, isRunning && { backgroundColor: Colors.amber }]}
          onPress={onToggle}
          activeOpacity={0.8}
        >
          <Ionicons name={isRunning ? 'pause' : 'play'} size={26} color={Colors.background} />
          <Text style={detailStyles.setDoneTxt}>{isRunning ? 'PAUSE' : (notStarted ? 'START' : 'RESUME')}</Text>
        </TouchableOpacity>
      )}

      {isComplete && (
        <View style={detailStyles.completeBadge}>
          <Ionicons name="checkmark-circle" size={28} color={Colors.gold} />
          <Text style={detailStyles.completeText}>Intervals Complete!</Text>
        </View>
      )}

      <TouchableOpacity style={detailStyles.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={detailStyles.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

const intervalStyles = StyleSheet.create({
  repsRow: { alignItems: 'center', marginBottom: Spacing.xl },
  repsLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.sm },
  phaseBlock: {
    alignItems: 'center', borderWidth: 2, borderRadius: Radius.lg,
    padding: Spacing.xl, marginBottom: Spacing.xl,
  },
  phaseLabel: { ...Typography.h2, marginBottom: Spacing.sm },
  timer: {
    fontFamily: DIGITAL_FONT, fontSize: 64, letterSpacing: 4,
  },
});

// ─── Shared detail styles ─────────────────────────────────────────────────────
const detailStyles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  name:      { ...Typography.h1, color: Colors.textPrimary },
  subtitle:  { ...Typography.body, color: Colors.textSecondary, marginTop: -Spacing.sm },
  stepperRow: { flexDirection: 'row', gap: Spacing.md, justifyContent: 'space-around', marginVertical: Spacing.md },
  setDoneBtn: {
    height: 64, borderRadius: Radius.lg, backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    ...Shadows.orange,
  },
  setDoneTxt: { ...Typography.h2, color: Colors.background, fontWeight: '800' },
  completeBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg },
  completeText:  { ...Typography.h2, color: Colors.gold },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.md,
  },
  backTxt: { ...Typography.body, color: Colors.textSecondary },
  comboScroll: { flex: 1, maxHeight: 260 },
  subCard: {
    backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  subName:    { ...Typography.h3, color: Colors.textPrimary },
  subSection: { ...Typography.bodySmall, color: Colors.amber },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TrainingScreen({ navigation, route }) {
  useKeepAwake();

  const { session } = route.params ?? {};
  const { height: windowHeight } = useWindowDimensions();

  // ── Session timer (counts up, always running) ──
  const [elapsedSec, setElapsedSec] = useState(0);

  // ── Rest timer ──
  const [restSec, setRestSec]       = useState(session?.restTimerSecs ?? 60);
  const [restActive, setRestActive] = useState(false);
  const restSecRef = useRef(session?.restTimerSecs ?? 60);

  // ── Navigation ──
  const [selectedId, setSelectedId] = useState(null);

  // ── Exercise states ──
  const [exStates, setExStates] = useState(() => initExerciseStates(session?.exercises ?? []));

  // ── Performance order (list of ids in order first worked) ──
  const [perfOrder, setPerfOrder] = useState([]);

  // ── Session start time ──
  const [startTime] = useState(new Date());

  // Ref copies for use inside timer callbacks (avoid stale closures)
  const exStatesRef = useRef(exStates);
  useEffect(() => { exStatesRef.current = exStates; }, [exStates]);

  const restActiveRef = useRef(restActive);
  useEffect(() => { restActiveRef.current = restActive; }, [restActive]);

  // ─── Load sounds on mount ────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await initAudio();
      await loadSounds();
    })();
    return () => { unloadSounds(); };
  }, []);

  // ─── Session timer ───────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Rest timer countdown ────────────────────────────────────────────────
  useEffect(() => {
    restSecRef.current = restSec;
  }, [restSec]);

  useEffect(() => {
    if (!restActive) return;
    const id = setInterval(() => {
      if (restSecRef.current <= 1) {
        playRestBeep();
        setRestSec(session?.restTimerSecs ?? 60);
        setRestActive(false);
      } else {
        setRestSec(s => s - 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [restActive]);

  // ─── Warmup timer ────────────────────────────────────────────────────────
  const warmupExercise = useMemo(
    () => session?.exercises?.find(e => e.type === EXERCISE_TYPES.WARMUP),
    [session]
  );

  const warmupStateRef = useRef(null);
  useEffect(() => {
    if (warmupExercise) warmupStateRef.current = exStates[warmupExercise.id];
  }, [exStates, warmupExercise]);

  useEffect(() => {
    const wu = warmupExercise;
    if (!wu) return;
    const state = exStates[wu.id];
    if (!state?.isRunning) return;

    const id = setInterval(() => {
      const cur = warmupStateRef.current;
      if (!cur?.isRunning) return;

      if (cur.timeLeft <= 1) {
        playIntervalBeep();
        setExStates(prev => ({
          ...prev,
          [wu.id]: { ...prev[wu.id], timeLeft: 0, isRunning: false, status: 'complete' },
        }));
        addToPerfOrder(wu.id);
        setSelectedId(null);
      } else {
        setExStates(prev => ({
          ...prev,
          [wu.id]: { ...prev[wu.id], timeLeft: prev[wu.id].timeLeft - 1 },
        }));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [exStates[warmupExercise?.id]?.isRunning]);

  // ─── Intervals timer ─────────────────────────────────────────────────────
  const intervalsExercise = useMemo(
    () => session?.exercises?.find(e => e.type === EXERCISE_TYPES.INTERVALS),
    [session]
  );

  const intervalsStateRef = useRef(null);
  useEffect(() => {
    if (intervalsExercise) intervalsStateRef.current = exStates[intervalsExercise.id];
  }, [exStates, intervalsExercise]);

  useEffect(() => {
    const iv = intervalsExercise;
    if (!iv) return;
    const state = exStates[iv.id];
    if (!state?.isRunning) return;

    const id = setInterval(() => {
      const cur = intervalsStateRef.current;
      if (!cur?.isRunning) return;

      if (cur.timeLeft <= 1) {
        // Phase transition
        advanceIntervalsPhase(iv.id, cur);
      } else {
        setExStates(prev => ({
          ...prev,
          [iv.id]: { ...prev[iv.id], timeLeft: prev[iv.id].timeLeft - 1 },
        }));
      }
    }, 1000);

    return () => clearInterval(id);
  }, [exStates[intervalsExercise?.id]?.isRunning]);

  const advanceIntervalsPhase = useCallback((id, cur) => {
    playIntervalBeep();
    setExStates(prev => {
      const st = prev[id];
      let next;
      switch (st.phase) {
        case PHASE.WALKING:
          next = { ...st, phase: PHASE.TRANS_IN, timeLeft: TRANS_DURATION };
          break;
        case PHASE.TRANS_IN:
          next = { ...st, phase: PHASE.RUNNING, timeLeft: st.intervalLength };
          break;
        case PHASE.RUNNING:
          next = { ...st, phase: PHASE.TRANS_OUT, timeLeft: TRANS_DURATION };
          break;
        case PHASE.TRANS_OUT: {
          const newReps = st.repsLeft - 1;
          if (newReps <= 0) {
            // All intervals done
            setTimeout(() => {
              addToPerfOrder(id);
              setSelectedId(null);
            }, 300);
            next = { ...st, repsLeft: 0, phase: PHASE.TRANS_OUT, timeLeft: 0, isRunning: false, status: 'complete' };
          } else {
            next = { ...st, repsLeft: newReps, phase: PHASE.WALKING, timeLeft: WALK_DURATION };
          }
          break;
        }
        default:
          next = st;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const addToPerfOrder = useCallback((id) => {
    setPerfOrder(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const activateRestTimer = useCallback(() => {
    setRestSec(session?.restTimerSecs ?? 60);
    setRestActive(true);
  }, [session]);

  // ─── Check if all exercises complete ─────────────────────────────────────
  useEffect(() => {
    if (!session?.exercises?.length) return;
    const allDone = session.exercises.every(e => exStates[e.id]?.status === 'complete');
    if (allDone) {
      setTimeout(() => {
        Alert.alert(
          '🏆 Session Complete!',
          'You finished all exercises. End the session?',
          [
            { text: 'Keep Going', style: 'cancel' },
            { text: 'End Session', style: 'default', onPress: endSession },
          ]
        );
      }, 500);
    }
  }, [exStates]);

  // ─── End session ─────────────────────────────────────────────────────────
  const endSession = useCallback(() => {
    const endTime = new Date();
    const allIds = session?.exercises?.map(e => e.id) ?? [];
    const remainingIds = allIds.filter(id => !perfOrder.includes(id));
    const orderedIds = [...perfOrder, ...remainingIds];

    const summaryData = {
      sessionName: session?.name ?? 'Session',
      sessionId:   session?.id ?? '',
      startTime:   startTime.toISOString(),
      endTime:     endTime.toISOString(),
      totalDurationSecs: elapsedSec,
      exercises: orderedIds.map((id, idx) => {
        const ex  = session.exercises.find(e => e.id === id);
        const st  = exStates[id];
        const base = { id, type: ex.type, name: getExerciseName(ex), status: st.status, performanceOrder: idx };
        if (ex.type === EXERCISE_TYPES.REGULAR) {
          return { ...base, weight: st.weight, reps: st.reps, plannedSets: ex.sets, completedSets: st.setsCompleted };
        }
        if (ex.type === EXERCISE_TYPES.COMBO) {
          return { ...base, plannedSets: ex.sets, completedSets: st.setsCompleted,
            subExercises: ex.subExercises.map((s, i) => ({
              name: s.name === 'Other' ? s.customName : s.name,
              weight: st.subWeights[i], reps: st.subReps[i],
            })) };
        }
        if (ex.type === EXERCISE_TYPES.WARMUP) {
          return { ...base, warmupType: ex.warmupType, plannedDurationSecs: ex.duration * 60 };
        }
        if (ex.type === EXERCISE_TYPES.INTERVALS) {
          return { ...base, plannedReps: ex.reps, completedReps: ex.reps - st.repsLeft, intervalLengthSecs: ex.intervalLength };
        }
        return base;
      }),
    };

    navigation.replace('Summary', { summary: summaryData });
  }, [elapsedSec, exStates, perfOrder, session, startTime, navigation]);

  const confirmEnd = useCallback(() => {
    Alert.alert(
      'End Session?',
      'Are you sure you want to end this training session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: endSession },
      ]
    );
  }, [endSession]);

  // ─── Exercise selection ───────────────────────────────────────────────────
  const selectExercise = useCallback((id) => {
    addToPerfOrder(id);
    setSelectedId(id);
  }, [addToPerfOrder]);

  const goBackToList = useCallback((exerciseId) => {
    // Update status when navigating back (partial if started, unchanged if untouched)
    if (exerciseId) {
      setExStates(prev => {
        const st = prev[exerciseId];
        if (!st || st.status === 'complete') return prev;
        const ex = session.exercises.find(e => e.id === exerciseId);
        if (!ex) return prev;
        if (ex.type === EXERCISE_TYPES.REGULAR || ex.type === EXERCISE_TYPES.COMBO) {
          const status = st.setsCompleted > 0 ? 'partial' : 'pending';
          return { ...prev, [exerciseId]: { ...st, status } };
        }
        if (ex.type === EXERCISE_TYPES.WARMUP) {
          const status = st.timeLeft < (ex.duration * 60) ? 'partial' : 'pending';
          return { ...prev, [exerciseId]: { ...st, isRunning: false, status } };
        }
        if (ex.type === EXERCISE_TYPES.INTERVALS) {
          const status = st.repsLeft < st.reps ? 'partial' : 'pending';
          return { ...prev, [exerciseId]: { ...st, isRunning: false, status } };
        }
        return prev;
      });
    }
    setSelectedId(null);
  }, [session]);

  // ─── Set done (regular & combo) ──────────────────────────────────────────
  const handleSetDone = useCallback((exerciseId) => {
    setExStates(prev => {
      const st = prev[exerciseId];
      if (!st || st.setsLeft <= 0) return prev;
      const newSetsLeft  = st.setsLeft - 1;
      const newCompleted = st.setsCompleted + 1;
      const status = newSetsLeft === 0 ? 'complete' : 'partial';
      const updated = { ...prev, [exerciseId]: { ...st, setsLeft: newSetsLeft, setsCompleted: newCompleted, status } };

      if (newSetsLeft === 0) {
        setTimeout(() => setSelectedId(null), 400);
      }
      return updated;
    });
    activateRestTimer();
  }, [activateRestTimer]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const selectedExercise = selectedId ? session?.exercises?.find(e => e.id === selectedId) : null;
  const selectedState    = selectedId ? exStates[selectedId] : null;

  const HEADER_H = 100;

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* ── Timer Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        {/* Session timer */}
        <View style={styles.timerBox}>
          <Text style={styles.timerLabel}>SESSION</Text>
          <Text style={[styles.timerDigits, { color: Colors.primary }]}>
            {formatTime(elapsedSec)}
          </Text>
        </View>

        {/* End button */}
        <TouchableOpacity style={styles.endBtn} onPress={confirmEnd} activeOpacity={0.8}>
          <Text style={styles.endBtnTxt}>END</Text>
        </TouchableOpacity>

        {/* Rest timer */}
        <View style={styles.timerBox}>
          <Text style={styles.timerLabel}>REST</Text>
          <Text style={[styles.timerDigits, { color: restActive ? Colors.blue : Colors.textMuted }]}>
            {formatTime(restSec)}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── Content area ─────────────────────────────────────────────── */}
      <View style={[styles.content, { height: windowHeight - HEADER_H - 1 }]}>
        {!selectedExercise ? (
          // Exercise list
          <FlatList
            data={session?.exercises ?? []}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const st = exStates[item.id];
              return (
                <TouchableOpacity
                  style={[styles.exRow, st?.status === 'complete' && styles.exRowComplete]}
                  onPress={() => selectExercise(item.id)}
                  activeOpacity={0.75}
                >
                  <StatusDot status={st?.status ?? 'pending'} />
                  <View style={styles.exInfo}>
                    <Text style={styles.exName}>{getExerciseName(item)}</Text>
                    <Text style={styles.exMeta}>{getExerciseMeta(item, st)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          // Exercise detail
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
            {selectedExercise.type === EXERCISE_TYPES.REGULAR && (
              <RegularDetail
                exercise={selectedExercise}
                state={selectedState}
                onUpdate={patch => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...patch } }))}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBackToList(selectedId)}
              />
            )}
            {selectedExercise.type === EXERCISE_TYPES.COMBO && (
              <ComboDetail
                exercise={selectedExercise}
                state={selectedState}
                onUpdate={patch => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...patch } }))}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBackToList(selectedId)}
              />
            )}
            {selectedExercise.type === EXERCISE_TYPES.WARMUP && (
              <WarmupDetail
                exercise={selectedExercise}
                state={selectedState}
                onToggle={() => setExStates(prev => ({
                  ...prev,
                  [selectedId]: { ...prev[selectedId], isRunning: !prev[selectedId].isRunning },
                }))}
                onBack={() => goBackToList(selectedId)}
              />
            )}
            {selectedExercise.type === EXERCISE_TYPES.INTERVALS && (
              <IntervalsDetail
                exercise={selectedExercise}
                state={selectedState}
                onToggle={() => setExStates(prev => {
                  const st = prev[selectedId];
                  const starting = !st.isRunning && st.phase === null;
                  addToPerfOrder(selectedId);
                  return {
                    ...prev,
                    [selectedId]: {
                      ...st,
                      isRunning: !st.isRunning,
                      phase: starting ? PHASE.WALKING : st.phase,
                      timeLeft: starting ? WALK_DURATION : st.timeLeft,
                    },
                  };
                })}
                onUpdateReps={v => setExStates(prev => ({
                  ...prev,
                  [selectedId]: { ...prev[selectedId], repsLeft: Math.max(0, v) },
                }))}
                onBack={() => goBackToList(selectedId)}
              />
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// Exercise meta line for the list
function getExerciseMeta(ex, st) {
  if (!st) return '';
  if (ex.type === EXERCISE_TYPES.REGULAR) {
    return `${st.weight}kg · ${ex.sets} sets · ${st.reps} reps`;
  }
  if (ex.type === EXERCISE_TYPES.COMBO) {
    return `${ex.subExercises.length} exercises · ${ex.sets} sets`;
  }
  if (ex.type === EXERCISE_TYPES.WARMUP) {
    return `${ex.warmupType} · ${ex.duration} min`;
  }
  if (ex.type === EXERCISE_TYPES.INTERVALS) {
    return `${ex.reps} reps · ${ex.intervalLength}s intervals`;
  }
  return '';
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { backgroundColor: Colors.background },

  // Timer header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  timerBox: { flex: 1, alignItems: 'center' },
  timerLabel: { ...Typography.label, color: Colors.textMuted, marginBottom: 2 },
  timerDigits: {
    fontFamily: DIGITAL_FONT,
    fontSize: 36,
    letterSpacing: 2,
  },
  endBtn: {
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  endBtnTxt: { ...Typography.label, color: Colors.textPrimary, fontSize: 14 },
  divider: { height: 1, backgroundColor: Colors.border },

  // Content
  content: { flex: 1 },

  // Exercise list
  listContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  exRow: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  exRowComplete: { borderColor: Colors.gold + '66', backgroundColor: Colors.surface },
  exInfo: { flex: 1 },
  exName: { ...Typography.h3, color: Colors.textPrimary },
  exMeta: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
});
