/**
 * One logged session — and the first screen in the app that can change one.
 *
 * Until now a mis-logged weight was permanent. You could see 20 kg where you
 * had pressed 80, know it was wrong, and have no way to say so; the only fix
 * was SQL. Everything downstream — volume, density, records, the body split —
 * inherited that lie for ever, and the numbers the app exists to produce were
 * quietly worth less than they looked.
 *
 * What makes this cheaper than it sounds: **nothing stores a personal record.**
 * `computeRecords` walks the sessions in order and derives them at read time.
 * So correcting a weight silently recomputes every record, chart and total,
 * with no invalidation, no cache to sweep, and no stored PR that has to be
 * taken back. The edit IS the whole operation.
 *
 * Scope is deliberately narrow: the numbers you can mis-enter — weight, reps,
 * sets completed — plus deleting the session. Not the timeline, which is
 * measured rather than typed and has no honest way to be edited, and not the
 * exercise list, because adding an exercise you did not do is a different and
 * more dangerous thing than fixing one you did.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Colors, Typography, Spacing, Radius, IconSize, Touch, Elevation, onAccent,
} from '../theme';
import { Icon } from '../components/Icon';
import { Stepper } from '../components/Stepper';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, SkeletonList } from '../components/States';
import { supabase } from '../config/supabase';
import { lbLabel } from '../utils/units';
import { refreshExerciseHistory } from '../utils/exerciseHistory';
import { shapeSessions, deriveSession, dayLabel, fmtDur, fmtTonnes } from '../utils/analytics';

const SELECT = `
  id, name, started_at, duration_secs, timeline,
  workout_exercises (
    id, parent_id, exercise_type, exercise_name, body_section, status,
    weight_kg, sets_planned, sets_completed, reps, duration_secs,
    perf_order, cardio_type, speed_kmh, incline_pct
  )
`;

/** Only these columns are editable, and only on rows that carry real loads. */
const isEditable = (row) => row.exercise_type === 'regular';

