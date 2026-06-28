import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, StatusBar, FlatList, useWindowDimensions, BackHandler,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows, DIGITAL_FONT } from '../theme';
import { formatTime } from '../utils/time';
import { initAudio, loadSounds, unloadSounds, playRestBeep, playIntervalBeep } from '../utils/sounds';
import { EXERCISE_TYPES } from '../data/exercises';
import { Stepper } from '../components/Stepper';

// ─── Constants ────────────────────────────────────────────────────────────────
const WALK_DURATION  = 60;  // seconds, always
const TRANS_DURATION = 10;  // seconds, always

const PHASE = {
  WALKING:   'walking',
  TRANS_IN:  'trans_in',   // walking → running
  RUNNING:   'running',
  TRANS_OUT: 'trans_out',  // running → next walking
};

const PHASE_LABEL = {
  [PHASE.WALKING]:   'WALKING',
  [PHASE.TRANS_IN]:  'TRANSITION',
  [PHASE.RUNNING]:   'RUNNING',
  [PHASE.TRANS_OUT]: 'TRANSITION',
};

const PHASE_COLOR = {
  [PHASE.WALKING]:   Colors.blue,
  [PHASE.TRANS_IN]:  Colors.amber,
  [PHASE.RUNNING]:   Colors.primary,
  [PHASE.TRANS_OUT]: Colors.amber,
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

// ─── Status dot ───────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  if (status === 'complete') return <Ionicons name="checkmark-circle" size={24} color={Colors.gold} />;
  if (status === 'partial')  return <Ionicons name="ellipsis-horizontal-circle" size={24} color={Colors.amber} />;
  return <View style={dotStyles.empty} />;
}
const dotStyles = StyleSheet.create({
  empty: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.border },
});

