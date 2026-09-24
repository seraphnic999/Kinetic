/**
 * What the weight you are about to type actually means.
 *
 * The app stored one number per exercise and read it as the total load moved.
 * Nobody types a total. You type what you can read off the thing in front of
 * you — 25 off the bell in your hand, 25 off the plate you slid onto one end
 * of the bar — so every dumbbell lift was logged at half, and a barbell lift
 * lost the far side and the bar.
 *
 * The answer is not a different number. It is this control: say which kind of
 * number it is once, and the conversion happens everywhere else (see
 * LOAD_TYPES and effectiveKg in shared/analytics.js).
 *
 * Three options and no more. "Single" covers a machine, a cable stack, a
 * kettlebell and a pullover held in both hands, because they share the only
 * property that matters here: what you type is what moved.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, Radius, Touch } from '../theme';
import { Stepper } from './Stepper';
import { LOAD_TYPES, DEFAULT_BAR_KG } from '../utils/analytics';

const OPTIONS = [
  { value: LOAD_TYPES.SINGLE,        label: 'Single',    hint: 'machine, cable, one bell' },
  { value: LOAD_TYPES.DUMBBELL_PAIR, label: 'Dumbbells', hint: 'one in each hand' },
  { value: LOAD_TYPES.BARBELL,       label: 'Barbell',   hint: 'plates per side' },
];

export function LoadTypeChoice({ value, barKg, onChange, label = 'LOAD' }) {
  // null reads as single — every exercise made before this control existed
  // means "what you typed is what moved", and must keep meaning that.
  const current = value ?? LOAD_TYPES.SINGLE;
  const hint = OPTIONS.find(o => o.value === current)?.hint;

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        {OPTIONS.map(o => {
          const on = o.value === current;
          return (
            <TouchableOpacity
              key={o.value}
              style={[s.chip, on && s.chipOn]}
              onPress={() => onChange(o.value, o.value === LOAD_TYPES.BARBELL
                ? (barKg ?? DEFAULT_BAR_KG) : null)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${o.label} — ${o.hint}`}
            >
              <Text style={[s.txt, on && s.txtOn]} numberOfLines={1}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}

      {/* Bars are not all 20 kg — an EZ bar is nearer 10, and a fixed barbell
          is whatever is stamped on it. Only ask once the answer matters. */}
      {current === LOAD_TYPES.BARBELL ? (
        <View style={s.barRow}>
          <Text style={s.barLabel}>BAR</Text>
          <Stepper value={barKg ?? DEFAULT_BAR_KG} min={0} max={50} step={2.5}
                   onChange={v => onChange(LOAD_TYPES.BARBELL, v)} fillRow={false} />
          <Text style={s.barUnit}>kg</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { gap: Spacing.xs },
  label: { ...Typography.label, color: Colors.textFaint },
  row:   { flexDirection: 'row', gap: Spacing.xs },
  chip:  { flexGrow: 1, flexShrink: 1, flexBasis: 0, height: Touch.min,
           borderRadius: Radius.sm, backgroundColor: Colors.surface,
           borderWidth: 1, borderColor: Colors.line,
           alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xs },
  chipOn:{ backgroundColor: Colors.emberDim, borderColor: Colors.ember },
  txt:   { ...Typography.bodyMedium, color: Colors.textMuted },
  txtOn: { color: Colors.ember },
  hint:  { ...Typography.caption, color: Colors.textFaint, textAlign: 'center' },
  barRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
             marginTop: Spacing.xs },
  barLabel:{ ...Typography.label, color: Colors.textFaint },
  barUnit: { ...Typography.caption, color: Colors.textFaint },
});
