import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, Modal,
   Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, Radius, IconSize, Touch, Elevation, onAccent } from '../theme';
import { Icon } from '../components/Icon';
import { Stepper } from '../components/Stepper';
import { LoadTypeChoice } from '../components/LoadTypeChoice';
import { PickerModal } from '../components/PickerModal';
import { EmptyState } from '../components/States';
import { upsertSession, generateId } from '../utils/storage';
import { BODY_SECTIONS, EXERCISES_BY_SECTION, WARMUP_TYPES, EXERCISE_TYPES, CARDIO_TYPES, CARDIO_TYPE_LABELS } from '../data/exercises';
import { formatTime } from '../utils/time';
import { templateExerciseLabel } from '../utils/analytics';

// ---------- Sub-component: Numeric Stepper ----------
// ---------- Exercise forms ----------
function RegularExerciseForm({ exercise, onChange }) {
  const [showSection, setShowSection] = useState(false);
  const [showExercise, setShowExercise] = useState(false);

  const sectionOptions = BODY_SECTIONS;
  const exerciseOptions = exercise.bodySection
    ? (EXERCISES_BY_SECTION[exercise.bodySection] || ['Other'])
    : [];

  return (
    <View style={formStyles.container}>
      {/* Body Section */}
      <View style={formStyles.field}>
        <Text style={formStyles.fieldLabel}>Body Section</Text>
        <TouchableOpacity
          style={formStyles.selector}
          onPress={() => setShowSection(true)}
          activeOpacity={0.7}
        >
          <Text style={exercise.bodySection ? formStyles.selectorValue : formStyles.selectorPlaceholder}>
            {exercise.bodySection || 'Select body section...'}
          </Text>
          <Icon name="chevronDown" size={IconSize.meta} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Exercise Name */}
      {exercise.bodySection && exercise.bodySection !== 'Other' ? (
        <View style={formStyles.field}>
          <Text style={formStyles.fieldLabel}>Exercise</Text>
          <TouchableOpacity
            style={formStyles.selector}
            onPress={() => setShowExercise(true)}
            activeOpacity={0.7}
          >
            <Text style={exercise.name ? formStyles.selectorValue : formStyles.selectorPlaceholder}>
              {exercise.name || 'Select exercise...'}
            </Text>
            <Icon name="chevronDown" size={IconSize.meta} color={Colors.textMuted} />
          </TouchableOpacity>
          {exercise.name === 'Other' && (
            <TextInput
              style={formStyles.textInput}
              value={exercise.customName || ''}
              onChangeText={t => onChange({ ...exercise, customName: t })}
              placeholder="Enter exercise name..."
              placeholderTextColor={Colors.textMuted}
            />
          )}
        </View>
      ) : exercise.bodySection === 'Other' ? (
        <>
          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>Body Section Name</Text>
            <TextInput
              style={formStyles.textInput}
              value={exercise.customBodySection || ''}
              onChangeText={t => onChange({ ...exercise, customBodySection: t })}
              placeholder="e.g. Forearms, Neck, Calves..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={formStyles.field}>
            <Text style={formStyles.fieldLabel}>Exercise Name</Text>
            <TextInput
              style={formStyles.textInput}
              value={exercise.customName || ''}
              onChangeText={t => onChange({ ...exercise, customName: t })}
              placeholder="Enter exercise name..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </>
      ) : null}

      {/* What the weight means. Above the number, because it changes what the
          number is being asked for. */}
      <View style={formStyles.field}>
        <LoadTypeChoice
          value={exercise.loadType}
          barKg={exercise.barKg}
          onChange={(loadType, barKg) => onChange({ ...exercise, loadType, barKg })}
        />
      </View>

      {/* Numeric parameters */}
      <View style={formStyles.stepperRow}>
        <Stepper label={weightStepperLabel(exercise.loadType)} value={exercise.weight ?? 0} onChange={v => onChange({ ...exercise, weight: v })} min={0} max={500} />
        <Stepper label="Sets" value={exercise.sets ?? 1} onChange={v => onChange({ ...exercise, sets: v })} min={1} max={99} />
        <Stepper label="Reps" value={exercise.reps ?? 1} onChange={v => onChange({ ...exercise, reps: v })} min={1} max={999} />
      </View>

      <PickerModal
        visible={showSection}
        title="Select Body Section"
        options={sectionOptions}
        onSelect={sec => onChange({ ...exercise, bodySection: sec, name: '', customName: '' })}
        onClose={() => setShowSection(false)}
      />
      <PickerModal
        visible={showExercise}
        title="Select Exercise"
        options={exerciseOptions}
        onSelect={name => onChange({ ...exercise, name, customName: '' })}
        onClose={() => setShowExercise(false)}
      />
    </View>
  );
}

