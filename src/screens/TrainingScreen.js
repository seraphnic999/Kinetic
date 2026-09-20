import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, StatusBar, FlatList, useWindowDimensions, Animated,
  Platform, AppState,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, Shadows, DIGITAL_FONT, IconSize } from '../theme';
import { Icon } from '../components/Icon';
import { formatTime } from '../utils/time';
import { initAudio, loadSounds, unloadSounds, playRestBeep, playIntervalBeep, playCompleteSound } from '../utils/sounds';
import { requestNotificationPermissions, scheduleTimerNotification, cancelTimerNotification, cancelAllTimerNotifications } from '../utils/notifications';
import { syncWorkout } from '../utils/syncWorkout';
import { generateId } from '../utils/storage';
import { EXERCISE_TYPES, BODY_SECTIONS, EXERCISES_BY_SECTION, WARMUP_TYPES, CARDIO_TYPES, CARDIO_TYPE_LABELS } from '../data/exercises';
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

// ─── Background-resilient interval phase advancement ───────────────────────────
// Pure function: given the current exercise state and the absolute timestamp
// (ms since epoch) at which the CURRENT phase is due to end, advance through
// as many phases as necessary to catch up to `nowMs`. Used both for routine
// 1-second ticks (where at most one phase boundary is crossed) and for
// resuming from the background after an arbitrary gap (where many phases may
// need to be fast-forwarded through at once). Returns the new state plus the
// new phase-end timestamp, so the caller can keep its anchor ref in sync.
function fastForwardIntervals(state, phaseEndMs, nowMs) {
  let st = state;
  let endMs = phaseEndMs;
  while (endMs <= nowMs && st.isRunning) {
    let nextPhase, nextDurSecs;
    switch (st.phase) {
      case PHASE.WALKING:   nextPhase = PHASE.TRANS_IN;  nextDurSecs = st.transitionDuration; break;
      case PHASE.TRANS_IN:  nextPhase = PHASE.RUNNING;   nextDurSecs = st.intervalLength;     break;
      case PHASE.RUNNING:   nextPhase = PHASE.TRANS_OUT; nextDurSecs = st.transitionDuration; break;
      case PHASE.TRANS_OUT: {
        const nr = st.repsLeft - 1;
        if (nr <= 0) {
          return { state: { ...st, repsLeft: 0, isRunning: false, status: 'complete', timeLeft: 0 }, phaseEndMs: endMs };
        }
        st = { ...st, repsLeft: nr };
        nextPhase = PHASE.WALKING; nextDurSecs = st.walkDuration;
        break;
      }
      default:
        return { state: st, phaseEndMs: endMs };
    }
    endMs += nextDurSecs * 1000;
    st = { ...st, phase: nextPhase, timeLeft: nextDurSecs };
  }
  const remainMs = Math.max(0, endMs - nowMs);
  st = { ...st, timeLeft: Math.ceil(remainMs / 1000) };
  return { state: st, phaseEndMs: endMs };
}

const PHASE_COLOR = {
  [PHASE.WALKING]:   Colors.blue,
  [PHASE.TRANS_IN]:  Colors.amber,
  [PHASE.RUNNING]:   Colors.primary,
  [PHASE.TRANS_OUT]: Colors.amber,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Cardio subtype, defaulting absent/legacy exercises to 'intervals' so
// pre-existing saved sessions and synced history keep working unchanged.
const getCardioType = (ex) => ex?.cardioType ?? CARDIO_TYPES.INTERVALS;

const getExerciseName = (ex) => {
  if (!ex) return '';
  if (ex.type === EXERCISE_TYPES.WARMUP)    return `Warmup — ${ex.warmupType}`;
  if (ex.type === EXERCISE_TYPES.INTERVALS) return CARDIO_TYPE_LABELS[getCardioType(ex)];
  if (ex.type === EXERCISE_TYPES.COMBO)     return ex.name || 'Combo';
  return ex.name === 'Other' ? (ex.customName || 'Exercise') : (ex.name || 'Exercise');
};

// Body part(s) shown on the second line of the exercise list — Warmup/Intervals
// have no body part, Regular shows its single section, Combo shows the
// deduplicated set of sections across its sub-exercises.
const getExerciseBodyPart = (ex) => {
  if (!ex) return '';
  if (ex.type === EXERCISE_TYPES.REGULAR) {
    return ex.bodySection === 'Other' ? (ex.customBodySection || 'Other') : (ex.bodySection || '');
  }
  if (ex.type === EXERCISE_TYPES.COMBO) {
    const parts = [...new Set(
      (ex.subExercises ?? []).map(s => s.bodySection === 'Other' ? (s.customBodySection || 'Other') : s.bodySection).filter(Boolean)
    )];
    return parts.join(' / ');
  }
  return '';
};

const getExerciseMeta = (ex, st) => {
  if (!st) return '';
  if (ex.type === EXERCISE_TYPES.REGULAR)
    return `${st.weight}kg · ${ex.sets} sets · ${st.reps} reps`;
  if (ex.type === EXERCISE_TYPES.COMBO)
    return `${ex.subExercises?.length ?? 0} exercises · ${ex.sets} sets`;
  if (ex.type === EXERCISE_TYPES.WARMUP)
    return `${ex.warmupType} · ${ex.duration} min`;
  if (ex.type === EXERCISE_TYPES.INTERVALS) {
    const cardioType = getCardioType(ex);
    if (cardioType === CARDIO_TYPES.TREADMILL)
      return `${ex.speedKmh ?? 6}km/h · ${ex.inclinePct ?? 0}% incline · ${formatTime(ex.lengthSecs ?? 600)}`;
    if (cardioType === CARDIO_TYPES.STAIRS)
      return `${ex.speedKmh ?? 6}km/h · ${formatTime(ex.lengthSecs ?? 600)}`;
    return `${ex.reps} reps · ${ex.intervalLength}s run / ${ex.walkDuration ?? 60}s walk`;
  }
  return '';
};

const initExerciseStates = (exercises) => {
  const s = {};
  (exercises ?? []).forEach(ex => {
    if (ex.type === EXERCISE_TYPES.REGULAR) {
      s[ex.id] = { setsLeft: ex.sets, setsCompleted: 0, weight: ex.weight, reps: ex.reps, status: 'pending', setStartedAt: null };
    } else if (ex.type === EXERCISE_TYPES.COMBO) {
      s[ex.id] = {
        setsLeft: ex.sets, setsCompleted: 0, status: 'pending', setStartedAt: null,
        subWeights: (ex.subExercises ?? []).map(s => s.weight ?? 0),
        subReps:    (ex.subExercises ?? []).map(s => s.reps ?? 1),
      };
    } else if (ex.type === EXERCISE_TYPES.WARMUP) {
      s[ex.id] = { timeLeft: ex.duration ?? 180, isRunning: false, status: 'pending' };
    } else if (ex.type === EXERCISE_TYPES.INTERVALS) {
      const cardioType = getCardioType(ex);
      if (cardioType === CARDIO_TYPES.TREADMILL || cardioType === CARDIO_TYPES.STAIRS) {
        const totalSecs = ex.lengthSecs ?? 600;
        s[ex.id] = {
          cardioType, totalSecs, timeLeft: totalSecs, isRunning: false, status: 'pending',
          speedKmh: ex.speedKmh ?? 6,
          ...(cardioType === CARDIO_TYPES.TREADMILL ? { inclinePct: ex.inclinePct ?? 0 } : {}),
        };
      } else {
        s[ex.id] = {
          cardioType: CARDIO_TYPES.INTERVALS,
          repsLeft: ex.reps ?? 8, reps: ex.reps ?? 8,
          intervalLength:     ex.intervalLength     ?? 45,
          walkDuration:       ex.walkDuration       ?? 60,
          transitionDuration: ex.transitionDuration ?? 10,
          phase: null, timeLeft: 0, isRunning: false, status: 'pending',
        };
      }
    }
  });
  return s;
};

// ─── Status dot ───────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  if (status === 'complete') return <Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} />;
  if (status === 'partial')  return <Icon name="statusPartial" size={IconSize.pip} color={Colors.amber} />;
  return <View style={dotStyles.empty} />;
}
const dotStyles = StyleSheet.create({
  empty: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: Colors.border },
});

