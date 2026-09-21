/**
 * SetPips — how many sets are done, readable without opening anything.
 *
 * §7.2a. The exercise rail used to carry a single status dot: pending, partial
 * or complete. "Partial" covers one set of five and four of five identically,
 * so the only way to learn how much was left was to open the exercise — which
 * is the thing you are trying to avoid mid-session.
 *
 * Above `MAX_PIPS` sets the row stops being countable at a glance, so it
 * degrades to "4 / 12" rather than drawing a pixel-wide smear of dots.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '../theme';

const MAX_PIPS = 8;

export function SetPips({ total, done, tone = Colors.ember, size = 9 }) {
  const t = Math.max(0, total ?? 0);
  const d = Math.min(t, Math.max(0, done ?? 0));
  if (!t) return null;

  if (t > MAX_PIPS) {
    return <Text style={s.count}>{d} / {t}</Text>;
  }

  return (
    <View style={s.row} accessibilityLabel={`${d} of ${t} sets done`}>
      {Array.from({ length: t }, (_, i) => (
        <View
          key={i}
          style={[
            { width: size, height: size, borderRadius: size / 2 },
            i < d
              ? { backgroundColor: tone }
              // An unfilled pip is a ring, not a dimmer disc: at 9px a low-alpha
              // fill and a filled pip are the same shape and read as the same
              // thing in gym lighting.
              : { borderWidth: 1.5, borderColor: Colors.line },
          ]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  count: { ...Typography.caption, color: Colors.textMuted, fontVariant: ['tabular-nums'] },
});