// ─── Regular exercise detail ──────────────────────────────────────────────────
function RegularDetail({ exercise, state, onUpdate, onSetDone, onBack }) {
  const isComplete = state.setsLeft === 0;
  return (
    <View style={D.container}>
      <Text style={D.name}>{getExerciseName(exercise)}</Text>
      {!!exercise.bodySection && <Text style={D.subtitle}>{exercise.bodySection}</Text>}

      <View style={D.stepperRow}>
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

      {isComplete
        ? <View style={D.completeBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold} /><Text style={D.completeTxt}>All sets done!</Text></View>
        : <TouchableOpacity style={D.doneBtn} onPress={onSetDone} activeOpacity={0.85}>
            <Ionicons name="checkmark" size={28} color={Colors.background} />
            <Text style={D.doneTxt}>SET DONE</Text>
          </TouchableOpacity>
      }

      <TouchableOpacity style={D.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={D.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Combo exercise detail ────────────────────────────────────────────────────
function ComboDetail({ exercise, state, onUpdate, onSetDone, onBack }) {
  const isComplete = state.setsLeft === 0;
  return (
    <View style={D.container}>
      <Text style={D.name}>🔗 {getExerciseName(exercise)}</Text>
      <View style={D.stepperRow}>
        <Stepper size="large" label="SETS LEFT"
          value={state.setsLeft} min={0} max={99}
          onChange={v => onUpdate({ setsLeft: v })} />
      </View>

      <ScrollView style={D.comboScroll} showsVerticalScrollIndicator={false}>
        {exercise.subExercises.map((sub, idx) => {
          const name = sub.name === 'Other' ? (sub.customName || `Exercise ${idx+1}`) : (sub.name || `Exercise ${idx+1}`);
          return (
            <View key={sub.id} style={D.subCard}>
              <Text style={D.subName}>{name}</Text>
              {!!sub.bodySection && <Text style={D.subSection}>{sub.bodySection}</Text>}
              <View style={D.stepperRow}>
                <Stepper size="large" label="WEIGHT (kg)"
                  value={state.subWeights[idx]} min={0} max={500}
                  onChange={v => { const w = [...state.subWeights]; w[idx] = v; onUpdate({ subWeights: w }); }} />
                <Stepper size="large" label="REPS"
                  value={state.subReps[idx]} min={1} max={999}
                  onChange={v => { const r = [...state.subReps]; r[idx] = v; onUpdate({ subReps: r }); }} />
              </View>
            </View>
          );
        })}
      </ScrollView>

      {isComplete
        ? <View style={D.completeBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold} /><Text style={D.completeTxt}>Combo complete!</Text></View>
        : <TouchableOpacity style={D.doneBtn} onPress={onSetDone} activeOpacity={0.85}>
            <Ionicons name="git-merge-outline" size={24} color={Colors.background} />
            <Text style={D.doneTxt}>COMBO SET DONE</Text>
          </TouchableOpacity>
      }

      <TouchableOpacity style={D.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={D.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Warmup detail ────────────────────────────────────────────────────────────
function WarmupDetail({ exercise, state, onToggle, onBack }) {
  const isRunning  = state.isRunning;
  const isComplete = state.status === 'complete';
  return (
    <View style={D.container}>
      <Text style={D.name}>🔥 Warmup</Text>
      <Text style={D.subtitle}>{exercise.warmupType}</Text>

      <View style={Wu.block}>
        <Text style={Wu.timer}>{formatTime(state.timeLeft)}</Text>
        <Text style={Wu.label}>{isComplete ? 'COMPLETE' : isRunning ? 'RUNNING' : 'PAUSED'}</Text>
      </View>

      {!isComplete &&
        <TouchableOpacity
          style={[D.doneBtn, isRunning && { backgroundColor: Colors.amber }]}
          onPress={onToggle} activeOpacity={0.85}
        >
          <Ionicons name={isRunning ? 'pause' : 'play'} size={28} color={Colors.background} />
          <Text style={D.doneTxt}>{isRunning ? 'PAUSE' : 'START'}</Text>
        </TouchableOpacity>
      }
      {isComplete &&
        <View style={D.completeBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold} /><Text style={D.completeTxt}>Warmup complete!</Text></View>
      }
      <TouchableOpacity style={D.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={D.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}
const Wu = StyleSheet.create({
  block: { alignItems: 'center', marginVertical: Spacing.xl },
  timer: { fontFamily: DIGITAL_FONT, fontSize: 72, color: Colors.amber, letterSpacing: 4 },
  label: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.sm },
});

// ─── Intervals detail ─────────────────────────────────────────────────────────
function IntervalsDetail({ exercise, state, onToggle, onUpdateReps, onBack }) {
  const { repsLeft, phase, timeLeft, isRunning, status } = state;
  const isComplete  = status === 'complete';
  const notStarted  = phase === null;
  const phaseColor  = phase ? PHASE_COLOR[phase] : Colors.textMuted;
  const phaseLabel  = phase ? PHASE_LABEL[phase] : 'READY';
  return (
    <View style={D.container}>
      <Text style={D.name}>⚡ Intervals</Text>

      <View style={Iv.repsRow}>
        <Text style={Iv.repsLabel}>REPS REMAINING</Text>
        <Stepper size="large" value={repsLeft} min={0} max={99} onChange={onUpdateReps} />
      </View>

      <View style={[Iv.phaseBlock, { borderColor: phaseColor }]}>
        <Text style={[Iv.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
        <Text style={[Iv.timer, { color: phaseColor }]}>
          {notStarted ? formatTime(WALK_DURATION) : formatTime(timeLeft)}
        </Text>
      </View>

      {!isComplete &&
        <TouchableOpacity
          style={[D.doneBtn, isRunning && { backgroundColor: Colors.amber }]}
          onPress={onToggle} activeOpacity={0.85}
        >
          <Ionicons name={isRunning ? 'pause' : 'play'} size={28} color={Colors.background} />
          <Text style={D.doneTxt}>{isRunning ? 'PAUSE' : (notStarted ? 'START' : 'RESUME')}</Text>
        </TouchableOpacity>
      }
      {isComplete &&
        <View style={D.completeBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold} /><Text style={D.completeTxt}>Intervals complete!</Text></View>
      }
      <TouchableOpacity style={D.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={D.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}
const Iv = StyleSheet.create({
  repsRow:   { alignItems: 'center', marginBottom: Spacing.lg },
  repsLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.sm },
  phaseBlock: { alignItems: 'center', borderWidth: 2, borderRadius: Radius.lg, padding: Spacing.xl, marginBottom: Spacing.lg },
  phaseLabel: { ...Typography.h2, marginBottom: Spacing.sm },
  timer:      { fontFamily: DIGITAL_FONT, fontSize: 64, letterSpacing: 4 },
});

// ─── Shared detail styles ─────────────────────────────────────────────────────
const D = StyleSheet.create({
  container:    { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  name:         { ...Typography.h1, color: Colors.textPrimary },
  subtitle:     { ...Typography.body, color: Colors.textSecondary, marginTop: -Spacing.sm },
  stepperRow:   { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'space-around', marginVertical: Spacing.sm },
  doneBtn:      { height: 68, borderRadius: Radius.lg, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, ...Shadows.orange },
  doneTxt:      { ...Typography.h2, color: Colors.background, fontWeight: '800', letterSpacing: 1 },
  completeBadge:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  completeTxt:  { ...Typography.h2, color: Colors.gold },
  backBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md },
  backTxt:      { ...Typography.body, color: Colors.textSecondary },
  comboScroll:  { maxHeight: 280 },
  subCard:      { backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm },
  subName:      { ...Typography.h3, color: Colors.textPrimary },
  subSection:   { ...Typography.bodySmall, color: Colors.amber },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function TrainingScreen({ navigation, route }) {
  useKeepAwake();

  const { session }              = route.params ?? {};
  const { height: windowHeight } = useWindowDimensions();

  const [elapsedSec, setElapsedSec] = useState(0);
  const [restSec, setRestSec]       = useState(session?.restTimerSecs ?? 60);
  const [restActive, setRestActive] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [exStates, setExStates]     = useState(() => initExerciseStates(session?.exercises ?? []));
  const [perfOrder, setPerfOrder]   = useState([]);
  const [startTime]                 = useState(new Date());

  // Guard: show "all complete" alert only once per session
  const allCompleteShown = useRef(false);

  // Keep refs in sync for use inside timer callbacks (avoids stale closure bugs)
  const restSecRef    = useRef(restSec);
  const restActiveRef = useRef(restActive);
  const exStatesRef   = useRef(exStates);
  const warmupRef     = useRef(null);
  const intervalsRef  = useRef(null);
  useEffect(() => { restSecRef.current    = restSec;    }, [restSec]);
  useEffect(() => { restActiveRef.current = restActive; }, [restActive]);
  useEffect(() => { exStatesRef.current   = exStates;   }, [exStates]);

  const warmupExercise    = useMemo(() => session?.exercises?.find(e => e.type === EXERCISE_TYPES.WARMUP),    [session]);
  const intervalsExercise = useMemo(() => session?.exercises?.find(e => e.type === EXERCISE_TYPES.INTERVALS), [session]);

  useEffect(() => { if (warmupExercise)    warmupRef.current    = exStates[warmupExercise.id];    }, [exStates, warmupExercise]);
  useEffect(() => { if (intervalsExercise) intervalsRef.current = exStates[intervalsExercise.id]; }, [exStates, intervalsExercise]);

  // ── Load / unload sounds ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => { await initAudio(); await loadSounds(); })();
    return () => { unloadSounds(); };
  }, []);

  // ── Session timer (always counting up) ───────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Rest timer countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (!restActive) return;
    let id;
    id = setInterval(() => {
      if (restSecRef.current <= 1) {
        clearInterval(id);
        playRestBeep();
        setRestSec(session?.restTimerSecs ?? 60);
        setRestActive(false);
      } else {
        setRestSec(s => s - 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [restActive]);

  // ── Warmup timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const wu = warmupExercise;
    if (!wu || !exStates[wu.id]?.isRunning) return;
    let id;
    id = setInterval(() => {
      const cur = warmupRef.current;
      if (!cur?.isRunning) { clearInterval(id); return; }
      if (cur.timeLeft <= 1) {
        clearInterval(id); // stop immediately, don't wait for ref sync
        playIntervalBeep();
        setExStates(prev => ({
          ...prev,
          [wu.id]: { ...prev[wu.id], timeLeft: 0, isRunning: false, status: 'complete' },
        }));
      } else {
        setExStates(prev => ({
          ...prev,
          [wu.id]: { ...prev[wu.id], timeLeft: prev[wu.id].timeLeft - 1 },
        }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [exStates[warmupExercise?.id]?.isRunning]);

  // Warmup completion → add to perf order and navigate back
  useEffect(() => {
    if (!warmupExercise) return;
    if (exStates[warmupExercise.id]?.status !== 'complete') return;
    addToPerfOrder(warmupExercise.id);
    if (selectedId === warmupExercise.id) {
      const t = setTimeout(() => setSelectedId(null), 350);
      return () => clearTimeout(t);
    }
  }, [exStates[warmupExercise?.id]?.status]);

  // ── Intervals timer ───────────────────────────────────────────────────────
  useEffect(() => {
    const iv = intervalsExercise;
    if (!iv || !exStates[iv.id]?.isRunning) return;
    let id;
    id = setInterval(() => {
      const cur = intervalsRef.current;
      if (!cur?.isRunning) { clearInterval(id); return; }
      if (cur.timeLeft <= 1) {
        clearInterval(id); // stop immediately
        advanceIntervalsPhase(iv.id);
      } else {
        setExStates(prev => ({
          ...prev,
          [iv.id]: { ...prev[iv.id], timeLeft: prev[iv.id].timeLeft - 1 },
        }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [exStates[intervalsExercise?.id]?.isRunning]);

  // Phase advancement — NO side effects inside the state updater
  const advanceIntervalsPhase = useCallback((id) => {
    playIntervalBeep();
    setExStates(prev => {
      const st = prev[id];
      if (!st) return prev;
      let next;
      switch (st.phase) {
        case PHASE.WALKING:
          next = { ...st, phase: PHASE.TRANS_IN,  timeLeft: TRANS_DURATION };   break;
        case PHASE.TRANS_IN:
          next = { ...st, phase: PHASE.RUNNING,   timeLeft: st.intervalLength }; break;
        case PHASE.RUNNING:
          next = { ...st, phase: PHASE.TRANS_OUT, timeLeft: TRANS_DURATION };   break;
        case PHASE.TRANS_OUT: {
          const newReps = st.repsLeft - 1;
          next = newReps <= 0
            ? { ...st, repsLeft: 0, phase: null, timeLeft: 0, isRunning: false, status: 'complete' }
            : { ...st, repsLeft: newReps, phase: PHASE.WALKING, timeLeft: WALK_DURATION };
          break;
        }
        default: next = st;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  // Intervals completion → add to perf order and navigate back
  useEffect(() => {
    if (!intervalsExercise) return;
    if (exStates[intervalsExercise.id]?.status !== 'complete') return;
    addToPerfOrder(intervalsExercise.id);
    if (selectedId === intervalsExercise.id) {
      const t = setTimeout(() => setSelectedId(null), 350);
      return () => clearTimeout(t);
    }
  }, [exStates[intervalsExercise?.id]?.status]);

  // ── All-complete detection ────────────────────────────────────────────────
  useEffect(() => {
    if (allCompleteShown.current) return;
    if (!session?.exercises?.length) return;
    const allDone = session.exercises.every(e => exStates[e.id]?.status === 'complete');
    if (!allDone) return;
    allCompleteShown.current = true;
    const t = setTimeout(() => {
      Alert.alert(
        '🏆 Session Complete!',
        'You finished all exercises. Ready to wrap up?',
        [
          { text: 'Keep Going', style: 'cancel', onPress: () => { allCompleteShown.current = false; } },
          { text: 'End Session', style: 'default', onPress: endSession },
        ]
      );
    }, 500);
    return () => clearTimeout(t);
  }, [exStates]);

  // ── Android back button ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedId) { goBackToList(selectedId); return true; }
      confirmEnd(); return true;
    });
    return () => handler.remove();
  }, [selectedId]);

  // ── Core actions ──────────────────────────────────────────────────────────
  const addToPerfOrder = useCallback((id) => {
    setPerfOrder(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const activateRestTimer = useCallback(() => {
    setRestSec(session?.restTimerSecs ?? 60);
    setRestActive(true);
  }, [session]);

  const endSession = useCallback(() => {
    const allIds      = session?.exercises?.map(e => e.id) ?? [];
    const remaining   = allIds.filter(id => !perfOrder.includes(id));
    const orderedIds  = [...perfOrder, ...remaining];
    const snap        = exStatesRef.current; // use ref for latest state
    const summaryData = {
      sessionName: session?.name ?? 'Session',
      sessionId:   session?.id ?? '',
      startTime:   startTime.toISOString(),
      endTime:     new Date().toISOString(),
      totalDurationSecs: elapsedSec,
      exercises: orderedIds.map((id, idx) => {
        const ex  = session.exercises.find(e => e.id === id);
        const st  = snap[id];
        const base = { id, type: ex.type, name: getExerciseName(ex), status: st?.status ?? 'pending', performanceOrder: idx };
        if (ex.type === EXERCISE_TYPES.REGULAR)
          return { ...base, weight: st.weight, reps: st.reps, plannedSets: ex.sets, completedSets: st.setsCompleted };
        if (ex.type === EXERCISE_TYPES.COMBO)
          return { ...base, plannedSets: ex.sets, completedSets: st.setsCompleted,
            subExercises: ex.subExercises.map((s, i) => ({ name: s.name === 'Other' ? s.customName : s.name, weight: st.subWeights[i], reps: st.subReps[i] })) };
        if (ex.type === EXERCISE_TYPES.WARMUP)
          return { ...base, warmupType: ex.warmupType, plannedDurationSecs: ex.duration * 60 };
        if (ex.type === EXERCISE_TYPES.INTERVALS)
          return { ...base, plannedReps: ex.reps, completedReps: ex.reps - (st?.repsLeft ?? ex.reps), intervalLengthSecs: ex.intervalLength };
        return base;
      }),
    };
    navigation.replace('Summary', { summary: summaryData });
  }, [elapsedSec, perfOrder, session, startTime, navigation]);

  const confirmEnd = useCallback(() => {
    Alert.alert(
      'End Session?',
      'Are you sure you want to end this training session?',
      [
        { text: 'Cancel',      style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: endSession },
      ]
    );
  }, [endSession]);

  const selectExercise = useCallback((id) => {
    addToPerfOrder(id);
    setSelectedId(id);
  }, [addToPerfOrder]);

  const goBackToList = useCallback((exId) => {
    if (exId) {
      setExStates(prev => {
        const st = prev[exId];
        if (!st || st.status === 'complete') return prev;
        const ex = session?.exercises?.find(e => e.id === exId);
        if (!ex) return prev;
        if (ex.type === EXERCISE_TYPES.REGULAR || ex.type === EXERCISE_TYPES.COMBO) {
          return { ...prev, [exId]: { ...st, status: st.setsCompleted > 0 ? 'partial' : 'pending' } };
        }
        if (ex.type === EXERCISE_TYPES.WARMUP) {
          const started = st.timeLeft < ex.duration * 60;
          return { ...prev, [exId]: { ...st, isRunning: false, status: started ? 'partial' : 'pending' } };
        }
        if (ex.type === EXERCISE_TYPES.INTERVALS) {
          const started = st.repsLeft < st.reps || st.phase !== null;
          return { ...prev, [exId]: { ...st, isRunning: false, status: started ? 'partial' : 'pending' } };
        }
        return prev;
      });
    }
    setSelectedId(null);
  }, [session]);

  const handleSetDone = useCallback((exId) => {
    setExStates(prev => {
      const st = prev[exId];
      if (!st || st.setsLeft <= 0) return prev;
      const newSetsLeft = st.setsLeft - 1;
      const newDone     = st.setsCompleted + 1;
      const status      = newSetsLeft === 0 ? 'complete' : 'partial';
      if (newSetsLeft === 0) setTimeout(() => setSelectedId(null), 350);
      return { ...prev, [exId]: { ...st, setsLeft: newSetsLeft, setsCompleted: newDone, status } };
    });
    activateRestTimer();
  }, [activateRestTimer]);

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedExercise = selectedId ? session?.exercises?.find(e => e.id === selectedId) : null;
  const selectedState    = selectedId ? exStates[selectedId] : null;

  return (
    <View style={[S.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* ── Timer header ───────────────────────────────────────── */}
      <View style={S.header}>
        <View style={S.timerBox}>
          <Text style={S.timerLabel}>SESSION</Text>
          <Text style={[S.timerDigits, { color: Colors.primary }]}>{formatTime(elapsedSec)}</Text>
        </View>

        <TouchableOpacity style={S.endBtn} onPress={confirmEnd} activeOpacity={0.85}>
          <Text style={S.endTxt}>END</Text>
        </TouchableOpacity>

        <View style={[S.timerBox, restActive && S.timerBoxActive]}>
          <Text style={S.timerLabel}>REST</Text>
          <Text style={[S.timerDigits, { color: restActive ? Colors.blue : Colors.textMuted }]}>
            {formatTime(restSec)}
          </Text>
        </View>
      </View>

      <View style={S.divider} />

      {/* ── Content (list or detail) ────────────────────────────── */}
      <View style={{ flex: 1, minHeight: 0 }}>
        {!selectedExercise ? (
          <FlatList
            data={session?.exercises ?? []}
            keyExtractor={item => item.id}
            contentContainerStyle={S.listPad}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Text style={S.listHdr}>
                {session?.name ?? 'Training'} — tap an exercise to start
              </Text>
            }
            renderItem={({ item }) => {
              const st = exStates[item.id];
              return (
                <TouchableOpacity
                  style={[S.exRow, st?.status === 'complete' && S.exRowDone]}
                  onPress={() => selectExercise(item.id)}
                  activeOpacity={0.75}
                >
                  <StatusDot status={st?.status ?? 'pending'} />
                  <View style={S.exInfo}>
                    <Text style={S.exName}>{getExerciseName(item)}</Text>
                    <Text style={S.exMeta}>{getListMeta(item, st)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
            {selectedExercise.type === EXERCISE_TYPES.REGULAR &&
              <RegularDetail
                exercise={selectedExercise} state={selectedState}
                onUpdate={p => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...p } }))}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBackToList(selectedId)}
              />
            }
            {selectedExercise.type === EXERCISE_TYPES.COMBO &&
              <ComboDetail
                exercise={selectedExercise} state={selectedState}
                onUpdate={p => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...p } }))}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBackToList(selectedId)}
              />
            }
            {selectedExercise.type === EXERCISE_TYPES.WARMUP &&
              <WarmupDetail
                exercise={selectedExercise} state={selectedState}
                onToggle={() => setExStates(prev => ({
                  ...prev,
                  [selectedId]: { ...prev[selectedId], isRunning: !prev[selectedId].isRunning },
                }))}
                onBack={() => goBackToList(selectedId)}
              />
            }
            {selectedExercise.type === EXERCISE_TYPES.INTERVALS &&
              <IntervalsDetail
                exercise={selectedExercise} state={selectedState}
                onToggle={() => {
                  // addToPerfOrder must be called OUTSIDE the setExStates updater
                  const st = exStates[selectedId];
                  const starting = !st?.isRunning && st?.phase === null;
                  if (starting) addToPerfOrder(selectedId);
                  setExStates(prev => {
                    const s = prev[selectedId];
                    return {
                      ...prev,
                      [selectedId]: {
                        ...s,
                        isRunning: !s.isRunning,
                        phase:    starting ? PHASE.WALKING    : s.phase,
                        timeLeft: starting ? WALK_DURATION    : s.timeLeft,
                      },
                    };
                  });
                }}
                onUpdateReps={v => setExStates(prev => ({
                  ...prev,
                  [selectedId]: { ...prev[selectedId], repsLeft: Math.max(0, v) },
                }))}
                onBack={() => goBackToList(selectedId)}
              />
            }
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// Meta line for exercise list — shows live progress
function getListMeta(ex, st) {
  if (!st) return '';
  if (ex.type === EXERCISE_TYPES.REGULAR) {
    const sets = st.setsCompleted > 0
      ? `${st.setsCompleted}/${ex.sets} sets · `
      : `${ex.sets} sets · `;
    return `${sets}${st.weight}kg · ${st.reps} reps`;
  }
  if (ex.type === EXERCISE_TYPES.COMBO)
    return `${ex.subExercises.length} exercises · ${st.setsCompleted > 0 ? `${st.setsCompleted}/` : ''}${ex.sets} sets`;
  if (ex.type === EXERCISE_TYPES.WARMUP)
    return `${ex.warmupType} · ${ex.duration} min`;
  if (ex.type === EXERCISE_TYPES.INTERVALS)
    return `${st.repsLeft}/${ex.reps} reps left · ${ex.intervalLength}s intervals`;
  return '';
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container: { backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg, paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  timerBox: { flex: 1, alignItems: 'center', paddingVertical: Spacing.xs },
  timerBoxActive: {
    backgroundColor: Colors.blueDim,
    borderRadius: Radius.md,
  },
  timerLabel:  { ...Typography.label, color: Colors.textMuted, marginBottom: 2 },
  timerDigits: { fontFamily: DIGITAL_FONT, fontSize: 38, letterSpacing: 2 },
  endBtn: {
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.full,
  },
  endTxt:  { ...Typography.label, color: Colors.textPrimary, fontSize: 14 },
  divider: { height: 1, backgroundColor: Colors.border },

  listPad:  { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  listHdr:  { ...Typography.bodySmall, color: Colors.textMuted, marginBottom: Spacing.sm },

  exRow: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md + 2,
    gap: Spacing.md,
  },
  exRowDone: { borderColor: Colors.gold + '55' },
  exInfo:    { flex: 1 },
  exName:    { ...Typography.h3, color: Colors.textPrimary },
  exMeta:    { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
});