export default function SessionDetailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { sessionId } = route.params ?? {};

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits]     = useState({});   // rowId -> { weight_kg, reps, sets_completed }
  const [saving, setSaving]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('workout_sessions').select(SELECT).eq('id', sessionId).single();
      if (error) throw error;
      setSession(shapeSessions([data])[0]);
    } catch (e) {
      console.warn('[SessionDetail] load failed:', e?.message ?? e);
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  /** Every lifting row, parents and combo children alike, in performed order. */
  const rows = useMemo(() => {
    if (!session) return [];
    const out = [];
    for (const e of session.exercises ?? []) {
      out.push({ ...e, depth: 0 });
      for (const c of e.children ?? []) out.push({ ...c, depth: 1 });
    }
    return out;
  }, [session]);

  const valueOf = (row, field) =>
    edits[row.id]?.[field] ?? (row[field] == null ? null : Number(row[field]));

  const setValue = (row, field, v) =>
    setEdits(prev => ({ ...prev, [row.id]: { ...prev[row.id], [field]: v } }));

  const dirty = Object.keys(edits).length > 0;

  // Derived live from the edited values, so the tonnage at the top moves as you
  // correct a weight — which is the confirmation that you fixed the right row.
  const preview = useMemo(() => {
    if (!session) return null;
    const patched = {
      ...session,
      workout_exercises: (session.workout_exercises ?? []).map(e =>
        edits[e.id] ? { ...e, ...edits[e.id] } : e),
    };
    return deriveSession(shapeSessions([patched])[0]);
  }, [session, edits]);

  const save = async () => {
    setSaving(true);
    try {
      for (const [rowId, patch] of Object.entries(edits)) {
        const clean = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v != null && Number.isFinite(Number(v))) clean[k] = Number(v);
        }
        if (!Object.keys(clean).length) continue;
        const { error } = await supabase
          .from('workout_exercises').update(clean).eq('id', rowId);
        if (error) throw error;
      }
      setEdits({});
      // The cached "last time" is now wrong for anything touched here.
      await refreshExerciseHistory();
      await load();
    } catch (e) {
      Alert.alert('Could not save', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    setSaving(true);
    try {
      // The exercise rows and their combo children go with it: both foreign
      // keys are ON DELETE CASCADE, so this cannot leave orphans behind.
      const { error } = await supabase
        .from('workout_sessions').delete().eq('id', sessionId);
      if (error) throw error;
      await refreshExerciseHistory();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not delete', e?.message ?? String(e));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.base }}>
        <SkeletonList count={5} lines={2} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.base, justifyContent: 'center' }}>
        <EmptyState
          icon="emptyHistory"
          title="Session not found"
          message="It may have been deleted on another device."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  const d = preview;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.base }}>
      <View style={[s.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}
                          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="back" size={IconSize.row} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title} numberOfLines={1}>{session.name}</Text>
          <Text style={s.sub}>
            {dayLabel(d.dayKey)} · {fmtDur(d.durationSecs)}
            {d.volumeKg > 0 ? ` · ${fmtTonnes(d.volumeKg)}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setConfirmDelete(true)} style={s.trash}
                          accessibilityRole="button" accessibilityLabel="Delete session">
          <Icon name="trash" size={IconSize.row} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
                  keyboardShouldPersistTaps="handled">
        <Text style={s.section}>Exercises</Text>

        {rows.map(row => {
          const editable = isEditable(row);
          const w = valueOf(row, 'weight_kg');
          return (
            <View key={row.id} style={[s.card, row.depth > 0 && s.childCard]}>
              <View style={s.cardHead}>
                <Text style={s.exName} numberOfLines={1}>{row.exercise_name}</Text>
                {row.body_section ? <Text style={s.exSub}>{row.body_section}</Text> : null}
              </View>

              {editable ? (
                <>
                  <View style={s.fieldRow}>
                    <View style={s.field}>
                      <Stepper size="large" label="WEIGHT (KG)" step={2.5}
                               value={w ?? 0} min={0} max={500}
                               onChange={v => setValue(row, 'weight_kg', v)} />
                      <Text style={s.shadow}>{w > 0 ? lbLabel(w) : ' '}</Text>
                    </View>
                    <View style={s.field}>
                      <Stepper size="large" label="REPS"
                               value={valueOf(row, 'reps') ?? 0} min={0} max={999}
                               onChange={v => setValue(row, 'reps', v)} />
                    </View>
                  </View>

                  <View style={s.setsRow}>
                    <Text style={s.setsLabel}>
                      SETS DONE{row.sets_planned ? ` · ${row.sets_planned} planned` : ''}
                    </Text>
                    <Stepper value={valueOf(row, 'sets_completed') ?? 0}
                             min={0} max={99} fillRow={false}
                             onChange={v => setValue(row, 'sets_completed', v)} />
                  </View>
                </>
              ) : (
                // Warmups, cardio and combo parents carry no load of their own.
                // Showing a disabled control would imply they could be fixed here.
                <Text style={s.readonly}>
                  {row.exercise_type === 'combo'
                    ? `${row.sets_completed ?? 0} of ${row.sets_planned ?? 0} rounds · edit the stations below`
                    : 'nothing to correct here'}
                </Text>
              )}
            </View>
          );
        })}

        <Text style={s.note}>
          Correcting a weight recomputes every total and record that used it —
          there is no separate copy to fix.
        </Text>
      </ScrollView>

      {dirty ? (
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <TouchableOpacity style={s.discard} onPress={() => setEdits({})}
                            activeOpacity={0.8} accessibilityRole="button">
            <Text style={s.discardTxt}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.save} onPress={save} disabled={saving}
                            activeOpacity={0.85} accessibilityRole="button">
            {saving ? <ActivityIndicator color={onAccent} />
                    : <Text style={s.saveTxt}>Save changes</Text>}
          </TouchableOpacity>
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirmDelete}
        onDismiss={() => setConfirmDelete(false)}
        icon="trash"
        iconColor={Colors.danger}
        title="Delete this session?"
        message={`${session.name} on ${dayLabel(d.dayKey)} goes for good, along with every set in it. Your totals and records will recompute without it.`}
        dismissLabel="Keep it"
        actions={[{ label: 'Delete', tone: 'danger', onPress: doDelete }]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  back:  { paddingRight: Spacing.xs },
  trash: { paddingLeft: Spacing.sm, minWidth: Touch.min, alignItems: 'flex-end' },
  title: { ...Typography.h1, color: Colors.text },
  sub:   { ...Typography.bodySmall, color: Colors.textMuted },

  content: { padding: Spacing.md, gap: Spacing.sm },
  section: { ...Typography.label, color: Colors.textFaint, marginTop: Spacing.sm },
  note:    { ...Typography.caption, color: Colors.textFaint, marginTop: Spacing.md,
             textAlign: 'center' },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.line,
    padding: Spacing.md, gap: Spacing.md,
  },
  childCard: { marginInlineStart: Spacing.lg, backgroundColor: Colors.base },
  cardHead:  { gap: 2 },
  exName:    { ...Typography.h3, color: Colors.text },
  exSub:     { ...Typography.bodySmall, color: Colors.textMuted },

  fieldRow: { flexDirection: 'row', gap: Spacing.sm },
  field:    { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  shadow:   { ...Typography.caption, color: Colors.textFaint, textAlign: 'center', marginTop: 2 },

  setsRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               borderTopWidth: 1, borderTopColor: Colors.line, paddingTop: Spacing.md },
  setsLabel: { ...Typography.label, color: Colors.textFaint, flex: 1 },

  readonly: { ...Typography.bodySmall, color: Colors.textFaint },

  footer: {
    flexDirection: 'row', gap: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: Colors.base,
    padding: Spacing.md,
  },
  discard: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0, height: Touch.gym,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  discardTxt: { ...Typography.h3, color: Colors.text },
  save: {
    flexGrow: 2, flexShrink: 1, flexBasis: 0, height: Touch.gym,
    borderRadius: Radius.md, backgroundColor: Colors.ember,
    alignItems: 'center', justifyContent: 'center',
  },
  saveTxt: { ...Typography.h3, color: onAccent },
});