// ---------- Sub-component: Warmup Form ----------
function WarmupForm({ exercise, onChange }) {
  const [showType, setShowType] = useState(false);
  return (
    <View style={formStyles.container}>
      <View style={formStyles.field}>
        <Text style={formStyles.fieldLabel}>Warmup Type</Text>
        <TouchableOpacity style={formStyles.selector} onPress={() => setShowType(true)} activeOpacity={0.7}>
          <Text style={exercise.warmupType ? formStyles.selectorValue : formStyles.selectorPlaceholder}>
            {exercise.warmupType || 'Select type...'}
          </Text>
          <Icon name="chevronDown" size={IconSize.meta} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={formStyles.timerRow}>
        <Stepper label="Seconds" value={exercise.duration ?? 180} onChange={v => onChange({ ...exercise, duration: v })} min={10} max={3600} />
        <Text style={formStyles.timerHint}>{formatTime(exercise.duration ?? 180)}</Text>
      </View>
      <PickerModal
        visible={showType}
        title="Warmup Type"
        options={WARMUP_TYPES}
        onSelect={t => onChange({ ...exercise, warmupType: t })}
        onClose={() => setShowType(false)}
      />
    </View>
  );
}

// ---------- Sub-component: Intervals Form ----------
function IntervalsForm({ exercise, onChange }) {
  const cardioType = exercise.cardioType ?? CARDIO_TYPES.INTERVALS;
  const setCardioType = ct => onChange({ ...exercise, cardioType: ct });

  return (
    <View style={formStyles.container}>
      <Text style={formStyles.fieldLabel}>Cardio Type</Text>
      <View style={formStyles.chipRow}>
        {Object.values(CARDIO_TYPES).map(ct => (
          <TouchableOpacity key={ct} style={[formStyles.chip, cardioType === ct && formStyles.chipActive]}
            onPress={() => setCardioType(ct)}>
            <Text style={[formStyles.chipTxt, cardioType === ct && formStyles.chipActiveTxt]}>{CARDIO_TYPE_LABELS[ct]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {cardioType === CARDIO_TYPES.INTERVALS && (
        <>
          <View style={formStyles.stepperRow}>
            <Stepper label="Reps"         value={exercise.reps          ?? 8}  onChange={v => onChange({ ...exercise, reps: v })}              min={1}  max={99}  />
            <Stepper label="Run (sec)"    value={exercise.intervalLength ?? 45} onChange={v => onChange({ ...exercise, intervalLength: v })}    min={5}  max={600} />
          </View>
          <View style={formStyles.stepperRow}>
            <Stepper label="Walk (sec)"   value={exercise.walkDuration   ?? 60} onChange={v => onChange({ ...exercise, walkDuration: v })}     min={5}  max={600} />
            <Stepper label="Trans. (sec)" value={exercise.transitionDuration ?? 10} onChange={v => onChange({ ...exercise, transitionDuration: v })} min={0} max={60} />
          </View>
        </>
      )}

      {(cardioType === CARDIO_TYPES.TREADMILL || cardioType === CARDIO_TYPES.STAIRS) && (
        <View style={formStyles.stepperRow}>
          <Stepper label="Length (min)" value={Math.round((exercise.lengthSecs ?? 600) / 60)} onChange={v => onChange({ ...exercise, lengthSecs: v * 60 })} min={1} max={180} />
          <Stepper label="Speed (km/h)" value={exercise.speedKmh ?? 6} onChange={v => onChange({ ...exercise, speedKmh: v })} min={1} max={30} />
          {cardioType === CARDIO_TYPES.TREADMILL && (
            <Stepper label="Incline (%)" value={exercise.inclinePct ?? 0} onChange={v => onChange({ ...exercise, inclinePct: v })} min={0} max={30} />
          )}
        </View>
      )}
    </View>
  );
}

const formStyles = StyleSheet.create({
  container: { gap: Spacing.md },
  field: { gap: Spacing.xs },
  fieldLabel: { ...Typography.label, color: Colors.textMuted },
  selector: {
    backgroundColor: Colors.raised,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorValue: { ...Typography.body, color: Colors.text },
  selectorPlaceholder: { ...Typography.body, color: Colors.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, borderRadius: Radius.full, backgroundColor: Colors.raised },
  chipActive: { backgroundColor: Colors.ember },
  chipTxt: { ...Typography.bodySmall, color: Colors.textMuted },
  chipActiveTxt: { color: Colors.base },
  textInput: {
    backgroundColor: Colors.raised,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.lg,
  },
  // Not seven-segment: §3.1 reserves DSEG7 for LIVE countdowns, and this is a
  // configured value sitting still in a form. The same mistake put the login
  // wordmark in a face with no letterforms.
  timerHint: {
    ...Typography.metric,
    color: Colors.warn,
    flex: 1,
  },
});

/** The stepper asks for a different quantity depending on the load type. */
const weightStepperLabel = (loadType) =>
  loadType === 'dumbbell_pair' ? 'Per hand (kg)'
  : loadType === 'barbell' ? 'Per side (kg)'
  : 'Weight (kg)';

// ---------- Helper: new exercise templates ----------
const newRegular = () => ({
  id: generateId(), type: EXERCISE_TYPES.REGULAR,
  bodySection: '', name: '', customName: '',
  weight: 0, sets: 3, reps: 10,
  // null, not 'single': an exercise that has never been told what its weight
  // means should read the same as every exercise made before this field
  // existed, and both mean "what you typed is what moved".
  loadType: null, barKg: null,
});
const newCombo = () => ({
  id: generateId(), type: EXERCISE_TYPES.COMBO, name: 'Combo',
  sets: 3,
  subExercises: [newRegular(), newRegular()],
});
const newWarmup = () => ({
  id: generateId(), type: EXERCISE_TYPES.WARMUP,
  warmupType: 'Treadmill', duration: 180,
});
const newIntervals = () => ({
  id: generateId(), type: EXERCISE_TYPES.INTERVALS, cardioType: CARDIO_TYPES.INTERVALS,
  reps: 8, intervalLength: 45, walkDuration: 60, transitionDuration: 10,
});

// ---------- Main Screen ----------
const defaultSessionName = () => {
  const d = new Date();
  return `Session ${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
};

export default function SessionEditorScreen({ navigation, route }) {
  const existingSession = route.params?.session ?? null;
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [navH, setNavH] = useState(0);

  // Session ID is fixed for the lifetime of this editor
  const [sessionId] = useState(existingSession?.id ?? generateId());
  const createdAt   = useRef(existingSession?.createdAt ?? Date.now());

  const [sessionName, setSessionName] = useState(existingSession?.name ?? defaultSessionName());
  const [restTimerSecs, setRestTimerSecs] = useState(existingSession?.restTimerSecs ?? 60);
  const [exercises, setExercises] = useState(existingSession?.exercises ?? []);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // ── Effective order: warmup first, intervals last ─────────────────────────
  const effectiveExercises = useMemo(() => {
    const warmup   = exercises.filter(e => e.type === EXERCISE_TYPES.WARMUP);
    const middle   = exercises.filter(e => e.type !== EXERCISE_TYPES.WARMUP && e.type !== EXERCISE_TYPES.INTERVALS);
    const interval = exercises.filter(e => e.type === EXERCISE_TYPES.INTERVALS);
    return [...warmup, ...middle, ...interval];
  }, [exercises]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const isFirstRender = useRef(true);
  const saveTimer     = useRef(null);

  const doSave = useCallback(async (name, exs, rest) => {
    const effective = (() => {
      const w = exs.filter(e => e.type === EXERCISE_TYPES.WARMUP);
      const m = exs.filter(e => e.type !== EXERCISE_TYPES.WARMUP && e.type !== EXERCISE_TYPES.INTERVALS);
      const i = exs.filter(e => e.type === EXERCISE_TYPES.INTERVALS);
      return [...w, ...m, ...i];
    })();
    await upsertSession({
      id: sessionId,
      name: name.trim() || 'New Session',
      exercises: effective,
      restTimerSecs: rest,
      createdAt: createdAt.current,
    });
  }, [sessionId]);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(sessionName, exercises, restTimerSecs), 600);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [sessionName, exercises, restTimerSecs, doSave]);

  const addExercise = (type) => {
    setShowAddMenu(false);
    if (type === EXERCISE_TYPES.WARMUP) {
      if (exercises.some(e => e.type === EXERCISE_TYPES.WARMUP)) {
        Alert.alert('Warmup already added', 'A session can only have one warmup.');
        return;
      }
      const wu = newWarmup();
      setExercises(prev => [wu, ...prev]);
      setExpandedId(wu.id);
    } else if (type === EXERCISE_TYPES.INTERVALS) {
      if (exercises.some(e => e.type === EXERCISE_TYPES.INTERVALS)) {
        Alert.alert('Intervals already added', 'A session can only have one intervals block.');
        return;
      }
      const iv = newIntervals();
      setExercises(prev => [...prev, iv]);
      setExpandedId(iv.id);
    } else if (type === EXERCISE_TYPES.COMBO) {
      const cb = newCombo();
      setExercises(prev => [...prev, cb]);
      setExpandedId(cb.id);
    } else {
      const ex = newRegular();
      setExercises(prev => [...prev, ex]);
      setExpandedId(ex.id);
    }
  };

  const updateExercise = (id, updated) => {
    setExercises(prev => prev.map(e => e.id === id ? updated : e));
  };

  const deleteExercise = (id) => {
    setExercises(prev => prev.filter(e => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const moveExercise = (id, direction) => {
    setExercises(prev => {
      const middle = prev.filter(e => e.type !== EXERCISE_TYPES.WARMUP && e.type !== EXERCISE_TYPES.INTERVALS);
      const idx = middle.findIndex(e => e.id === id);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= middle.length) return prev;
      const swapped = [...middle];
      [swapped[idx], swapped[newIdx]] = [swapped[newIdx], swapped[idx]];
      const warmup   = prev.filter(e => e.type === EXERCISE_TYPES.WARMUP);
      const interval = prev.filter(e => e.type === EXERCISE_TYPES.INTERVALS);
      return [...warmup, ...swapped, ...interval];
    });
  };

  // Shared with the web dashboard's session list — see utils/analytics.js.
  const getExerciseLabel = templateExerciseLabel;

  const isReorderable = (ex) =>
    ex.type !== EXERCISE_TYPES.WARMUP && ex.type !== EXERCISE_TYPES.INTERVALS;

  return (
    <View style={[styles.container, Platform.OS === 'web' && { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.base} />

      {/* Nav Header */}
      <View style={[styles.navHeader, { paddingTop: insets.top }]} onLayout={e => setNavH(e.nativeEvent.layout.height)}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="back" size={IconSize.row} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          {existingSession ? 'Edit Session' : 'New Session'}
        </Text>
        <View style={styles.navRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >

        {/* Session Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SESSION NAME</Text>
          <TextInput
            style={styles.nameInput}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="e.g. Push Day, Leg Day..."
            placeholderTextColor={Colors.textMuted}
            autoFocus={!existingSession}
          />
        </View>

        {/* Rest Timer */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>REST TIMER</Text>
          {/* No "Seconds" label on the stepper: the section is already called
              REST TIMER and the readout beside it spells the value out, so a
              third label stacked between them said nothing twice. Stepping by
              15 keeps the value on the grid people actually pick — 45, 60, 90
              — rather than walking it one second at a time. */}
          <View style={styles.restTimerRow}>
            <Stepper
              value={restTimerSecs}
              onChange={setRestTimerSecs}
              min={0}
              max={600}
              step={15}
              fillRow={false}
            />
            <Text style={styles.restTimerHint}>
              {restTimerSecs === 0 ? 'no rest timer' : formatTime(restTimerSecs)}
            </Text>
          </View>
        </View>

        {/* Exercises */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EXERCISES</Text>

          {effectiveExercises.length === 0 && (
            <EmptyState
              icon="emptySessions"
              title="No exercises yet"
              message="Add one below and it becomes part of this session."
            />
          )}

          {effectiveExercises.map((ex, idx) => {
            const isExpanded = expandedId === ex.id;
            const canMove = isReorderable(ex);
            const middleExercises = effectiveExercises.filter(e => isReorderable(e));
            const middleIdx = middleExercises.findIndex(e => e.id === ex.id);
            const canUp   = canMove && middleIdx > 0;
            const canDown = canMove && middleIdx < middleExercises.length - 1;

            return (
              <View key={ex.id} style={styles.exerciseCard}>
                {/* Exercise Header Row */}
                <TouchableOpacity
                  style={styles.exerciseHeader}
                  onPress={() => setExpandedId(isExpanded ? null : ex.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.exerciseLabelGroup}>
                    <Text style={styles.exerciseLabel} numberOfLines={1}>
                      {getExerciseLabel(ex)}
                    </Text>
                  </View>
                  <View style={styles.exerciseActions}>
                    {canMove && (
                      <>
                        <TouchableOpacity
                          style={[styles.moveBtn, !canUp && styles.moveBtnDisabled]}
                          onPress={() => canUp && moveExercise(ex.id, -1)}
                        >
                          <Icon name="chevronUp" size={IconSize.meta} color={canUp ? Colors.textMuted : Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.moveBtn, !canDown && styles.moveBtnDisabled]}
                          onPress={() => canDown && moveExercise(ex.id, 1)}
                        >
                          <Icon name="chevronDown" size={IconSize.meta} color={canDown ? Colors.textMuted : Colors.textMuted} />
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity
                      style={styles.deleteExBtn}
                      onPress={() => deleteExercise(ex.id)}
                    >
                      <Icon name="trash" size={IconSize.meta} color={Colors.danger} />
                    </TouchableOpacity>
                    <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={IconSize.meta} color={Colors.textMuted} />
                  </View>
                </TouchableOpacity>

                {/* Expanded Form */}
                {isExpanded && (
                  <View style={styles.exerciseForm}>
                    {ex.type === EXERCISE_TYPES.WARMUP && (
                      <WarmupForm exercise={ex} onChange={updated => updateExercise(ex.id, updated)} />
                    )}
                    {ex.type === EXERCISE_TYPES.INTERVALS && (
                      <IntervalsForm exercise={ex} onChange={updated => updateExercise(ex.id, updated)} />
                    )}
                    {ex.type === EXERCISE_TYPES.REGULAR && (
                      <RegularExerciseForm exercise={ex} onChange={updated => updateExercise(ex.id, updated)} />
                    )}
                    {ex.type === EXERCISE_TYPES.COMBO && (
                      <View style={{ gap: Spacing.md }}>
                        <View style={styles.comboSets}>
                          <Stepper
                            label="Sets (whole combo)"
                            value={ex.sets}
                            onChange={v => updateExercise(ex.id, { ...ex, sets: v })}
                            min={1} max={99}
                          />
                        </View>
                        {ex.subExercises.map((sub, subIdx) => (
                          <View key={sub.id} style={styles.subExerciseCard}>
                            <View style={styles.subExerciseHeader}>
                              <Text style={styles.subExerciseTitle}>Exercise {subIdx + 1}</Text>
                              {ex.subExercises.length > 2 && (
                                <TouchableOpacity
                                  onPress={() => updateExercise(ex.id, {
                                    ...ex,
                                    subExercises: ex.subExercises.filter((_, i) => i !== subIdx),
                                  })}
                                >
                                  <Icon name="close" size={IconSize.meta} color={Colors.danger} />
                                </TouchableOpacity>
                              )}
                            </View>
                            <RegularExerciseForm
                              exercise={sub}
                              onChange={updatedSub => updateExercise(ex.id, {
                                ...ex,
                                subExercises: ex.subExercises.map((s, i) => i === subIdx ? updatedSub : s),
                              })}
                            />
                          </View>
                        ))}
                        <TouchableOpacity
                          style={styles.addSubBtn}
                          onPress={() => updateExercise(ex.id, {
                            ...ex,
                            subExercises: [...ex.subExercises, newRegular()],
                          })}
                        >
                          <Icon name="add" size={IconSize.meta} color={Colors.ember} />
                          <Text style={styles.addSubBtnText}>Add Exercise to Combo</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {/* Add Exercise Button */}
          <TouchableOpacity
            style={styles.addExerciseBtn}
            onPress={() => setShowAddMenu(true)}
            activeOpacity={0.8}
          >
            <Icon name="add" size={IconSize.row} color={Colors.ember} />
            <Text style={styles.addExerciseBtnText}>Add Exercise</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add Exercise Type Menu Modal */}
      <Modal
        visible={showAddMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMenu(false)}
      >
        <View style={menuStyles.overlay}>
          <View style={menuStyles.sheet}>
            <View style={menuStyles.header}>
              <Text style={menuStyles.title}>Add Exercise</Text>
              <TouchableOpacity onPress={() => setShowAddMenu(false)}>
                <Icon name="close" size={IconSize.row} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            {[
              { type: EXERCISE_TYPES.REGULAR,   icon: 'barbell',   label: 'Regular Exercise',  desc: 'Single exercise with weight, sets & reps' },
              { type: EXERCISE_TYPES.COMBO,     icon: 'combo', label: 'Combo Exercise',    desc: 'Two or more exercises, shared set count' },
              { type: EXERCISE_TYPES.WARMUP,    icon: 'warmup',     label: 'Warmup',            desc: 'Treadmill or steps — always runs first' },
              { type: EXERCISE_TYPES.INTERVALS, icon: 'intervals',     label: 'Cardio',            desc: 'Intervals, treadmill, or stairs — always runs last' },
            ].filter(opt => {
              if (opt.type === EXERCISE_TYPES.WARMUP)    return !exercises.some(e => e.type === EXERCISE_TYPES.WARMUP);
              if (opt.type === EXERCISE_TYPES.INTERVALS) return !exercises.some(e => e.type === EXERCISE_TYPES.INTERVALS);
              return true;
            }).map(opt => (
              <TouchableOpacity
                key={opt.type}
                style={menuStyles.option}
                onPress={() => addExercise(opt.type)}
                activeOpacity={0.7}
              >
                <View style={menuStyles.optionIcon}>
                  <Icon name={opt.icon} size={IconSize.row} color={Colors.ember} />
                </View>
                <View style={menuStyles.optionText}>
                  <Text style={menuStyles.optionLabel}>{opt.label}</Text>
                  <Text style={menuStyles.optionDesc}>{opt.desc}</Text>
                </View>
                <Icon name="forward" size={IconSize.meta} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const menuStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  title: { ...Typography.h3, color: Colors.text },
  option: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.line, gap: Spacing.md,
  },
  optionIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.emberDim, alignItems: 'center', justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionLabel: { ...Typography.h3, color: Colors.text },
  optionDesc: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.base,
  },
  navHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  backBtn: { padding: Spacing.sm },
  navTitle: { ...Typography.h3, color: Colors.text, flex: 1, textAlign: 'center' },
  navRight:    { width: 40 },
  scroll: {
    flex: 1,
    minHeight: 0, // critical for flex-based scroll containment on web
  },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  section: { gap: Spacing.sm },
  sectionLabel: { ...Typography.label, color: Colors.textMuted },
  nameInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    ...Typography.bodyLarge, color: Colors.text,
    borderWidth: 1, borderColor: Colors.line,
  },
  restTimerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.lg,
  },
  restTimerHint: {
    ...Typography.metric,   // see timerHint above — a setting, not a countdown
    color: Colors.warn,
    flex: 1,
  },
  emptyExercises: {
    padding: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radius.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.line, borderStyle: 'dashed',
  },
  emptyExercisesText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  exerciseCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.line, overflow: 'hidden',
  },
  exerciseHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  exerciseLabelGroup: { flex: 1 },
  exerciseLabel: { ...Typography.body, color: Colors.text },
  exerciseActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  moveBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm, backgroundColor: Colors.raised,
  },
  moveBtnDisabled: { opacity: 0.3 },
  deleteExBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm, backgroundColor: `${Colors.danger}22`,
  },
  exerciseForm: {
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.line,
  },
  comboSets: { alignItems: 'flex-start' },
  subExerciseCard: {
    backgroundColor: Colors.nested, borderRadius: Radius.md, padding: Spacing.md,
    gap: Spacing.md,
  },
  subExerciseHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  subExerciseTitle: { ...Typography.label, color: Colors.warn },
  addSubBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.ember, borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  addSubBtnText: { ...Typography.body, color: Colors.ember },
  addExerciseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.ember, borderStyle: 'dashed',
    marginTop: Spacing.sm,
  },
  addExerciseBtnText: { ...Typography.h3, color: Colors.ember },
});
