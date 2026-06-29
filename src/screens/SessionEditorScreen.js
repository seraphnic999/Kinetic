import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, StatusBar, Modal,
  FlatList, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows, DIGITAL_FONT } from '../theme';
import { loadSessions, saveSessions, generateId } from '../utils/storage';
import { BODY_SECTIONS, EXERCISES_BY_SECTION, WARMUP_TYPES, EXERCISE_TYPES } from '../data/exercises';
import { formatTime } from '../utils/time';

// ---------- Sub-component: Numeric Stepper ----------
function Stepper({ value, onChange, min = 0, max = 999, label }) {
  const [text, setText] = useState(String(value));

  // Sync display when value changes externally (e.g. +/- buttons)
  useEffect(() => { setText(String(value)); }, [value]);

  const handleChangeText = (t) => {
    setText(t);
    const n = parseInt(t, 10);
    // Don't clamp during typing — allow intermediate states (e.g. typing "30" via "3")
    if (!isNaN(n) && n >= 0) onChange(Math.min(max, n));
  };

  const handleBlur = () => {
    const n = parseInt(text, 10);
    const clamped = isNaN(n) ? min : Math.max(min, Math.min(max, n));
    onChange(clamped);
    setText(String(clamped));
  };

  return (
    <View style={stepperStyles.container}>
      {label && <Text style={stepperStyles.label}>{label}</Text>}
      <View style={stepperStyles.row}>
        <TouchableOpacity
          style={stepperStyles.btn}
          onPress={() => onChange(Math.max(min, value - 1))}
          activeOpacity={0.7}
        >
          <Ionicons name="remove" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <TextInput
          style={stepperStyles.input}
          value={text}
          onChangeText={handleChangeText}
          onBlur={handleBlur}
          keyboardType="number-pad"
          selectTextOnFocus
        />
        <TouchableOpacity
          style={stepperStyles.btn}
          onPress={() => onChange(Math.min(max, value + 1))}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const stepperStyles = StyleSheet.create({
  container: { alignItems: 'center', flex: 1 },
  label: { ...Typography.label, color: Colors.textSecondary, marginBottom: Spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, overflow: 'hidden',
  },
  btn: {
    width: 40, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  input: {
    width: 56, height: 44, textAlign: 'center',
    ...Typography.h3, color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
});

// ---------- Sub-component: Option Picker Modal ----------
function PickerModal({ visible, title, options, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={item => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={pickerStyles.option}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[
                  pickerStyles.optionText,
                  item === 'Other' && { color: Colors.primary },
                ]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}
const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    maxHeight: '70%', paddingBottom: Spacing.xxl,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { ...Typography.h3, color: Colors.textPrimary },
  option: {
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  optionText: { ...Typography.bodyLarge, color: Colors.textPrimary },
});

// ---------- Sub-component: Regular Exercise Form ----------
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
          <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
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
            <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
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

      {/* Numeric parameters */}
      <View style={formStyles.stepperRow}>
        <Stepper label="Weight (kg)" value={exercise.weight ?? 0} onChange={v => onChange({ ...exercise, weight: v })} min={0} max={500} />
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
          <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
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
  return (
    <View style={formStyles.container}>
      <View style={formStyles.stepperRow}>
        <Stepper label="Reps"         value={exercise.reps          ?? 8}  onChange={v => onChange({ ...exercise, reps: v })}              min={1}  max={99}  />
        <Stepper label="Run (sec)"    value={exercise.intervalLength ?? 45} onChange={v => onChange({ ...exercise, intervalLength: v })}    min={5}  max={600} />
      </View>
      <View style={formStyles.stepperRow}>
        <Stepper label="Walk (sec)"   value={exercise.walkDuration   ?? 60} onChange={v => onChange({ ...exercise, walkDuration: v })}     min={5}  max={600} />
        <Stepper label="Trans. (sec)" value={exercise.transitionDuration ?? 10} onChange={v => onChange({ ...exercise, transitionDuration: v })} min={0} max={60} />
      </View>
    </View>
  );
}

const formStyles = StyleSheet.create({
  container: { gap: Spacing.md },
  field: { gap: Spacing.xs },
  fieldLabel: { ...Typography.label, color: Colors.textSecondary },
  selector: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorValue: { ...Typography.body, color: Colors.textPrimary },
  selectorPlaceholder: { ...Typography.body, color: Colors.textMuted },
  textInput: {
    backgroundColor: Colors.surfaceRaised,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Typography.body,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'space-around',
  },
  timerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.lg,
  },
  timerHint: {
    ...Typography.timerMedium,
    color: Colors.amber,
    flex: 1,
    fontFamily: DIGITAL_FONT,
    letterSpacing: 2,
  },
});

// ---------- Helper: new exercise templates ----------
const newRegular = () => ({
  id: generateId(), type: EXERCISE_TYPES.REGULAR,
  bodySection: '', name: '', customName: '',
  weight: 0, sets: 3, reps: 10,
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
  id: generateId(), type: EXERCISE_TYPES.INTERVALS,
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
    const session = {
      id: sessionId,
      name: name.trim() || 'New Session',
      exercises: effective,
      restTimerSecs: rest,
      createdAt: createdAt.current,
    };
    const sessions = await loadSessions();
    const updated  = sessions.some(s => s.id === sessionId)
      ? sessions.map(s => s.id === sessionId ? session : s)
      : [...sessions, session];
    await saveSessions(updated);
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

  const getExerciseLabel = (ex) => {
    if (ex.type === EXERCISE_TYPES.WARMUP)    return `🔥 Warmup — ${ex.warmupType} • ${formatTime(ex.duration ?? 180)}`;
    if (ex.type === EXERCISE_TYPES.INTERVALS) return `⚡ Intervals — ${ex.reps} reps • ${ex.intervalLength}s run / ${ex.walkDuration ?? 60}s walk`;
    if (ex.type === EXERCISE_TYPES.COMBO) {
      const parts = [...new Set(
        (ex.subExercises ?? []).map(s => s.bodySection === 'Other' ? (s.customBodySection || 'Other') : s.bodySection).filter(Boolean)
      )].join(' / ');
      return parts ? `🔗 ${parts} — ${ex.sets} sets` : `🔗 Combo — ${ex.sets} sets`;
    }
    const section = ex.bodySection === 'Other'
      ? (ex.customBodySection || 'Other')
      : (ex.bodySection || '');
    const name = (ex.name === 'Other' || ex.bodySection === 'Other')
      ? (ex.customName || 'Unnamed')
      : (ex.name || 'Unnamed');
    const details = `${ex.weight}kg • ${ex.sets}×${ex.reps}`;
    return section ? `${section} — ${name} — ${details}` : `${name} — ${details}`;
  };

  const isReorderable = (ex) =>
    ex.type !== EXERCISE_TYPES.WARMUP && ex.type !== EXERCISE_TYPES.INTERVALS;

  return (
    <View style={[styles.container, Platform.OS === 'web' && { height: windowHeight }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Nav Header */}
      <View style={styles.navHeader} onLayout={e => setNavH(e.nativeEvent.layout.height)}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          {existingSession ? 'Edit Session' : 'New Session'}
        </Text>
        <View style={styles.navRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
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
          <View style={styles.restTimerRow}>
            <Stepper
              label="Seconds"
              value={restTimerSecs}
              onChange={setRestTimerSecs}
              min={0}
              max={600}
            />
            <Text style={styles.restTimerHint}>
              {formatTime(restTimerSecs)}
            </Text>
          </View>
        </View>

        {/* Exercises */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EXERCISES</Text>

          {effectiveExercises.length === 0 && (
            <View style={styles.emptyExercises}>
              <Text style={styles.emptyExercisesText}>No exercises yet — add one below</Text>
            </View>
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
                          <Ionicons name="chevron-up" size={16} color={canUp ? Colors.textSecondary : Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.moveBtn, !canDown && styles.moveBtnDisabled]}
                          onPress={() => canDown && moveExercise(ex.id, 1)}
                        >
                          <Ionicons name="chevron-down" size={16} color={canDown ? Colors.textSecondary : Colors.textMuted} />
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity
                      style={styles.deleteExBtn}
                      onPress={() => deleteExercise(ex.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    </TouchableOpacity>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={16} color={Colors.textSecondary}
                    />
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
                                  <Ionicons name="close-circle" size={18} color={Colors.danger} />
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
                          <Ionicons name="add" size={16} color={Colors.primary} />
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
            <Ionicons name="add-circle" size={22} color={Colors.primary} />
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
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {[
              { type: EXERCISE_TYPES.REGULAR,   icon: 'barbell-outline',   label: 'Regular Exercise',  desc: 'Single exercise with weight, sets & reps' },
              { type: EXERCISE_TYPES.COMBO,     icon: 'git-merge-outline', label: 'Combo Exercise',    desc: 'Two or more exercises, shared set count' },
              { type: EXERCISE_TYPES.WARMUP,    icon: 'flame-outline',     label: 'Warmup',            desc: 'Treadmill or steps — always runs first' },
              { type: EXERCISE_TYPES.INTERVALS, icon: 'pulse-outline',     label: 'Intervals',         desc: 'Walk / run intervals — always runs last' },
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
                  <Ionicons name={opt.icon} size={22} color={Colors.primary} />
                </View>
                <View style={menuStyles.optionText}>
                  <Text style={menuStyles.optionLabel}>{opt.label}</Text>
                  <Text style={menuStyles.optionDesc}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
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
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { ...Typography.h3, color: Colors.textPrimary },
  option: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.md,
  },
  optionIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.primaryDim, alignItems: 'center', justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionLabel: { ...Typography.h3, color: Colors.textPrimary },
  optionDesc: { ...Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: Spacing.sm },
  navTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  navRight:    { width: 40 },
  scroll: {
    flex: 1,
    minHeight: 0, // critical for flex-based scroll containment on web
  },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  section: { gap: Spacing.sm },
  sectionLabel: { ...Typography.label, color: Colors.textSecondary },
  nameInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    ...Typography.bodyLarge, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  restTimerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.lg,
  },
  restTimerHint: {
    ...Typography.timerMedium,
    color: Colors.amber,
    flex: 1,
    fontFamily: DIGITAL_FONT,
    letterSpacing: 2,
  },
  emptyExercises: {
    padding: Spacing.lg, backgroundColor: Colors.surface,
    borderRadius: Radius.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  emptyExercisesText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  exerciseCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  exerciseHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  exerciseLabelGroup: { flex: 1 },
  exerciseLabel: { ...Typography.body, color: Colors.textPrimary },
  exerciseActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  moveBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm, backgroundColor: Colors.surfaceRaised,
  },
  moveBtnDisabled: { opacity: 0.3 },
  deleteExBtn: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.sm, backgroundColor: `${Colors.danger}22`,
  },
  exerciseForm: {
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  comboSets: { alignItems: 'flex-start' },
  subExerciseCard: {
    backgroundColor: Colors.surfaceRaised, borderRadius: Radius.md, padding: Spacing.md,
    gap: Spacing.md,
  },
  subExerciseHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  subExerciseTitle: { ...Typography.label, color: Colors.amber },
  addSubBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.primary, borderStyle: 'dashed',
    borderRadius: Radius.md,
  },
  addSubBtnText: { ...Typography.body, color: Colors.primary },
  addExerciseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.primary, borderStyle: 'dashed',
    marginTop: Spacing.sm,
  },
  addExerciseBtnText: { ...Typography.h3, color: Colors.primary },
});
