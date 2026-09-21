/**
 * WeightField / RepsField — the §7.2 entry controls.
 *
 * Cause 11 in the audit: the old control was a single ±1 stepper, so moving
 * from 60 kg to 82.5 kg cost forty-five taps. Nobody did it. People trained at
 * whatever the template said and the logged weight drifted away from the real
 * one, which quietly poisons every number the Stats tab computes.
 *
 * The fix is plate arithmetic. The big ± either side moves by one plate pair
 * (2.5 kg — the smallest change you can actually make to a barbell), the chips
 * underneath cover the jumps you really make, and tapping the value types an
 * exact number for a machine with its own stack. Forty taps becomes two.
 *
 * The pound shadow (§3.5) lives here above all other places: this is the one
 * screen where you read a weight off the phone and set a machine to it.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Pressable,
} from 'react-native';
import { Colors, Typography, Spacing, Radius, IconSize, Touch, onAccent } from '../theme';
import { Icon } from './Icon';
import { lbLabel } from '../utils/units';
import { platesFor, perSideLabel } from '../utils/plates';

/** Trailing zeros are noise on a weight: 80, not 80.0 — but 82.5 stays 82.5. */
const fmt = (n) => {
  const r = Math.round((Number(n) || 0) * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Shared frame: label, ± flanking a tappable value, chips beneath. */
function Field({
  label, value, onChange, min, max, step, chips, unit, shadow, disabled,
  keyboard = 'numeric', hint = false, footer = null,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef(null);

  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  const commit = () => {
    const n = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(n)) onChange(clamp(n, min, max));
    setEditing(false);
  };

  const bump = (d) => onChange(clamp((Number(value) || 0) + d, min, max));

  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>

      <View style={s.mainRow}>
        <TouchableOpacity
          style={[s.bigBtn, disabled && s.btnOff]}
          onPress={() => !disabled && bump(-step)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label} by ${step}`}
        >
          <Icon name="minus" size={IconSize.row} color={disabled ? Colors.textMuted : Colors.text} />
        </TouchableOpacity>

        <Pressable
          style={s.valueBox}
          onPress={() => { if (!disabled) { setDraft(fmt(value)); setEditing(true); } }}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${fmt(value)} ${unit}. Tap to type an exact value.`}
        >
          {editing ? (
            <TextInput
              ref={input}
              style={s.valueInput}
              value={draft}
              onChangeText={setDraft}
              onBlur={commit}
              onSubmitEditing={commit}
              keyboardType={keyboard}
              selectTextOnFocus
              returnKeyType="done"
            />
          ) : (
            <>
              <View style={s.valueLine}>
                <Text style={s.value}>{fmt(value)}</Text>
                {unit ? <Text style={s.unit}>{unit}</Text> : null}
              </View>
              {/* A readout, never an input — see utils/units.js. */}
              {shadow ? <Text style={s.shadow}>{lbLabel(value)}</Text> : null}
            </>
          )}
        </Pressable>

        <TouchableOpacity
          style={[s.bigBtn, disabled && s.btnOff]}
          onPress={() => !disabled && bump(step)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label} by ${step}`}
        >
          <Icon name="add" size={IconSize.row} color={disabled ? Colors.textMuted : Colors.text} />
        </TouchableOpacity>
      </View>

      {chips?.length ? (
        <View style={s.chips}>
          {chips.map(c => (
            <TouchableOpacity
              key={c}
              style={s.chip}
              onPress={() => !disabled && bump(c)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              {/* Minus sign U+2212, not a hyphen — at this size a hyphen next
                  to a digit reads as part of the number. */}
              <Text style={s.chipTxt}>{c > 0 ? '+' : '−'}{fmt(Math.abs(c))}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {hint ? <Text style={s.hint}>tap the value to type</Text> : null}
      {footer}
    </View>
  );
}

/**
 * What to hang on each side, on request.
 *
 * Tapped rather than automatic: there is no equipment field, so the app cannot
 * tell a barbell from a machine, and plate maths under a 65 kg lat pulldown
 * would be confidently wrong. You ask for it on the lift where it means
 * something, and it is never wrong about the lift where it does not.
 */
function PlateBreakdown({ value }) {
  const [open, setOpen] = useState(false);
  const r = platesFor(value);

  return (
    <View style={s.plateWrap}>
      <TouchableOpacity
        style={s.plateToggle}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide plate breakdown' : 'Show plate breakdown'}
      >
        <Icon name="plate" size={IconSize.meta} color={Colors.textMuted} />
        <Text style={s.plateToggleTxt}>plates</Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={IconSize.pip} color={Colors.textMuted} />
      </TouchableOpacity>

      {open ? (
        <View style={s.plateBody}>
          {r.perSide.length ? (
            <>
              <Text style={s.plateList}>{perSideLabel(r.perSide)}</Text>
              <Text style={s.plateNote}>
                per side · {r.barKg} kg bar
                {r.ok ? '' : ` · ${r.shortfallKg} kg short, loads ${r.loadedKg}`}
              </Text>
            </>
          ) : (
            <Text style={s.plateNote}>
              {r.reason ?? `cannot be made from the rack — ${r.shortfallKg} kg short`}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Plate-math weight. 2.5 kg is one pair of the smallest plates on the rack. */
export function WeightField({ value, onChange, disabled, label = 'WEIGHT', plates = true }) {
  return (
    <Field
      label={label}
      value={value}
      onChange={onChange}
      min={0}
      max={500}
      step={2.5}
      chips={[-5, -2.5, 2.5, 5, 10]}
      unit="kg"
      shadow
      hint
      disabled={disabled}
      footer={plates ? <PlateBreakdown value={value} /> : null}
    />
  );
}

/** Reps: ±1 on the big buttons, ±5 on the chips, keypad on the value. */
export function RepsField({ value, onChange, disabled, label = 'REPS' }) {
  return (
    <Field
      label={label}
      value={value}
      onChange={onChange}
      min={1}
      max={999}
      step={1}
      chips={[-5, -1, 1, 5]}
      unit=""
      disabled={disabled}
      keyboard="number-pad"
    />
  );
}

const s = StyleSheet.create({
  field: { gap: Spacing.sm },
  label: { ...Typography.label, color: Colors.textFaint },

  mainRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm },

  bigBtn: {
    width: 64, borderRadius: Radius.md,
    backgroundColor: Colors.raised,
    alignItems: 'center', justifyContent: 'center',
  },
  btnOff: { opacity: 0.4 },

  valueBox: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    minHeight: 76, borderRadius: Radius.md,
    backgroundColor: Colors.raised,
    borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  valueLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  value: { ...Typography.statHuge, color: Colors.text },
  unit:  { ...Typography.h3, color: Colors.textMuted },
  shadow:{ ...Typography.caption, color: Colors.textFaint, marginTop: -2 },
  valueInput: {
    alignSelf: 'stretch', textAlign: 'center',
    ...Typography.statHuge, color: Colors.ember,
    paddingVertical: 0, marginVertical: 0,
  },

  chips: { flexDirection: 'row', gap: Spacing.xs },
  chip: {
    flexGrow: 1, flexShrink: 1, flexBasis: 0,
    height: Touch.min, borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  chipTxt: { ...Typography.bodyMedium, color: Colors.text, fontVariant: ['tabular-nums'] },

  hint: { ...Typography.caption, color: Colors.textFaint, textAlign: 'center' },

  plateWrap:   { alignItems: 'center' },
  plateToggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
                 paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md,
                 minHeight: Touch.min },
  plateToggleTxt: { ...Typography.label, color: Colors.textMuted },
  plateBody:   { alignItems: 'center', alignSelf: 'stretch',
                 backgroundColor: Colors.raised, borderRadius: Radius.sm,
                 borderWidth: 1, borderColor: Colors.line,
                 paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, gap: 2 },
  plateList:   { ...Typography.metric, color: Colors.text, fontVariant: ['tabular-nums'] },
  plateNote:   { ...Typography.caption, color: Colors.textFaint, textAlign: 'center' },
});
