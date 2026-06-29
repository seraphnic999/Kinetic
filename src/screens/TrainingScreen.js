import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, StatusBar, FlatList, useWindowDimensions, Animated,
  Platform,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows, DIGITAL_FONT } from '../theme';
import { formatTime } from '../utils/time';
import { initAudio, loadSounds, unloadSounds, playRestBeep, playIntervalBeep } from '../utils/sounds';
import { EXERCISE_TYPES } from '../data/exercises';
import { Stepper } from '../components/Stepper';

// ─── Constants ────────────────────────────────────────────────────────────────
const PHASE = {
  WALKING:   'walking',
  TRANS_IN:  'trans_in',
  RUNNING:   'running',
  TRANS_OUT: 'trans_out',
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

const getExerciseMeta = (ex, st) => {
  if (!st) return '';
  if (ex.type === EXERCISE_TYPES.REGULAR)
    return `${st.weight}kg · ${ex.sets} sets · ${st.reps} reps`;
  if (ex.type === EXERCISE_TYPES.COMBO)
    return `${ex.subExercises?.length ?? 0} exercises · ${ex.sets} sets`;
  if (ex.type === EXERCISE_TYPES.WARMUP)
    return `${ex.warmupType} · ${ex.duration} min`;
  if (ex.type === EXERCISE_TYPES.INTERVALS)
    return `${ex.reps} reps · ${ex.intervalLength}s run / ${ex.walkDuration ?? 60}s walk`;
  return '';
};

const initExerciseStates = (exercises) => {
  const s = {};
  (exercises ?? []).forEach(ex => {
    if (ex.type === EXERCISE_TYPES.REGULAR) {
      s[ex.id] = { setsLeft: ex.sets, setsCompleted: 0, weight: ex.weight, reps: ex.reps, status: 'pending' };
    } else if (ex.type === EXERCISE_TYPES.COMBO) {
      s[ex.id] = {
        setsLeft: ex.sets, setsCompleted: 0, status: 'pending',
        subWeights: (ex.subExercises ?? []).map(s => s.weight ?? 0),
        subReps:    (ex.subExercises ?? []).map(s => s.reps ?? 1),
      };
    } else if (ex.type === EXERCISE_TYPES.WARMUP) {
      s[ex.id] = { timeLeft: ex.duration ?? 180, isRunning: false, status: 'pending' };
    } else if (ex.type === EXERCISE_TYPES.INTERVALS) {
      s[ex.id] = {
        repsLeft: ex.reps ?? 8, reps: ex.reps ?? 8,
        intervalLength:     ex.intervalLength     ?? 45,
        walkDuration:       ex.walkDuration       ?? 60,
        transitionDuration: ex.transitionDuration ?? 10,
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

// ─── Regular exercise detail ───────────────────────────────────────────────────
function RegularDetail({ exercise, state, onUpdate, onSetDone, onBack }) {
  const done = state.setsLeft === 0;
  return (
    <View style={d.container}>
      <Text style={d.name}>{getExerciseName(exercise)}</Text>
      {exercise.bodySection ? <Text style={d.subtitle}>{exercise.bodySection}</Text> : null}

      <View style={d.stepperRow}>
        <Stepper size="large" label="WEIGHT (kg)" value={state.weight} min={0} max={500}
          onChange={v => onUpdate({ weight: v })} />
        <Stepper size="large" label="SETS LEFT" value={state.setsLeft} min={0} max={99}
          onChange={v => onUpdate({ setsLeft: v })} />
        <Stepper size="large" label="REPS" value={state.reps} min={1} max={999}
          onChange={v => onUpdate({ reps: v })} />
      </View>

      {done
        ? <View style={d.doneBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold} /><Text style={d.doneText}>Complete!</Text></View>
        : <TouchableOpacity style={d.actionBtn} onPress={onSetDone} activeOpacity={0.8}>
            <Ionicons name="checkmark" size={26} color={Colors.background} />
            <Text style={d.actionTxt}>SET DONE</Text>
          </TouchableOpacity>
      }
      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={d.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Combo detail ─────────────────────────────────────────────────────────────
function ComboDetail({ exercise, state, onUpdate, onSetDone, onBack }) {
  const done = state.setsLeft === 0;
  return (
    <View style={d.container}>
      <Text style={d.name}>🔗 {exercise.name || 'Combo'}</Text>

      <View style={d.stepperRow}>
        <Stepper size="large" label="SETS LEFT" value={state.setsLeft} min={0} max={99}
          onChange={v => onUpdate({ setsLeft: v })} />
      </View>

      <View>
        {(exercise.subExercises ?? []).map((sub, idx) => {
          const nm = sub.name === 'Other' ? (sub.customName || `Exercise ${idx+1}`) : (sub.name || `Exercise ${idx+1}`);
          return (
            <View key={sub.id ?? idx} style={d.subCard}>
              <Text style={d.subName}>{nm}</Text>
              {sub.bodySection ? <Text style={d.subSection}>{sub.bodySection}</Text> : null}
              <View style={d.stepperRow}>
                <Stepper size="large" label="WEIGHT (kg)"
                  value={state.subWeights[idx] ?? 0} min={0} max={500}
                  onChange={v => { const sw=[...state.subWeights]; sw[idx]=v; onUpdate({subWeights:sw}); }} />
                <Stepper size="large" label="REPS"
                  value={state.subReps[idx] ?? 1} min={1} max={999}
                  onChange={v => { const sr=[...state.subReps]; sr[idx]=v; onUpdate({subReps:sr}); }} />
              </View>
            </View>
          );
        })}
      </View>

      {done
        ? <View style={d.doneBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold} /><Text style={d.doneText}>Combo Complete!</Text></View>
        : <TouchableOpacity style={d.actionBtn} onPress={onSetDone} activeOpacity={0.8}>
            <Ionicons name="git-merge-outline" size={22} color={Colors.background} />
            <Text style={d.actionTxt}>COMBO SET DONE</Text>
          </TouchableOpacity>
      }
      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={d.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Warmup detail ────────────────────────────────────────────────────────────
function WarmupDetail({ exercise, state, onToggle, onBack }) {
  const done = state.status === 'complete';
  return (
    <View style={d.container}>
      <Text style={d.name}>🔥 Warmup</Text>
      <Text style={d.subtitle}>{exercise.warmupType}</Text>

      <View style={wu.block}>
        <Text style={wu.timer}>{formatTime(state.timeLeft)}</Text>
        <Text style={wu.label}>{done ? 'DONE' : state.isRunning ? 'RUNNING' : 'PAUSED'}</Text>
      </View>

      {!done &&
        <TouchableOpacity style={[d.actionBtn, state.isRunning && {backgroundColor: Colors.amber}]}
          onPress={onToggle} activeOpacity={0.8}>
          <Ionicons name={state.isRunning ? 'pause' : 'play'} size={26} color={Colors.background} />
          <Text style={d.actionTxt}>{state.isRunning ? 'PAUSE' : 'START'}</Text>
        </TouchableOpacity>
      }
      {done && <View style={d.doneBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold}/><Text style={d.doneText}>Warmup Complete!</Text></View>}

      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={d.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}
const wu = StyleSheet.create({
  block: { alignItems: 'center', marginVertical: Spacing.xl },
  timer: { fontFamily: DIGITAL_FONT, fontSize: 72, color: Colors.amber, letterSpacing: 4 },
  label: { ...Typography.label, color: Colors.textSecondary, marginTop: Spacing.sm },
});

// ─── Intervals detail ─────────────────────────────────────────────────────────
function IntervalsDetail({ exercise, state, onToggle, onUpdateReps, onBack }) {
  const done     = state.status === 'complete';
  const notStart = state.phase === null;
  const pColor   = state.phase ? PHASE_COLOR[state.phase] : Colors.textMuted;
  const pLabel   = state.phase ? PHASE_LABEL[state.phase] : 'READY';

  return (
    <View style={d.container}>
      <Text style={d.name}>⚡ Intervals</Text>

      <View style={iv.repsRow}>
        <Text style={iv.repsLabel}>REPS REMAINING</Text>
        <Stepper size="large" value={state.repsLeft} min={0} max={99} onChange={onUpdateReps} />
      </View>

      <View style={[iv.phaseBox, { borderColor: pColor }]}>
        <Text style={[iv.phaseLabel, { color: pColor }]}>{pLabel}</Text>
        <Text style={[iv.timer, { color: pColor }]}>
          {notStart ? formatTime(state.walkDuration ?? 60) : formatTime(state.timeLeft)}
        </Text>
      </View>

      {!done &&
        <TouchableOpacity style={[d.actionBtn, state.isRunning && {backgroundColor: Colors.amber}]}
          onPress={onToggle} activeOpacity={0.8}>
          <Ionicons name={state.isRunning ? 'pause' : 'play'} size={26} color={Colors.background} />
          <Text style={d.actionTxt}>{state.isRunning ? 'PAUSE' : notStart ? 'START' : 'RESUME'}</Text>
        </TouchableOpacity>
      }
      {done && <View style={d.doneBadge}><Ionicons name="checkmark-circle" size={30} color={Colors.gold}/><Text style={d.doneText}>Intervals Complete!</Text></View>}

      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        <Text style={d.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}
const iv = StyleSheet.create({
  repsRow:   { alignItems: 'center', marginBottom: Spacing.xl },
  repsLabel: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.sm },
  phaseBox:  { alignItems: 'center', borderWidth: 2, borderRadius: Radius.lg, padding: Spacing.xl, marginBottom: Spacing.xl },
  phaseLabel:{ ...Typography.h2, marginBottom: Spacing.sm },
  timer:     { fontFamily: DIGITAL_FONT, fontSize: 64, letterSpacing: 4 },
});

// ─── Shared detail styles ─────────────────────────────────────────────────────
const d = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  name:      { ...Typography.h1, color: Colors.textPrimary },
  subtitle:  { ...Typography.body, color: Colors.textSecondary, marginTop: -Spacing.sm },
  stepperRow:{ flexDirection: 'row', gap: Spacing.md, justifyContent: 'space-around', marginVertical: Spacing.md },
  actionBtn: { height: 64, borderRadius: Radius.lg, backgroundColor: Colors.primary,
               flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
               gap: Spacing.sm, ...Shadows.orange },
  actionTxt: { ...Typography.h2, color: Colors.background, fontWeight: '800' },
  doneBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
               gap: Spacing.md, padding: Spacing.lg },
  doneText:  { ...Typography.h2, color: Colors.gold },
  backBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
               gap: Spacing.xs, paddingVertical: Spacing.md },
  backTxt:   { ...Typography.body, color: Colors.textSecondary },
  subScroll: { maxHeight: 280 },
  subCard:   { backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md,
               padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm },
  subName:   { ...Typography.h3, color: Colors.textPrimary },
  subSection:{ ...Typography.bodySmall, color: Colors.amber },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TrainingScreen({ navigation, route }) {
  useKeepAwake();

  const { session } = route.params ?? {};
  const { height: windowHeight } = useWindowDimensions();

  // Session timer
  const [elapsedSec, setElapsedSec]   = useState(0);

  // End confirmation
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Rest timer
  const [restSec, setRestSec]         = useState(session?.restTimerSecs ?? 60);
  const [restActive, setRestActive]   = useState(false);
  const restSecRef                    = useRef(session?.restTimerSecs ?? 60);
  useEffect(() => { restSecRef.current = restSec; }, [restSec]);

  // Animated glow for rest timer
  const restGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (restActive) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(restGlow, { toValue: 1, duration: 700, useNativeDriver: false }),
          Animated.timing(restGlow, { toValue: 0, duration: 700, useNativeDriver: false }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      Animated.timing(restGlow, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    }
  }, [restActive]);

  const restBorderColor = restGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.border, Colors.blue],
  });

  // Dynamic header height
  const [headerH, setHeaderH] = useState(88);

  // Navigation state
  const [selectedId, setSelectedId] = useState(null);

  // Exercise states
  const [exStates, setExStates] = useState(() => initExerciseStates(session?.exercises));
  const exStatesRef = useRef(exStates);
  useEffect(() => { exStatesRef.current = exStates; }, [exStates]);

  // Performance order
  const [perfOrder, setPerfOrder] = useState([]);
  const [startTime]               = useState(new Date());

  // Flag to allow programmatic navigation without triggering the back confirm dialog
  const navigatingAway = useRef(false);

  // ─── Intercept Android back / swipe-back ────────────────────────────────
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (navigatingAway.current) return;
      e.preventDefault();
      Alert.alert(
        'End Session?',
        'Going back will end your training session.',
        [
          { text: 'Keep Training', style: 'cancel' },
          { text: 'End & Exit', style: 'destructive', onPress: () => {
            navigatingAway.current = true;
            navigation.dispatch(e.data.action);
          }},
        ]
      );
    });
    return unsub;
  }, [navigation]);

  // ─── Sounds ─────────────────────────────────────────────────────────────
  useEffect(() => {
    initAudio().then(() => loadSounds());
    return () => { unloadSounds(); };
  }, []);

  // ─── Session timer (always running) ─────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Rest timer ──────────────────────────────────────────────────────────
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
  const warmupEx = useMemo(() => session?.exercises?.find(e => e.type === EXERCISE_TYPES.WARMUP), [session]);
  const warmupRef = useRef(null);
  useEffect(() => { if (warmupEx) warmupRef.current = exStates[warmupEx.id]; }, [exStates, warmupEx]);

  useEffect(() => {
    if (!warmupEx) return;
    if (!exStates[warmupEx.id]?.isRunning) return;
    const id = setInterval(() => {
      const cur = warmupRef.current;
      if (!cur?.isRunning) return;
      if (cur.timeLeft <= 1) {
        playIntervalBeep();
        setExStates(prev => ({ ...prev, [warmupEx.id]: { ...prev[warmupEx.id], timeLeft: 0, isRunning: false, status: 'complete' } }));
        addToPerfOrder(warmupEx.id);
        setSelectedId(null);
      } else {
        setExStates(prev => ({ ...prev, [warmupEx.id]: { ...prev[warmupEx.id], timeLeft: prev[warmupEx.id].timeLeft - 1 } }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [exStates[warmupEx?.id]?.isRunning]);

  // ─── Intervals timer ─────────────────────────────────────────────────────
  const intervalsEx = useMemo(() => session?.exercises?.find(e => e.type === EXERCISE_TYPES.INTERVALS), [session]);
  const intervalsRef = useRef(null);
  useEffect(() => { if (intervalsEx) intervalsRef.current = exStates[intervalsEx.id]; }, [exStates, intervalsEx]);

  const advancePhase = useCallback((id) => {
    playIntervalBeep();
    setExStates(prev => {
      const st = prev[id];
      let next;
      switch (st.phase) {
        case PHASE.WALKING:   next = { ...st, phase: PHASE.TRANS_IN,  timeLeft: st.transitionDuration }; break;
        case PHASE.TRANS_IN:  next = { ...st, phase: PHASE.RUNNING,   timeLeft: st.intervalLength };     break;
        case PHASE.RUNNING:   next = { ...st, phase: PHASE.TRANS_OUT, timeLeft: st.transitionDuration }; break;
        case PHASE.TRANS_OUT: {
          const nr = st.repsLeft - 1;
          if (nr <= 0) {
            setTimeout(() => { addToPerfOrder(id); setSelectedId(null); }, 300);
            next = { ...st, repsLeft: 0, isRunning: false, status: 'complete' };
          } else {
            next = { ...st, repsLeft: nr, phase: PHASE.WALKING, timeLeft: st.walkDuration };
          }
          break;
        }
        default: next = st;
      }
      return { ...prev, [id]: next };
    });
  }, []);

  useEffect(() => {
    if (!intervalsEx) return;
    if (!exStates[intervalsEx.id]?.isRunning) return;
    const id = setInterval(() => {
      const cur = intervalsRef.current;
      if (!cur?.isRunning) return;
      if (cur.timeLeft <= 1) {
        advancePhase(intervalsEx.id);
      } else {
        setExStates(prev => ({ ...prev, [intervalsEx.id]: { ...prev[intervalsEx.id], timeLeft: prev[intervalsEx.id].timeLeft - 1 } }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [exStates[intervalsEx?.id]?.isRunning]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const addToPerfOrder = useCallback((id) => {
    setPerfOrder(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const activateRest = useCallback(() => {
    setRestSec(session?.restTimerSecs ?? 60);
    setRestActive(true);
  }, [session]);

  // ─── Auto-complete check ─────────────────────────────────────────────────
  useEffect(() => {
    const exs = session?.exercises ?? [];
    if (!exs.length) return;
    const allDone = exs.every(e => exStates[e.id]?.status === 'complete');
    if (allDone) {
      setTimeout(() => setShowEndConfirm(true), 600);
    }
  }, [exStates]);

  // ─── End session ─────────────────────────────────────────────────────────
  const doEndSession = useCallback(() => {
    const exs = session?.exercises ?? [];
    const allIds = exs.map(e => e.id);
    const remaining = allIds.filter(id => !perfOrder.includes(id));
    const ordered   = [...perfOrder, ...remaining];

    const summary = {
      sessionName: session?.name ?? 'Session',
      sessionId:   session?.id ?? '',
      startTime:   startTime.toISOString(),
      endTime:     new Date().toISOString(),
      totalDurationSecs: elapsedSec,
      exercises: ordered.map((id, idx) => {
        const ex = exs.find(e => e.id === id);
        const st = exStatesRef.current[id];
        const base = { id, type: ex?.type, name: getExerciseName(ex), status: st?.status ?? 'pending', performanceOrder: idx };
        if (ex?.type === EXERCISE_TYPES.REGULAR)
          return { ...base, weight: st.weight, reps: st.reps, plannedSets: ex.sets, completedSets: st.setsCompleted };
        if (ex?.type === EXERCISE_TYPES.COMBO)
          return { ...base, plannedSets: ex.sets, completedSets: st.setsCompleted,
            subExercises: (ex.subExercises ?? []).map((s, i) => ({
              name: s.name === 'Other' ? s.customName : s.name,
              weight: st.subWeights[i], reps: st.subReps[i],
            })) };
        if (ex?.type === EXERCISE_TYPES.WARMUP)
          return { ...base, warmupType: ex.warmupType, plannedDurationSecs: ex.duration ?? 180 };
        if (ex?.type === EXERCISE_TYPES.INTERVALS)
          return { ...base, plannedReps: ex.reps, completedReps: ex.reps - (st?.repsLeft ?? 0), intervalLengthSecs: ex.intervalLength };
        return base;
      }),
    };

    navigatingAway.current = true;
    navigation.replace('Summary', { summary });
  }, [elapsedSec, perfOrder, session, startTime, navigation]);

  const confirmEnd = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  // ─── Exercise selection ───────────────────────────────────────────────────
  const selectExercise = useCallback((id) => {
    addToPerfOrder(id);
    setSelectedId(id);
  }, [addToPerfOrder]);

  const goBack = useCallback((id) => {
    if (id) {
      setExStates(prev => {
        const st = prev[id];
        if (!st || st.status === 'complete') return prev;
        const ex = (session?.exercises ?? []).find(e => e.id === id);
        if (!ex) return prev;
        let status = st.status;
        if (ex.type === EXERCISE_TYPES.REGULAR || ex.type === EXERCISE_TYPES.COMBO)
          status = st.setsCompleted > 0 ? 'partial' : 'pending';
        if (ex.type === EXERCISE_TYPES.WARMUP)
          status = st.timeLeft < (ex.duration ?? 180) ? 'partial' : 'pending';
        if (ex.type === EXERCISE_TYPES.INTERVALS)
          status = st.repsLeft < st.reps ? 'partial' : 'pending';
        return { ...prev, [id]: { ...st, isRunning: false, status } };
      });
    }
    setSelectedId(null);
  }, [session]);

  const handleSetDone = useCallback((id) => {
    setExStates(prev => {
      const st = prev[id];
      if (!st || st.setsLeft <= 0) return prev;
      const setsLeft  = st.setsLeft - 1;
      const setsCompleted = st.setsCompleted + 1;
      const status    = setsLeft === 0 ? 'complete' : 'partial';
      if (setsLeft === 0) setTimeout(() => setSelectedId(null), 400);
      return { ...prev, [id]: { ...st, setsLeft, setsCompleted, status } };
    });
    activateRest();
  }, [activateRest]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const selectedEx    = selectedId ? (session?.exercises ?? []).find(e => e.id === selectedId) : null;
  const selectedState = selectedId ? exStates[selectedId] : null;
  const contentH      = windowHeight - headerH;

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View
        style={styles.header}
        onLayout={e => setHeaderH(e.nativeEvent.layout.height)}
      >
        {/* Session name */}
        <Text style={styles.sessionName} numberOfLines={1}>{session?.name ?? 'Training'}</Text>

        {/* Timer row */}
        <View style={styles.timerRow}>
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

          {/* Rest timer — animated border when active */}
          <Animated.View style={[styles.timerBox, styles.restBox, { borderColor: restBorderColor }]}>
            <Text style={styles.timerLabel}>REST</Text>
            <Text style={[styles.timerDigits, { color: restActive ? Colors.blue : Colors.textMuted }]}>
              {formatTime(restSec)}
            </Text>
          </Animated.View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* ── Content ────────────────────────────────────────────────── */}
      <View style={{ height: contentH - 1 }}>
        {!selectedEx ? (
          /* Exercise list */
          <FlatList
            data={session?.exercises ?? []}
            keyExtractor={item => item.id}
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const st = exStates[item.id];
              return (
                <TouchableOpacity
                  style={[styles.exRow, st?.status === 'complete' && styles.exRowDone]}
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
          /* Exercise detail */
          <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ flexGrow: 1 }}>
            {selectedEx.type === EXERCISE_TYPES.REGULAR && (
              <RegularDetail exercise={selectedEx} state={selectedState}
                onUpdate={p => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...p } }))}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBack(selectedId)} />
            )}
            {selectedEx.type === EXERCISE_TYPES.COMBO && (
              <ComboDetail exercise={selectedEx} state={selectedState}
                onUpdate={p => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...p } }))}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBack(selectedId)} />
            )}
            {selectedEx.type === EXERCISE_TYPES.WARMUP && (
              <WarmupDetail exercise={selectedEx} state={selectedState}
                onToggle={() => setExStates(prev => ({
                  ...prev, [selectedId]: { ...prev[selectedId], isRunning: !prev[selectedId].isRunning }
                }))}
                onBack={() => goBack(selectedId)} />
            )}
            {selectedEx.type === EXERCISE_TYPES.INTERVALS && (
              <IntervalsDetail exercise={selectedEx} state={selectedState}
                onToggle={() => setExStates(prev => {
                  const st = prev[selectedId];
                  const starting = !st.isRunning && st.phase === null;
                  if (starting) addToPerfOrder(selectedId);
                  return { ...prev, [selectedId]: {
                    ...st, isRunning: !st.isRunning,
                    status:   starting ? 'partial'        : st.status,
                    phase:    starting ? PHASE.WALKING    : st.phase,
                    timeLeft: starting ? st.walkDuration  : st.timeLeft,
                  }};
                })}
                onUpdateReps={v => setExStates(prev => ({
                  ...prev, [selectedId]: { ...prev[selectedId], repsLeft: Math.max(0, v) }
                }))}
                onBack={() => goBack(selectedId)} />
            )}
          </ScrollView>
        )}
      </View>

      {/* ── End Session Confirmation ────────────────────────────────── */}
      {showEndConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>End Session?</Text>
            <Text style={styles.confirmMsg}>
              Are you sure you want to end this training session?
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowEndConfirm(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmCancelTxt}>Keep Training</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmEndBtn}
                onPress={() => { setShowEndConfirm(false); doEndSession(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmEndTxt}>End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { backgroundColor: Colors.background },
  header:      { paddingHorizontal: Spacing.md, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  sessionName: { ...Typography.bodySmall, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.xs },
  timerRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timerBox:    { flex: 1, alignItems: 'center' },
  restBox:     { borderWidth: 1.5, borderRadius: Radius.md, paddingVertical: Spacing.xs },
  timerLabel:  { ...Typography.label, color: Colors.textMuted, fontSize: 11, marginBottom: 1 },
  timerDigits: { fontFamily: DIGITAL_FONT, fontSize: 34, letterSpacing: 2 },
  endBtn:      { backgroundColor: Colors.danger, paddingHorizontal: Spacing.lg,
                 paddingVertical: Spacing.sm, borderRadius: Radius.full },
  endBtnTxt:   { ...Typography.label, color: Colors.textPrimary, fontSize: 14 },
  divider:     { height: 1, backgroundColor: Colors.border },
  listContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  exRow:       { backgroundColor: Colors.surface, borderRadius: Radius.lg,
                 borderWidth: 1, borderColor: Colors.border,
                 flexDirection: 'row', alignItems: 'center',
                 paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.md },
  exRowDone:   { borderColor: Colors.gold + '55' },
  exInfo:      { flex: 1 },
  exName:      { ...Typography.h3, color: Colors.textPrimary },
  exMeta:      { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },

  // End session confirmation overlay
  confirmOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000CC',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999,
  },
  confirmBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.xl, margin: Spacing.xl, gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
    ...Shadows.card,
  },
  confirmTitle: { ...Typography.h2, color: Colors.textPrimary, textAlign: 'center' },
  confirmMsg:   { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  confirmBtns:  { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  confirmCancelBtn: {
    flex: 1, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmCancelTxt: { ...Typography.h3, color: Colors.textSecondary },
  confirmEndBtn: {
    flex: 1, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmEndTxt: { ...Typography.h3, color: Colors.textPrimary, fontWeight: '700' },
});
