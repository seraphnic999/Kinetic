import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, StatusBar, FlatList, useWindowDimensions, Animated,
  Platform, AppState,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, IconSize, Touch, Elevation, onAccent } from '../theme';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SetPips } from '../components/SetPips';
import { WeightField, RepsField } from '../components/NumberField';
import { RestHero } from '../components/RestHero';
import { EmptyState } from '../components/States';
import { formatTime } from '../utils/time';
import { lbLabel } from '../utils/units';
import { lastFor, getExerciseHistory, peekExerciseHistory } from '../utils/exerciseHistory';
import { overloadSuggestion } from '../utils/overload';
import { dayLabel } from '../utils/analytics';
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
  [PHASE.WALKING]:   Colors.ice,
  [PHASE.TRANS_IN]:  Colors.warn,
  [PHASE.RUNNING]:   Colors.ember,
  [PHASE.TRANS_OUT]: Colors.warn,
};

const SECTION_ICON = {
  Chest: 'bodyChest', Back: 'bodyBack', Shoulders: 'bodyShoulders',
  'Front Arms': 'bodyArmsFront', 'Back Arms': 'bodyArmsBack',
  Legs: 'bodyLegs', Core: 'bodyCore', Other: 'bodyOther',
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
    return `${ex.warmupType} · ${formatTime(ex.duration ?? 180)}`;
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

/**
 * Splice mid-session additions in before the cardio.
 *
 * The app's convention everywhere else is warmup first, cardio last — the
 * editor enforces it explicitly. An exercise added while training is lifting,
 * so appending it blindly would put it after the treadmill, which is the one
 * place it definitely does not belong.
 */
const withAdded = (base, added) => {
  const rows = base ?? [];
  if (!added?.length) return rows;
  const firstCardio = rows.findIndex(e => e.type === EXERCISE_TYPES.INTERVALS);
  const at = firstCardio === -1 ? rows.length : firstCardio;
  return [...rows.slice(0, at), ...added, ...rows.slice(at)];
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

/**
 * What you did last time, at the moment you decide what to do now.
 *
 * Progressive overload is a memory problem. The app has held this number since
 * the first build and has never shown it on the one screen where the decision
 * is actually made — you were choosing a weight from memory while the device
 * in your hand knew the answer.
 *
 * Renders nothing when there is no history: a first outing has nothing to beat,
 * and an empty "no previous data" row is noise on every new exercise.
 */
function LastTime({ exerciseName, targetReps, onTake }) {
  const prev = lastFor(exerciseName);
  if (!prev) return null;
  const s = overloadSuggestion(prev, targetReps);

  return (
    <View style={d.lastCard}>
      <View style={d.lastRow}>
        <Icon name="history" size={IconSize.meta} color={Colors.textMuted} />
        <Text style={d.lastLabel}>LAST</Text>
        <Text style={d.lastValue}>{prev.weightKg} kg × {prev.reps}</Text>
        <Text style={d.lastWhen}>{dayLabel(prev.dayKey)}</Text>
      </View>

      {/* Ice, not ember: ember is the live action (SET DONE) and a suggestion
          must not compete with it. This offers; it never sets by itself. */}
      {s.suggest && onTake ? (
        <TouchableOpacity style={d.suggestRow} onPress={() => onTake(s.weightKg)}
                          activeOpacity={0.75} accessibilityRole="button"
                          accessibilityLabel={`Use ${s.weightKg} kilograms — ${s.reason}`}>
          <Icon name="trendUp" size={IconSize.meta} color={Colors.ice} />
          <Text style={d.suggestValue}>try {s.weightKg} kg</Text>
          <Text style={d.suggestWhy} numberOfLines={1}>{s.reason}</Text>
          <Icon name="chevronRight" size={IconSize.pip} color={Colors.ice} />
        </TouchableOpacity>
      ) : s.reason ? (
        // Say why there is no bump. "3 of 5 sets last time" is information;
        // silence would read as the feature being broken.
        <Text style={d.suggestWhyOnly}>{s.reason}</Text>
      ) : null}
    </View>
  );
}

// ─── Regular exercise detail ───────────────────────────────────────────────────
// Sheet BODY only. The header (name, body part, close chevron) belongs to the
// Sheet, and the action lives in a fixed footer bar — see `renderSheetFooter`.
// Nothing here scrolls out of reach of the thumb.
function RegularDetail({ exercise, state, onUpdate }) {
  const total = exercise.sets ?? 0;
  const done  = Math.max(0, total - (state.setsLeft ?? 0));

  return (
    <View style={d.body}>
      <View style={d.progress}>
        <SetPips total={total} done={done} size={12} />
        <Text style={d.progressTxt}>
          {done} of {total} {total === 1 ? 'set' : 'sets'}
        </Text>
      </View>

      <LastTime exerciseName={getExerciseName(exercise)}
                targetReps={state.reps}
                onTake={v => onUpdate({ weight: v })} />

      <WeightField value={state.weight} onChange={v => onUpdate({ weight: v })} />
      <RepsField   value={state.reps}   onChange={v => onUpdate({ reps: v })} />

      {/* Plans change mid-session — one more set, or one fewer because the
          weight went up. Quiet, because it is the exception. */}
      <View style={d.adjustRow}>
        <Text style={d.adjustLabel}>SETS LEFT</Text>
        <Stepper value={state.setsLeft} min={0} max={99}
                 onChange={v => onUpdate({ setsLeft: v })} fillRow={false} />
      </View>
    </View>
  );
}

// ─── Combo detail ─────────────────────────────────────────────────────────────
// A combo can carry five sub-exercises, so each one gets a compact stepper pair
// rather than the full plate-math field — five of those would be three screens
// of scrolling. The step is still 2.5 kg, and each weight still carries its
// pound shadow, because the reason for the shadow does not change with layout.
function ComboDetail({ exercise, state, onUpdate }) {
  const total = exercise.sets ?? 0;
  const done  = Math.max(0, total - (state.setsLeft ?? 0));
  const subs  = exercise.subExercises ?? [];

  // One station open at a time.
  //
  // Five WeightFields stacked is three screens of scrolling, and a combo is
  // the one place you genuinely want to SEE every station before you start —
  // you set the whole circuit up once, then run rounds without editing. So
  // the closed row is the summary (weight x reps, with its pound shadow) and
  // opening one gives it the same plate-math controls a single lift gets.
  const [open, setOpen] = useState(null);

  const setW = (idx, v) => {
    const sw = [...(state.subWeights ?? [])]; sw[idx] = v; onUpdate({ subWeights: sw });
  };
  const setR = (idx, v) => {
    const sr = [...(state.subReps ?? [])]; sr[idx] = v; onUpdate({ subReps: sr });
  };

  return (
    <View style={d.body}>
      <View style={d.progress}>
        <SetPips total={total} done={done} size={12} tone={Colors.ice} />
        <Text style={d.progressTxt}>
          {done} of {total} {total === 1 ? 'round' : 'rounds'}
        </Text>
      </View>

      <View style={{ gap: Spacing.sm }}>
        <Text style={d.adjustLabel}>{subs.length} STATIONS PER ROUND</Text>

        {subs.map((sub, idx) => {
          const nm = sub.name === 'Other'
            ? (sub.customName || `Exercise ${idx + 1}`)
            : (sub.name || `Exercise ${idx + 1}`);
          const w = state.subWeights?.[idx] ?? 0;
          const r = state.subReps?.[idx] ?? 1;
          const isOpen = open === idx;

          return (
            <View key={sub.id ?? idx} style={[d.subCard, isOpen && d.subCardOpen]}>
              <TouchableOpacity
                style={d.stationHead}
                onPress={() => setOpen(isOpen ? null : idx)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${nm}, ${w} kilograms by ${r} reps. Tap to ${isOpen ? 'close' : 'edit'}.`}
              >
                <Text style={d.stationNum}>{idx + 1}</Text>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={d.subName} numberOfLines={1}>{nm}</Text>
                  {sub.bodySection ? <Text style={d.subSection}>{sub.bodySection}</Text> : null}
                </View>

                {!isOpen && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={d.stationMeta}>{w} kg × {r}</Text>
                    {w > 0 ? <Text style={d.subShadow}>{lbLabel(w)}</Text> : null}
                  </View>
                )}

                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'}
                      size={IconSize.meta} color={Colors.textMuted} />
              </TouchableOpacity>

              {isOpen && (
                <View style={d.stationBody}>
                  <LastTime exerciseName={nm} targetReps={r}
                            onTake={v => setW(idx, v)} />
                  <WeightField value={w} onChange={v => setW(idx, v)} />
                  <RepsField   value={r} onChange={v => setR(idx, v)} />
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={d.adjustRow}>
        <Text style={d.adjustLabel}>ROUNDS LEFT</Text>
        <Stepper value={state.setsLeft} min={0} max={99}
                 onChange={v => onUpdate({ setsLeft: v })} fillRow={false} />
      </View>
    </View>
  );
}

// ─── Warmup detail ────────────────────────────────────────────────────────────
function WarmupDetail({ exercise, state, onToggle }) {
  const done = state.status === 'complete';
  return (
    <View style={d.container}>

      <View style={wu.block}>
        <Text style={wu.timer}>{formatTime(state.timeLeft)}</Text>
        <Text style={wu.label}>{done ? 'DONE' : state.isRunning ? 'RUNNING' : 'PAUSED'}</Text>
      </View>
      {done && <View style={d.doneBadge}><Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} /><Text style={d.doneText}>Warmup Complete!</Text></View>}
    </View>
  );
}
const wu = StyleSheet.create({
  block: { alignItems: 'center', marginVertical: Spacing.xl },
  timer: { ...Typography.timerHero, color: Colors.warn },
  label: { ...Typography.label, color: Colors.textMuted, marginTop: Spacing.sm },
});

// ─── Intervals detail ─────────────────────────────────────────────────────────
function IntervalsDetail({ exercise, state, onToggle, onUpdateReps }) {
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
      {done && <View style={d.doneBadge}><Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} /><Text style={d.doneText}>Intervals Complete!</Text></View>}
    </View>
  );
}
const iv = StyleSheet.create({
  repsRow:       { alignItems: 'center', marginBottom: Spacing.xl },
  repsLabel:     { ...Typography.label, color: Colors.textMuted, marginBottom: Spacing.sm },
  phaseBox:      { alignItems: 'center', borderWidth: 2, borderRadius: Radius.lg, padding: Spacing.xl, marginBottom: Spacing.xl },
  phaseLabel:    { ...Typography.h2, marginBottom: Spacing.sm },
  timer:         { ...Typography.timerLarge },
  totalTimer:    { ...Typography.bodySmall, color: Colors.textMuted, marginTop: Spacing.sm, letterSpacing: 0.5 },
  progressTrack: {
    alignSelf: 'stretch',
    height: 8,
    backgroundColor: Colors.raised,
    borderRadius: 4,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
});

// ─── Cardio (Treadmill / Stairs) detail ────────────────────────────────────────
// A single background-resilient countdown (no phase cycling), modeled on
// WarmupDetail, with a progress bar and live-adjustable speed/incline.
function CardioLengthDetail({ state, onToggle, onUpdateSpeed, onUpdateIncline }) {
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

      <View style={[iv.phaseBox, { borderColor: Colors.ember }]}>
        <Text style={[iv.phaseLabel, { color: Colors.ember }]}>
          {done ? 'DONE' : state.isRunning ? 'RUNNING' : notStart ? 'READY' : 'PAUSED'}
        </Text>
        <Text style={[iv.timer, { color: Colors.ember }]}>{formatTime(state.timeLeft)}</Text>
        <View style={iv.progressTrack} onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
          <View style={[iv.progressFill, { width: trackW * progress, backgroundColor: Colors.ember }]} />
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
      {done && <View style={d.doneBadge}><Icon name="statusComplete" size={IconSize.pip} color={Colors.gold} /><Text style={d.doneText}>{label} Complete!</Text></View>}
    </View>
  );
}

// ─── Shared detail styles ─────────────────────────────────────────────────────
// The Sheet draws the name, the body part and the close affordance, and the
// footer bar draws the action — so these are the styles for the middle only.
const d = StyleSheet.create({
  body:        { padding: Spacing.lg, gap: Spacing.xl },

  progress:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  lastCard:    { backgroundColor: Colors.raised, borderRadius: Radius.md,
                 borderWidth: 1, borderColor: Colors.line, overflow: 'hidden' },
  lastRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
                 paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  suggestRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
                 backgroundColor: Colors.iceDim, minHeight: Touch.min,
                 borderTopWidth: 1, borderTopColor: Colors.line,
                 paddingHorizontal: Spacing.md },
  suggestValue:{ ...Typography.metric, color: Colors.ice },
  suggestWhy:  { ...Typography.caption, color: Colors.textMuted, flex: 1, textAlign: 'right' },
  suggestWhyOnly: { ...Typography.caption, color: Colors.textFaint,
                    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  lastLabel:   { ...Typography.label, color: Colors.textFaint },
  lastValue:   { ...Typography.metric, color: Colors.text, flex: 1 },
  lastWhen:    { ...Typography.caption, color: Colors.textMuted },
  progressTxt: { ...Typography.label, color: Colors.textMuted },

  adjustRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                 borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: Spacing.lg },
  adjustLabel: { ...Typography.label, color: Colors.textFaint },

  subCard:     { backgroundColor: Colors.surface, borderRadius: Radius.md,
                 borderWidth: 1, borderColor: Colors.line,
                 padding: Spacing.md, gap: Spacing.sm },
  subHead:     { gap: 2 },
  subName:     { ...Typography.h3, color: Colors.text },
  subSection:  { ...Typography.bodySmall, color: Colors.textMuted },
  subCardOpen: { borderColor: Colors.ember },
  stationHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
                 minHeight: Touch.min },
  stationNum:  { ...Typography.caption, color: Colors.textFaint, width: 12,
                 fontVariant: ['tabular-nums'] },
  stationMeta: { ...Typography.metric, color: Colors.text },
  stationBody: { gap: Spacing.lg, paddingTop: Spacing.md, marginTop: Spacing.xs,
                 borderTopWidth: 1, borderTopColor: Colors.line },
  subRow:      { flexDirection: 'row', gap: Spacing.sm },
  subShadow:   { ...Typography.caption, color: Colors.textFaint, textAlign: 'center', marginTop: 2 },

  // Still used by the warmup / intervals / cardio detail bodies.
  container:   { padding: Spacing.lg, gap: Spacing.md },
  name:        { ...Typography.h1, color: Colors.text },
  titleRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  subtitle:    { ...Typography.body, color: Colors.textMuted },
  stepperRow:  { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.md, justifyContent: 'center' },
  doneBadge:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                 gap: Spacing.md, padding: Spacing.lg },
  doneText:    { ...Typography.h2, color: Colors.gold },
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

/** The raw type values are database words; these are what people call them. */
const QUICK_ADD_TITLE = {
  [EXERCISE_TYPES.REGULAR]:   'Exercise',
  [EXERCISE_TYPES.COMBO]:     'Combo',
  [EXERCISE_TYPES.WARMUP]:    'Warmup',
  [EXERCISE_TYPES.INTERVALS]: 'Cardio',
};

// ─── Quick Add Modal ───────────────────────────────────────────
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
    !hasWarmup && !hasExercises && { key: EXERCISE_TYPES.WARMUP, icon: 'warmup', label: 'Warmup', color: Colors.warn },
    { key: EXERCISE_TYPES.REGULAR, icon: 'barbell', label: 'Exercise', color: Colors.ember },
    { key: EXERCISE_TYPES.COMBO,   icon: 'combo', label: 'Combo', color: Colors.ice },
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
            <Icon name={step === 'form' ? 'back' : 'close'} size={IconSize.row} color={Colors.text} />
          </TouchableOpacity>
          <Text style={qam.title}>
            {step === 'type' ? 'Add Exercise' : (QUICK_ADD_TITLE[type] ?? 'Add Exercise')}
          </Text>
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
                <Icon name="add" size={IconSize.meta} color={Colors.ember} />
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
              <Icon name="check" size={IconSize.row} color={Colors.base} />
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
  header:      { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.line },
  backBtn:     { width: 40 },
  title:       { ...Typography.h2, color: Colors.text, flex: 1, textAlign: 'center' },
  typeCard:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.raised, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1 },
  typeLabel:   { ...Typography.h3 },
  fieldLabel:  { ...Typography.label, color: Colors.textMuted },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip:        { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, backgroundColor: Colors.raised },
  chipActive:  { backgroundColor: Colors.ember },
  chipTxt:     { ...Typography.bodySmall, color: Colors.textMuted },
  chipActiveTxt:{ color: Colors.base },
  stepperRow:  { flexDirection: 'row', gap: Spacing.sm },
  timerHint:   { ...Typography.timerInline, color: Colors.warn, alignSelf: 'flex-end', paddingBottom: 4 },
  helpTxt:     { ...Typography.bodySmall, color: Colors.textMuted, fontStyle: 'italic' },
  textInput:   { height: 44, borderRadius: Radius.md, backgroundColor: Colors.raised,
                 paddingHorizontal: Spacing.md, ...Typography.body, color: Colors.text },
  subCard:     { gap: Spacing.sm, backgroundColor: Colors.nested, borderRadius: Radius.lg,
                 padding: Spacing.md },
  subCardHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subCardTitle:{ ...Typography.label, color: Colors.textMuted },
  addSubBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
                 height: 44, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.ember + '55' },
  addSubBtnTxt:{ ...Typography.bodySmall, color: Colors.ember },
  confirmBtn:  { height: 56, borderRadius: Radius.full, backgroundColor: Colors.ember, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  confirmTxt:  { ...Typography.h3, color: Colors.base },
});

// ─── The fixed action bar at the foot of the set sheet (§7.2) ─────────────────
// Module scope on purpose: defined inside the render these get a fresh
// component type every pass, so the bar unmounts and remounts once a second
// while the "under load" counter ticks — and a press landing on that frame is
// dropped.
function Bar({ onPress, icon, label, tone = Colors.ember, sub }) {
  return (
    <TouchableOpacity style={[styles.setBar, { backgroundColor: tone }]}
                      onPress={onPress} activeOpacity={0.85}
                      accessibilityRole="button" accessibilityLabel={label}>
      <Icon name={icon} size={IconSize.tab} color={onAccent} />
      <View>
        <Text style={styles.setBarTxt}>{label}</Text>
        {sub ? <Text style={styles.setBarSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function DoneBar({ label }) {
  return (
    <View style={[styles.setBar, styles.setBarDone]}>
      <Icon name="statusComplete" size={IconSize.tab} color={Colors.gold} />
      <Text style={[styles.setBarTxt, { color: Colors.gold }]}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function TrainingScreen({ navigation, route }) {
  useKeepAwake();

  const { session: sessionParam, adHoc = false } = route.params ?? {};

  // Ad-hoc mode: exercises live in state, not in a pre-defined session
  const sessionIdRef    = useRef(sessionParam?.id ?? generateId());
  const sessionNameRef  = useRef(sessionParam?.name ?? `Quick Training — ${new Date().toLocaleDateString('en',{month:'short',day:'numeric'})}`);
  const [adHocExercises, setAdHocExercises] = useState(sessionParam?.exercises ?? []);
  const [showQuickAdd,   setShowQuickAdd]   = useState(false);

  // Exercises added after the session started. A planned session could not
  // gain one, so a busy squat rack meant going off-plan with no way to record
  // what you actually did instead — the app quietly stopped matching the
  // training. They live separately from the template: adding one here changes
  // today, never the saved session.
  const [addedExercises, setAddedExercises] = useState([]);

  // Computed session view — reactive in both modes now.
  const session = adHoc
    ? { id: sessionIdRef.current, name: sessionNameRef.current,
        exercises: adHocExercises, restTimerSecs: sessionParam?.restTimerSecs ?? 60 }
    : sessionParam
      ? { ...sessionParam, exercises: withAdded(sessionParam.exercises, addedExercises) }
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
  // Ticks only while a set is actually running, so the screen is not
  // re-rendering once a second for the other 95% of a session.
  const [setNow, setSetNow] = useState(Date.now());

  const [restSec, setRestSec]         = useState(session?.restTimerSecs ?? 60);
  const [restActive, setRestActive]   = useState(false);
  const restEndTimeRef                = useRef(null); // absolute ms timestamp rest is due to end

  // Navigation state
  const [selectedId, setSelectedId] = useState(null);

  // Exercise states
  const [exStates, setExStates] = useState(() => initExerciseStates(session?.exercises));
  const exStatesRef = useRef(exStates);
  useEffect(() => { exStatesRef.current = exStates; }, [exStates]);

  // When exercises are added in ad-hoc mode, initialize state for the new ones
  const prevExerciseIds = useRef(new Set((session?.exercises ?? []).map(e => e.id)));
  // Watches the composed list rather than the ad-hoc one, so an exercise added
  // mid-session to a PLANNED session gets its state too.
  const liveExercises = session?.exercises ?? [];
  useEffect(() => {
    const newExs = liveExercises.filter(e => !prevExerciseIds.current.has(e.id));
    if (!newExs.length) return;
    newExs.forEach(e => prevExerciseIds.current.add(e.id));
    setExStates(prev => ({ ...prev, ...initExerciseStates(newExs) }));
  }, [liveExercises.length]);

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

  // The cache is normally warm already (App.js loads it at launch). This is
  // the cold path — a session started before that finished — and it only
  // triggers one re-render, so LastTime appears rather than staying blank.
  const [, setHistReady] = useState(() => !!peekExerciseHistory());
  useEffect(() => {
    let alive = true;
    getExerciseHistory().then(() => { if (alive) setHistReady(true); });
    return () => { alive = false; };
  }, []);

  // ─── Set-in-progress tick ────────────────────────────────────────────────
  // Seeded on start, not on mount: the footer used to compute elapsed against
  // a timestamp captured when the detail first rendered, which is EARLIER than
  // setStartedAt, and showed a negative time until the first tick landed.
  const runningSetAt = selectedId ? exStates[selectedId]?.setStartedAt : null;
  useEffect(() => {
    if (!runningSetAt) return;
    setSetNow(Date.now());
    const id = setInterval(() => setSetNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [runningSetAt]);

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
      // §7.2: pressing SET DONE transitions the screen straight into the
      // rest state, so the sheet closes whether or not sets remain. Staying
      // open would hide the countdown behind the thing you just finished.
      setTimeout(() => setSelectedId(null), 260);
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

  // ─── Exercise glyphs ──────────────────────────────────────────────────────
  // Body part where there is one, equipment where there is not.
  const exIcon = (ex) => {
    if (!ex) return 'barbell';
    if (ex.type === EXERCISE_TYPES.WARMUP) return 'warmup';
    if (ex.type === EXERCISE_TYPES.INTERVALS) {
      const t = getCardioType(ex);
      return t === CARDIO_TYPES.TREADMILL ? 'treadmill'
           : t === CARDIO_TYPES.STAIRS    ? 'stairs' : 'intervals';
    }
    if (ex.type === EXERCISE_TYPES.COMBO) return 'combo';
    return SECTION_ICON[ex.bodySection] ?? 'barbell';
  };

  // ─── Timer toggles ────────────────────────────────────────────────────────
  // Named rather than inlined, because the fixed footer bar and the sheet body
  // both need to drive them now.
  const toggleWarmup = useCallback((id, ex) => setExStates(prev => {
    const st = prev[id];
    const starting = !st.isRunning;
    if (starting) {
      warmupEndTimeRef.current = Date.now() + st.timeLeft * 1000;
      addEvent('warmup_start', { exerciseName: ex?.warmupType, durationSecs: st.timeLeft });
      scheduleTimerNotification(st.timeLeft, 'Warmup complete — session started!', 'beep_rest.wav')
        .then(nid => { warmupNotifRef.current = nid; });
    } else {
      cancelTimerNotification(warmupNotifRef.current);
      warmupNotifRef.current = null;
    }
    return { ...prev, [id]: { ...st, isRunning: starting } };
  }), [addEvent]);

  const toggleIntervals = useCallback((id) => setExStates(prev => {
    const st = prev[id];
    const starting = !st.isRunning && st.phase === null;
    const willRun  = !st.isRunning;
    if (starting) addToPerfOrder(id);
    const newTimeLeft = starting ? st.walkDuration : st.timeLeft;
    if (willRun) {
      intervalsPhaseEndRef.current = Date.now() + newTimeLeft * 1000;
      scheduleTimerNotification(newTimeLeft, 'Intervals — start running!', 'beep_interval.wav')
        .then(nid => { intervalsNotifRef.current = nid; });
    } else {
      cancelTimerNotification(intervalsNotifRef.current);
      intervalsNotifRef.current = null;
    }
    return { ...prev, [id]: {
      ...st, isRunning: willRun,
      status:   starting ? 'partial'     : st.status,
      phase:    starting ? PHASE.WALKING : st.phase,
      timeLeft: newTimeLeft,
    }};
  }), [addToPerfOrder]);

  const toggleCardio = useCallback((id, ex) => setExStates(prev => {
    const st = prev[id];
    const starting = st.status === 'pending';
    const willRun  = !st.isRunning;
    if (starting) addToPerfOrder(id);
    if (willRun) {
      cardioLengthEndRef.current = Date.now() + st.timeLeft * 1000;
      const label = st.cardioType === CARDIO_TYPES.TREADMILL ? 'Treadmill' : 'Stairs';
      addEvent('cardio_length_start', {
        cardioType: st.cardioType, exerciseName: getExerciseName(ex), durationSecs: st.timeLeft,
      });
      scheduleTimerNotification(st.timeLeft, label + ' complete!', 'beep_rest.wav')
        .then(nid => { cardioLengthNotifRef.current = nid; });
    } else {
      cancelTimerNotification(cardioLengthNotifRef.current);
      cardioLengthNotifRef.current = null;
    }
    return { ...prev, [id]: { ...st, isRunning: willRun, status: starting ? 'partial' : st.status } };
  }), [addEvent, addToPerfOrder]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const exercises     = session?.exercises ?? [];
  const selectedEx    = selectedId ? exercises.find(e => e.id === selectedId) : null;
  const selectedState = selectedId ? exStates[selectedId] : null;

  const patch = (props) =>
    setExStates(prev => ({ ...prev, [selectedId]: { ...prev[selectedId], ...props } }));

  // While rest is lit, ember goes cold everywhere else — §2.2 allows exactly
  // one live channel at a time, and during rest that channel is ice.
  const live = restActive ? Colors.textMuted : Colors.ember;

  // What to name on the rest hero. The exercise you were just on, if it still
  // has sets left — otherwise the next one that is not finished.
  const lastWorked = perfOrder.length
    ? exercises.find(e => e.id === perfOrder[perfOrder.length - 1])
    : null;
  const lastWorkedLeft = lastWorked && exStates[lastWorked.id]?.status !== 'complete';
  const nextEx = lastWorkedLeft
    ? lastWorked
    : exercises.find(e => exStates[e.id]?.status !== 'complete');
  const nextSt = nextEx ? exStates[nextEx.id] : null;

  // ─── The fixed action bar at the foot of the sheet (§7.2) ─────────────────
  const renderSheetFooter = () => {
    if (!selectedEx || !selectedState) return null;
    const type = selectedEx.type;

    if (type === EXERCISE_TYPES.REGULAR || type === EXERCISE_TYPES.COMBO) {
      const isCombo = type === EXERCISE_TYPES.COMBO;
      if (selectedState.setsLeft === 0)
        return <DoneBar label={isCombo ? 'COMBO COMPLETE' : 'ALL SETS DONE'} />;
      if (selectedState.setStartedAt == null)
        return <Bar onPress={() => handleSetStart(selectedId)} icon="play"
                    label={isCombo ? 'START ROUND' : 'START SET'} />;
      const elapsed = Math.max(0, Math.floor((setNow - selectedState.setStartedAt) / 1000));
      return <Bar onPress={() => handleSetDone(selectedId)} icon="check"
                  label={isCombo ? 'ROUND DONE' : 'SET DONE'}
                  sub={'under load ' + formatTime(elapsed)} />;
    }

    if (selectedState.status === 'complete') return <DoneBar label="COMPLETE" />;

    const running = selectedState.isRunning;
    const started = selectedState.phase != null || selectedState.status === 'partial';
    const toggle =
      type === EXERCISE_TYPES.WARMUP ? () => toggleWarmup(selectedId, selectedEx)
      : getCardioType(selectedEx) === CARDIO_TYPES.INTERVALS ? () => toggleIntervals(selectedId)
      : () => toggleCardio(selectedId, selectedEx);

    return <Bar onPress={toggle} icon={running ? 'pause' : 'play'}
                label={running ? 'PAUSE' : started ? 'RESUME' : 'START'}
                tone={running ? Colors.warn : Colors.ember} />;
  };

  return (
    <View style={[styles.container, { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      {/* The rest readout has left this bar entirely — it is the hero below
          now. What remains is what you glance at, not what you read. */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sessionName} numberOfLines={1}>{session?.name ?? 'Training'}</Text>
          <Text style={styles.elapsed}>{formatTime(elapsedSec)}</Text>
        </View>
        <TouchableOpacity style={styles.endBtn} onPress={confirmEnd} activeOpacity={0.8}
                          accessibilityRole="button">
          <Text style={styles.endBtnTxt}>END</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* ── Rest hero — state (b) ──────────────────────────────────── */}
      {restActive && (
        <RestHero
          secsLeft={restSec}
          totalSecs={session?.restTimerSecs ?? 60}
          nextLabel={nextEx ? getExerciseName(nextEx) : null}
          nextSub={nextEx && nextSt ? getExerciseMeta(nextEx, nextSt) : null}
          nextIcon={nextEx ? exIcon(nextEx) : null}
          onSkip={stopRest}
        />
      )}

      {/* ── Exercise rail — state (a) ──────────────────────────────── */}
      <FlatList
        data={exercises}
        keyExtractor={item => item.id}
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxl }]}
        ListEmptyComponent={
          <EmptyState
            icon="emptySessions"
            title="Nothing planned yet"
            message={adHoc
              ? 'Add your first exercise and it starts counting.'
              : 'This session has no exercises.'}
          />
        }
        renderItem={({ item }) => {
          const st   = exStates[item.id];
          const done = st?.status === 'complete';
          const sets = item.sets ?? 0;
          const made = Math.max(0, sets - (st?.setsLeft ?? 0));
          return (
            <TouchableOpacity
              style={[styles.exRow, done && styles.exRowDone]}
              onPress={() => selectExercise(item.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <Icon name={exIcon(item)} size={IconSize.row}
                    color={done ? Colors.gold : st?.status === 'partial' ? live : Colors.textMuted} />

              <View style={styles.exInfo}>
                <Text style={styles.exName} numberOfLines={1}>{getExerciseName(item)}</Text>
                <Text style={styles.exMeta} numberOfLines={1}>{getExerciseMeta(item, st)}</Text>
              </View>

              {/* The pips are the whole point of the row: how many left,
                  without opening anything (§7.2a). */}
              <View style={styles.exRight}>
                {done ? (
                  <Icon name="statusComplete" size={IconSize.meta} color={Colors.gold} />
                ) : sets ? (
                  <>
                    <SetPips total={sets} done={made} tone={live} />
                    <Text style={styles.exCount}>{made} of {sets}</Text>
                  </>
                ) : (
                  <Icon name={st?.status === 'partial' ? 'statusPartial' : 'chevronRight'}
                        size={IconSize.meta}
                        color={st?.status === 'partial' ? Colors.warn : Colors.textMuted} />
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Add an exercise — in a planned session too, not just ad-hoc. */}
      {!restActive && (
        <TouchableOpacity
          style={[styles.quickAddFab, { marginBottom: insets.bottom + Spacing.md }]}
          onPress={() => setShowQuickAdd(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Icon name="add" size={IconSize.tab} color={onAccent} />
          <Text style={styles.quickAddTxt}>Add Exercise</Text>
        </TouchableOpacity>
      )}

      {/* ── Set detail — state (c), a sheet over the dimmed list ────── */}
      <Sheet
        visible={!!selectedEx}
        onClose={() => goBack(selectedId)}
        title={selectedEx ? getExerciseName(selectedEx) : ''}
        subtitle={selectedEx ? (getExerciseBodyPart(selectedEx) || undefined) : undefined}
        icon={selectedEx ? exIcon(selectedEx) : undefined}
        iconColor={Colors.ember}
        footer={renderSheetFooter()}
      >
        <ScrollView
          contentContainerStyle={styles.sheetScroll}
          keyboardShouldPersistTaps="handled"
        >
          {selectedEx && selectedState && (
            <>
              {selectedEx.type === EXERCISE_TYPES.REGULAR && (
                <RegularDetail exercise={selectedEx} state={selectedState} onUpdate={patch} />
              )}
              {selectedEx.type === EXERCISE_TYPES.COMBO && (
                <ComboDetail exercise={selectedEx} state={selectedState} onUpdate={patch} />
              )}
              {selectedEx.type === EXERCISE_TYPES.WARMUP && (
                <WarmupDetail exercise={selectedEx} state={selectedState}
                  onToggle={() => toggleWarmup(selectedId, selectedEx)} />
              )}
              {selectedEx.type === EXERCISE_TYPES.INTERVALS
                && getCardioType(selectedEx) === CARDIO_TYPES.INTERVALS && (
                <IntervalsDetail exercise={selectedEx} state={selectedState}
                  onToggle={() => toggleIntervals(selectedId)}
                  onUpdateReps={v => patch({ repsLeft: Math.max(0, v) })} />
              )}
              {selectedEx.type === EXERCISE_TYPES.INTERVALS
                && getCardioType(selectedEx) !== CARDIO_TYPES.INTERVALS && (
                <CardioLengthDetail state={selectedState}
                  onToggle={() => toggleCardio(selectedId, selectedEx)}
                  onUpdateSpeed={v => patch({ speedKmh: Math.max(0, v) })}
                  onUpdateIncline={v => patch({ inclinePct: Math.max(0, v) })} />
              )}
            </>
          )}
        </ScrollView>
      </Sheet>

      {/* ── End session ────────────────────────────────────────────── */}
      <ConfirmDialog
        visible={showEndConfirm}
        onDismiss={() => setShowEndConfirm(false)}
        title="End session?"
        message="Save it to your stats, or discard it — handy for testing without touching your history."
        dismissLabel="Keep training"
        actions={[
          { label: 'Discard',    tone: 'danger',  onPress: () => { setShowEndConfirm(false); doEndSession(false); } },
          { label: 'Save & end', tone: 'primary', onPress: () => { setShowEndConfirm(false); doEndSession(true); } },
        ]}
      />

      {/* ── Quick Add (ad-hoc mode) ────────────────────────────────── */}
      {showQuickAdd && (
        <QuickAddModal
          exercises={exercises}
          onAdd={(ex) => {
            if (adHoc) setAdHocExercises(prev => [...prev, ex]);
            else       setAddedExercises(prev => [...prev, ex]);
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
  container: { backgroundColor: Colors.base },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
  },
  sessionName: { ...Typography.bodySmall, color: Colors.textMuted },
  // Session elapsed is a glance, not a read — inline size, and it is the only
  // seven-segment face left in the header now that rest has its own hero.
  elapsed:     { ...Typography.timerInline, color: Colors.text },
  endBtn: {
    paddingHorizontal: Spacing.lg, height: Touch.min,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger,
  },
  endBtnTxt: { ...Typography.label, color: Colors.danger, fontSize: 13 },
  divider:   { height: 1, backgroundColor: Colors.line },

  listContent: { padding: Spacing.md, gap: Spacing.sm },
  exRow: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.line,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    gap: Spacing.md, minHeight: Touch.gym,
  },
  exRowDone: { borderColor: Colors.goldDim, backgroundColor: Colors.base },
  exInfo:    { flex: 1, minWidth: 0, gap: 2 },
  exName:    { ...Typography.h3, color: Colors.text },
  exMeta:    { ...Typography.bodySmall, color: Colors.textMuted },
  exRight:   { alignItems: 'flex-end', gap: Spacing.xs },
  exCount:   { ...Typography.caption, color: Colors.textFaint, fontVariant: ['tabular-nums'] },

  sheetScroll: { paddingBottom: Spacing.xl },

  // The fixed action bar (§7.2) — full width, 72px, never scrolls away.
  setBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.md, height: 72,
  },
  setBarTxt:  { ...Typography.h2, color: onAccent, letterSpacing: 0.5 },
  setBarSub:  { ...Typography.caption, color: onAccent, opacity: 0.8 },
  setBarDone: { backgroundColor: Colors.base, borderTopWidth: 1, borderTopColor: Colors.goldDim },

  quickAddFab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, backgroundColor: Colors.ember,
    marginHorizontal: Spacing.md, height: Touch.gym,
    borderRadius: Radius.full, ...Elevation.glowEmber,
  },
  quickAddTxt: { ...Typography.h3, color: onAccent },
});