// ─── Regular exercise detail ───────────────────────────────────────────────────
function RegularDetail({ exercise, state, onUpdate, onSetStart, onSetDone, onBack }) {
  const done     = state.setsLeft === 0;
  const started  = state.setStartedAt != null;

  // Live elapsed counter while set is in progress. `now` must be re-seeded the
  // moment the set starts — otherwise it still holds the timestamp from when
  // this detail view mounted, which is *earlier* than setStartedAt and shows a
  // negative elapsed time until the first interval tick lands.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!started) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [started, state.setStartedAt]);
  const setElapsed = started ? Math.max(0, Math.floor((now - state.setStartedAt) / 1000)) : 0;

  return (
    <View style={d.container}>
      <Text style={d.name}>{getExerciseName(exercise)}</Text>
      {exercise.bodySection ? <Text style={d.subtitle}>{exercise.bodySection}</Text> : null}

      <View style={d.heroStepperRow}>
        <Stepper size="large" label="SETS LEFT" value={state.setsLeft} min={0} max={99}
          onChange={v => onUpdate({ setsLeft: v })} fillRow={false} />
      </View>

      <View style={d.stepperRow}>
        <Stepper size="large" label="WEIGHT (kg)" value={state.weight} min={0} max={500}
          onChange={v => onUpdate({ weight: v })} />
        <Stepper size="large" label="REPS" value={state.reps} min={1} max={999}
          onChange={v => onUpdate({ reps: v })} />
      </View>

      {done ? (
        <View style={d.doneBadge}>
          <Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} />
          <Text style={d.doneText}>Complete!</Text>
        </View>
      ) : !started ? (
        /* Waiting to start — show START SET */
        <TouchableOpacity style={[d.actionBtn, d.startBtn]} onPress={onSetStart} activeOpacity={0.8}>
          <Icon name="play" size={IconSize.row} color={Colors.background} />
          <Text style={d.actionTxt}>START SET</Text>
        </TouchableOpacity>
      ) : (
        /* Set in progress — show elapsed + SET DONE */
        <>
          <View style={d.elapsedRow}>
            <Icon name="timer" size={IconSize.meta} color={Colors.amber} />
            <Text style={d.elapsedTxt}>Set in progress · {formatTime(setElapsed)}</Text>
          </View>
          <TouchableOpacity style={d.actionBtn} onPress={onSetDone} activeOpacity={0.8}>
            <Icon name="check" size={IconSize.row} color={Colors.background} />
            <Text style={d.actionTxt}>SET DONE</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Icon name="back" size={IconSize.meta} color={Colors.textSecondary} />
        <Text style={d.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Combo detail ─────────────────────────────────────────────────────────────
function ComboDetail({ exercise, state, onUpdate, onSetStart, onSetDone, onBack }) {
  const done    = state.setsLeft === 0;
  const started = state.setStartedAt != null;

  // See RegularDetail — `now` is re-seeded on start so the first render of the
  // elapsed counter isn't computed against a stale (pre-start) timestamp.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!started) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [started, state.setStartedAt]);
  const setElapsed = started ? Math.max(0, Math.floor((now - state.setStartedAt) / 1000)) : 0;
  return (
    <View style={d.container}>
      <View style={d.titleRow}>
        <Icon name="combo" size={IconSize.section} color={Colors.ice} />
        <Text style={d.name}>{exercise.name || 'Combo'}</Text>
      </View>

      <View style={d.stepperRow}>
        <Stepper
          size="large"
          label="SETS LEFT"
          value={state.setsLeft}
          min={0}
          max={99}
          onChange={v => onUpdate({ setsLeft: v })}
          fillRow={false}
        />
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

      {done ? (
        <View style={d.doneBadge}><Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} /><Text style={d.doneText}>Combo Complete!</Text></View>
      ) : !started ? (
        <TouchableOpacity style={[d.actionBtn, d.startBtn]} onPress={onSetStart} activeOpacity={0.8}>
          <Icon name="play" size={IconSize.row} color={Colors.background} />
          <Text style={d.actionTxt}>START SET</Text>
        </TouchableOpacity>
      ) : (
        <>
          <View style={d.elapsedRow}>
            <Icon name="timer" size={IconSize.meta} color={Colors.amber} />
            <Text style={d.elapsedTxt}>Set in progress · {formatTime(setElapsed)}</Text>
          </View>
          <TouchableOpacity style={d.actionBtn} onPress={onSetDone} activeOpacity={0.8}>
            <Icon name="combo" size={IconSize.row} color={Colors.background} />
            <Text style={d.actionTxt}>COMBO SET DONE</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Icon name="back" size={IconSize.meta} color={Colors.textSecondary} />
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
      <View style={d.titleRow}>
        <Icon name="warmup" size={IconSize.section} color={Colors.warn} />
        <Text style={d.name}>Warmup</Text>
      </View>
      <Text style={d.subtitle}>{exercise.warmupType}</Text>

      <View style={wu.block}>
        <Text style={wu.timer}>{formatTime(state.timeLeft)}</Text>
        <Text style={wu.label}>{done ? 'DONE' : state.isRunning ? 'RUNNING' : 'PAUSED'}</Text>
      </View>

      {!done &&
        <TouchableOpacity style={[d.actionBtn, state.isRunning && {backgroundColor: Colors.amber}]}
          onPress={onToggle} activeOpacity={0.8}>
          <Icon name={state.isRunning ? 'pause' : 'play'} size={IconSize.row} color={Colors.background} />
          <Text style={d.actionTxt}>{state.isRunning ? 'PAUSE' : 'START'}</Text>
        </TouchableOpacity>
      }
      {done && <View style={d.doneBadge}><Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} /><Text style={d.doneText}>Warmup Complete!</Text></View>}

      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Icon name="back" size={IconSize.meta} color={Colors.textSecondary} />
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

  const [trackW, setTrackW] = useState(0);   // measured pixel width of the progress track

  // ── Total interval time countdown ─────────────────────────────────────────
  const cycleTime = (state.walkDuration ?? 60) + (state.intervalLength ?? 45) + 2 * (state.transitionDuration ?? 10);
  const totalTime = (state.reps ?? 8) * cycleTime;

  const currentRepElapsed = (() => {
    if (!state.phase) return 0;
    const dur = {
      [PHASE.WALKING]:   state.walkDuration   ?? 60,
      [PHASE.TRANS_IN]:  state.transitionDuration ?? 10,
      [PHASE.RUNNING]:   state.intervalLength  ?? 45,
      [PHASE.TRANS_OUT]: state.transitionDuration ?? 10,
    };
    let elapsed = 0;
    for (const ph of [PHASE.WALKING, PHASE.TRANS_IN, PHASE.RUNNING, PHASE.TRANS_OUT]) {
      if (ph === state.phase) { elapsed += dur[ph] - (state.timeLeft ?? 0); break; }
      elapsed += dur[ph];
    }
    return elapsed;
  })();
  const completedReps  = (state.reps ?? 8) - (state.repsLeft ?? state.reps ?? 8);
  const totalElapsed   = completedReps * cycleTime + currentRepElapsed;
  const totalRemaining = Math.max(0, totalTime - totalElapsed);
  const progress       = notStart ? 0 : Math.min(1, totalElapsed / Math.max(totalTime, 1));

  return (
    <View style={d.container}>
      <View style={d.titleRow}>
        <Icon name="intervals" size={IconSize.section} color={Colors.ember} />
        <Text style={d.name}>Intervals</Text>
      </View>

      <View style={iv.repsRow}>
        <Text style={iv.repsLabel}>REPS REMAINING</Text>
        <Stepper
          size="large"
          value={state.repsLeft}
          min={0}
          max={99}
          onChange={onUpdateReps}
          fillRow={false}
        />
      </View>

      <View style={[iv.phaseBox, { borderColor: pColor }]}>
        <Text style={[iv.phaseLabel, { color: pColor }]}>{pLabel}</Text>
        <Text style={[iv.timer, { color: pColor }]}>
          {notStart ? formatTime(state.walkDuration ?? 60) : formatTime(state.timeLeft)}
        </Text>

        {/* Total countdown */}
        <Text style={iv.totalTimer}>
          Total remaining: {formatTime(notStart ? totalTime : totalRemaining)}
        </Text>

        {/* Progress bar — onLayout gives us the real pixel width so fill is reliable */}
        <View
          style={iv.progressTrack}
          onLayout={e => setTrackW(e.nativeEvent.layout.width)}
        >
          <View
            style={[
              iv.progressFill,
              { width: trackW * progress, backgroundColor: pColor },
            ]}
          />
        </View>
      </View>

      {!done &&
        <TouchableOpacity style={[d.actionBtn, state.isRunning && {backgroundColor: Colors.amber}]}
          onPress={onToggle} activeOpacity={0.8}>
          <Icon name={state.isRunning ? 'pause' : 'play'} size={IconSize.row} color={Colors.background} />
          <Text style={d.actionTxt}>{state.isRunning ? 'PAUSE' : notStart ? 'START' : 'RESUME'}</Text>
        </TouchableOpacity>
      }
      {done && <View style={d.doneBadge}><Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} /><Text style={d.doneText}>Intervals Complete!</Text></View>}

      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Icon name="back" size={IconSize.meta} color={Colors.textSecondary} />
        <Text style={d.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}
const iv = StyleSheet.create({
  repsRow:       { alignItems: 'center', marginBottom: Spacing.xl },
  repsLabel:     { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.sm },
  phaseBox:      { alignItems: 'center', borderWidth: 2, borderRadius: Radius.lg, padding: Spacing.xl, marginBottom: Spacing.xl },
  phaseLabel:    { ...Typography.h2, marginBottom: Spacing.sm },
  timer:         { fontFamily: DIGITAL_FONT, fontSize: 64, letterSpacing: 4 },
  totalTimer:    { ...Typography.bodySmall, color: Colors.textMuted, marginTop: Spacing.sm, letterSpacing: 0.5 },
  progressTrack: {
    alignSelf: 'stretch',
    height: 8,
    backgroundColor: Colors.surfaceRaised,
    borderRadius: 4,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
});

// ─── Cardio (Treadmill / Stairs) detail ────────────────────────────────────────
// A single background-resilient countdown (no phase cycling), modeled on
// WarmupDetail, with a progress bar and live-adjustable speed/incline.
function CardioLengthDetail({ state, onToggle, onUpdateSpeed, onUpdateIncline, onBack }) {
  const isTreadmill = state.cardioType === CARDIO_TYPES.TREADMILL;
  const label = isTreadmill ? 'Treadmill' : 'Stairs';
  const icon  = isTreadmill ? 'treadmill' : 'stairs';
  const done     = state.status === 'complete';
  const notStart = state.status === 'pending';
  const total    = state.totalSecs ?? 600;
  const progress = notStart ? 0 : Math.min(1, (total - state.timeLeft) / Math.max(total, 1));

  const [trackW, setTrackW] = useState(0);

  return (
    <View style={d.container}>
      <View style={d.titleRow}>
        <Icon name={icon} size={IconSize.section} color={Colors.ember} />
        <Text style={d.name}>{label}</Text>
      </View>

      <View style={[iv.phaseBox, { borderColor: Colors.primary }]}>
        <Text style={[iv.phaseLabel, { color: Colors.primary }]}>
          {done ? 'DONE' : state.isRunning ? 'RUNNING' : notStart ? 'READY' : 'PAUSED'}
        </Text>
        <Text style={[iv.timer, { color: Colors.primary }]}>{formatTime(state.timeLeft)}</Text>
        <View style={iv.progressTrack} onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
          <View style={[iv.progressFill, { width: trackW * progress, backgroundColor: Colors.primary }]} />
        </View>
      </View>

      <View style={d.stepperRow}>
        <Stepper size="large" label="SPEED (km/h)" value={state.speedKmh ?? 6} min={1} max={30}
          onChange={onUpdateSpeed} />
        {isTreadmill && (
          <Stepper size="large" label="INCLINE (%)" value={state.inclinePct ?? 0} min={0} max={30}
            onChange={onUpdateIncline} />
        )}
      </View>

      {!done &&
        <TouchableOpacity style={[d.actionBtn, state.isRunning && {backgroundColor: Colors.amber}]}
          onPress={onToggle} activeOpacity={0.8}>
          <Icon name={state.isRunning ? 'pause' : 'play'} size={IconSize.row} color={Colors.background} />
          <Text style={d.actionTxt}>{state.isRunning ? 'PAUSE' : notStart ? 'START' : 'RESUME'}</Text>
        </TouchableOpacity>
      }
      {done && <View style={d.doneBadge}><Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} /><Text style={d.doneText}>{label} Complete!</Text></View>}

      <TouchableOpacity style={d.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Icon name="back" size={IconSize.meta} color={Colors.textSecondary} />
        <Text style={d.backTxt}>Back to exercises</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Shared detail styles ─────────────────────────────────────────────────────
const d = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  name:      { ...Typography.h1, color: Colors.textPrimary },
  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  subtitle:  { ...Typography.body, color: Colors.textSecondary, marginTop: -Spacing.sm },
  heroStepperRow:{ flexDirection: 'row', justifyContent: 'center', marginTop: Spacing.lg },
  stepperRow:{ flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.md, justifyContent: 'center' },
  actionBtn: { height: 64, borderRadius: Radius.lg, backgroundColor: Colors.primary,
               flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
               gap: Spacing.sm, ...Shadows.orange },
  // START SET is a lighter ember than the solid-orange SET DONE, so the two
  // states of the same button are told apart at a glance mid-workout.
  startBtn:  { backgroundColor: Colors.primaryLight },
  actionTxt: { ...Typography.h2, color: Colors.background, fontWeight: '800' },
  elapsedRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
               gap: Spacing.xs, paddingVertical: Spacing.xs },
  elapsedTxt:{ ...Typography.body, color: Colors.amber },
  doneBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
               gap: Spacing.md, padding: Spacing.lg },
  doneText:  { ...Typography.h2, color: Colors.gold },
  backBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
               gap: Spacing.xs, paddingVertical: Spacing.md },
  backTxt:   { ...Typography.body, color: Colors.textSecondary },
  subScroll: { maxHeight: 280 },
  subCard:   { backgroundColor: Colors.surfaceNested, borderRadius: Radius.md,
               padding: Spacing.md, marginBottom: Spacing.sm, gap: Spacing.sm },
  subName:   { ...Typography.h3, color: Colors.textPrimary },
  subSection:{ ...Typography.bodySmall, color: Colors.amber },
});

// ─── Body section + exercise picker, with free-text "Other" entry ─────────────
// Shared by the Regular-exercise form and each Combo sub-exercise.
function ExercisePicker({ value, onChange }) {
  const { bodySection, name, customBodySection, customName } = value;
  return (
    <>
      <Text style={qam.fieldLabel}>Body Section</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={qam.chipRow}>
          {BODY_SECTIONS.map(s => (
            <TouchableOpacity key={s} style={[qam.chip, bodySection === s && qam.chipActive]}
              onPress={() => onChange({ bodySection: s, name: '', customName: '' })}>
              <Text style={[qam.chipTxt, bodySection === s && qam.chipActiveTxt]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {bodySection && bodySection !== 'Other' ? (
        <>
          <Text style={qam.fieldLabel}>Exercise</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={qam.chipRow}>
              {(EXERCISES_BY_SECTION[bodySection] ?? []).map(n => (
                <TouchableOpacity key={n} style={[qam.chip, name === n && qam.chipActive]}
                  onPress={() => onChange({ name: n })}>
                  <Text style={[qam.chipTxt, name === n && qam.chipActiveTxt]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {name === 'Other' && (
            <TextInput
              style={qam.textInput}
              value={customName}
              onChangeText={t => onChange({ customName: t })}
              placeholder="Enter exercise name..."
              placeholderTextColor={Colors.textMuted}
            />
          )}
        </>
      ) : bodySection === 'Other' ? (
        <>
          <Text style={qam.fieldLabel}>Body Section Name</Text>
          <TextInput
            style={qam.textInput}
            value={customBodySection}
            onChangeText={t => onChange({ customBodySection: t })}
            placeholder="e.g. Forearms, Neck, Calves..."
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={qam.fieldLabel}>Exercise Name</Text>
          <TextInput
            style={qam.textInput}
            value={customName}
            onChangeText={t => onChange({ customName: t })}
            placeholder="Enter exercise name..."
            placeholderTextColor={Colors.textMuted}
          />
        </>
      ) : null}
    </>
  );
}

// ─── Quick Add Modal (ad-hoc mode) ───────────────────────────────────────────
// Simplified exercise builder for adding exercises during an ad-hoc session.
function QuickAddModal({ exercises, onAdd, onClose }) {
  const [step, setStep]     = useState('type');  // 'type' | 'form'
  const [type, setType]     = useState(null);
  const insets              = useSafeAreaInsets();

  // Form state per type
  const [warmupType, setWarmupType]   = useState('Treadmill');
  const [warmupDur, setWarmupDur]     = useState(180);
  const emptyEx = () => ({ bodySection: '', name: '', customBodySection: '', customName: '' });
  const [regEx, setRegEx]             = useState(emptyEx);
  const updateRegEx = patch => setRegEx(prev => ({ ...prev, ...patch }));
  const emptyComboSub = () => ({ ...emptyEx(), weight: 0, reps: 10 });
  const [comboSubs, setComboSubs]     = useState(() => [emptyComboSub(), emptyComboSub()]);
  const updateComboSub = (idx, patch) => setComboSubs(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  const addComboSub    = () => setComboSubs(prev => [...prev, emptyComboSub()]);
  const removeComboSub = (idx) => setComboSubs(prev => prev.filter((_, i) => i !== idx));
  const [weight, setWeight]           = useState(0);
  const [sets, setSets]               = useState(3);
  const [reps, setReps]               = useState(10);
  const [cardioSubtype, setCardioSubtype] = useState(CARDIO_TYPES.INTERVALS);
  const [ivReps, setIvReps]           = useState(8);
  const [ivRun, setIvRun]             = useState(45);
  const [ivWalk, setIvWalk]           = useState(60);
  const [ivTrans, setIvTrans]         = useState(10);
  const [cardioLengthMin, setCardioLengthMin] = useState(10);
  const [cardioSpeed, setCardioSpeed]         = useState(6);
  const [cardioIncline, setCardioIncline]     = useState(1);

  // An exercise pick is valid once it has a body section + exercise name,
  // or (for "Other") the free-text fields are actually filled in.
  const exValid = (ex) => {
    if (!ex.bodySection) return false;
    if (ex.bodySection === 'Other') return !!ex.customBodySection.trim() && !!ex.customName.trim();
    if (!ex.name) return false;
    if (ex.name === 'Other') return !!ex.customName.trim();
    return true;
  };

  const hasWarmup = exercises.some(e => e.type === EXERCISE_TYPES.WARMUP);
  const hasCardio = exercises.some(e => e.type === EXERCISE_TYPES.INTERVALS);
  const hasExercises = exercises.length > 0;

  const typeOptions = [
    !hasWarmup && !hasExercises && { key: EXERCISE_TYPES.WARMUP, icon: 'warmup', label: 'Warmup', color: Colors.amber },
    { key: EXERCISE_TYPES.REGULAR, icon: 'barbell', label: 'Exercise', color: Colors.primary },
    { key: EXERCISE_TYPES.COMBO,   icon: 'combo', label: 'Combo', color: Colors.blue },
    !hasCardio && { key: EXERCISE_TYPES.INTERVALS, icon: 'intervals',  label: 'Cardio', color: Colors.gold },
  ].filter(Boolean);

  const selectType = (t) => { setType(t); setStep('form'); };

  const confirm = () => {
    const id = generateId();
    if (type === EXERCISE_TYPES.WARMUP)
      return onAdd({ id, type, warmupType, duration: warmupDur });
    if (type === EXERCISE_TYPES.REGULAR)
      return onAdd({ id, type, ...regEx, weight, sets, reps });
    if (type === EXERCISE_TYPES.COMBO)
      return onAdd({ id, type, name: 'Combo', sets,
        subExercises: comboSubs.map(sub => ({ id: generateId(), ...sub })) });
    if (type === EXERCISE_TYPES.INTERVALS) {
      if (cardioSubtype === CARDIO_TYPES.INTERVALS)
        return onAdd({ id, type, cardioType: cardioSubtype, reps: ivReps, intervalLength: ivRun, walkDuration: ivWalk, transitionDuration: ivTrans });
      const base = { id, type, cardioType: cardioSubtype, lengthSecs: cardioLengthMin * 60, speedKmh: cardioSpeed };
      return onAdd(cardioSubtype === CARDIO_TYPES.TREADMILL ? { ...base, inclinePct: cardioIncline } : base);
    }
  };

  const isFormValid =
    type === EXERCISE_TYPES.REGULAR ? exValid(regEx) :
    type === EXERCISE_TYPES.COMBO   ? comboSubs.every(exValid) :
    true;

  return (
    <View style={qam.overlay}>
      <View style={[qam.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Header */}
        <View style={qam.header}>
          <TouchableOpacity onPress={step === 'form' ? () => setStep('type') : onClose} style={qam.backBtn}>
            <Icon name={step === 'form' ? 'back' : 'close'} size={IconSize.row} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={qam.title}>{step === 'type' ? 'Add Exercise' : type}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: Spacing.md, padding: Spacing.lg }}>
          {/* ── Step 1: Type picker ── */}
          {step === 'type' && typeOptions.map(opt => (
            <TouchableOpacity key={opt.key} style={[qam.typeCard, { borderColor: opt.color + '55' }]}
              onPress={() => selectType(opt.key)} activeOpacity={0.8}>
              <Icon name={opt.icon} size={IconSize.tab} color={opt.color} />
              <Text style={[qam.typeLabel, { color: opt.color }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}

          {/* ── Step 2: Forms ── */}
          {step === 'form' && type === EXERCISE_TYPES.WARMUP && (
            <>
              <Text style={qam.fieldLabel}>Warmup Type</Text>
              <View style={qam.chipRow}>
                {WARMUP_TYPES.map(t => (
                  <TouchableOpacity key={t} style={[qam.chip, warmupType === t && qam.chipActive]}
                    onPress={() => setWarmupType(t)}>
                    <Text style={[qam.chipTxt, warmupType === t && qam.chipActiveTxt]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={qam.fieldLabel}>Duration (seconds)</Text>
              <View style={qam.stepperRow}>
                <Stepper value={warmupDur} onChange={setWarmupDur} min={10} max={3600} label="Seconds" />
                <Text style={qam.timerHint}>{formatTime(warmupDur)}</Text>
              </View>
            </>
          )}

          {step === 'form' && type === EXERCISE_TYPES.REGULAR && (
            <>
              <ExercisePicker value={regEx} onChange={updateRegEx} />
              <View style={qam.stepperRow}>
                <Stepper value={weight} onChange={setWeight} min={0} max={500} label="Weight (kg)" />
                <Stepper value={sets}   onChange={setSets}   min={1} max={99}  label="Sets" />
                <Stepper value={reps}   onChange={setReps}   min={1} max={999} label="Reps" />
              </View>
            </>
          )}

          {step === 'form' && type === EXERCISE_TYPES.COMBO && (
            <>
              <View style={qam.stepperRow}>
                <Stepper value={sets} onChange={setSets} min={1} max={99} label="Sets (whole combo)" />
              </View>
              {comboSubs.map((sub, idx) => (
                <View key={idx} style={qam.subCard}>
                  <View style={qam.subCardHeader}>
                    <Text style={qam.subCardTitle}>Exercise {idx + 1}</Text>
                    {comboSubs.length > 2 && (
                      <TouchableOpacity onPress={() => removeComboSub(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Icon name="close" size={IconSize.meta} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <ExercisePicker value={sub} onChange={patch => updateComboSub(idx, patch)} />
                  <View style={qam.stepperRow}>
                    <Stepper value={sub.weight} onChange={v => updateComboSub(idx, { weight: v })} min={0} max={500} label="Weight (kg)" />
                    <Stepper value={sub.reps}   onChange={v => updateComboSub(idx, { reps: v })}   min={1} max={999} label="Reps" />
                  </View>
                </View>
              ))}
              <TouchableOpacity style={qam.addSubBtn} onPress={addComboSub} activeOpacity={0.8}>
                <Icon name="add" size={IconSize.meta} color={Colors.primary} />
                <Text style={qam.addSubBtnTxt}>Add Exercise to Combo</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'form' && type === EXERCISE_TYPES.INTERVALS && (
            <>
              <Text style={qam.fieldLabel}>Cardio Type</Text>
              <View style={qam.chipRow}>
                {Object.values(CARDIO_TYPES).map(ct => (
                  <TouchableOpacity key={ct} style={[qam.chip, cardioSubtype === ct && qam.chipActive]}
                    onPress={() => setCardioSubtype(ct)}>
                    <Text style={[qam.chipTxt, cardioSubtype === ct && qam.chipActiveTxt]}>{CARDIO_TYPE_LABELS[ct]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {cardioSubtype === CARDIO_TYPES.INTERVALS && (
                <>
                  <View style={qam.stepperRow}>
                    <Stepper value={ivReps}  onChange={setIvReps}  min={1} max={99}  label="Reps" />
                    <Stepper value={ivRun}   onChange={setIvRun}   min={5} max={600} label="Run (sec)" />
                  </View>
                  <View style={qam.stepperRow}>
                    <Stepper value={ivWalk}  onChange={setIvWalk}  min={5} max={600} label="Walk (sec)" />
                    <Stepper value={ivTrans} onChange={setIvTrans} min={0} max={60}  label="Trans. (sec)" />
                  </View>
                </>
              )}

              {(cardioSubtype === CARDIO_TYPES.TREADMILL || cardioSubtype === CARDIO_TYPES.STAIRS) && (
                <View style={qam.stepperRow}>
                  <Stepper value={cardioLengthMin} onChange={setCardioLengthMin} min={1} max={180} label="Length (min)" />
                  <Stepper value={cardioSpeed}     onChange={setCardioSpeed}     min={1} max={30}  label="Speed (km/h)" />
                  {cardioSubtype === CARDIO_TYPES.TREADMILL && (
                    <Stepper value={cardioIncline} onChange={setCardioIncline} min={0} max={30} label="Incline (%)" />
                  )}
                </View>
              )}
            </>
          )}

          {step === 'form' && (
            <TouchableOpacity
              style={[qam.confirmBtn, !isFormValid && { opacity: 0.4 }]}
              onPress={confirm}
              activeOpacity={0.8}
              disabled={!isFormValid}
            >
              <Icon name="check" size={IconSize.row} color={Colors.background} />
              <Text style={qam.confirmTxt}>Add to Session</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
const qam = StyleSheet.create({
  overlay:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000A', justifyContent: 'flex-end', zIndex: 999 },
  sheet:       { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, maxHeight: '85%' },
  header:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn:     { width: 40 },
  title:       { ...Typography.h2, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  typeCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surfaceRaised, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1 },
  typeLabel:   { ...Typography.h3, fontWeight: '700' },
  fieldLabel:  { ...Typography.label, color: Colors.textSecondary },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip:        { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, backgroundColor: Colors.surfaceRaised },
  chipActive:  { backgroundColor: Colors.primary },
  chipTxt:     { ...Typography.bodySmall, color: Colors.textSecondary },
  chipActiveTxt:{ color: Colors.background, fontWeight: '700' },
  stepperRow:  { flexDirection: 'row', gap: Spacing.sm },
  timerHint:   { ...Typography.timerMedium, color: Colors.amber, alignSelf: 'flex-end', fontFamily: DIGITAL_FONT, letterSpacing: 2, paddingBottom: 4 },
  helpTxt:     { ...Typography.bodySmall, color: Colors.textMuted, fontStyle: 'italic' },
  textInput:   { height: 44, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised,
                 paddingHorizontal: Spacing.md, ...Typography.body, color: Colors.textPrimary },
  subCard:     { gap: Spacing.sm, backgroundColor: Colors.surfaceNested, borderRadius: Radius.lg,
                 padding: Spacing.md },
  subCardHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subCardTitle:{ ...Typography.label, color: Colors.textSecondary },
  addSubBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
                 height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary + '55' },
  addSubBtnTxt:{ ...Typography.bodySmall, color: Colors.primary, fontWeight: '600' },
  confirmBtn:  { height: 56, borderRadius: Radius.full, backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  confirmTxt:  { ...Typography.h3, color: Colors.background, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TrainingScreen({ navigation, route }) {
  useKeepAwake();

  const { session: sessionParam, adHoc = false } = route.params ?? {};

  // Ad-hoc mode: exercises live in state, not in a pre-defined session
  const sessionIdRef    = useRef(sessionParam?.id ?? generateId());
  const sessionNameRef  = useRef(sessionParam?.name ?? `Quick Training — ${new Date().toLocaleDateString('en',{month:'short',day:'numeric'})}`);
  const [adHocExercises, setAdHocExercises] = useState(sessionParam?.exercises ?? []);
  const [showQuickAdd,   setShowQuickAdd]   = useState(false);

  // Computed session view (stable in normal mode, reactive in ad-hoc)
  const session = adHoc
    ? { id: sessionIdRef.current, name: sessionNameRef.current, exercises: adHocExercises, restTimerSecs: sessionParam?.restTimerSecs ?? 60 }
    : sessionParam;

  // ── Timeline ─────────────────────────────────────────────────────────────
  const timelineRef = useRef([{ t: 0, action: 'session_start' }]);
  const startTimeRef = useRef(null); // set once on mount, used by addEvent
  const addEvent = useCallback((action, details = {}) => {
    if (!startTimeRef.current) return;
    const t = Math.floor((Date.now() - startTimeRef.current) / 1000);
    timelineRef.current.push({ t, action, ...details });
  }, []);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Session timer
  const [elapsedSec, setElapsedSec]   = useState(0);

  // End confirmation
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Scheduled notification IDs — cancelled when timer completes in-app
  const restNotifRef        = useRef(null);
  const warmupNotifRef      = useRef(null);
  const intervalsNotifRef   = useRef(null);
  const cardioLengthNotifRef = useRef(null);

  // Rest timer
  const [restSec, setRestSec]         = useState(session?.restTimerSecs ?? 60);
  const [restActive, setRestActive]   = useState(false);
  const restEndTimeRef                = useRef(null); // absolute ms timestamp rest is due to end

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

  // When exercises are added in ad-hoc mode, initialize state for the new ones
  const prevExerciseIds = useRef(new Set((session?.exercises ?? []).map(e => e.id)));
  useEffect(() => {
    if (!adHoc) return;
    const newExs = adHocExercises.filter(e => !prevExerciseIds.current.has(e.id));
    if (!newExs.length) return;
    newExs.forEach(e => prevExerciseIds.current.add(e.id));
    const newStates = initExerciseStates(newExs);
    setExStates(prev => ({ ...prev, ...newStates }));
  }, [adHocExercises, adHoc]);

  // Performance order
  const [perfOrder, setPerfOrder] = useState([]);
  const [startTime]               = useState(new Date());

  // Set startTimeRef once so addEvent can compute elapsed seconds
  useEffect(() => { startTimeRef.current = startTime.getTime(); }, [startTime]);

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

  // ─── Sounds + notification permissions ──────────────────────────────────
  useEffect(() => {
    initAudio().then(() => loadSounds());
    requestNotificationPermissions();
    return () => {
      unloadSounds();
      cancelAllTimerNotifications();
    };
  }, []);

  // ─── Session timer (always running) ─────────────────────────────────────
  useEffect(() => {
    const tick = () => setElapsedSec(Math.floor((Date.now() - startTime.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  // ─── Rest timer ──────────────────────────────────────────────────────────
  const restTick = useCallback(() => {
    if (restEndTimeRef.current == null) return;
    const remaining = Math.max(0, Math.round((restEndTimeRef.current - Date.now()) / 1000));
    if (remaining <= 0) {
      cancelTimerNotification(restNotifRef.current); restNotifRef.current = null;
      addEvent('rest_end');
      playRestBeep();
      restEndTimeRef.current = null;
      setRestSec(session?.restTimerSecs ?? 60);
      setRestActive(false);
    } else {
      setRestSec(remaining);
    }
  }, [session, addEvent]);

  useEffect(() => {
    if (!restActive) return;
    restTick();
    const id = setInterval(restTick, 1000);
    return () => clearInterval(id);
  }, [restActive]);

  // ─── Warmup timer ────────────────────────────────────────────────────────
  const warmupEx = useMemo(() => session?.exercises?.find(e => e.type === EXERCISE_TYPES.WARMUP), [session]);
  const warmupRef = useRef(null);
  const warmupEndTimeRef = useRef(null); // absolute ms timestamp warmup is due to end
  useEffect(() => { if (warmupEx) warmupRef.current = exStates[warmupEx.id]; }, [exStates, warmupEx]);

  const warmupTick = useCallback(() => {
    const cur = warmupRef.current;
    if (!cur?.isRunning || warmupEndTimeRef.current == null) return;
    const remaining = Math.max(0, Math.round((warmupEndTimeRef.current - Date.now()) / 1000));
    if (remaining <= 0) {
      cancelTimerNotification(warmupNotifRef.current); warmupNotifRef.current = null;
      addEvent('warmup_end', { exerciseName: warmupEx?.warmupType });
      playRestBeep();
      warmupEndTimeRef.current = null;
      setExStates(prev => ({ ...prev, [warmupEx.id]: { ...prev[warmupEx.id], timeLeft: 0, isRunning: false, status: 'complete' } }));
      addToPerfOrder(warmupEx.id);
      setSelectedId(null);
    } else {
      setExStates(prev => ({ ...prev, [warmupEx.id]: { ...prev[warmupEx.id], timeLeft: remaining } }));
    }
  }, [warmupEx, addEvent]);

  useEffect(() => {
    if (!warmupEx) return;
    if (!exStates[warmupEx.id]?.isRunning) return;
    warmupTick();
    const id = setInterval(warmupTick, 1000);
    return () => clearInterval(id);
  }, [exStates[warmupEx?.id]?.isRunning]);

  // ─── Cardio timer (Intervals subtype) ───────────────────────────────────
  const cardioEx = useMemo(() => session?.exercises?.find(e => e.type === EXERCISE_TYPES.INTERVALS), [session]);
  const cardioSubtype = getCardioType(cardioEx);
  const intervalsEx = cardioEx; // kept as an alias below — only used when subtype === 'intervals'
  const intervalsRef = useRef(null);
  const intervalsPhaseEndRef = useRef(null); // absolute ms timestamp current phase is due to end
  useEffect(() => { if (cardioEx) intervalsRef.current = exStates[cardioEx.id]; }, [exStates, cardioEx]);

  const intervalsTick = useCallback(() => {
    if (!intervalsEx || cardioSubtype !== CARDIO_TYPES.INTERVALS || intervalsPhaseEndRef.current == null) return;
    const cur = intervalsRef.current;
    if (!cur?.isRunning) return;
    const now = Date.now();

    if (intervalsPhaseEndRef.current > now) {
      // Still within the current phase — just update the visual countdown
      const remaining = Math.ceil((intervalsPhaseEndRef.current - now) / 1000);
      if (remaining !== cur.timeLeft) {
        setExStates(prev => ({ ...prev, [intervalsEx.id]: { ...prev[intervalsEx.id], timeLeft: remaining } }));
      }
      return;
    }

    // Current phase (or several, if catching up from background) has elapsed
    const prevPhase = cur.phase;
    const prevReps  = cur.repsLeft;
    const { state: nextSt, phaseEndMs } = fastForwardIntervals(cur, intervalsPhaseEndRef.current, now);
    intervalsPhaseEndRef.current = nextSt.isRunning ? phaseEndMs : null;
    setExStates(prev => ({ ...prev, [intervalsEx.id]: nextSt }));
    if (nextSt.phase !== prevPhase || nextSt.repsLeft !== prevReps) {
      playIntervalBeep();
      addEvent('interval_phase', {
        phase:   nextSt.phase,
        repsDone: (nextSt.reps ?? 8) - (nextSt.repsLeft ?? 0),
        repsLeft: nextSt.repsLeft,
      });
    }
    if (nextSt.status === 'complete') {
      addEvent('intervals_done');
      cancelTimerNotification(intervalsNotifRef.current); intervalsNotifRef.current = null;
      setTimeout(() => { addToPerfOrder(intervalsEx.id); setSelectedId(null); }, 300);
    } else if (nextSt.isRunning && phaseEndMs) {
      // Reschedule notification for the new phase end
      cancelTimerNotification(intervalsNotifRef.current);
      const secsUntilNextPhase = Math.ceil((phaseEndMs - now) / 1000);
      const phaseLabel = nextSt.phase === PHASE.RUNNING ? 'Stop running!' : nextSt.phase === PHASE.WALKING ? 'Start walking' : 'Transition!';
      scheduleTimerNotification(secsUntilNextPhase, `Intervals — ${phaseLabel} 🏃`, 'beep_interval.wav')
        .then(id => { intervalsNotifRef.current = id; });
    }
  }, [intervalsEx, addEvent]);

  useEffect(() => {
    if (!intervalsEx || cardioSubtype !== CARDIO_TYPES.INTERVALS) return;
    if (!exStates[intervalsEx.id]?.isRunning) return;
    const id = setInterval(intervalsTick, 1000);
    return () => clearInterval(id);
  }, [exStates[intervalsEx?.id]?.isRunning, cardioSubtype]);

  // ─── Cardio timer (Treadmill / Stairs subtypes) ─────────────────────────
  // Single background-resilient countdown, anchored to an absolute end
  // timestamp — mirrors the Warmup timer exactly (no phase cycling needed).
  const cardioLengthEndRef = useRef(null); // absolute ms timestamp the length is due to end

  const cardioLengthTick = useCallback(() => {
    if (!cardioEx || cardioSubtype === CARDIO_TYPES.INTERVALS || cardioLengthEndRef.current == null) return;
    const cur = intervalsRef.current;
    if (!cur?.isRunning) return;
    const remaining = Math.max(0, Math.round((cardioLengthEndRef.current - Date.now()) / 1000));
    if (remaining <= 0) {
      cancelTimerNotification(cardioLengthNotifRef.current); cardioLengthNotifRef.current = null;
      addEvent('cardio_length_end', { cardioType: cardioSubtype, exerciseName: getExerciseName(cardioEx) });
      playRestBeep();
      cardioLengthEndRef.current = null;
      setExStates(prev => ({ ...prev, [cardioEx.id]: { ...prev[cardioEx.id], timeLeft: 0, isRunning: false, status: 'complete' } }));
      addToPerfOrder(cardioEx.id);
      setSelectedId(null);
    } else {
      setExStates(prev => ({ ...prev, [cardioEx.id]: { ...prev[cardioEx.id], timeLeft: remaining } }));
    }
  }, [cardioEx, cardioSubtype, addEvent]);

  useEffect(() => {
    if (!cardioEx || cardioSubtype === CARDIO_TYPES.INTERVALS) return;
    if (!exStates[cardioEx.id]?.isRunning) return;
    const id = setInterval(cardioLengthTick, 1000);
    return () => clearInterval(id);
  }, [exStates[cardioEx?.id]?.isRunning, cardioSubtype]);

  // ─── Resync all timers immediately when returning from background ─────────
  // Android suspends/throttles JS timers while the app isn't foregrounded, so
  // setInterval ticks can be delayed or skipped entirely. Every timer above is
  // anchored to an absolute target timestamp (Date.now()-based), so simply
  // re-running each tick function here recomputes the correct value from real
  // elapsed time — no drift, no missed beeps, no waiting up to a second for
  // the next scheduled tick to catch the display up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      setElapsedSec(Math.floor((Date.now() - startTime.getTime()) / 1000));
      restTick();
      warmupTick();
      intervalsTick();
      cardioLengthTick();
    });
    return () => sub.remove();
  }, [startTime, restTick, warmupTick, intervalsTick, cardioLengthTick]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const addToPerfOrder = useCallback((id) => {
    setPerfOrder(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const activateRest = useCallback(() => {
    const secs = session?.restTimerSecs ?? 60;
    restEndTimeRef.current = Date.now() + secs * 1000;
    addEvent('rest_start', { durationSecs: secs });
    setRestSec(secs);
    setRestActive(true);
    // Keep the promise, not just the resolved id: rest can be cut short before
    // scheduling has resolved, and cancelling by a still-null ref would leave
    // the "rest over" alert to fire in the middle of the next set.
    restNotifRef.current = scheduleTimerNotification(secs, 'Rest over — time to lift! 💪', 'beep_rest.wav');
  }, [session, addEvent]);

  // Cut rest short — the athlete is back under the bar, so the countdown and
  // its "rest over" notification are no longer wanted.
  const stopRest = useCallback(() => {
    if (restEndTimeRef.current == null) return;
    cancelTimerNotification(restNotifRef.current); restNotifRef.current = null;
    restEndTimeRef.current = null;
    addEvent('rest_end', { interrupted: true });
    setRestSec(session?.restTimerSecs ?? 60);
    setRestActive(false);
  }, [session, addEvent]);

  // ─── Auto-complete check ─────────────────────────────────────────────────
  // Skipped in ad-hoc mode: there the exercise list is built as you go, so
  // "everything done" is the normal state between adding exercises and would
  // pop the end-session prompt after every single one.
  useEffect(() => {
    if (adHoc) return;
    const exs = session?.exercises ?? [];
    if (!exs.length) return;
    const allDone = exs.every(e => exStates[e.id]?.status === 'complete');
    if (allDone) {
      setTimeout(() => setShowEndConfirm(true), 600);
    }
  }, [exStates, adHoc]);

  // ─── End session ─────────────────────────────────────────────────────────
  const doEndSession = useCallback((save = true) => {
    const exs = session?.exercises ?? [];
    const allIds   = exs.map(e => e.id);
    const remaining = allIds.filter(id => !perfOrder.includes(id));
    const ordered   = [...perfOrder, ...remaining];

    addEvent('session_end');

    const summary = {
      sessionName: session?.name ?? 'Session',
      sessionId:   session?.id ?? '',
      startTime:   startTime.toISOString(),
      endTime:     new Date().toISOString(),
      totalDurationSecs: elapsedSec,
      timeline:    timelineRef.current,
      exercises: ordered.map((id, idx) => {
        const ex = exs.find(e => e.id === id);
        const st = exStatesRef.current[id];
        const base = { id, type: ex?.type, name: getExerciseName(ex), status: st?.status ?? 'pending', performanceOrder: idx };
        if (ex?.type === EXERCISE_TYPES.REGULAR)
          return { ...base, bodySection: ex?.bodySection, weight: st.weight, reps: st.reps, plannedSets: ex.sets, completedSets: st.setsCompleted };
        if (ex?.type === EXERCISE_TYPES.COMBO)
          return { ...base, plannedSets: ex.sets, completedSets: st.setsCompleted,
            subExercises: (ex.subExercises ?? []).map((s, i) => ({
              name: s.name === 'Other' ? s.customName : s.name,
              bodySection: s.bodySection,
              weight: st.subWeights?.[i], reps: st.subReps?.[i],
            })) };
        if (ex?.type === EXERCISE_TYPES.WARMUP)
          return { ...base, warmupType: ex.warmupType, plannedDurationSecs: ex.duration ?? 180 };
        if (ex?.type === EXERCISE_TYPES.INTERVALS) {
          const cardioType = getCardioType(ex);
          if (cardioType !== CARDIO_TYPES.INTERVALS)
            return { ...base, cardioType,
              plannedDurationSecs: ex.lengthSecs ?? 600,
              completedDurationSecs: (ex.lengthSecs ?? 600) - (st?.timeLeft ?? ex.lengthSecs ?? 600),
              speedKmh: st?.speedKmh ?? ex.speedKmh,
              ...(cardioType === CARDIO_TYPES.TREADMILL ? { inclinePct: st?.inclinePct ?? ex.inclinePct } : {}) };
          return { ...base, cardioType, plannedReps: ex.reps, completedReps: ex.reps - (st?.repsLeft ?? 0), intervalLengthSecs: ex.intervalLength };
        }
        return base;
      }),
      saved: save,
    };

    playCompleteSound();
    cancelAllTimerNotifications();
    if (save) syncWorkout(summary);
    navigatingAway.current = true;
    navigation.replace('Summary', {
      summary,
      reusableSession: adHoc ? {
        exercises: adHocExercises,
        restTimerSecs: session?.restTimerSecs,
        suggestedName: session?.name,
      } : null,
    });
  }, [elapsedSec, perfOrder, session, startTime, navigation, addEvent, adHoc, adHocExercises]);

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
          status = st.status; // maintained correctly: pending → partial on start → complete when done
        return { ...prev, [id]: { ...st, isRunning: false, status } };
      });
    }
    setSelectedId(null);
  }, [session]);

  const handleSetStart = useCallback((id) => {
    stopRest();   // rest is over the moment the next set begins
    const ex = (session?.exercises ?? []).find(e => e.id === id);
    const st = exStatesRef.current[id];
    addEvent('set_start', {
      exerciseName: getExerciseName(ex),
      bodySection:  ex?.bodySection ?? null,
      setNumber:    (st?.setsCompleted ?? 0) + 1,
    });
    setExStates(prev => ({ ...prev, [id]: { ...prev[id], setStartedAt: Date.now() } }));
  }, [session, addEvent, stopRest]);

  const handleSetDone = useCallback((id) => {
    setExStates(prev => {
      const st = prev[id];
      if (!st || st.setsLeft <= 0) return prev;
      const setsLeft      = st.setsLeft - 1;
      const setsCompleted = st.setsCompleted + 1;
      const status        = setsLeft === 0 ? 'complete' : 'partial';
      if (setsLeft === 0) setTimeout(() => setSelectedId(null), 400);
      const ex = (session?.exercises ?? []).find(e => e.id === id);
      const durationSecs = st.setStartedAt
        ? Math.round((Date.now() - st.setStartedAt) / 1000)
        : undefined;
      // A combo's weights live in subWeights/subReps, not weight/reps — logging
      // st.weight for one wrote `undefined`, which is why no historic combo
      // could be reconstructed from the timeline. Log what was actually lifted.
      const load = ex?.type === EXERCISE_TYPES.COMBO
        ? {
            subExercises: (ex.subExercises ?? []).map((sub, i) => ({
              name:   sub.name === 'Other' ? (sub.customName || `Exercise ${i + 1}`) : sub.name,
              bodySection: sub.bodySection ?? null,
              weight: st.subWeights?.[i],
              reps:   st.subReps?.[i],
            })),
          }
        : { weight: st.weight, reps: st.reps };

      addEvent('set_done', {
        exerciseName: getExerciseName(ex),
        bodySection:  ex?.bodySection ?? null,
        setNumber:    setsCompleted,
        setsLeft,
        ...load,
        durationSecs,
      });
      return { ...prev, [id]: { ...st, setsLeft, setsCompleted, status, setStartedAt: null } };
    });
    activateRest();
  }, [activateRest, session, addEvent]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const exercises     = session?.exercises ?? [];
  const selectedEx    = selectedId ? exercises.find(e => e.id === selectedId) : null;
  const selectedState = selectedId ? exStates[selectedId] : null;
  const contentH      = windowHeight - headerH;

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View
        style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}
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
          <>
            <FlatList
              data={exercises}
              keyExtractor={item => item.id}
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xl }]}
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
                    {getExerciseBodyPart(item) ? (
                      <Text style={styles.exBodyPart}>{getExerciseBodyPart(item)}</Text>
                    ) : null}
                    <Text style={styles.exMeta}>{getExerciseMeta(item, st)}</Text>
                  </View>
                  <Icon name="forward" size={IconSize.meta} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            }}
          />
          {/* Ad-hoc Quick Add button */}
          {adHoc && (
            <TouchableOpacity
              style={styles.quickAddFab}
              onPress={() => setShowQuickAdd(true)}
              activeOpacity={0.85}
            >
              <Icon name="add" size={IconSize.tab} color={Colors.background} />
              <Text style={styles.quickAddTxt}>Add Exercise</Text>
            </TouchableOpacity>
          )}
          </>
        ) : (
          /* Exercise detail */
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.lg }}
          >
            {selectedEx.type === EXERCISE_TYPES.REGULAR && (
              <RegularDetail exercise={selectedEx} state={selectedState}
                onUpdate={p => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...p } }))}
                onSetStart={() => handleSetStart(selectedId)}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBack(selectedId)} />
            )}
            {selectedEx.type === EXERCISE_TYPES.COMBO && (
              <ComboDetail exercise={selectedEx} state={selectedState}
                onUpdate={p => setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...p } }))}
                onSetStart={() => handleSetStart(selectedId)}
                onSetDone={() => handleSetDone(selectedId)}
                onBack={() => goBack(selectedId)} />
            )}
            {selectedEx.type === EXERCISE_TYPES.WARMUP && (
              <WarmupDetail exercise={selectedEx} state={selectedState}
                onToggle={() => setExStates(prev => {
                  const st = prev[selectedId];
                  const starting = !st.isRunning;
                  if (starting) {
                    warmupEndTimeRef.current = Date.now() + st.timeLeft * 1000;
                    addEvent('warmup_start', { exerciseName: selectedEx?.warmupType, durationSecs: st.timeLeft });
                    scheduleTimerNotification(st.timeLeft, 'Warmup complete — session started! 🔥', 'beep_rest.wav')
                      .then(id => { warmupNotifRef.current = id; });
                  } else {
                    cancelTimerNotification(warmupNotifRef.current);
                    warmupNotifRef.current = null;
                  }
                  return { ...prev, [selectedId]: { ...st, isRunning: starting } };
                })}
                onBack={() => goBack(selectedId)} />
            )}
            {selectedEx.type === EXERCISE_TYPES.INTERVALS && cardioSubtype === CARDIO_TYPES.INTERVALS && (
              <IntervalsDetail exercise={selectedEx} state={selectedState}
                onToggle={() => setExStates(prev => {
                  const st = prev[selectedId];
                  const starting = !st.isRunning && st.phase === null;
                  const willRun = !st.isRunning;
                  if (starting) addToPerfOrder(selectedId);
                  const newTimeLeft = starting ? st.walkDuration : st.timeLeft;
                  if (willRun) {
                    intervalsPhaseEndRef.current = Date.now() + newTimeLeft * 1000;
                    scheduleTimerNotification(newTimeLeft, 'Intervals — Start running! 🏃', 'beep_interval.wav')
                      .then(id => { intervalsNotifRef.current = id; });
                  } else {
                    cancelTimerNotification(intervalsNotifRef.current);
                    intervalsNotifRef.current = null;
                  }
                  return { ...prev, [selectedId]: {
                    ...st, isRunning: willRun,
                    status:   starting ? 'partial'        : st.status,
                    phase:    starting ? PHASE.WALKING    : st.phase,
                    timeLeft: newTimeLeft,
                  }};
                })}
                onUpdateReps={v => setExStates(prev => ({
                  ...prev, [selectedId]: { ...prev[selectedId], repsLeft: Math.max(0, v) }
                }))}
                onBack={() => goBack(selectedId)} />
            )}
            {selectedEx.type === EXERCISE_TYPES.INTERVALS && cardioSubtype !== CARDIO_TYPES.INTERVALS && (
              <CardioLengthDetail state={selectedState}
                onToggle={() => setExStates(prev => {
                  const st = prev[selectedId];
                  const starting = st.status === 'pending';
                  const willRun = !st.isRunning;
                  if (starting) addToPerfOrder(selectedId);
                  if (willRun) {
                    cardioLengthEndRef.current = Date.now() + st.timeLeft * 1000;
                    const label = cardioSubtype === CARDIO_TYPES.TREADMILL ? 'Treadmill' : 'Stairs';
                    addEvent('cardio_length_start', { cardioType: cardioSubtype, exerciseName: getExerciseName(selectedEx), durationSecs: st.timeLeft });
                    scheduleTimerNotification(st.timeLeft, `${label} complete! 🏁`, 'beep_rest.wav')
                      .then(id => { cardioLengthNotifRef.current = id; });
                  } else {
                    cancelTimerNotification(cardioLengthNotifRef.current);
                    cardioLengthNotifRef.current = null;
                  }
                  return { ...prev, [selectedId]: { ...st, isRunning: willRun, status: starting ? 'partial' : st.status } };
                })}
                onUpdateSpeed={v => setExStates(prev => ({
                  ...prev, [selectedId]: { ...prev[selectedId], speedKmh: Math.max(0, v) }
                }))}
                onUpdateIncline={v => setExStates(prev => ({
                  ...prev, [selectedId]: { ...prev[selectedId], inclinePct: Math.max(0, v) }
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
              Save this session to your stats, or discard it — handy for testing or demoing without affecting your history.
            </Text>
            <TouchableOpacity
              style={styles.confirmCancelBtn}
              onPress={() => setShowEndConfirm(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmCancelTxt}>Keep Training</Text>
            </TouchableOpacity>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmDiscardBtn}
                onPress={() => { setShowEndConfirm(false); doEndSession(false); }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmDiscardTxt}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmEndBtn}
                onPress={() => { setShowEndConfirm(false); doEndSession(true); }}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmEndTxt}>Save & End</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── Quick Add Exercise (ad-hoc mode) ───────────────────────── */}
      {showQuickAdd && (
        <QuickAddModal
          exercises={exercises}
          onAdd={(ex) => {
            setAdHocExercises(prev => [...prev, ex]);
            setShowQuickAdd(false);
          }}
          onClose={() => setShowQuickAdd(false)}
        />
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
  exBodyPart:  { ...Typography.bodySmall, color: Colors.amber, marginTop: 2 },
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
    height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmCancelTxt: { ...Typography.h3, color: Colors.textSecondary },
  confirmDiscardBtn: {
    flex: 1, height: 48, borderRadius: Radius.md,
    backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmDiscardTxt: { ...Typography.h3, color: Colors.danger, fontWeight: '700' },
  confirmEndBtn: {
    flex: 1, height: 48, borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmEndTxt: { ...Typography.h3, color: Colors.background, fontWeight: '700' },

  // Ad-hoc Quick Add FAB
  quickAddFab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.primary,
    margin: Spacing.md, height: 52, borderRadius: Radius.full, ...Shadows.orange,
  },
  quickAddTxt: { ...Typography.h3, color: Colors.background, fontWeight: '700' },
});
